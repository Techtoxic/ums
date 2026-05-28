const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { upload, validateUploadBuffer, FILE_IMAGE_EXT_RE } = require('../utils/uploads');
const { uploadToS3, getPresignedUrl, deleteFromS3 } = require('../utils/s3Service');
const { StudentUpload, Student, StudentUnitRegistration, AuditLog, User, Notification } = require('../db/models');

// Upload student file (profile, KCSE, KCPE, assessment, practical)
router.post('/student-uploads', verifyToken, authorize('admin', 'registrar', 'student', 'trainer'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const {
            studentId,
            uploadType,
            unitId,
            unitCode,
            unitName,
            assessmentNumber,
            practicalNumber,
            academicYear,
            semester
        } = req.body;

        // Validate required fields
        if (!studentId || !uploadType || !academicYear || !semester) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // SEV-H-011: authoritative magic-byte validation before anything is stored.
        const v = validateUploadBuffer(req.file, 'student-upload');
        if (!v.ok) {
            return res.status(v.status).json({ message: v.message });
        }

        // Get student details
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Validate unit-related uploads
        if (['assessment', 'practical', 'combined_video'].includes(uploadType)) {
            if (!unitId || !unitCode) {
                return res.status(400).json({ message: 'Unit information required for this upload type' });
            }

            // Check if student is registered for this unit
            const registration = await StudentUnitRegistration.findOne({
                studentId,
                unitId,
                status: 'registered',
                isActive: true,
                academicYear,
                semester
            });

            if (!registration) {
                return res.status(403).json({ message: 'You are not registered for this unit' });
            }

            // Check if unit is common (should not allow uploads for common units)
            if (registration.unitType === 'common') {
                return res.status(403).json({ message: 'Cannot upload assessments for common units' });
            }
        }

        // Validate assessment number
        if (uploadType === 'assessment') {
            if (!assessmentNumber || assessmentNumber < 1 || assessmentNumber > 3) {
                return res.status(400).json({ message: 'Invalid assessment number (must be 1-3)' });
            }
        }

        // Validate practical number
        if (uploadType === 'practical') {
            if (!practicalNumber || practicalNumber < 1 || practicalNumber > 3) {
                return res.status(400).json({ message: 'Invalid practical number (must be 1-3)' });
            }

            // SEV-H-011: practicals must be PDF — checked by magic bytes, not
            // the client-supplied mimetype.
            if (practicalNumber >= 1 && practicalNumber <= 3) {
                if (v.ext !== 'pdf') {
                    return res.status(400).json({
                        message: 'Practical documents must be PDF files. Please upload a PDF file.'
                    });
                }
            }
        }

            // Check for existing upload (to replace)
            let existingUpload = null;
            const searchCriteria = {
                studentId,
                uploadType,
                status: 'uploaded'
            };

            // For profile/results, only check by studentId and uploadType
            // For assessments/practicals/combined_video, also check unit and semester
            if (uploadType === 'assessment') {
                searchCriteria.unitId = unitId;
                searchCriteria.assessmentNumber = assessmentNumber;
                searchCriteria.academicYear = academicYear;
                searchCriteria.semester = semester;
            } else if (uploadType === 'practical') {
                searchCriteria.unitId = unitId;
                searchCriteria.practicalNumber = practicalNumber;
                searchCriteria.academicYear = academicYear;
                searchCriteria.semester = semester;
            } else if (uploadType === 'combined_video') {
                searchCriteria.unitId = unitId;
                searchCriteria.academicYear = academicYear;
                searchCriteria.semester = semester;
            }
            // For profile_photo, kcse_results, kcpe_results - don't filter by academic year/semester

            existingUpload = await StudentUpload.findOne(searchCriteria);

            console.log('Existing upload check:', searchCriteria, 'Found:', !!existingUpload);

        // If replacing existing, mark old as replaced FIRST to avoid duplicate key error
        if (existingUpload) {
            existingUpload.status = 'replaced';
            existingUpload.updatedAt = Date.now();
            await existingUpload.save();
            console.log('Marked old upload as replaced:', existingUpload._id);
        }

        // SEV-H-011: server-generated UUID storage name (no user input in the
        // key); identifier path segments sanitised; original kept as display.
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const seg = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');
        const fileName = `${crypto.randomUUID()}.${v.ext}`;

        let folderPath;
        if (['profile_photo', 'kcse_results', 'kcpe_results'].includes(uploadType)) {
            folderPath = `cibec/${seg(uploadType)}/${seg(studentId)}/${year}/${month.toString().padStart(2, '0')}`;
        } else {
            folderPath = `cibec/${seg(unitId)}/${seg(studentId)}/${seg(uploadType)}/${year}/${month.toString().padStart(2, '0')}`;
        }

        const s3Result = await uploadToS3(
            req.file.buffer,
            fileName,
            req.file.mimetype,
            folderPath,
            { displayName: v.displayName, inlineImage: v.isImage }
        );

        // Create new upload record
        const newUpload = new StudentUpload({
            studentId,
            studentName: student.name,
            admissionNumber: student.admissionNumber,
            course: student.course,
            department: student.department,
            module: student.module,
            uploadType,
            unitId: unitId || null,
            unitCode: unitCode || null,
            unitName: unitName || null,
            assessmentNumber: assessmentNumber || null,
            practicalNumber: practicalNumber || null,
            fileName: fileName,
            originalFileName: v.displayName,
            s3Key: s3Result.key,
            s3Bucket: s3Result.bucket,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            status: 'uploaded',
            version: existingUpload ? existingUpload.version + 1 : 1,
            replaces: existingUpload ? existingUpload._id : null,
            academicYear,
            semester
        });

        await newUpload.save();
        console.log('Saved new upload:', newUpload._id, 'version:', newUpload.version);

        // Create audit log
        await AuditLog.logAction({
            userId: req.user.userId, // SEV-H-008: actor from verified token
            userType: req.user.role,
            action: existingUpload ? 'replace' : 'upload',
            fileId: newUpload._id,
            studentId,
            details: {
                uploadType,
                unitCode,
                assessmentNumber,
                practicalNumber,
                fileName: v.displayName,
                fileSize: req.file.size,
                replaced: !!existingUpload
            }
        });

        // Notify all CIBEC officers (they are users with role 'cibec')
        const cibecUsers = await User.find({ role: 'cibec' });
        for (const cibec of cibecUsers) {
            await Notification.create({
                recipientId: cibec.id,
                recipientType: 'user',
                title: `New ${uploadType.replace(/_/g, ' ')} Upload`,
                body: `${student.name} (${student.admissionNumber}) uploaded ${uploadType.replace(/_/g, ' ')}${unitName ? ` for ${unitName}` : ''}.`,
            });
        }

        res.json({
            success: true,
            message: existingUpload ? 'File replaced successfully' : 'File uploaded successfully',
            data: {
                id: newUpload._id,
                uploadType: newUpload.uploadType,
                fileName: newUpload.originalFileName,
                status: newUpload.status,
                version: newUpload.version,
                uploadedAt: newUpload.uploadedAt
            }
        });

    } catch (error) {
        console.error('Error uploading student file:', error);
        res.status(500).json({
            message: 'Error uploading file',
            error: error.message
        });
    }
});

// Get student's uploads
router.get('/student-uploads/:studentId', verifyToken, authorize('admin', 'registrar', 'student', 'trainer', 'cibec'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { uploadType, status = 'uploaded' } = req.query;

        const query = { studentId, status };
        if (uploadType) query.uploadType = uploadType;

        const uploads = await StudentUpload.find(query)
            .populate('unitId')
            .sort({ uploadedAt: -1 });

        // Log view action
        await AuditLog.logAction({
            userId: req.user.userId, // SEV-H-008: actor from verified token
            userType: req.user.role,
            action: 'view',
            studentId,
            details: { uploadType, status, count: uploads.length }
        });

        res.json(uploads);
    } catch (error) {
        console.error('Error fetching student uploads:', error);
        res.status(500).json({ message: 'Error fetching uploads' });
    }
});

// Get student's unit uploads
router.get('/student-uploads/:studentId/unit/:unitId', verifyToken, authorize('admin', 'registrar', 'student', 'trainer', 'cibec'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId, unitId } = req.params;

        const uploads = await StudentUpload.find({
            studentId,
            unitId,
            status: 'uploaded'
        }).sort({ uploadType: 1, assessmentNumber: 1 });

        res.json(uploads);
    } catch (error) {
        console.error('Error fetching unit uploads:', error);
        res.status(500).json({ message: 'Error fetching unit uploads' });
    }
});

// Get download URL for student upload
router.get('/student-uploads/:uploadId/download', verifyToken, authorize('admin', 'registrar', 'student', 'trainer', 'cibec'), async (req, res) => {
    try {
        const { uploadId } = req.params;

        const upload = await StudentUpload.findById(uploadId);
        // SEV-H-007: do not leak existence. Return 403 for both not-found and
        // not-owner. Owner is the student (by admission number); admin,
        // registrar and cibec may access any upload.
        if (!upload) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (!['admin', 'registrar', 'cibec'].includes(req.user.role)) {
            if (String(upload.studentId) !== String(req.user.admissionNumber)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        // SEV-H-011: 15-min cap + safe Content-Disposition/Type enforced in s3Service.
        const isImg = FILE_IMAGE_EXT_RE.test(upload.fileName || '');
        const presignedUrl = await getPresignedUrl(upload.s3Key, 900, {
            displayName: upload.originalFileName, inlineImage: isImg, contentType: upload.mimeType
        });

        // Log download action
        await AuditLog.logAction({
            userId: req.user.userId, // SEV-H-008: actor from verified token
            userType: req.user.role,
            action: 'download',
            fileId: upload._id,
            studentId: upload.studentId,
            details: {
                fileName: upload.originalFileName,
                uploadType: upload.uploadType
            }
        });

        res.json({
            success: true,
            url: presignedUrl,
            fileName: upload.originalFileName,
            uploadType: upload.uploadType
        });
    } catch (error) {
        console.error('Error getting download URL:', error);
        res.status(500).json({
            message: 'Error getting download URL',
            error: error.message
        });
    }
});

// Delete student upload
router.delete('/student-uploads/:uploadId', verifyToken, authorize('admin', 'registrar', 'student', 'cibec'), async (req, res) => {
    try {
        const { uploadId } = req.params;

        const upload = await StudentUpload.findById(uploadId);
        // SEV-H-007: ownership from the verified token, never req.query. Do not
        // leak existence: 403 for both not-found and not-owner. admin,
        // registrar and cibec may delete any upload.
        if (!upload) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (!['admin', 'registrar', 'cibec'].includes(req.user.role)) {
            if (String(upload.studentId) !== String(req.user.admissionNumber)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        // Delete from S3
        await deleteFromS3(upload.s3Key);

        // Mark as deleted in DB (soft delete)
        upload.status = 'deleted';
        upload.updatedAt = Date.now();
        await upload.save();

        // Log delete action
        await AuditLog.logAction({
            userId: req.user.userId, // SEV-H-008: actor from verified token
            userType: req.user.role,
            action: 'delete',
            fileId: upload._id,
            studentId: upload.studentId,
            details: {
                fileName: upload.originalFileName,
                uploadType: upload.uploadType
            }
        });

        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting upload:', error);
        res.status(500).json({
            message: 'Error deleting file',
            error: error.message
        });
    }
});

module.exports = router;
