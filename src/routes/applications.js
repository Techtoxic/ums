const express = require('express');
const router = express.Router();
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { isEligibleToApply } = require('../utils/studentHelpers');
const { Student, GraduationApplication, AttachmentApplication, User, Notification } = require('../db/models');

// Check if student can apply for graduation
router.get('/students/:studentId/graduation-eligibility', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Extract level from course name (e.g., "science_laboratory_technology_5" -> level 5)
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const moduleOfStudy = student.module || 1;

        const eligible = isEligibleToApply(level, moduleOfStudy);

        // A student has an existing application if any non-rejected row exists for them.
        // Query by the resolved student uuid (the shim maps studentId -> student_id).
        const existingApplications = await GraduationApplication.find({ studentId: student.id });
        const existingApplication = existingApplications.find(a => a.status !== 'rejected') || null;

        res.json({
            canApply: eligible && !existingApplication,
            level,
            moduleOfStudy,
            hasExistingApplication: !!existingApplication,
            existingApplication: existingApplication,
            reason: !eligible ? `Level ${level} students can only apply in module ${level - 3}` : null
        });

    } catch (error) {
        console.error('Error checking graduation eligibility:', error);
        res.status(500).json({ message: 'Error checking eligibility' });
    }
});

// Submit graduation application
router.post('/students/:studentId/graduation-application', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Extract level from course name
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const moduleOfStudy = student.module || 1;

        // Validate eligibility
        if (!isEligibleToApply(level, moduleOfStudy)) {
            return res.status(400).json({
                message: `Level ${level} students can only apply for graduation in module ${level - 3}`
            });
        }

        // Guard: block if a non-rejected application already exists (query by student uuid).
        const existingApplications = await GraduationApplication.find({ studentId: student.id });
        if (existingApplications.some(a => a.status !== 'rejected')) {
            return res.status(400).json({ message: 'You have already applied for graduation' });
        }

        // graduation_applications only has student_id (+ status default 'pending'); the V1
        // snapshot fields (name, course, level, academicYear, unitsCompleted, ...) have no columns.
        const application = await GraduationApplication.create({
            studentId: student.id
        });

        // Notify all ILO officers (they review/approve applications)
        const iloUsers = await User.find({ role: 'ilo' });
        for (const ilo of iloUsers) {
            await Notification.create({
                recipientId: ilo.id,
                recipientType: 'user',
                title: 'New Graduation Application',
                body: `${student.name} (${studentId}) has applied for graduation.`,
            });
        }

        res.json({
            success: true,
            message: 'Graduation application submitted successfully',
            application
        });

    } catch (error) {
        console.error('Error submitting graduation application:', error);
        res.status(500).json({ message: 'Error submitting application' });
    }
});

// Check if student can apply for attachment
router.get('/students/:studentId/attachment-eligibility', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Extract level from course name
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const moduleOfStudy = student.module || 1;

        const eligible = isEligibleToApply(level, moduleOfStudy);

        // A student has an existing application if any non-rejected row exists for them.
        // Query by the resolved student uuid (the shim maps studentId -> student_id).
        const existingApplications = await AttachmentApplication.find({ studentId: student.id });
        const existingApplication = existingApplications.find(a => a.status !== 'rejected') || null;

        res.json({
            canApply: eligible && !existingApplication,
            level,
            moduleOfStudy,
            hasExistingApplication: !!existingApplication,
            existingApplication: existingApplication,
            reason: !eligible ? `Level ${level} students can only apply in module ${level - 3}` : null
        });

    } catch (error) {
        console.error('Error checking attachment eligibility:', error);
        res.status(500).json({ message: 'Error checking eligibility' });
    }
});

// Submit attachment application
router.post('/students/:studentId/attachment-application', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { county, nearestTown } = req.body;

        if (!county || !nearestTown) {
            return res.status(400).json({ message: 'County and nearest town are required' });
        }

        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Extract level from course name
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const moduleOfStudy = student.module || 1;

        // Validate eligibility
        if (!isEligibleToApply(level, moduleOfStudy)) {
            return res.status(400).json({
                message: `Level ${level} students can only apply for attachment in module ${level - 3}`
            });
        }

        // Guard: block if a non-rejected application already exists (query by student uuid).
        const existingApplications = await AttachmentApplication.find({ studentId: student.id });
        if (existingApplications.some(a => a.status !== 'rejected')) {
            return res.status(400).json({ message: 'You have already applied for attachment' });
        }

        // Persist the attachment location (county / nearest_town columns added in migration 0004).
        const application = await AttachmentApplication.create({
            studentId: student.id,
            county: county,
            nearestTown: nearestTown,
        });

        // Notify all ILO officers (they review/approve applications)
        const iloUsers = await User.find({ role: 'ilo' });
        for (const ilo of iloUsers) {
            await Notification.create({
                recipientId: ilo.id,
                recipientType: 'user',
                title: 'New Attachment Application',
                body: `${student.name} (${studentId}) has applied for attachment — ${county}, ${nearestTown}.`,
            });
        }

        res.json({
            success: true,
            message: 'Attachment application submitted successfully',
            application
        });

    } catch (error) {
        console.error('Error submitting attachment application:', error);
        res.status(500).json({ message: 'Error submitting application' });
    }
});

module.exports = router;
