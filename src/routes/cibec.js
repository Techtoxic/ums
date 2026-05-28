const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../middleware/auth');
const { StudentUpload, AuditLog, Student } = require('../db/models');

// Get all uploads with filters (CIBEC)
router.get('/cibec/uploads', verifyToken, authorize('admin', 'cibec', 'registrar'), async (req, res) => {
    try {
        const filters = {
            course: req.query.course,
            department: req.query.department,
            unitCode: req.query.unitCode,
            module: req.query.module,
            courseLevel: req.query.courseLevel,
            uploadType: req.query.uploadType,
            academicYear: req.query.academicYear,
            semester: req.query.semester,
            studentId: req.query.studentId,
            admissionNumber: req.query.admissionNumber,
            status: req.query.status || 'uploaded'
        };

        const uploads = await StudentUpload.getCIBECUploads(filters);

        // Log search action
        await AuditLog.logAction({
            userId: req.user.userId, // SEV-H-008: actor from verified token
            userType: req.user.role,
            action: 'search',
            details: { filters, resultCount: uploads.length }
        });

        res.json({
            success: true,
            count: uploads.length,
            uploads
        });
    } catch (error) {
        console.error('Error fetching CIBEC uploads:', error);
        res.status(500).json({ message: 'Error fetching uploads' });
    }
});

// Get CIBEC statistics
router.get('/cibec/statistics', verifyToken, authorize('admin', 'cibec', 'registrar', 'dean'), async (req, res) => {
    try {
        const { academicYear, semester } = req.query;

        const query = academicYear && semester
            ? { academicYear, semester, status: 'uploaded' }
            : { status: 'uploaded' };

        const [
            totalUploads,
            byType,
            byDepartment,
            byCourse,
            recentUploads
        ] = await Promise.all([
            StudentUpload.countDocuments(query),
            StudentUpload.aggregate([
                { $match: query },
                { $group: { _id: '$uploadType', count: { $sum: 1 } } }
            ]),
            StudentUpload.aggregate([
                { $match: query },
                { $group: { _id: '$department', count: { $sum: 1 } } }
            ]),
            StudentUpload.aggregate([
                { $match: query },
                { $group: { _id: '$course', count: { $sum: 1 } } }
            ]),
            StudentUpload.find(query)
                .sort({ uploadedAt: -1 })
                .limit(10)
                .populate('unitId')
        ]);

        res.json({
            success: true,
            statistics: {
                totalUploads,
                byType,
                byDepartment,
                byCourse,
                recentUploads
            }
        });
    } catch (error) {
        console.error('Error fetching CIBEC statistics:', error);
        res.status(500).json({ message: 'Error fetching statistics' });
    }
});

// Get student's all uploads (CIBEC view)
router.get('/cibec/student/:studentId/uploads', verifyToken, authorize('admin', 'cibec', 'registrar'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { cibecUserId } = req.query;

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const uploads = await StudentUpload.find({
            studentId,
            status: 'uploaded'
        })
            .populate('unitId')
            .sort({ uploadedAt: -1 });

        // Log view action
        await AuditLog.logAction({
            userId: req.user.userId, // SEV-H-008: actor from verified token
            userType: req.user.role,
            action: 'view',
            studentId,
            details: {
                studentName: student.name,
                admissionNumber: student.admissionNumber,
                uploadCount: uploads.length
            }
        });

        res.json({
            success: true,
            student: {
                studentId: student.admissionNumber,
                name: student.name,
                course: student.course,
                department: student.department,
                module: student.module
            },
            uploads
        });
    } catch (error) {
        console.error('Error fetching student uploads for CIBEC:', error);
        res.status(500).json({ message: 'Error fetching student uploads' });
    }
});

// Get audit logs (CIBEC)
router.get('/cibec/audit-logs', verifyToken, authorize('admin', 'cibec'), async (req, res) => {
    try {
        const { dateFrom, dateTo, action, userId, limit = 100 } = req.query;

        const query = {};
        if (dateFrom || dateTo) {
            query.timestamp = {};
            if (dateFrom) query.timestamp.$gte = new Date(dateFrom);
            if (dateTo) query.timestamp.$lte = new Date(dateTo);
        }
        if (action) query.action = action;
        if (userId) query.userId = userId;

        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .populate('fileId');

        res.json({
            success: true,
            count: logs.length,
            logs
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ message: 'Error fetching audit logs' });
    }
});

module.exports = router;
