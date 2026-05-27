const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config');
const { verifyToken } = require('../middleware/auth');

// SEV-H-011: Multer always writes to MEMORY so the bytes can be inspected
// before anything is persisted. The client-supplied mimetype is informational
// only — magic-byte inspection (validateUploadBuffer) is authoritative.
// `file-type` is not installed and its current major is ESM-only (this code
// base is CommonJS); a self-contained magic-byte sniffer is used instead.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.upload.maxFileSize // hard cap (MAX_FILE_SIZE env, default 10MB); multer rejects larger before the full read. Images further capped to 5MB in validateUploadBuffer.
    }
});

// Image types are additionally capped at 5MB (SEV-H-011 #6).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Per-endpoint allowlist of accepted extensions (SEV-H-011 #3).
const UPLOAD_ALLOWLIST = {
    'student-upload': new Set(['pdf', 'jpg', 'png', 'webp', 'docx']),
    'tool':           new Set(['pdf', 'docx', 'xlsx', 'pptx'])
};
const IMAGE_EXTS = new Set(['jpg', 'png', 'webp']);
// OOXML documents are all ZIP containers; their first bytes are identical.
const OOXML_EXTS = new Set(['docx', 'xlsx', 'pptx']);

// Inspect the leading bytes and return the authoritative kind, or null.
// kinds: 'pdf' | 'jpg' | 'png' | 'webp' | 'zip' (OOXML container)
function sniffMagic(buf) {
    if (!buf || buf.length < 4) return null;
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';      // %PDF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';                          // JPEG
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
        && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) return 'png';
    if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46  // RIFF
        && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp'; // WEBP
    if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';       // PK.. (OOXML)
    return null;
}

// SEV-H-011: sanitize the original filename for safe display/metadata only.
function sanitizeDisplayName(name) {
    let base = path.basename(String(name || '')); // strip any path components
    base = base.replace(/[\x00-\x1f\x7f]/g, ''); // strip control chars (incl. null byte)
    base = base.replace(/[^A-Za-z0-9._ ()\-]/g, '_'); // conservative display charset
    base = base.replace(/\.{2,}/g, '.').replace(/^\.+/, '').trim();
    if (!base) base = 'file';
    return base.slice(0, 255);
}

// SEV-H-011: authoritative post-multer validation. Returns
// { ok, ext, displayName, isImage } or { ok:false, status, message }.
function validateUploadBuffer(file, category) {
    const allow = UPLOAD_ALLOWLIST[category];
    if (!allow) return { ok: false, status: 500, message: 'Unknown upload category' };
    if (!file || !file.buffer || file.buffer.length === 0) {
        return { ok: false, status: 400, message: 'No file uploaded' };
    }
    const kind = sniffMagic(file.buffer);
    if (!kind) {
        return { ok: false, status: 400, message: 'Unsupported or unrecognised file content. Allowed: ' + [...allow].join(', ') };
    }

    let ext;
    if (kind === 'zip') {
        // OOXML container — first bytes cannot distinguish docx/xlsx/pptx.
        // The security boundary (no executables/scripts) is enforced by the
        // ZIP signature; pick the concrete type from the claimed extension,
        // constrained to the OOXML types this endpoint allows.
        const claimed = path.extname(String(file.originalname || '')).slice(1).toLowerCase();
        if (!OOXML_EXTS.has(claimed) || !allow.has(claimed)) {
            return { ok: false, status: 400, message: 'Office document type not allowed here. Allowed: ' + [...allow].join(', ') };
        }
        ext = claimed;
    } else {
        ext = kind === 'jpg' ? 'jpg' : kind; // pdf/png/webp/jpg
        if (!allow.has(ext)) {
            return { ok: false, status: 400, message: 'File type ".' + ext + '" not allowed here. Allowed: ' + [...allow].join(', ') };
        }
    }

    const isImage = IMAGE_EXTS.has(ext);
    if (isImage && file.buffer.length > MAX_IMAGE_BYTES) {
        return { ok: false, status: 400, message: 'Image files must be 5MB or smaller.' };
    }
    return { ok: true, ext, displayName: sanitizeDisplayName(file.originalname), isImage };
}

// ============================================================
// SEV-H-012: short-lived HMAC capability token for file download
// ============================================================
// Lets the existing authFetch -> {url} -> window.open flow keep working for
// LOCAL files (which a browser navigation cannot send a Bearer header for)
// without exposing them unauthenticated. S3 files use presigned URLs instead.
const FILE_GRANT_TTL_MS = 15 * 60 * 1000;
function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function verifyFileGrant(token) {
    try {
        const [payload, sig] = String(token).split('.');
        if (!payload || !sig) return null;
        const expected = b64url(crypto.createHmac('sha256', config.jwt.secret).update(payload).digest());
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        if (!data || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
        return data;
    } catch (e) {
        return null;
    }
}
const FILE_IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp)$/i;
// Auth for the download route: a valid capability token (?t=) OR a Bearer session.
function fileDownloadAuth(req, res, next) {
    const t = req.query.t;
    if (t) {
        const g = verifyFileGrant(t);
        if (g && g.cat === req.params.category && String(g.id) === String(req.params.id)) {
            req.fileGrant = g;
            return next();
        }
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return verifyToken(req, res, next);
}

module.exports = {
    upload,
    validateUploadBuffer,
    sniffMagic,
    sanitizeDisplayName,
    fileDownloadAuth,
    verifyFileGrant,
    b64url,
    FILE_IMAGE_EXT_RE,
    MAX_IMAGE_BYTES,
    UPLOAD_ALLOWLIST,
};
