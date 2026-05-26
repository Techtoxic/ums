const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, desc } = require('drizzle-orm');
const { verifyToken, authorize } = require('../middleware/auth');
const { GraduationApplication, AttachmentApplication, Notification } = require('../db/models');

// Get all graduation applications
router.get('/ilo/graduation-applications', verifyToken, authorize('admin', 'ilo', 'registrar'), async (req, res) => {
    try {
        const { status } = req.query; // department filter dropped — no such column

        const conditions = [];
        if (status) conditions.push(eq(schema.graduationApplications.status, status));

        const applications = await db
            .select({
                id: schema.graduationApplications.id,
                studentId: schema.graduationApplications.student_id,
                status: schema.graduationApplications.status,
                appliedAt: schema.graduationApplications.applied_at,
                comments: schema.graduationApplications.comments,
                reviewedBy: schema.graduationApplications.reviewed_by,
                reviewedAt: schema.graduationApplications.reviewed_at,
                studentName: schema.students.name,
                admissionNumber: schema.students.admission_number,
                course: schema.students.course,
            })
            .from(schema.graduationApplications)
            .innerJoin(schema.students, eq(schema.students.id, schema.graduationApplications.student_id))
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(schema.graduationApplications.applied_at));

        res.json({
            success: true,
            applications,
            total: applications.length
        });

    } catch (error) {
        console.error('Error fetching graduation applications:', error);
        res.status(500).json({ message: 'Error fetching applications' });
    }
});

// Get all attachment applications
router.get('/ilo/attachment-applications', verifyToken, authorize('admin', 'ilo', 'registrar'), async (req, res) => {
    try {
        const { status, county } = req.query; // department filter dropped — no such column

        const conditions = [];
        if (status) conditions.push(eq(schema.attachmentApplications.status, status));
        if (county) conditions.push(eq(schema.attachmentApplications.county, county));

        const applications = await db
            .select({
                id: schema.attachmentApplications.id,
                studentId: schema.attachmentApplications.student_id,
                status: schema.attachmentApplications.status,
                county: schema.attachmentApplications.county,
                nearestTown: schema.attachmentApplications.nearest_town,
                companyName: schema.attachmentApplications.company_name,
                comments: schema.attachmentApplications.comments,
                reviewedBy: schema.attachmentApplications.reviewed_by,
                reviewedAt: schema.attachmentApplications.reviewed_at,
                createdAt: schema.attachmentApplications.created_at,
                studentName: schema.students.name,
                admissionNumber: schema.students.admission_number,
                course: schema.students.course,
            })
            .from(schema.attachmentApplications)
            .innerJoin(schema.students, eq(schema.students.id, schema.attachmentApplications.student_id))
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(schema.attachmentApplications.created_at));

        res.json({
            success: true,
            applications,
            total: applications.length
        });

    } catch (error) {
        console.error('Error fetching attachment applications:', error);
        res.status(500).json({ message: 'Error fetching applications' });
    }
});

// Update application status
router.patch('/ilo/applications/:type/:applicationId/status', verifyToken, authorize('admin', 'ilo', 'registrar'), async (req, res) => {
    try {
        const { type, applicationId } = req.params;
        const { status, comments } = req.body;

        if (!['graduation', 'attachment'].includes(type)) {
            return res.status(400).json({ message: 'Invalid application type' });
        }

        // Validate status against the enum allowed for this application type.
        const allowedStatuses = type === 'graduation'
            ? ['pending', 'verifying', 'approved', 'rejected']
            : ['pending', 'approved', 'completed', 'rejected'];
        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status for ${type} application. Allowed: ${allowedStatuses.join(', ')}` });
        }

        const Model = type === 'graduation' ? GraduationApplication : AttachmentApplication;

        // Update via findByIdAndUpdate (returns the updated row). reviewedBy comes from the
        // verified token, never the client body.
        const application = await Model.findByIdAndUpdate(applicationId, {
            status,
            comments: comments || null,
            reviewedBy: req.user.userId,
            reviewedAt: new Date(),
        });
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // Notify the student (recipientId is the student uuid from the application row).
        await Notification.create({
            recipientId: application.studentId,
            recipientType: 'student',
            title: `${type === 'graduation' ? 'Graduation' : 'Attachment'} Application ${status}`,
            body: `Your ${type} application has been ${status}${comments ? `. Note: ${comments}` : '.'}`,
        });

        res.json({
            success: true,
            message: 'Application status updated successfully',
            application
        });

    } catch (error) {
        console.error('Error updating application status:', error);
        res.status(500).json({ message: 'Error updating application' });
    }
});

module.exports = router;
