const express = require('express');
const router = express.Router();
const { fileDownloadAuth, FILE_IMAGE_EXT_RE } = require('../utils/uploads');
const { isValidId } = require('../utils/validators');
const { getPresignedUrl } = require('../utils/s3Service');
const { ToolUpload, StudentUpload } = require('../db/models');

// SEV-H-012: authenticated, ownership-checked file streaming. Replaces the
// removed unauthenticated /uploads static mount. Accepts either a Bearer
// session or a short-lived signed ?t= capability token (see fileDownloadAuth).
router.get('/files/:category/:id/download', fileDownloadAuth, async (req, res) => {
    try {
        const { category, id } = req.params;
        if (!isValidId(String(id))) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        if (category === 'student-upload') {
            const up = await StudentUpload.findById(id);
            if (!up) return res.status(403).json({ success: false, message: 'Forbidden' });
            if (!req.fileGrant) {
                const role = req.user && req.user.role;
                if (!['admin', 'registrar', 'cibec'].includes(role) &&
                    String(up.studentId) !== String(req.user && req.user.admissionNumber)) {
                    return res.status(403).json({ success: false, message: 'Forbidden' });
                }
            }
            if (!up.s3Key) return res.status(404).json({ success: false, message: 'File unavailable' });
            const isImg = FILE_IMAGE_EXT_RE.test(up.fileName || '');
            const url = await getPresignedUrl(up.s3Key, 900, {
                displayName: up.originalFileName, inlineImage: isImg, contentType: up.mimeType
            });
            res.set('X-Content-Type-Options', 'nosniff');
            return res.redirect(url);
        }

        if (category === 'tool') {
            const tool = await ToolUpload.findById(id);
            if (!tool) return res.status(403).json({ success: false, message: 'Forbidden' });
            if (!req.fileGrant) {
                const role = req.user && req.user.role;
                if (!['admin', 'dean', 'deputy'].includes(role) &&
                    String(tool.trainerId) !== String(req.user && req.user.userId)) {
                    return res.status(403).json({ success: false, message: 'Forbidden' });
                }
            }
            // S3-only: tool_uploads rows always carry an s3Key.
            const isImg = FILE_IMAGE_EXT_RE.test(tool.fileName || '');
            const url = await getPresignedUrl(tool.s3Key, 900, {
                displayName: tool.originalName, inlineImage: isImg, contentType: tool.mimeType
            });
            res.set('X-Content-Type-Options', 'nosniff');
            return res.redirect(url);
        }

        return res.status(400).json({ success: false, message: 'Unknown file category' });
    } catch (err) {
        console.error('❌ File download error:', err.message);
        return res.status(500).json({ success: false, message: 'Error serving file' });
    }
});

module.exports = router;
