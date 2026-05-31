const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { upload, validateUploadBuffer, FILE_IMAGE_EXT_RE } = require('../utils/uploads');
// NOTE: deleteFromS3 is intentionally NOT imported here. Student CBET evidence is
// immutable — deletes are soft (status='deleted') and the S3 bytes are retained as
// the permanent audit record. Never delete evidence bytes.
const { uploadToS3, getPresignedUrl } = require('../utils/s3Service');
const { StudentUpload, Student, StudentUnitRegistration, AuditLog, User, Notification } = require('../db/models');

// Staff roles allowed to view/manage ANY student's upload.
const STAFF_UPLOAD_ROLES = ['admin', 'registrar', 'cibec'];

// Ownership is decided ONLY from the verified token, never from req.query/body
// (those are attacker-controlled — e.g. a tampered ?userId in Burp). upload.studentId
// is the student UUID for current data, but may be a legacy admission number; match
// either against the token identity so a student can reach only their own files.
function isUploadOwner(req, upload) {
    const owner = String(upload.studentId);
    return owner === String(req.user.userId) || owner === String(req.user.admissionNumber);
}

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

        // SHA-256 of the validated bytes — integrity proof + duplicate detection.
        const contentHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        // Get student details
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Cohort snapshot — frozen point-in-time, taken from the resolved student
        // record (never trusted from the client). intake_year is NOT NULL on
        // students; intake is the enum.
        const intakeVal = student.intake || null;
        const intakeYearVal = (student.intakeYear != null) ? student.intakeYear
            : (student.intake_year != null ? student.intake_year : null);

        // academic_year / semester are integer columns — coerce the V1 strings.
        const acadYearInt = Number.isFinite(parseInt(String(academicYear).split('/')[0], 10))
            ? parseInt(String(academicYear).split('/')[0], 10) : null;
        const semInt = Number.isFinite(parseInt(String(semester), 10)) ? parseInt(String(semester), 10) : null;

        // Validate unit-related uploads
        if (['assessment', 'practical', 'combined_video'].includes(uploadType)) {
            if (!unitId || !unitCode) {
                return res.status(400).json({ message: 'Unit information required for this upload type' });
            }

            // Check if student is registered for this unit. Use the resolved
            // helper (it maps admission number -> student uuid) instead of a raw
            // findOne, which would try to cast the admission number into the
            // student_id uuid column and 500.
            const regs = await StudentUnitRegistration.getStudentRegistrations(studentId);
            const registration = regs.find(r => String(r.unitId) === String(unitId));

            if (!registration) {
                return res.status(403).json({ message: 'You are not registered for this unit' });
            }

            // Check if unit is common (should not allow uploads for common units)
            if (registration.unitType === 'common') {
                return res.status(403).json({ message: 'Cannot upload assessments for common units' });
            }

            // Completeness at write: every unit-scoped evidence row MUST have a
            // complete, valid address. unit_id is validated above; academic_year +
            // semester must coerce to integers (slot numbers are enforced below).
            if (acadYearInt == null || semInt == null) {
                return res.status(400).json({ message: 'Valid academic year and semester are required for this upload type' });
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

            // Check for existing upload (to replace). Query by the resolved
            // student uuid (not the admission number) and the integer-coerced
            // academic period.
            let existingUpload = null;
            const searchCriteria = {
                studentId: student.id,
                uploadType,
                status: 'uploaded'
            };

            // For profile/results, only check by studentId and uploadType
            // For assessments/practicals/combined_video, also check unit and semester
            if (uploadType === 'assessment') {
                searchCriteria.unitId = unitId;
                searchCriteria.assessmentNumber = assessmentNumber;
                searchCriteria.academicYear = acadYearInt;
                searchCriteria.semester = semInt;
            } else if (uploadType === 'practical') {
                searchCriteria.unitId = unitId;
                searchCriteria.practicalNumber = practicalNumber;
                searchCriteria.academicYear = acadYearInt;
                searchCriteria.semester = semInt;
            } else if (uploadType === 'combined_video') {
                searchCriteria.unitId = unitId;
                searchCriteria.academicYear = acadYearInt;
                searchCriteria.semester = semInt;
            }
            // For profile_photo, kcse_results, kcpe_results - don't filter by academic year/semester

            existingUpload = await StudentUpload.findOne(searchCriteria);

            console.log('Existing upload check:', searchCriteria, 'Found:', !!existingUpload);

        // Duplicate detection: if the current document for this exact slot already
        // holds identical bytes, this is a no-op re-submit. Return the existing
        // current row instead of creating a redundant new version (no S3 write, no
        // supersede). Keeps the version chain meaningful.
        if (existingUpload && existingUpload.contentHash && existingUpload.contentHash === contentHash) {
            return res.json({
                success: true,
                message: 'Identical file already on record for this slot — no new version created',
                duplicate: true,
                data: {
                    id: existingUpload._id,
                    uploadType: existingUpload.uploadType,
                    fileName: existingUpload.originalFileName,
                    status: existingUpload.status,
                    version: existingUpload.version,
                    uploadedAt: existingUpload.uploadedAt
                }
            });
        }

        // If replacing existing, mark old as replaced FIRST to avoid duplicate key
        // error (the partial unique index allows only one status='uploaded' row per
        // slot; superseding before insert keeps the transition legal).
        if (existingUpload) {
            existingUpload.status = 'replaced';
            existingUpload.updatedAt = Date.now();
            await existingUpload.save();
            console.log('Marked old upload as replaced:', existingUpload._id);
        }

        // Version for this new row (computed up-front so it can stamp the key).
        const newVersion = existingUpload ? (existingUpload.version || 1) + 1 : 1;

        // Human-meaningful, sanitised S3 key built from ACADEMIC metadata (not the
        // upload calendar month), so a forensic browse of the bucket is legible:
        //   cibec/{intakeYear}/{course}/module-{module}/{unitCode|general}/{adm}/{type}{slot}_v{n}.{ext}
        // Student-level docs (no unit) land under a /student/ folder. The DB row
        // (s3_key) remains the source of truth; this is for human legibility only.
        // EXISTING keys are never rebuilt — this affects new uploads only.
        const seg = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9._-]/g, '_') || 'na';
        const slotNum = uploadType === 'assessment' ? assessmentNumber
            : uploadType === 'practical' ? practicalNumber : '';
        // Object name is fully server-derived (fixed type, validated 1-3 slot,
        // computed version, magic-byte ext) — no user input, so SEV-H-011 holds —
        // and the version stamp guarantees uniqueness per slot (old versions kept).
        const slotPart = slotNum ? String(slotNum) : '';
        const fileName = `${seg(uploadType)}${slotPart}_v${newVersion}.${v.ext}`;
        const cohortYear = intakeYearVal || acadYearInt || new Date().getFullYear();
        const courseSeg = seg(student.course || 'general');
        const admSeg = seg(student.admissionNumber || studentId);

        let folderPath;
        if (['profile_photo', 'kcse_results', 'kcpe_results'].includes(uploadType)) {
            folderPath = `cibec/${cohortYear}/${courseSeg}/student/${admSeg}`;
        } else {
            folderPath = `cibec/${cohortYear}/${courseSeg}/module-${seg(student.module || 0)}/${seg(unitCode || 'general')}/${admSeg}`;
        }

        const s3Result = await uploadToS3(
            req.file.buffer,
            fileName,
            req.file.mimetype,
            folderPath,
            { displayName: v.displayName, inlineImage: v.isImage }
        );

        // Create new upload record. NOT NULL columns: student_id (resolved uuid),
        // category (= uploadType), file_path (= s3 key), uploaded_by (token user),
        // file_size, mime_type. The rest are the V1 metadata columns added in 0010.
        let newUpload;
        try {
        newUpload = await StudentUpload.create({
            studentId: student.id,
            uploadedBy: req.user.userId,
            category: uploadType,
            filePath: s3Result.key,
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
            version: newVersion,
            replaces: existingUpload ? existingUpload._id : null,
            academicYear: acadYearInt,
            semester: semInt,
            // CBET integrity (Phase 2): frozen cohort snapshot + content hash.
            intake: intakeVal,
            intakeYear: intakeYearVal,
            contentHash: contentHash
        });
        } catch (insertErr) {
            // Defence-in-depth: if the insert fails AFTER the prior row was
            // superseded, restore it so the slot never ends up with zero current
            // documents (e.g. a race: two replaces of the same slot+period).
            if (existingUpload) {
                try { existingUpload.status = 'uploaded'; existingUpload.updatedAt = Date.now(); await existingUpload.save(); } catch (_) { /* best-effort restore */ }
            }
            const code = insertErr && (insertErr.code || (insertErr.cause && insertErr.cause.code));
            if (code === '23505' || /duplicate key|unique/i.test(insertErr.message || '')) {
                return res.status(409).json({ message: 'This slot already has a current document for this period. Refresh and replace it instead.' });
            }
            throw insertErr;
        }

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

        // :studentId is an admission number; resolve it to the student uuid
        // before querying the student_id uuid column (mirrors payments.js).
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const query = { studentId: student.id, status };
        if (uploadType) query.uploadType = uploadType;

        // Sort via the options arg (chained .sort() on the shim is a no-op).
        const uploads = await StudentUpload.find(query, null, { sort: { uploadedAt: -1 } });

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

        // :studentId is an admission number; resolve it to the student uuid.
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const uploads = await StudentUpload.find(
            { studentId: student.id, unitId, status: 'uploaded' },
            null,
            { sort: { uploadType: 1, assessmentNumber: 1 } }
        );

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
        // Owner-only for non-staff. Ownership comes from the token, so a tampered
        // ?userId / changed uploadId in Burp cannot reach another student's file.
        if (!STAFF_UPLOAD_ROLES.includes(req.user.role) && !isUploadOwner(req, upload)) {
            return res.status(403).json({ message: 'Forbidden' });
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
        // Owner-only for non-staff (token-based ownership; query is not trusted).
        if (!STAFF_UPLOAD_ROLES.includes(req.user.role) && !isUploadOwner(req, upload)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Evidence is immutable: soft-delete the row ONLY. The S3 bytes are
        // deliberately retained as the permanent audit record — never deleted.
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
