const express = require('express');
const router = express.Router();
const { db, schema } = require('../db');
const { eq, and, desc } = require('drizzle-orm');
const crypto = require('crypto');
const { verifyToken, authorize, verifyOwnership } = require('../middleware/auth');
const { upload, validateUploadBuffer, FILE_IMAGE_EXT_RE } = require('../utils/uploads');
const { uploadToS3, getPresignedUrl, isS3Configured } = require('../utils/s3Service');
const { ToolUpload, ToolRequest, Notification, User } = require('../db/models');

// Upload Tools of Trade
router.post('/tools/upload', verifyToken, authorize('admin', 'trainer'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { trainerId, toolType, requestId } = req.body;

        if (!trainerId || !toolType) {
            return res.status(400).json({ message: 'Missing required fields: trainerId and toolType are required' });
        }

        // SEV-H-007: a trainer may only upload as themselves. Trust the token,
        // not the body trainerId, unless the caller is admin.
        if (req.user.role !== 'admin') {
            if (String(trainerId) !== String(req.user.userId)) {
                return res.status(403).json({ message: 'You can only upload tools for your own account.' });
            }
        }

        // SEV-H-011: authoritative magic-byte validation of the in-memory buffer.
        const v = validateUploadBuffer(req.file, 'tool');
        if (!v.ok) {
            return res.status(v.status).json({ message: v.message });
        }

        // S3-only: never fall back to local disk. Reject when storage isn't configured.
        if (!isS3Configured()) {
            return res.status(503).json({ message: 'File storage is not configured. Uploads are temporarily unavailable.' });
        }

        // SEV-H-011: storage name is a server-generated UUID; the original name is kept
        // only as sanitised display metadata. toolType is sanitised for the path segment.
        const safeToolType = String(toolType).replace(/[^A-Za-z0-9._-]/g, '_');
        const fileName = `${crypto.randomUUID()}.${v.ext}`;

        console.log('Uploading tool to S3...');
        const s3Result = await uploadToS3(
            req.file.buffer,
            fileName,
            req.file.mimetype,
            `tools-of-trade/${safeToolType}`,
            { displayName: v.displayName, inlineImage: v.isImage }
        );
        console.log('Tool uploaded to S3:', s3Result.key);

        const newUpload = await ToolUpload.create({
            requestId: requestId || null,
            trainerId,
            toolType,
            fileName,
            originalName: v.displayName,
            s3Key: s3Result.key,
            s3Bucket: s3Result.bucket,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
        });

        // If this upload fulfils a specific request, mark that request fulfilled.
        // Don't fail the upload if the request id is missing or invalid.
        if (requestId) {
            try {
                const reqRow = await ToolRequest.findById(requestId);
                if (reqRow) {
                    await ToolRequest.findByIdAndUpdate(requestId, { status: 'fulfilled' });
                }
            } catch (e) {
                console.warn('Could not mark tool request fulfilled:', e.message);
            }
        }

        // Notify the Dean(s) — they review submissions.
        const deans = await User.find({ role: 'dean' });
        for (const dean of deans) {
            await Notification.create({
                recipientId: dean.id,
                recipientType: 'user',
                title: 'New Tools of Trade Submission',
                body: `A trainer submitted a ${toolType.replace(/_/g, ' ')}.`,
            });
        }

        res.json({
            success: true,
            message: 'File uploaded',
            data: {
                id: newUpload.id,
                fileName: newUpload.fileName,
                originalName: newUpload.originalName,
                toolType: newUpload.toolType,
                status: newUpload.status,
            }
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            message: 'Error uploading file',
            error: error.message
        });
    }
});

// Get Tools of Trade for a trainer
router.get('/tools/trainer/:trainerId', verifyToken, authorize('admin', 'trainer', 'hod'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { toolType, status } = req.query;

        const filter = { trainerId };
        if (toolType) filter.toolType = toolType;
        if (status) filter.status = status;

        // Sort in the DB (chained .sort() on the shim result is a no-op); drop soft-deleted in JS.
        const rows = await ToolUpload.find(filter, null, { sort: { createdAt: -1 } });
        const tools = rows.filter(r => !r.deletedAt);

        res.json(tools);
    } catch (error) {
        console.error('Error fetching tools:', error);
        res.status(500).json({ message: 'Error fetching tools' });
    }
});

// Get all Tools of Trade (for HOD/Deputy)
router.get('/tools', verifyToken, authorize('admin', 'trainer', 'hod', 'registrar', 'deputy'), async (req, res) => {
    try {
        const { status, toolType, department } = req.query;

        // Drizzle join to users (the trainer) for the trainer's name/department.
        const conditions = [];
        if (status) conditions.push(eq(schema.toolUploads.status, status));
        if (toolType) conditions.push(eq(schema.toolUploads.tool_type, toolType));

        const rows = await db
            .select({
                id: schema.toolUploads.id,
                requestId: schema.toolUploads.request_id,
                trainerId: schema.toolUploads.trainer_id,
                toolType: schema.toolUploads.tool_type,
                fileName: schema.toolUploads.file_name,
                originalName: schema.toolUploads.original_name,
                s3Key: schema.toolUploads.s3_key,
                fileSize: schema.toolUploads.file_size,
                mimeType: schema.toolUploads.mime_type,
                status: schema.toolUploads.status,
                reviewedBy: schema.toolUploads.reviewed_by,
                reviewedAt: schema.toolUploads.reviewed_at,
                createdAt: schema.toolUploads.created_at,
                deletedAt: schema.toolUploads.deleted_at,
                trainerName: schema.users.name,
                trainerDepartment: schema.users.department,
            })
            .from(schema.toolUploads)
            .innerJoin(schema.users, eq(schema.users.id, schema.toolUploads.trainer_id))
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(schema.toolUploads.created_at));

        // Exclude soft-deleted; optional department filter applied to the joined trainer's dept.
        let filteredUploads = rows.filter(r => !r.deletedAt);
        if (department) {
            filteredUploads = filteredUploads.filter(r => r.trainerDepartment === department);
        }

        res.json(filteredUploads);
    } catch (error) {
        console.error('Error fetching tools:', error);
        res.status(500).json({ message: 'Error fetching tools' });
    }
});

// Update tool status (for Deputy only)
router.patch('/tools/:toolId/status', verifyToken, authorize('admin', 'dean', 'deputy'), async (req, res) => {
    try {
        const { toolId } = req.params;
        const { status, feedback } = req.body;

        // tool_uploads.status values. Note: tool_uploads has NO feedback column —
        // feedback is not persisted; it only reaches the trainer via the notification below.
        if (!['reviewed', 'rejected', 'submitted'].includes(status)) {
            return res.status(400).json({ message: "status must be 'reviewed', 'rejected' or 'submitted'" });
        }

        const updated = await ToolUpload.findByIdAndUpdate(toolId, {
            status,
            reviewedBy: req.user.userId, // actor sourced from the verified token, never the client body
            reviewedAt: new Date(),
        });
        if (!updated) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        // Notify the trainer. updated.trainerId is the trainer's user uuid → recipientType 'user'.
        await Notification.create({
            recipientId: updated.trainerId,
            recipientType: 'user',
            title: `Tools of Trade ${status}`,
            body: `Your ${(updated.toolType || 'tool').replace(/_/g, ' ')} submission has been ${status}.${feedback ? ' Feedback: ' + feedback : ''}`,
        });

        res.json({
            success: true,
            message: 'Tool status updated',
            data: updated
        });
    } catch (error) {
        console.error('Error updating tool status:', error);
        res.status(500).json({ message: 'Error updating tool status' });
    }
});

// Get presigned URL for downloading a file from S3
router.get('/tools/:toolId/download', verifyToken, authorize('admin', 'dean', 'trainer', 'deputy'), async (req, res) => {
    try {
        const { toolId } = req.params;

        const tool = await ToolUpload.findById(toolId);
        // SEV-H-007 pattern: 403 for both not-found and not-owner.
        if (!tool) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        // SEV-H-012: ownership — admin/dean may access any tool; otherwise the
        // requester must be the owning trainer.
        if (!['admin', 'dean', 'deputy'].includes(req.user.role) &&
            String(tool.trainerId) !== String(req.user.userId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // S3-only: tool_uploads rows always carry an s3Key.
        // SEV-H-011: 15-min cap + safe disposition are enforced in s3Service.
        const isImg = FILE_IMAGE_EXT_RE.test(tool.fileName || '');
        const presignedUrl = await getPresignedUrl(tool.s3Key, 900, {
            displayName: tool.originalName, inlineImage: isImg, contentType: tool.mimeType
        });
        res.json({ success: true, url: presignedUrl, fileName: tool.originalName });
    } catch (error) {
        console.error('Error getting download URL:', error);
        res.status(500).json({
            message: 'Error getting download URL',
            error: error.message
        });
    }
});

// Delete tool submission
router.delete('/tools/:toolId', verifyToken, authorize('admin', 'deputy', 'trainer'), async (req, res) => {
    try {
        const { toolId } = req.params;

        const tool = await ToolUpload.findById(toolId);
        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        // Delete policy: a trainer may delete only their OWN upload, and only
        // while it is still 'submitted' (not yet reviewed). admin/deputy may
        // delete any upload, any status. Other roles are blocked by authorize().
        if (req.user.role === 'trainer') {
            if (String(tool.trainerId) !== String(req.user.userId)) {
                return res.status(403).json({ message: 'You can only delete your own uploads.' });
            }
            if (tool.status !== 'submitted') {
                return res.status(403).json({ message: 'This upload has already been reviewed and can no longer be deleted.' });
            }
        }

        // Soft delete: hide the row, keep the S3 file. No hard delete, no S3 deletion.
        await ToolUpload.findByIdAndUpdate(toolId, { deletedAt: new Date() });

        res.json({
            success: true,
            message: 'Tool submission removed'
        });
    } catch (error) {
        console.error('Error deleting tool:', error);
        res.status(500).json({
            message: 'Error deleting tool',
            error: error.message
        });
    }
});

module.exports = router;
