require('dotenv').config();
const dns = require('dns');
// Set DNS resolution order to prioritize IPv4 (Windows fix for MongoDB Atlas)
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const config = require('./src/config/config');
const csp = require('./src/config/csp'); // SEV-M-025: CSP (Report-Only by default)

// Student Schema
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    idNumber: { type: String, required: true, unique: true },
    kcseGrade: { type: String, required: true },
    admissionNumber: { type: String, required: true, unique: true },
    course: { type: String, required: true },
    department: { type: String, required: true },
    year: { type: Number, required: true },
    intake: { 
        type: String, 
        required: true, 
        enum: ['january', 'september'],
        lowercase: true 
    },
    intakeYear: { type: Number, required: true },
    phoneNumber: { type: String, required: true },
    email: { 
        type: String, 
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Invalid email format'
        }
    },
    admissionType: { 
        type: String, 
        required: true, 
        enum: ['walk-in', 'KUCCPS'],
        default: 'walk-in'
    },
    password: { type: String, required: true, select: false }, // SEV-H-018: never returned by default queries
    role: { type: String, default: 'student' },
    tokenVersion: { type: Number, default: 0 }, // SEV-H-013: bumped on password/email change to revoke JWTs
    isFirstLogin: { type: Boolean, default: true }, // SEV-H-014
    mustUpdatePassword: { type: Boolean, default: true }, // SEV-H-014: forced change of the random initial password
    createdAt: { type: Date, default: Date.now }
});

// Hash password before saving + SEV-H-013 tokenVersion bump
studentSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    if (!this.isNew && (this.isModified('password') || this.isModified('email'))) {
        this.tokenVersion = (this.tokenVersion || 0) + 1;
    }
    next();
});

// Method to compare passwords
studentSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// SEV-H-018: strip secret-like fields from any serialised output.
function stripStudentSecrets(doc, ret) {
    delete ret.password;
    delete ret.tokenVersion;
    return ret;
}
studentSchema.set('toJSON', { transform: stripStudentSecrets });
studentSchema.set('toObject', { transform: stripStudentSecrets });

// Register Student model (check if already exists for serverless compatibility)
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

// Import models
const Unit = require('./src/models/Unit');
const Trainer = require('./src/models/Trainer');
const TrainerAssignment = require('./src/models/TrainerAssignment');
const HOD = require('./src/models/HOD');
const CommonUnit = require('./src/models/CommonUnit');
const CommonUnitAssignment = require('./src/models/CommonUnitAssignment');
const SystemSettings = require('./src/models/SystemSettings');
const StudentUnitRegistration = require('./src/models/StudentUnitRegistration');
const ToolsOfTrade = require('./src/models/ToolsOfTrade');
const Notification = require('./src/models/Notification');
const GraduationApplication = require('./src/models/GraduationApplication');
const AttachmentApplication = require('./src/models/AttachmentApplication');
const PasswordReset = require('./src/models/PasswordReset');
const StudentUpload = require('./src/models/StudentUpload');
const AuditLog = require('./src/models/AuditLog');
const StudentNote = require('./src/models/StudentNote');
const Payslip = require('./src/models/Payslip');
const AdminStaff = require('./src/models/AdminStaff');
const LoginOTP = require('./src/models/LoginOTP');

// Import services
const EmailService = require('./src/utils/emailService');
const { uploadToS3, getPresignedUrl, deleteFromS3, isS3Configured } = require('./src/utils/s3Service');

// Import authentication middleware
const { verifyToken, authorize, verifyOwnership, optionalAuth, enforceStudentFirstLogin, signToken } = require('./src/middleware/auth');

// Initialize email service
let emailService;
try {
    emailService = new EmailService();
    console.log('✅ Email service initialized');
} catch (err) {
    console.error('⚠️ Email service failed to initialize:', err.message);
    // Create stub for build phase
    emailService = {
        sendOTPEmail: async () => console.log('📧 Email stub: sendOTPEmail'),
        sendResetLinkEmail: async () => console.log('📧 Email stub: sendResetLinkEmail'),
        sendPassword: async () => console.log('📧 Email stub: sendPassword'),
        sendStudentCredentials: async () => console.log('📧 Email stub: sendStudentCredentials')
    };
}

// Import data parsers
const { getAllTrainers, parseTrainersFile } = require('./src/data/trainerData');

// SEV-H-019: escape user/DB-supplied values before using them inside a RegExp
// or a Mongoose $regex, to prevent regex injection and ReDoS.
function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// SEV-H-016: money is stored as Decimal128 for exactness. These helpers
// convert at the boundary. Choice (documented in STAGE2A_REPORT.md):
// arithmetic/comparisons are done in Number space via parseFloat(String(...));
// KES amounts are well within JS safe-integer range, and storage stays exact.
function toMoneyNumber(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(v.toString());
    return Number.isFinite(n) ? n : 0;
}
function toDecimal128(v) {
    const n = toMoneyNumber(v);
    return mongoose.Types.Decimal128.fromString(n.toFixed(2));
}

// Utility function to format course names
function formatCourseNameServer(courseCode) {
    if (!courseCode) return 'Unknown Course';
    
    // Course name mappings
    const courseNames = {
        'analytical_chemistry_6': 'Analytical Chemistry',
        'sustainable_agriculture_5': 'Sustainable Agriculture',
        'building_technology_6': 'Building Technology',
        'electrical_installation_6': 'Electrical Installation',
        'food_beverage_6': 'Food & Beverage Service',
        'business_management_6': 'Business Management',
        'computer_science_6': 'Computer Science',
        'fashion_design_4': 'Fashion & Design',
        'science_laboratory_technology_6': 'Science Laboratory Technology',
        'crop_production_6': 'Crop Production',
        'civil_engineering_6': 'Civil Engineering',
        'mechanical_engineering_6': 'Mechanical Engineering',
        'hospitality_management_6': 'Hospitality Management',
        'accounting_6': 'Accounting',
        'information_technology_6': 'Information Technology',
        'interior_design_4': 'Interior Design'
    };
    
    return courseNames[courseCode] || courseCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Import routes (conditionally) and database initializer
let studentRoutes;
try {
    studentRoutes = require('./src/server/routes/student');
} catch (err) {
    console.warn('Student routes file not found, using inline student endpoints.');
}

const adminAuthRoutes = require('./src/routes/adminAuth');

console.log('🔵 All imports loaded successfully');

const app = express();

console.log('🔵 Express app created');

// Create uploads directory if it doesn't exist (skip in serverless/Vercel environment)
const uploadsDir = path.join(__dirname, 'uploads');
if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('✅ Created uploads directory');
    } catch (err) {
        console.warn('⚠️  Could not create uploads directory (using S3):', err.message);
    }
} else if (process.env.VERCEL) {
    console.log('🌐 Running on Vercel - using S3 for file storage');
}

// SEV-H-011: Multer always writes to MEMORY so the bytes can be inspected
// before anything is persisted. The client-supplied mimetype is informational
// only — magic-byte inspection (validateUploadBuffer) is authoritative.
// `file-type` is not installed and its current major is ESM-only (this code
// base is CommonJS); a self-contained magic-byte sniffer is used instead.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB hard cap; multer rejects larger before the full read. Images further capped to 5MB in validateUploadBuffer.
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
function signFileGrant(grant) {
    const payload = b64url(JSON.stringify({ cat: grant.cat, id: String(grant.id), exp: Date.now() + FILE_GRANT_TTL_MS }));
    const sig = b64url(crypto.createHmac('sha256', config.jwt.secret).update(payload).digest());
    return `${payload}.${sig}`;
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

// ===============================
// DATABASE CONNECTION
// ===============================

// Lazy MongoDB connection for serverless
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(config.mongodbUri, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            family: 4,
        });
        
        isConnected = true;
        console.log('✅ MongoDB connected');
        
        // Initialize default data
        await initializeSystemSettings();
        await initializeCommonUnits();
        await initializeTrainers();
        await initializeAdminStaff();
        
    } catch (error) {
        console.error('❌ MongoDB error:', error.message);
        throw error;
    }
};

// Middleware to ensure DB connection
const ensureDB = async (req, res, next) => {
    try {
        if (!isConnected) {
            await connectDB();
        }
        next();
    } catch (err) {
        res.status(500).json({ message: 'Database connection failed' });
    }
};

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err);
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

// Lazy connection - don't connect at startup for Vercel
console.log('Loading middleware and routes...');

// Trust the first proxy (Vercel/Render/Cloudflare). Required for real client IPs in rate limiting.
app.set('trust proxy', 1);

// ===============================
// SECURITY MIDDLEWARE
// ===============================

// helmet sets the baseline security headers (HSTS, X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy, etc). helmet's OWN CSP stays disabled here
// so this call — and therefore every other helmet header — is unchanged by
// Stage 2B-2B; CSP is emitted by the dedicated middleware below (full control
// of report-uri/report-to and the Report-Only vs enforce toggle). See src/config/csp.js.
app.use(helmet({
    contentSecurityPolicy: false,        // CSP emitted separately (Report-Only) — see csp middleware below
    crossOriginEmbedderPolicy: false      // PDFs and external assets need this off for now
}));

// SEV-M-025: emit Content-Security-Policy-Report-Only (or Content-Security-Policy
// when CSP_ENFORCE=true). Report-Only NEVER blocks — it only reports to
// /api/csp-report. Default is Report-Only; do not flip to enforce here.
const CSP_HEADER_NAME = csp.headerName();
const CSP_HEADER_VALUE = csp.buildCspString(config.isProduction);
const CSP_REPORT_TO = csp.reportToHeaderValue();
app.use((req, res, next) => {
    res.setHeader(CSP_HEADER_NAME, CSP_HEADER_VALUE);
    res.setHeader('Report-To', CSP_REPORT_TO);
    next();
});

// CORS: in production, only allow configured origins. In development, allow any.
const corsOptions = {
    origin(origin, callback) {
        // Allow requests with no origin (server-to-server, mobile apps, curl)
        if (!origin) return callback(null, true);
        if (!config.isProduction) return callback(null, true);
        if (config.allowedOrigins.length === 0) return callback(new Error('CORS not configured: set ALLOWED_ORIGINS'));
        if (config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true
};
app.use(cors(corsOptions));

// ===============================
// CSP VIOLATION REPORT ENDPOINT (SEV-M-025)
// ===============================
// Registered BEFORE the global body parser / ensureDB / generalApiLimiter / auth
// so: (a) its own 64KB parser is authoritative for this route (the global 1mb
// JSON parser never sees it), (b) it needs no DB and no auth (browsers post
// these unauthenticated, cross-context), (c) it has its own dedicated limiter.
// It NEVER blocks anything and ALWAYS returns 204 — it is pure telemetry.

// Dedicated, generous per-IP limiter. A misconfigured page can emit a violation
// per blocked subresource per navigation, so this is intentionally high; it only
// exists to cap a hostile flood, not to shape normal reporting volume.
const cspReportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,          // 1 hour
    max: 1000,                          // 1000 reports per IP per hour
    standardHeaders: true,
    legacyHeaders: false,
    // A rate-limited report is dropped silently with 204 (don't leak limiter state
    // to the browser; a 429 here would just generate console noise client-side).
    handler: (req, res) => res.status(204).end()
});

// Body size capped at 64KB: real CSP reports are a few hundred bytes; 64KB is
// generous headroom while still bounding memory if someone posts garbage.
// `type` matches all three content-types browsers use for violation reports:
//   - application/csp-report      (legacy report-uri)
//   - application/reports+json    (Reporting API / report-to)
//   - application/json            (some browsers / manual testing)
const cspReportParser = express.json({
    limit: '64kb',
    type: ['application/csp-report', 'application/reports+json', 'application/json']
});

app.post('/api/csp-report', cspReportLimiter, cspReportParser,
    // Body-parser rejections (PayloadTooLargeError when > 64KB, SyntaxError on
    // malformed JSON) arrive here via next(err). This route must never 4xx/5xx
    // on a bad report — log and still 204. (4-arg arity = Express error handler.)
    (err, req, res, next) => {
        if (res.headersSent) return next(err);
        console.log(`[CSP-REPORT] body rejected: ${err && err.message}`);
        return res.status(204).end();
    },
    (req, res) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const ts = new Date().toISOString();
        const body = req.body || {};

        // Normalize the two wire formats into a flat list of violation records.
        // Legacy report-uri:  { "csp-report": { ... } }  (single object)
        // Reporting API:      [ { type, body: { ... } }, ... ]  (array)
        let reports = [];
        if (Array.isArray(body)) {
            reports = body
                .filter(r => r && (r.type === 'csp-violation' || r.body))
                .map(r => r.body || r);
        } else if (body['csp-report']) {
            reports = [body['csp-report']];
        } else if (Object.keys(body).length > 0) {
            // Unknown shape — log it raw rather than dropping the signal.
            reports = [body];
        }

        for (const r of reports) {
            // Field names differ between the legacy (kebab-case) and Reporting
            // API (camelCase) schemas — read both.
            const violated = r['violated-directive'] || r['effective-directive'] ||
                r.effectiveDirective || r.violatedDirective || 'unknown';
            const blocked = r['blocked-uri'] || r.blockedURL || 'unknown';
            const docUri = r['document-uri'] || r.documentURL || 'unknown';
            const sourceFile = r['source-file'] || r.sourceFile || '';
            const line = r['line-number'] ?? r.lineNumber ?? '';
            const col = r['column-number'] ?? r.columnNumber ?? '';
            const loc = sourceFile ? ` source=${sourceFile}:${line}:${col}` : '';

            console.log(
                `[CSP-REPORT] ${ts} ip=${ip} ` +
                `violated-directive="${violated}" ` +
                `blocked-uri="${blocked}" ` +
                `document-uri="${docUri}"${loc}`
            );
        }
    } catch (err) {
        // Never let a malformed report turn into a 5xx — this endpoint must be
        // boring and unkillable. Swallow and still 204.
        console.log(`[CSP-REPORT] parse error: ${err && err.message}`);
    }
    // Always 204 No Content, regardless of outcome.
    res.status(204).end();
});

// Body parser with explicit size limits (defends against memory-exhaustion via huge payloads)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Strip MongoDB operator characters from req.body, req.query, req.params to defeat
// NoSQL injection (e.g. {"$ne": null} as a password).
// Replaces express-mongo-sanitize (incompatible with Express 5 read-only req.query).
function customMongoSanitize(options) {
    const replaceWith = options.replaceWith || '_';
    const onSanitize = options.onSanitize || function () {};

    function sanitize(obj) {
        if (obj == null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitize);
        }
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            let newKey = key;
            if (key.startsWith('$')) {
                onSanitize({ req: null, key });
                newKey = replaceWith + key.slice(1);
            }
            if (newKey.includes('.')) {
                onSanitize({ req: null, key });
                newKey = newKey.split('.').join(replaceWith);
            }
            result[newKey] = sanitize(value);
        }
        return result;
    }

    return function (req, res, next) {
        // Express 5 makes several request properties read-only.
        // Wrap each assignment in try/catch so a single read-only prop
        // does not crash the whole request.
        try {
            if (req.body && typeof req.body === 'object') {
                req.body = sanitize(req.body);
            }
        } catch (e) {
            // body is read-only — unlikely, but harmless to skip
        }

        try {
            if (req.query && typeof req.query === 'object') {
                const clean = sanitize(req.query);
                req._query = clean;
                req.query = clean;
            }
        } catch (e) {
            // read-only in Express 5 — _query fallback above handles it
        }

        try {
            if (req.params && typeof req.params === 'object') {
                req.params = sanitize(req.params);
            }
        } catch (e) {
            // read-only in Express 5 — params are usually clean anyway at this stage
        }

        next();
    };
}

app.use(customMongoSanitize({
    replaceWith: '_',
    onSanitize: ({ key }) => {
        console.warn(`Sanitized prohibited key "${key}"`);
    }
}));

// Block direct browser access to server-side source files. The /src directory contains
// route handlers, models, middleware, config, and utility code that must never be served
// as static assets. We explicitly serve /src/components below for the client-side HTML/JS only.
app.use((req, res, next) => {
    const url = req.url.toLowerCase().split('?')[0];
    const blockedPrefixes = [
        '/src/middleware/',
        '/src/routes/',
        '/src/config/',
        '/src/models/',
        '/src/utils/',
        '/src/data/',
        '/src/server/',
        '/middleware/',
        '/routes/',
        '/config/',
        '/models/',
        '/utils/',
        '/data/'
    ];
    const blockedExactOrSuffix = [
        '/.env',
        '/server.js',
        '/package.json',
        '/package-lock.json',
        '/vercel.json',
        '.old.html',
        '.old.js',
        '.bak',
        'trainers.txt',
        'instructions.txt'
    ];
    if (blockedPrefixes.some(p => url.startsWith(p)) ||
        blockedExactOrSuffix.some(s => url === s || url.endsWith(s))) {
        return res.status(404).send('Not Found');
    }
    next();
});

// Apply DB connection middleware to API routes
app.use('/api', ensureDB);

// ===============================
// RATE LIMITERS
// ===============================

// General API limiter - generous, applies to all /api/*
const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,        // 15 minutes
    max: 300,                          // 300 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

// Tighter limiter for authentication endpoints (login, OTP, password reset)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,                           // 20 attempts per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' }
});

app.use('/api', generalApiLimiter);

// SEV-H-014: block a student with the forced-change flag from doing anything
// except changing their initial password.
app.use('/api', enforceStudentFirstLogin);

// ===============================
// STATIC FILE SERVING
// ===============================

// SEV-H-012: the unauthenticated `app.use('/uploads', express.static('uploads'))`
// mount was REMOVED. User-uploaded files are now served only through the
// authenticated, ownership-checked route GET /api/files/:category/:id/download.

// Public assets (favicon, public JS config, etc.)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Only the components subdirectory of src is safe to expose - it contains
// client-side HTML and JS that the browser legitimately needs.
app.use('/src/components', express.static(path.join(__dirname, 'src', 'components')));

// Helper function to serve HTML files (Vercel-compatible)
const serveHTML = (res, filePath) => {
    if (process.env.VERCEL) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(content);
        } catch (err) {
            console.error('Error reading file:', err.message);
            res.status(404).send('Page not found');
        }
    } else {
        res.sendFile(filePath);
    }
};

// Auth pages (login, OTP step, password reset, first-login) must never be
// cached by the browser — otherwise the back button can re-display the OTP
// page with the code still visible. Applied per-route, NOT globally, so
// static assets (CSS/JS/images) keep their normal caching.
function noCacheAuthPages(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}

// Minimal request logger - method, path, status only. Never log headers or bodies.
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
});

// ===============================
// FORGOT PASSWORD API ENDPOINTS  
// ===============================

// Forgot password endpoint - Initiate password reset (OTP or Token)
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email, resetMethod, userType } = req.body;
        
        if (!email || !resetMethod || !userType) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email, reset method, and user type are required' 
            });
        }

        if (!['otp', 'token'].includes(resetMethod)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid reset method. Use "otp" or "token"' 
            });
        }

        if (!['student', 'trainer', 'hod', 'admin', 'finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'].includes(userType)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user type' 
            });
        }

        // Find user based on type
        let user = null;
        let userData = null;

        if (userType === 'admin') {
            user = await AdminStaff.findOne({ email: email.toLowerCase(), isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department || 'Administration'
                };
            }
        } else if (userType === 'hod') {
            user = await HOD.findOne({ email: email.toLowerCase(), isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department
                };
            }
        } else if (userType === 'trainer') {
            user = await Trainer.findOne({ email: email.toLowerCase(), isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department
                };
            }
        } else if (userType === 'student') {
            user = await Student.findOne({ email: email.toLowerCase() });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    admissionNumber: user.admissionNumber
                };
            }
        } else if (['finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'].includes(userType)) {
            user = await AdminStaff.findOne({ email: email.toLowerCase(), role: userType, isActive: true });
            if (user) {
                userData = {
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department || userType
                };
            }
        }

        // Always return the same response to prevent email enumeration
        const standardResponse = {
            success: true,
            message: `If an account with that email exists, you will receive a ${resetMethod === 'otp' ? 'verification code' : 'reset link'} shortly.`
        };

        // If user not found, still return success but don't send email
        if (!user) {
            return res.json(standardResponse);
        }

        // Check rate limiting - max 3 attempts per 15 minutes per email
        const recentAttempts = await PasswordReset.countDocuments({
            email: email.toLowerCase(),
            userType: userType,
            createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) }
        });

        if (recentAttempts >= 3) {
            return res.json(standardResponse); // Don't reveal rate limiting
        }

        // Invalidate any existing reset requests for this user
        await PasswordReset.invalidateUserResets(userData.userId, userType);

        // Create new reset request
        const resetData = {
            userId: userData.userId,
            userType: userType,
            email: email.toLowerCase(),
            resetType: resetMethod,
            ipAddress: req.ip || (req.socket && req.socket.remoteAddress) || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown'
        };

        if (resetMethod === 'otp') {
            resetData.otp = PasswordReset.generateOTP();
        } else {
            resetData.resetToken = PasswordReset.generateResetToken();
        }

        const passwordReset = new PasswordReset(resetData);
        await passwordReset.save();

        // Send email. Do not log recipient email, OTP value, or token.
        try {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const host = req.headers['x-forwarded-host'] || req.headers.host || config.baseUrl;
            const baseUrl = `${protocol}://${host}`;

            if (resetMethod === 'otp') {
                await emailService.sendOTPEmail(userData.email, resetData.otp, userData.name, userType);
            } else {
                await emailService.sendResetLinkEmail(userData.email, resetData.resetToken, userData.name, userType, baseUrl);
            }
        } catch (emailError) {
            console.error('Password reset email failed to send:', emailError.message);
        }

        res.json(standardResponse);

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred. Please try again later.' 
        });
    }
});

// Verify OTP endpoint
app.post('/api/auth/verify-otp', authLimiter, async (req, res) => {
    try {
        const { email, otp, userType } = req.body;
        
        if (!email || !otp || !userType) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email, OTP, and user type are required' 
            });
        }

        // Find valid OTP reset request
        const resetRequest = await PasswordReset.findValidReset({
            email: email.toLowerCase(),
            userType: userType,
            resetType: 'otp',
            otp: otp
        });

        if (!resetRequest) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired OTP' 
            });
        }

        if (!resetRequest.canAttempt()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum OTP attempts exceeded or OTP expired' 
            });
        }

        // Generate session token for password reset
        const sessionToken = PasswordReset.generateResetToken();
        
        // Create a session token entry (reuse the same document)
        resetRequest.resetToken = sessionToken;
        resetRequest.isUsed = true; // Mark OTP as used
        resetRequest.usedAt = new Date();
        await resetRequest.save();

        // Create new session for password reset
        const sessionReset = new PasswordReset({
            userId: resetRequest.userId,
            userType: userType,
            email: email.toLowerCase(),
            resetType: 'token',
            resetToken: sessionToken,
            ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes for password reset
        });
        
        await sessionReset.save();

        res.json({
            success: true,
            message: 'OTP verified successfully',
            sessionToken: sessionToken
        });

    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred. Please try again later.' 
        });
    }
});

// Reset password endpoint
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, newPassword, userType, sessionToken } = req.body;

        // Check if it's a session token (from OTP flow) or reset token (from email link)
        const resetToken = sessionToken || token;

        if (!resetToken || !newPassword || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Token, new password, and user type are required'
            });
        }

        // Strong password rules - must match what AdminStaff routes enforce
        // 8+ characters, uppercase, lowercase, number, special character
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
            });
        }

        // Find valid reset request
        const resetRequest = await PasswordReset.findValidReset({
            resetToken: resetToken,
            userType: userType,
            resetType: 'token'
        });

        if (!resetRequest) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired reset token' 
            });
        }

        // Find and update user password
        let user = null;
        if (userType === 'admin' || ['finance', 'registrar', 'dean', 'ilo', 'deputy', 'cibec'].includes(userType)) {
            user = await AdminStaff.findById(resetRequest.userId);
        } else if (userType === 'hod') {
            user = await HOD.findById(resetRequest.userId);
        } else if (userType === 'trainer') {
            user = await Trainer.findById(resetRequest.userId);
        } else if (userType === 'student') {
            user = await Student.findById(resetRequest.userId);
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Update password
        if (userType === 'student') {
            // For students, password is stored as plain text (phone number)
            user.password = newPassword;
        } else {
            // For HOD and trainers, set the plain password - the model's pre-save hook will hash it
            user.password = newPassword;
        }
        
        await user.save();

        // Mark reset request as used
        await resetRequest.markAsUsed();

        // Invalidate all other reset requests for this user
        await PasswordReset.invalidateUserResets(resetRequest.userId, userType);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred. Please try again later.' 
        });
    }
});

// Validate reset token endpoint (for email links)
app.get('/api/auth/validate-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const type = req.query.type || req.query.userType;

        if (!token || !type) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token and user type are required' 
            });
        }

        const resetRequest = await PasswordReset.findValidReset({
            resetToken: token,
            userType: type,
            resetType: 'token'
        });

        if (!resetRequest) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired reset token' 
            });
        }

        // Fetch user details to return to frontend
        let userData = { name: 'User', identifier: resetRequest.email };
        try {
            if (type === 'admin') {
                const admin = await AdminStaff.findById(resetRequest.userId).select('name email staffId');
                if (admin) userData = { name: admin.name, identifier: admin.staffId || admin.email };
            } else if (type === 'hod') {
                const hod = await HOD.findById(resetRequest.userId).select('name email department');
                if (hod) userData = { name: hod.name, identifier: hod.department || hod.email };
            } else if (type === 'trainer') {
                const trainer = await Trainer.findById(resetRequest.userId).select('name email');
                if (trainer) userData = { name: trainer.name, identifier: trainer.email };
            } else if (type === 'student') {
                const student = await Student.findById(resetRequest.userId).select('name admissionNumber');
                if (student) userData = { name: student.name, identifier: student.admissionNumber || resetRequest.email };
            }
        } catch (userLookupError) {
            console.error('Error looking up user details:', userLookupError);
        }

        res.json({
            success: true,
            message: 'Token is valid',
            email: resetRequest.email,
            userType: resetRequest.userType,
            user: userData
        });

    } catch (error) {
        console.error('Error validating reset token:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred. Please try again later.' 
        });
    }
});

// Forgot password page route
app.get('/forgot-password', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'auth', 'ForgotPassword.html'));
});

// Reset password page route
app.get('/reset-password', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'auth', 'ResetPassword.html'));
});

// Debug page route
app.get('/debug', (req, res) => {
    res.sendFile(path.join(__dirname, 'debug.html'));
});


// Admin staff authentication routes
app.use('/api/admin/auth', adminAuthRoutes);

// Admin portal pages (MUST BE BEFORE GENERIC ROUTES)
app.get('/admin/login', noCacheAuthPages, (req, res) => {
    const filePath = path.join(__dirname, 'src', 'components', 'admin', 'AdminLogin.html');
    console.log('🔐 Admin login requested');
    console.log('📂 File path:', filePath);
    console.log('📁 File exists:', fs.existsSync(filePath));
    
    serveHTML(res, filePath);
});

app.get('/admin/first-login', noCacheAuthPages, (req, res) => {
    console.log('📝 First login page requested');
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'FirstLogin.html'));
});

app.get('/admin/dashboard', (req, res) => {
    console.log('📊 Admin dashboard requested');
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'adminDashboard.html'));
});

// Serve main login page (Student/Trainer combined)
app.get('/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'login.html'));
});

// Serve HOD pages
app.get('/hod/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'hod', 'HODLogin.html'));
});

app.get('/hod/dashboard', (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'hod', 'HODDashboard.html'));
});

// Serve trainer pages
app.get('/trainer/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'trainer', 'TrainerLogin.html'));
});

app.get('/trainer/dashboard', (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'trainer', 'TrainerDashboard.html'));
});

// Serve student pages
app.get('/student/dashboard', (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'student', 'StudentPortalTailwind.html'));
});

// Serve admission letter template
app.get('/src/components/registrar/AdmissionLetter.html', (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'registrar', 'AdmissionLetter.html'));
});

// Function to initialize programs in database
async function initializePrograms() {
    try {
        const programs = [
            // Applied Science Department
            { programName: 'Applied Biology Level 6', programCost: 67189, department: 'applied_science' },
            { programName: 'Analytical Chemistry Level 6', programCost: 67189, department: 'applied_science' },
            { programName: 'Science Lab Technology Level 5', programCost: 67189, department: 'applied_science' },
            
            // Agriculture Department
            { programName: 'General Agriculture Level 4', programCost: 67189, department: 'agriculture' },
            { programName: 'Sustainable Agriculture Level 5', programCost: 67189, department: 'agriculture' },
            { programName: 'Agricultural Extension Level 6', programCost: 67189, department: 'agriculture' },
            
            // Building and Civil Department
            { programName: 'Building Technician Level 4', programCost: 67189, department: 'building_civil' },
            { programName: 'Building Technician Level 6', programCost: 67189, department: 'building_civil' },
            { programName: 'Civil Engineering Level 6', programCost: 67189, department: 'building_civil' },
            { programName: 'Plumbing Level 4', programCost: 67189, department: 'building_civil' },
            { programName: 'Plumbing Level 5', programCost: 67189, department: 'building_civil' },
            
            // Electromechanical Department
            { programName: 'Electrical Engineering Level 4', programCost: 67189, department: 'electromechanical' },
            { programName: 'Electrical Engineering Level 5', programCost: 67189, department: 'electromechanical' },
            { programName: 'Electrical Engineering Level 6', programCost: 67189, department: 'electromechanical' },
            { programName: 'Automotive Engineering Level 5', programCost: 67189, department: 'electromechanical' },
            { programName: 'Automotive Engineering Level 6', programCost: 67189, department: 'electromechanical' },
            
            // Hospitality Department
            { programName: 'Food and Beverage Level 4', programCost: 67189, department: 'hospitality' },
            { programName: 'Food & Beverage Level 5', programCost: 67189, department: 'hospitality' },
            { programName: 'Food & Beverage Level 6', programCost: 67189, department: 'hospitality' },
            { programName: 'Fashion & Design Level 4', programCost: 67189, department: 'hospitality' },
            { programName: 'Fashion and Design Level 5', programCost: 67189, department: 'hospitality' },
            { programName: 'Fashion and Design Level 6', programCost: 67189, department: 'hospitality' },
            { programName: 'Hairdressing Level 4', programCost: 67189, department: 'hospitality' },
            { programName: 'Hairdressing Level 5', programCost: 67189, department: 'hospitality' },
            { programName: 'Hairdressing Level 6', programCost: 67189, department: 'hospitality' },
            { programName: 'Tourism Management Level 5', programCost: 67189, department: 'hospitality' },
            { programName: 'Tourism Management Level 6', programCost: 67189, department: 'hospitality' },
            
            // Business and Liberal Studies Department
            { programName: 'Social Work Level 5', programCost: 67189, department: 'business_liberal' },
            { programName: 'Social Work Level 6', programCost: 67189, department: 'business_liberal' },
            { programName: 'Office Administration Level 5', programCost: 67189, department: 'business_liberal' },
            { programName: 'Office Administration Level 6', programCost: 67189, department: 'business_liberal' },
            
            // Computing and Informatics Department
            { programName: 'ICT Level 5', programCost: 67189, department: 'computing_informatics' },
            { programName: 'ICT Level 6', programCost: 67189, department: 'computing_informatics' },
            { programName: 'Information Science Level 5', programCost: 67189, department: 'computing_informatics' },
            { programName: 'Information Science Level 6', programCost: 67189, department: 'computing_informatics' }
        ];

        for (const programData of programs) {
            const existingProgram = await Program.findOne({ programName: programData.programName });
            if (!existingProgram) {
                const program = new Program(programData);
                await program.save();
                console.log(`Program created: ${programData.programName}`);
            }
        }

        console.log('Programs initialization completed!');
    } catch (error) {
        console.error('Error initializing programs:', error);
    }
}

// Function to filter out common units from course units
function filterCommonUnits(units) {
    // Define common unit names that should be excluded from department units
    const commonUnitNames = [
        'Demonstrate Communication Skills',
        'Communication Skills',
        'Demonstrate Numeracy Skills', 
        'Numeracy Skills',
        'Demonstrate Digital Literacy',
        'Digital Literacy',
        'Demonstrate Understanding of Entrepreneurship',
        'Demonstrate Entrepreneural Skills',
        'Demonstrate Entrepreneurial Skills',
        'Entrepreneurial Skills',
        'Entrepreneural Skills',
        'Demonstrate Employability Skills',
        'Employability Skills',
        'Demonstrate Environmental Literacy',
        'Environmental Literacy',
        'Demonstrate Occupational Safety and Health Practices',
        'Occupational Safety and Health Practices',
        'OSH Practices'
    ];
    
    return units.filter(unit => {
        const isCommonUnit = commonUnitNames.some(commonName => 
            unit.unitName.toLowerCase().includes(commonName.toLowerCase()) ||
            commonName.toLowerCase().includes(unit.unitName.toLowerCase())
        );
        return !isCommonUnit;
    });
}

// Function to initialize units in database
async function initializeUnits() {
    try {
        // Import course units data
        const { courseUnits } = require('./src/data/courseUnits');
        
        // Check if units already exist
        const existingUnitsCount = await Unit.countDocuments();
        if (existingUnitsCount > 0) {
            console.log(`Units already initialized (${existingUnitsCount} units found)`);
            // Check if we have all the course codes from courseUnits
            const courseCodesInDb = await Unit.distinct('courseCode');
            const courseCodesInMapping = Object.keys(courseUnits);
            const missingCourses = courseCodesInMapping.filter(code => !courseCodesInDb.includes(code));
            
            if (missingCourses.length > 0) {
                console.log(`Found ${missingCourses.length} missing course codes: ${missingCourses.join(', ')}`);
                console.log('Adding missing units...');
                
                // Add units for missing courses
                let unitsAdded = 0;
                for (const courseCode of missingCourses) {
                    const courseData = courseUnits[courseCode];
                    const { department, level, units } = courseData;

                    // Filter out common units
                    const departmentUnits = filterCommonUnits(units);

                    for (const unitData of departmentUnits) {
                        const unit = new Unit({
                            unitName: unitData.unitName,
                            unitCode: unitData.unitCode,
                            courseCode: courseCode,
                            department: department,
                            level: level,
                            description: `${unitData.unitName} - Part of ${courseCode.replace(/_/g, ' ').toUpperCase()} program`,
                            isActive: true
                        });

                        await unit.save();
                        unitsAdded++;
                    }
                }
                console.log(`Successfully added ${unitsAdded} units for ${missingCourses.length} missing courses`);
            }
            return;
        }

        console.log('Initializing units...');
        let totalUnitsAdded = 0;

        // Process each course and its units
        for (const [courseCode, courseData] of Object.entries(courseUnits)) {
            const { department, level, units } = courseData;
            
            // Filter out common units
            const departmentUnits = filterCommonUnits(units);
            const filteredCount = units.length - departmentUnits.length;
            if (filteredCount > 0) {
                console.log(`  📋 ${courseCode}: Filtered out ${filteredCount} common units, keeping ${departmentUnits.length} department-specific units`);
            }

            // Create units for this course
            for (const unitData of departmentUnits) {
                const unit = new Unit({
                    unitName: unitData.unitName,
                    unitCode: unitData.unitCode,
                    courseCode: courseCode,
                    department: department,
                    level: level,
                    description: `${unitData.unitName} - Part of ${courseCode.replace(/_/g, ' ').toUpperCase()} program`,
                    isActive: true
                });

                await unit.save();
                totalUnitsAdded++;
            }
        }

        console.log(`Successfully initialized ${totalUnitsAdded} units across ${Object.keys(courseUnits).length} courses`);
    } catch (error) {
        console.error('Error initializing units:', error);
    }
}

// Function to initialize trainers in database
async function initializeTrainers() {
    try {
        console.log('🔄 Initializing trainers (preserving existing ones)...');

        const trainersByDepartment = parseTrainersFile();
        console.log('📋 Departments found in trainers.txt:', Object.keys(trainersByDepartment));
        
        let newTrainersAdded = 0;
        let existingTrainersFound = 0;
        
        for (const [department, trainers] of Object.entries(trainersByDepartment)) {
            console.log(`🔍 Checking ${trainers.length} trainers for department: ${department}`);
            
            for (const trainerData of trainers) {
                // Check if trainer already exists by email (unique identifier)
                // SEV-C-005: Trainer.password is select:false; load it so a
                // later .save() does not fail the required-field validation.
                const existingTrainer = await Trainer.findOne({ email: trainerData.email }).select('+password');
                
                if (existingTrainer) {
                    // Update existing trainer if needed
                    let updated = false;
                    if (existingTrainer.department !== trainerData.department) {
                        existingTrainer.department = trainerData.department;
                        updated = true;
                    }
                    if (existingTrainer.name !== trainerData.name) {
                        existingTrainer.name = trainerData.name;
                        updated = true;
                    }
                    
                    if (updated) {
                        await existingTrainer.save();
                        console.log(`  ✏️ Updated trainer: ${trainerData.name}`);
                    } else {
                        console.log(`  ✅ Existing trainer: ${trainerData.name}`);
                    }
                    existingTrainersFound++;
                } else {
                    // Create new trainer
                    console.log(`  ➕ Adding new trainer: ${trainerData.name} to department: ${trainerData.department}`);
                // SEV-C-004: Trainer.password is now required with no default.
                // Seed each new trainer with a unique strong random password
                // (hashed by the model pre-save hook). It is intentionally not
                // logged - operators must set/communicate trainer credentials
                // via the password-reset flow.
                const seededTrainerPassword = `Aa1!${crypto.randomBytes(18).toString('base64').replace(/[+/=]/g, 'A')}`;
                const trainer = new Trainer({ ...trainerData, password: seededTrainerPassword });
                await trainer.save();
                    newTrainersAdded++;
                }
            }
        }

        console.log(`✅ Trainer initialization complete!`);
        console.log(`📊 Summary: ${existingTrainersFound} existing, ${newTrainersAdded} new trainers`);
        
        // Only fix references if we have broken ones
        const allAssignments = await TrainerAssignment.find({ status: 'active' });
        const allTrainers = await Trainer.find({});
        const currentTrainerIds = allTrainers.map(t => t._id.toString());
        
        const brokenAssignments = allAssignments.filter(assignment => 
            !assignment.trainerId || !currentTrainerIds.includes(assignment.trainerId.toString())
        );
        
        if (brokenAssignments.length > 0) {
            console.log(`🔧 Found ${brokenAssignments.length} broken trainer references, fixing...`);
            await fixBrokenTrainerReferences();
        } else {
            console.log('✅ All trainer references are valid');
        }
        
        // Check unit references
        const allUnits = await Unit.find({ isActive: true });
        const currentUnitIds = allUnits.map(u => u._id.toString());
        
        const brokenUnitAssignments = allAssignments.filter(assignment => 
            !assignment.unitId || !currentUnitIds.includes(assignment.unitId.toString())
        );
        
        if (brokenUnitAssignments.length > 0) {
            console.log(`🔧 Found ${brokenUnitAssignments.length} broken unit references, fixing...`);
            await fixBrokenUnitReferences();
        } else {
            console.log('✅ All unit references are valid');
        }
        
    } catch (error) {
        console.error('❌ Error initializing trainers:', error);
    }
}

// Function to fix broken trainer references in assignments
async function fixBrokenTrainerReferences() {
    try {
        console.log('Fixing broken trainer references in assignments...');
        
        // Get all assignments with null or invalid trainer references
        const brokenAssignments = await TrainerAssignment.find({
            $or: [
                { trainerId: null },
                { trainerId: { $exists: false } }
            ],
            status: 'active'
        });
        
        console.log(`Found ${brokenAssignments.length} assignments with broken trainer references`);
        
        if (brokenAssignments.length === 0) {
            return;
        }
        
        // Get all current trainers
        const allTrainers = await Trainer.find({});
        console.log(`Available trainers: ${allTrainers.map(t => t.name).join(', ')}`);
        
        let fixedCount = 0;
        
        // For now, we'll assign all broken assignments to the first trainer in each department
        // This is a temporary fix - in production you'd want a more sophisticated matching
        for (const assignment of brokenAssignments) {
            const departmentTrainers = allTrainers.filter(t => t.department === assignment.department);
            
            if (departmentTrainers.length > 0) {
                // Assign to first trainer in the department (you could implement better logic here)
                const trainer = departmentTrainers[0];
                assignment.trainerId = trainer._id;
                await assignment.save();
                
                console.log(`Fixed assignment for unit ${assignment.courseCode} - assigned to ${trainer.name}`);
                fixedCount++;
            } else {
                console.warn(`No trainers found for department ${assignment.department}`);
            }
        }
        
        console.log(`Successfully fixed ${fixedCount} broken trainer references`);
        
    } catch (error) {
        console.error('Error fixing broken trainer references:', error);
    }
}

// Function to fix broken unit references in assignments
async function fixBrokenUnitReferences() {
    try {
        console.log('🔧 Fixing broken unit references in assignments...');
        
        // Get all active assignments
        const allAssignments = await TrainerAssignment.find({ status: 'active' });
        console.log(`📋 Found ${allAssignments.length} total active assignments`);
        
        // Get all current units
        const currentUnits = await Unit.find({ isActive: true });
        const currentUnitIds = currentUnits.map(u => u._id.toString());
        
        console.log(`📚 Found ${currentUnits.length} active units in database`);
        
        // Find assignments with invalid unit references
        const brokenAssignments = [];
        for (const assignment of allAssignments) {
            if (!assignment.unitId || !currentUnitIds.includes(assignment.unitId.toString())) {
                brokenAssignments.push(assignment);
            }
        }
        
        console.log(`🔍 Found ${brokenAssignments.length} assignments with broken/invalid unit references`);
        
        if (brokenAssignments.length === 0) {
            console.log('✅ No broken unit references found');
            return;
        }
        
        let fixedCount = 0;
        
        for (const assignment of brokenAssignments) {
            // Try to find a unit by course code and department
            const matchingUnits = currentUnits.filter(u => 
                u.courseCode === assignment.courseCode && u.department === assignment.department
            );
            
            if (matchingUnits.length > 0) {
                // Assign to first matching unit
                const unit = matchingUnits[0];
                assignment.unitId = unit._id;
                await assignment.save();
                
                console.log(`✅ Fixed unit reference for assignment ${assignment.courseCode} - assigned to unit ${unit.unitCode}`);
                fixedCount++;
            } else {
                console.warn(`⚠️ No matching units found for assignment ${assignment.courseCode} in department ${assignment.department}`);
                
                // Try to find any unit with the same course code (ignore department)
                const anyMatchingUnit = currentUnits.find(u => u.courseCode === assignment.courseCode);
                if (anyMatchingUnit) {
                    assignment.unitId = anyMatchingUnit._id;
                    await assignment.save();
                    console.log(`✅ Fixed unit reference for assignment ${assignment.courseCode} - assigned to unit ${anyMatchingUnit.unitCode} (cross-department)`);
                    fixedCount++;
                }
            }
        }
        
        console.log(`✅ Successfully fixed ${fixedCount} broken unit references`);
        
    } catch (error) {
        console.error('❌ Error fixing broken unit references:', error);
    }
}

// Function to initialize HODs in database
async function initializeHODs() {
    try {
        const existingHODsCount = await HOD.countDocuments();
        if (existingHODsCount > 0) {
            console.log(`HODs already initialized (${existingHODsCount} HODs found)`);
            return;
        }

        const departments = HOD.getAllDepartments();
        console.log(`Initializing ${departments.length} HODs...`);

        for (const dept of departments) {
            const hod = new HOD({
                department: dept.code,
                name: `HOD ${dept.name}`,
                email: `hod.${dept.code}@ace.ac.ke`,
                password: 'HOD' // Will be hashed automatically
            });
            await hod.save();
        }

        console.log(`Successfully initialized ${departments.length} HODs!`);
    } catch (error) {
        console.error('Error initializing HODs:', error);
    }
}

// Initialize Common Units
async function initializeCommonUnits() {
    try {
        console.log('🔄 Initializing common units...');
        
        // Common units data from the requirements
        const commonUnits = [
            {
                unitCode: 'COM001',
                unitName: 'Communication Skills',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Essential communication skills for all students'
            },
            {
                unitCode: 'COM002',
                unitName: 'Numeracy Skills',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Basic mathematical and numerical skills'
            },
            {
                unitCode: 'COM003',
                unitName: 'Digital Literacy',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Essential digital and computer literacy skills'
            },
            {
                unitCode: 'COM004',
                unitName: 'Entrepreneurial Skills',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Basic entrepreneurship and business skills'
            },
            {
                unitCode: 'COM005',
                unitName: 'Employability Skills',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Skills for employment readiness and workplace success'
            },
            {
                unitCode: 'COM006',
                unitName: 'Environmental Literacy',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Environmental awareness and sustainability practices'
            },
            {
                unitCode: 'COM007',
                unitName: 'Occupational Safety and Health (OSH) Practices',
                courseCode: 'COMMON',
                courseName: 'Common Units',
                level: 'certificate',
                description: 'Workplace safety and health practices'
            }
        ];

        let existingCount = 0;
        let newCount = 0;

        for (const unitData of commonUnits) {
            const existingUnit = await CommonUnit.findOne({ unitCode: unitData.unitCode });
            
            if (existingUnit) {
                // Update existing unit if needed
                Object.assign(existingUnit, unitData);
                await existingUnit.save();
                existingCount++;
                console.log(`  ✅ Updated common unit: ${unitData.unitName}`);
            } else {
                // Create new common unit
                const commonUnit = new CommonUnit(unitData);
                await commonUnit.save();
                newCount++;
                console.log(`  ➕ Created common unit: ${unitData.unitName}`);
            }
        }

        console.log(`✅ Common units initialization complete!`);
        console.log(`📊 Summary: ${existingCount} existing, ${newCount} new common units`);
        
    } catch (error) {
        console.error('❌ Error initializing common units:', error);
    }
}

// Initialize admin staff with default accounts
async function initializeAdminStaff() {
    try {
        console.log('Checking admin staff seed...');

        const existingStaffCount = await AdminStaff.countDocuments();
        if (existingStaffCount > 0) {
            console.log(`Admin staff already seeded (${existingStaffCount} accounts). Skipping.`);
            return;
        }

        // Resolve initial password from env, falling back to a randomly generated one.
        // We print the generated password ONCE to the server log so the operator can capture it
        // and rotate it. After the first login each user is forced to change email and password.
        let initialPassword = config.initialAdminPassword;
        let passwordWasGenerated = false;

        const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$/;
        if (!initialPassword || !complexityRegex.test(initialPassword)) {
            if (initialPassword) {
                console.warn('INITIAL_ADMIN_PASSWORD does not meet complexity (12+ chars, upper+lower+digit+special). Generating one.');
            }
            // Generate a strong random password: 24 url-safe chars + required complexity boost
            const random = crypto.randomBytes(18).toString('base64').replace(/[+/=]/g, 'A');
            initialPassword = `Aa1!${random}`;
            passwordWasGenerated = true;
        }

        const defaultStaff = [
            { role: 'admin',     staffId: 'ADMIN001',     name: 'System Administrator', email: 'admin@edtti.ac.ke',     department: 'Administration' },
            { role: 'deputy',    staffId: 'DEPUTY001',    name: 'Deputy Principal',     email: 'deputy@edtti.ac.ke',    department: 'Administration' },
            { role: 'finance',   staffId: 'FINANCE001',   name: 'Finance Officer',      email: 'finance@edtti.ac.ke',   department: 'Finance' },
            { role: 'dean',      staffId: 'DEAN001',      name: 'Dean of Students',     email: 'dean@edtti.ac.ke',      department: 'Student Affairs' },
            { role: 'ilo',       staffId: 'ILO001',       name: 'Industry Liaison Officer', email: 'ilo@edtti.ac.ke',    department: 'Industry Liaison' },
            { role: 'registrar', staffId: 'REGISTRAR001', name: 'Registrar',            email: 'registrar@edtti.ac.ke', department: 'Registry' }
        ];

        for (const data of defaultStaff) {
            const staff = new AdminStaff({
                ...data,
                password: initialPassword,
                isActive: true,
                isFirstLogin: true,
                mustUpdateEmail: true,
                mustUpdatePassword: true
            });
            await staff.save();
        }

        // SEV-H-015: never log the initial password (logs persist in cloud
        // aggregators). If sourced from env, just say so. If generated, write it
        // to a local 0600 file the operator reads once and deletes.
        if (passwordWasGenerated) {
            const seedFile = path.join(__dirname, '.seed-credentials.txt');
            try {
                fs.writeFileSync(
                    seedFile,
                    `Initial admin accounts seeded ${new Date().toISOString()}\n` +
                    `Emails: [role]@edtti.ac.ke (admin, deputy, finance, dean, ilo, registrar)\n` +
                    `Initial password: ${initialPassword}\n` +
                    `Log in immediately, change email + password, then DELETE this file.\n`,
                    { mode: 0o600 }
                );
                try { fs.chmodSync(seedFile, 0o600); } catch (_) { /* best effort on non-POSIX */ }
                console.log('Seeded admin accounts; initial password written to .seed-credentials.txt — read it, then delete it.');
            } catch (writeErr) {
                // Do not fall back to logging the password. Surface the failure only.
                console.error('Seeded admin accounts but failed to write .seed-credentials.txt:', writeErr.message);
                console.error('Set INITIAL_ADMIN_PASSWORD in the environment and re-seed on a fresh database.');
            }
        } else {
            console.log('Seeded admin accounts; password sourced from INITIAL_ADMIN_PASSWORD env.');
        }

    } catch (error) {
        console.error('Error initializing admin staff:', error.message);
    }
}

// Initialize system settings with default values
async function initializeSystemSettings() {
    try {
        console.log('🔄 Initializing system settings...');
        
        // Default settings
        const defaultSettings = [
            {
                key: 'fee_threshold',
                value: 50000,
                description: 'Minimum fee balance required for unit registration',
                category: 'finance'
            },
            {
                key: 'current_academic_year',
                value: '2024/2025',
                description: 'Current academic year',
                category: 'academic'
            },
            {
                key: 'current_semester',
                value: '1',
                description: 'Current semester (1 or 2)',
                category: 'academic'
            },
            {
                key: 'registration_enabled',
                value: true,
                description: 'Whether unit registration is currently enabled',
                category: 'academic'
            }
        ];

        let existingCount = 0;
        let newCount = 0;

        for (const settingData of defaultSettings) {
            const existingSetting = await SystemSettings.findOne({ key: settingData.key });
            
            if (existingSetting) {
                existingCount++;
                console.log(`  ✓ Setting exists: ${settingData.key} = ${existingSetting.value}`);
            } else {
                await SystemSettings.create(settingData);
                newCount++;
                console.log(`  ➕ Created setting: ${settingData.key} = ${settingData.value}`);
            }
        }

        console.log(`✅ System settings initialization complete!`);
        console.log(`📊 Summary: ${existingCount} existing, ${newCount} new settings`);
        
    } catch (error) {
        console.error('❌ Error initializing system settings:', error);
    }
}

// Tool Request Schema
const toolRequestSchema = new mongoose.Schema({
    toolType: { type: String, required: true },
    course: { type: String, required: true },
    dueDate: { type: Date, required: true },
    instructions: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const ToolRequest = mongoose.models.ToolRequest || mongoose.model('ToolRequest', toolRequestSchema);

// Program Schema
const programSchema = new mongoose.Schema({
    programName: { 
        type: String, 
        required: [true, 'Program name is required'],
        trim: true,
        unique: true
    },
    programCost: {
        type: mongoose.Schema.Types.Decimal128, // SEV-H-016: exact money
        required: [true, 'Program cost is required']
    },
    department: {
        type: String,
        required: [true, 'Department is required'],
        enum: ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics']
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

programSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// SEV-H-016: emit programCost as a plain string, not the raw {$numberDecimal}.
function decToStringTransform(field) {
    return function(doc, ret) {
        if (ret[field] !== undefined && ret[field] !== null && typeof ret[field] === 'object') {
            ret[field] = ret[field].toString();
        }
        return ret;
    };
}
programSchema.set('toJSON', { transform: decToStringTransform('programCost') });

const Program = mongoose.models.Program || mongoose.model('Program', programSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
    studentId: { 
        type: String, 
        required: [true, 'Student ID is required'],
        trim: true
    },
    amount: {
        type: mongoose.Schema.Types.Decimal128, // SEV-H-016: exact money
        required: [true, 'Payment amount is required']
    },
    paymentMode: {
        type: String,
        required: [true, 'Payment mode is required'],
        enum: ['mpesa', 'bank', 'bursary']
    },
    bankName: {
        type: String,
        required: function() { return this.paymentMode === 'bank'; }
    },
    receiptNumber: {
        type: String,
        required: function() { return this.paymentMode === 'bank'; }
    },
    mpesaTransactionId: {
        type: String,
        required: function() { return this.paymentMode === 'mpesa'; }
    },
    bursaryReference: {
        type: String,
        required: function() { return this.paymentMode === 'bursary'; }
    },
    reference: {
        type: String,
        required: true
    },
    paymentDate: { 
        type: Date, 
        default: Date.now 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// SEV-H-016: emit amount as a plain string, not the raw {$numberDecimal}.
paymentSchema.set('toJSON', { transform: decToStringTransform('amount') });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);





// Tool Request Routes

// Get all tool requests
app.get('/api/tool-requests', verifyToken, authorize('admin', 'trainer', 'hod'), async (req, res) => {
    try {
        const requests = await ToolRequest.find().sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching tool requests:', error);
        res.status(500).json({ message: 'Failed to fetch tool requests' });
    }
});

// Get tool requests for a specific trainer
app.get('/api/tool-requests/trainer/:email', verifyToken, authorize('admin', 'trainer'), verifyOwnership('email'), async (req, res) => {
    try {
        const requests = await ToolRequest.find({
            $or: [
                { trainer: req.params.email },
                { trainer: 'all_trainers' }
            ]
        }).sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching trainer requests:', error);
        res.status(500).json({ message: 'Failed to fetch trainer requests' });
    }
});

// Submit a new tool request
app.post('/api/tool-requests', verifyToken, authorize('admin', 'trainer', 'hod'), async (req, res) => {
    try {
        const { toolType, course, trainer, dueDate, instructions } = req.body;

        if (!toolType || !course || !trainer || !dueDate) {
            return res.status(400).json({
                message: 'Missing required fields: toolType, course, trainer, and dueDate are required'
            });
        }

        const newRequest = new ToolRequest({
            toolType,
            course,
            trainer,
            dueDate,
            instructions
        });

        await newRequest.save();

        try {
            // Map trainers based on course
            let emailList = [];
            if (trainer === 'all_trainers') {
                // Course-specific trainer email mappings
                // Each course can have multiple trainers assigned
                // The system will notify all trainers associated with the course
                switch(course) {
                    case 'software_engineering':
                    case 'computer science':
                        emailList.push(
                            'maxxymaxxy04@gmail.com',
                            'software.lead@example.com',
                            'cs.coordinator@example.com'
                        );
                        break;
                    case 'data_science':
                        emailList.push(
                            'gatewaytimer@gmail.com',
                            'data.analytics@example.com',
                            'ml.specialist@example.com'
                        );
                        break;
                    case 'cybersecurity':
                        emailList.push(
                            'severinawanjiku2022@gmail.com',
                            'network.security@example.com',
                            'security.analyst@example.com'
                        );
                        break;
                    case 'artificial_intelligence':
                        emailList.push(
                            'ai.director@example.com',
                            'ml.research@example.com',
                            'ai.applications@example.com'
                        );
                        break;
                    default:
                        console.warn('No specific trainers mapped for course:', course);
                }
            } else {
                emailList.push(trainer);
            }

            if (emailList.length === 0) {
                console.warn('No trainers found for the course:', course);
                emailList.push(process.env.EMAIL_USER); // Fallback to admin email
            }

            const info = await emailService.sendToolRequestNotification(emailList, toolType, course, dueDate, instructions);

            if (info.success) {
                console.log('Email notification sent successfully');
            } else {
                console.error('Failed to send email notification:', info.error);
            }
        } catch (emailError) {
            console.error('Failed to send email notification:');
            console.error('Error message:', emailError.message);
        }

        res.status(201).json({
            message: 'Tool request submitted successfully',
            request: newRequest
        });
    } catch (error) {
        console.error('Error submitting tool request:', error);
        res.status(500).json({
            message: 'Failed to submit tool request',
            error: error.message
        });
    }
});

// Student Routes

// Registration Endpoint
// SEV-H-014: generate a strong random initial password (>=12 chars, with
// lowercase, uppercase, digit and symbol). Uses crypto, not Math.random.
function generateStudentInitialPassword() {
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '@$!%*?&#';
    const all = lower + upper + digits + symbols;
    const pick = (set) => set[crypto.randomInt(0, set.length)];
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    while (chars.length < 14) chars.push(pick(all));
    // Fisher-Yates shuffle so the required classes are not always in front.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

app.post('/api/students/register', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { name, idNumber, kcseGrade, admissionNumber, course, department, phoneNumber, year, intake, intakeYear, admissionType, email } = req.body;

        const normalizedPhone = phoneNumber.replace(/\D/g, '');

        if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(normalizedPhone)) {
            return res.status(400).json({
                message: 'Invalid phone number format. Please enter a valid Kenyan phone number'
            });
        }

        const formattedPhone = normalizedPhone.length === 12 ? '0' + normalizedPhone.slice(-9) : 
                              normalizedPhone.length === 13 ? '0' + normalizedPhone.slice(-9) : 
                              normalizedPhone;

        const existingIdNumber = await Student.findOne({ idNumber });
        const existingPhone = await Student.findOne({ phoneNumber: formattedPhone });
        const existingAdmission = await Student.findOne({ admissionNumber });

        if (existingIdNumber) {
            return res.status(400).json({
                message: 'A student with this ID number already exists'
            });
        }
        if (existingPhone) {
            return res.status(400).json({
                message: 'A student with this phone number already exists'
            });
        }
        if (existingAdmission) {
            return res.status(400).json({
                message: 'A student with this admission number already exists'
            });
        }

        // SEV-H-014: never use the phone number as the credential. Generate a
        // strong random one-time password; the pre-save hook hashes it.
        const initialPassword = generateStudentInitialPassword();

        const student = new Student({
            name,
            idNumber,
            kcseGrade,
            admissionNumber,
            course,
            department,
            year: year || 1,
            intake: intake || 'september',
            intakeYear: intakeYear || new Date().getFullYear(),
            phoneNumber: formattedPhone,
            email: email ? String(email).toLowerCase() : undefined,
            admissionType: admissionType || 'walk-in',  // Default to walk-in if not provided
            password: initialPassword,  // hashed by the pre-save hook
            isFirstLogin: true,
            mustUpdatePassword: true,
            role: 'student'
        });

        await student.save();

        // SEV-H-014: deliver the one-time password out-of-band via email.
        let credentialsEmailed = false;
        if (student.email) {
            try {
                await emailService.sendStudentCredentials(
                    student.email, student.name, student.admissionNumber, initialPassword
                );
                credentialsEmailed = true;
            } catch (mailErr) {
                console.error('Failed to send student credentials email:', mailErr.message);
            }
        }

        // Prepare admission letter data
        const admissionLetterData = {
            name: student.name,
            admissionNumber: student.admissionNumber,
            course: student.course,
            department: student.department,
            intakeYear: student.intakeYear,
            phoneNumber: student.phoneNumber,
            intake: student.intake
        };

        // SEV-H-014: if the student has no email on file (or delivery failed),
        // return the one-time password ONCE so the registrar can hand it over
        // securely. When it was emailed, never echo it back.
        const response = {
            message: credentialsEmailed
                ? 'Student registered successfully. Initial password emailed to the student.'
                : 'Student registered successfully. No email on file — give the student the initial password below; they must change it on first login.',
            student: {
                name: student.name,
                admissionNumber: student.admissionNumber,
                course: student.course
            },
            credentialsEmailed,
            admissionLetter: admissionLetterData,
            showAdmissionLetter: true
        };
        if (!credentialsEmailed) {
            response.initialPassword = initialPassword;
        }
        res.status(201).json(response);

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error registering student' });
    }
});

// Generate intake code based on intake and year
function generateIntakeCode(intake, intakeYear) {
    const yearSuffix = intakeYear.toString().slice(-2); // Get last 2 digits of year
    const intakePrefix = intake === 'january' ? 'J' : 'S';
    return `${intakePrefix}${yearSuffix}`;
}

// Units API Routes

// Get units by course code (for student portal)
app.get('/api/units/course/:courseCode', async (req, res) => {
    try {
        const { courseCode } = req.params;
        const { studentId } = req.query; // Optional parameter for registration status
        
        // Validate course code
        if (!courseCode || courseCode.trim() === '') {
            return res.status(400).json({ message: 'Course code is required' });
        }

        // Find department units for the course
        const departmentUnits = await Unit.getUnitsByCourse(courseCode.toLowerCase());
        
        // Get all common units
        const commonUnits = await CommonUnit.getActiveUnits();
        
        // Get current academic settings
        const currentAcademicYear = await SystemSettings.getSetting('current_academic_year', '2024/2025');
        const currentSemester = await SystemSettings.getSetting('current_semester', '1');
        
        // Get student's registrations if studentId is provided
        let studentRegistrations = [];
        if (studentId) {
            studentRegistrations = await StudentUnitRegistration.find({
                studentId: studentId,
                academicYear: currentAcademicYear,
                semester: currentSemester,
                status: 'registered',
                isActive: true
            });
        }
        
        // Create a map for quick lookup of registered units
        const registrationMap = new Map();
        studentRegistrations.forEach(reg => {
            registrationMap.set(reg.unitCode, reg);
        });
        
        // Format common units to match the department units structure
        const formattedCommonUnits = commonUnits.map(unit => ({
            _id: unit._id,
            unitName: unit.unitName,
            unitCode: unit.unitCode,
            courseCode: unit.courseCode,
            department: 'common',
            level: unit.level,
            description: unit.description,
            isActive: unit.isActive,
            type: 'common',
            isRegistered: registrationMap.has(unit.unitCode),
            registrationId: registrationMap.get(unit.unitCode)?._id || null
        }));
        
        // Format department units
        const formattedDepartmentUnits = departmentUnits.map(unit => ({
            ...unit.toObject(),
            type: 'department',
            isRegistered: registrationMap.has(unit.unitCode),
            registrationId: registrationMap.get(unit.unitCode)?._id || null
        }));
        
        // Combine both types of units
        const allUnits = [...formattedDepartmentUnits, ...formattedCommonUnits];
        
        if (allUnits.length === 0) {
            return res.status(404).json({ message: 'No units found for this course' });
        }

        // Count registered units
        const registeredUnits = allUnits.filter(unit => unit.isRegistered).length;

        res.json({
            success: true,
            courseCode: courseCode,
            totalUnits: allUnits.length,
            departmentUnits: formattedDepartmentUnits.length,
            commonUnits: formattedCommonUnits.length,
            registeredUnits: registeredUnits,
            academicYear: currentAcademicYear,
            semester: currentSemester,
            units: allUnits
        });
    } catch (error) {
        console.error('Error fetching units by course:', error);
        res.status(500).json({ message: 'Server error while fetching units' });
    }
});

// Get units by department (for admin use)
app.get('/api/units/department/:department', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { department } = req.params;
        
        // Validate department
        const validDepartments = ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics', 'business_administration'];
        if (!validDepartments.includes(department)) {
            return res.status(400).json({ message: 'Invalid department' });
        }

        const units = await Unit.getUnitsByDepartment(department);
        
        res.json({
            success: true,
            department: department,
            totalUnits: units.length,
            units: units
        });
    } catch (error) {
        console.error('Error fetching units by department:', error);
        res.status(500).json({ message: 'Server error while fetching units' });
    }
});

// Get all units (for admin use with pagination)
app.get('/api/units', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const units = await Unit.find({ isActive: true })
            .sort({ courseCode: 1, unitCode: 1 })
            .skip(skip)
            .limit(limit);

        const total = await Unit.countDocuments({ isActive: true });

        res.json({
            success: true,
            units: units,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalUnits: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching all units:', error);
        res.status(500).json({ message: 'Server error while fetching units' });
    }
});

// Get all courses
app.get('/api/courses', async (req, res) => {
    try {
        const { courseUnits } = require('./src/data/courseUnits');
        const courses = Object.keys(courseUnits).map(courseCode => ({
            code: courseCode,
            name: formatCourseNameServer(courseCode),
            department: courseUnits[courseCode].department,
            level: courseUnits[courseCode].level
        }));
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ message: 'Error fetching courses' });
    }
});

// Common Units API Routes

// Get all common units
app.get('/api/common-units', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const commonUnits = await CommonUnit.getActiveUnits();
        res.json({ 
            success: true, 
            commonUnits: commonUnits,
            total: commonUnits.length 
        });
    } catch (error) {
        console.error('Error fetching common units:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching common units' 
        });
    }
});

// Get common unit by code
app.get('/api/common-units/:unitCode', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { unitCode } = req.params;
        const commonUnit = await CommonUnit.findByCode(unitCode);
        
        if (!commonUnit) {
            return res.status(404).json({ 
                success: false, 
                message: 'Common unit not found' 
            });
        }
        
        res.json({ 
            success: true, 
            commonUnit: commonUnit 
        });
    } catch (error) {
        console.error('Error fetching common unit:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching common unit' 
        });
    }
});

// Create new common unit (admin only)
app.post('/api/common-units', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const commonUnitData = req.body;
        
        // Check if unit code already exists
        const existingUnit = await CommonUnit.findOne({ 
            unitCode: commonUnitData.unitCode.toUpperCase() 
        });
        
        if (existingUnit) {
            return res.status(400).json({ 
                success: false, 
                message: 'Common unit with this code already exists' 
            });
        }
        
        const commonUnit = new CommonUnit(commonUnitData);
        await commonUnit.save();
        
        res.status(201).json({ 
            success: true, 
            commonUnit: commonUnit,
            message: 'Common unit created successfully' 
        });
    } catch (error) {
        console.error('Error creating common unit:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while creating common unit' 
        });
    }
});

// Update common unit (admin only)
app.put('/api/common-units/:unitCode', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { unitCode } = req.params;
        const updateData = req.body;
        
        const commonUnit = await CommonUnit.findOneAndUpdate(
            { unitCode: unitCode.toUpperCase(), isActive: true },
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!commonUnit) {
            return res.status(404).json({ 
                success: false, 
                message: 'Common unit not found' 
            });
        }
        
        res.json({ 
            success: true, 
            commonUnit: commonUnit,
            message: 'Common unit updated successfully' 
        });
    } catch (error) {
        console.error('Error updating common unit:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating common unit' 
        });
    }
});

// Delete common unit (admin only)
app.delete('/api/common-units/:unitCode', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { unitCode } = req.params;
        
        const commonUnit = await CommonUnit.findOneAndUpdate(
            { unitCode: unitCode.toUpperCase() },
            { isActive: false },
            { new: true }
        );
        
        if (!commonUnit) {
            return res.status(404).json({ 
                success: false, 
                message: 'Common unit not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Common unit deactivated successfully' 
        });
    } catch (error) {
        console.error('Error deactivating common unit:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while deactivating common unit' 
        });
    }
});

// Common Unit Assignment API Routes

// Get all common unit assignments
app.get('/api/common-unit-assignments', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { status = 'active', department, trainerId, commonUnitId } = req.query;
        
        let query = { status };
        if (department) query.assignedByDepartment = department;
        if (trainerId) query.trainerId = trainerId;
        if (commonUnitId) query.commonUnitId = commonUnitId;
        
        const assignments = await CommonUnitAssignment.find(query)
            .populate('commonUnitId')
            .populate('trainerId', 'name email department')
            .populate('assignedBy', 'name department')
            .sort({ assignedAt: -1 });
        
        res.json({ 
            success: true, 
            assignments: assignments,
            total: assignments.length 
        });
    } catch (error) {
        console.error('Error fetching common unit assignments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching common unit assignments' 
        });
    }
});

// Get common unit assignments by trainer
app.get('/api/common-unit-assignments/trainer/:trainerId', verifyToken, authorize('admin', 'registrar', 'hod', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { status = 'active' } = req.query;
        
        const assignments = await CommonUnitAssignment.getAssignmentsByTrainer(trainerId, status);
        
        res.json({ 
            success: true, 
            assignments: assignments,
            total: assignments.length 
        });
    } catch (error) {
        console.error('Error fetching trainer common unit assignments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching trainer assignments' 
        });
    }
});

// Get common unit assignments by department
app.get('/api/common-unit-assignments/department/:department', verifyToken, authorize('admin', 'registrar', 'hod'), async (req, res) => {
    try {
        const { department } = req.params;
        const { status = 'active' } = req.query;
        
        const assignments = await CommonUnitAssignment.getAssignmentsByDepartment(department, status);
        
        res.json({ 
            success: true, 
            assignments: assignments,
            total: assignments.length 
        });
    } catch (error) {
        console.error('Error fetching department common unit assignments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching department assignments' 
        });
    }
});

// Create new common unit assignment
app.post('/api/common-unit-assignments', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { commonUnitId, trainerId, assignedBy, assignedByDepartment, trainerDepartment, notes } = req.body;
        
        console.log('📝 Common unit assignment request body:', req.body);
        console.log('🔍 Field validation:');
        console.log('  commonUnitId:', commonUnitId ? '✅' : '❌');
        console.log('  trainerId:', trainerId ? '✅' : '❌');
        console.log('  assignedBy:', assignedBy ? '✅' : '❌');
        console.log('  assignedByDepartment:', assignedByDepartment ? '✅' : '❌');
        console.log('  trainerDepartment:', trainerDepartment ? '✅' : '❌');
        
        // Validate required fields
        if (!commonUnitId || !trainerId || !assignedBy || !assignedByDepartment || !trainerDepartment) {
            console.log('❌ Validation failed - missing required fields');
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }
        
        // Check if assignment already exists
        const existingAssignment = await CommonUnitAssignment.findOne({
            commonUnitId,
            trainerId,
            status: 'active'
        });
        
        if (existingAssignment) {
            return res.status(400).json({ 
                success: false, 
                message: 'This common unit is already assigned to this trainer' 
            });
        }
        
        // Verify common unit exists
        const commonUnit = await CommonUnit.findById(commonUnitId);
        if (!commonUnit) {
            return res.status(404).json({ 
                success: false, 
                message: 'Common unit not found' 
            });
        }
        
        // Verify trainer exists
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Trainer not found' 
            });
        }
        
        // Create assignment
        const assignment = new CommonUnitAssignment({
            commonUnitId,
            trainerId,
            assignedBy,
            assignedByDepartment,
            trainerDepartment,
            notes
        });
        
        await assignment.save();
        
        // Populate the assignment for response
        await assignment.populate('commonUnitId');
        await assignment.populate('trainerId', 'name email department');
        await assignment.populate('assignedBy', 'name department');
        
        res.status(201).json({ 
            success: true, 
            assignment: assignment,
            message: 'Common unit assignment created successfully' 
        });
    } catch (error) {
        console.error('Error creating common unit assignment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while creating assignment' 
        });
    }
});

// Update common unit assignment
app.put('/api/common-unit-assignments/:assignmentId', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const updateData = req.body;
        
        const assignment = await CommonUnitAssignment.findById(assignmentId);
        if (!assignment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Assignment not found' 
            });
        }
        
        if (!assignment.canModify()) {
            return res.status(400).json({ 
                success: false, 
                message: 'This assignment cannot be modified' 
            });
        }
        
        Object.assign(assignment, updateData);
        await assignment.save();
        
        await assignment.populate('commonUnitId');
        await assignment.populate('trainerId', 'name email department');
        await assignment.populate('assignedBy', 'name department');
        
        res.json({ 
            success: true, 
            assignment: assignment,
            message: 'Assignment updated successfully' 
        });
    } catch (error) {
        console.error('Error updating common unit assignment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating assignment' 
        });
    }
});

// Delete/deactivate common unit assignment
app.delete('/api/common-unit-assignments/:assignmentId', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { assignmentId } = req.params;
        
        const assignment = await CommonUnitAssignment.findByIdAndUpdate(
            assignmentId,
            { status: 'inactive' },
            { new: true }
        );
        
        if (!assignment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Assignment not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Assignment deactivated successfully' 
        });
    } catch (error) {
        console.error('Error deactivating common unit assignment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while deactivating assignment' 
        });
    }
});

// Get trainers from all departments for common unit assignment
app.get('/api/trainers/all-departments', verifyToken, authorize('admin', 'hod', 'registrar'), async (req, res) => {
    try {
        const trainers = await Trainer.find({ isActive: true })
            .select('name email department specialization')
            .sort({ department: 1, name: 1 });
        
        // Group trainers by department
        const trainersByDepartment = trainers.reduce((acc, trainer) => {
            if (!acc[trainer.department]) {
                acc[trainer.department] = [];
            }
            acc[trainer.department].push(trainer);
            return acc;
        }, {});
        
        res.json({ 
            success: true, 
            trainers: trainers,
            trainersByDepartment: trainersByDepartment,
            departments: Object.keys(trainersByDepartment).sort()
        });
    } catch (error) {
        console.error('Error fetching trainers from all departments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching trainers' 
        });
    }
});

// HOD & Trainer Management API Routes

// HOD Authentication
app.post('/api/hod/login', authLimiter, async (req, res) => {
    try {
        const { department, password } = req.body;

        if (!department || !password) {
            return res.status(400).json({ message: 'Department and password are required' });
        }

        const genericFail = { message: 'Invalid department or password' };

        // SEV-H-018: password is select:false; load it for comparePassword
        // and the subsequent updateLastLogin().save().
        const hod = await HOD.findOne({ department: String(department), isActive: true }).select('+password');
        if (!hod) {
            return res.status(401).json(genericFail);
        }

        const isValidPassword = await hod.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json(genericFail);
        }

        await hod.updateLastLogin();

        const token = signToken({
            userId: String(hod._id),
            email: hod.email,
            role: 'hod',
            tokenVersion: hod.tokenVersion || 0 // SEV-H-013
        });

        res.json({
            message: 'Login successful',
            token,
            user: {
                _id: hod._id,
                department: hod.department,
                departmentName: HOD.getDepartmentDisplayName(hod.department),
                name: hod.name,
                email: hod.email
            }
        });
    } catch (error) {
        console.error('HOD login error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update HOD profile (email and phone)
app.put('/api/hod/:hodId/profile', verifyToken, authorize('admin', 'hod'), verifyOwnership('hodId'), async (req, res) => {
    try {
        const { hodId } = req.params;
        const { email, phone } = req.body;

        // Validate HOD ID format
        if (!hodId || !hodId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: 'Invalid HOD ID format' });
        }

        // Find HOD
        // SEV-H-018: load select:false password so the hod.save() below does
        // not fail required-field validation on profile update.
        const hod = await HOD.findById(hodId).select('+password');
        if (!hod) {
            return res.status(404).json({ message: 'HOD not found' });
        }

        // Update fields if provided
        if (email && email !== hod.email) {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }

            // Check if email is already in use
            const existingHOD = await HOD.findOne({ email: email, _id: { $ne: hodId } });
            if (existingHOD) {
                return res.status(400).json({ message: 'Email address is already in use' });
            }
            hod.email = email;
        }

        if (phone !== undefined) {
            hod.phone = phone || null;
        }

        hod.updatedAt = new Date();
        await hod.save();

        console.log(`✅ Updated profile for HOD: ${hod.name}`);

        res.json({
            message: 'Profile updated successfully',
            hod: {
                _id: hod._id,
                name: hod.name,
                email: hod.email,
                phone: hod.phone,
                department: hod.department,
                departmentName: HOD.getDepartmentDisplayName(hod.department)
            }
        });
    } catch (error) {
        console.error('Error updating HOD profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get departments for HOD login
app.get('/api/hod/departments', async (req, res) => {
    try {
        const departments = HOD.getAllDepartments();
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ message: 'Failed to fetch departments' });
    }
});

// Get trainers by department
app.get('/api/trainers/department/:department', verifyToken, authorize('admin', 'hod', 'registrar'), async (req, res) => {
    try {
        const { department } = req.params;
        console.log(`API: Fetching trainers for department: ${department}`);
        
        // First, let's see what departments actually exist in the database
        const allTrainers = await Trainer.find({}).select('name department');
        console.log(`API: All trainers in database:`, allTrainers.map(t => ({ name: t.name, dept: t.department })));
        
        const trainers = await Trainer.getTrainersByDepartment(department);
        console.log(`API: Found ${trainers.length} trainers for department ${department}:`, trainers.map(t => ({ name: t.name, dept: t.department })));
        res.json(trainers);
    } catch (error) {
        console.error('Error fetching trainers:', error);
        res.status(500).json({ message: 'Failed to fetch trainers' });
    }
});

// Get trainer assignments by department
app.get('/api/assignments/department/:department', verifyToken, authorize('admin', 'hod', 'registrar'), async (req, res) => {
    try {
        const { department } = req.params;
        console.log(`Fetching assignments for department: ${department}`);
        
        const assignments = await TrainerAssignment.getAssignmentsByDepartment(department);
        console.log(`Found ${assignments.length} assignments for department ${department}`);
        
        res.json(assignments);
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ message: 'Failed to fetch assignments' });
    }
});

// Assign units to trainer
app.post('/api/assignments/assign', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { trainerId, unitIds, assignedBy, department } = req.body;

        if (!trainerId || !unitIds || !Array.isArray(unitIds) || unitIds.length === 0) {
            return res.status(400).json({ message: 'Trainer ID and unit IDs are required' });
        }

        const assignments = await TrainerAssignment.assignUnitsToTrainer(
            trainerId, 
            unitIds, 
            assignedBy, 
            department
        );

        res.json({
            message: 'Units assigned successfully',
            assignments: assignments
        });
    } catch (error) {
        console.error('Error assigning units:', error);
        res.status(500).json({ message: 'Failed to assign units' });
    }
});

// Unassign units
app.post('/api/assignments/unassign', verifyToken, authorize('admin', 'hod'), async (req, res) => {
    try {
        const { unitIds } = req.body;

        if (!unitIds || !Array.isArray(unitIds) || unitIds.length === 0) {
            return res.status(400).json({ message: 'Unit IDs are required' });
        }

        await TrainerAssignment.unassignUnits(unitIds);

        res.json({
            message: 'Units unassigned successfully'
        });
    } catch (error) {
        console.error('Error unassigning units:', error);
        res.status(500).json({ message: 'Failed to unassign units' });
    }
});

// Trainer Authentication
app.post('/api/trainers/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const genericFail = { message: 'Invalid email or password' };

        // SEV-C-005: explicitly select the (now select:false) password so the
        // bcrypt comparePassword and the subsequent updateLastLogin().save() work.
        const trainer = await Trainer.findOne({ email: String(email).toLowerCase(), isActive: true }).select('+password');
        if (!trainer) {
            return res.status(401).json(genericFail);
        }

        const isPasswordValid = await trainer.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json(genericFail);
        }

        await trainer.updateLastLogin();
        const assignedUnitsCount = await trainer.getAssignedUnitsCount();

        const token = signToken({
            userId: String(trainer._id),
            email: trainer.email,
            role: 'trainer',
            tokenVersion: trainer.tokenVersion || 0 // SEV-H-013
        });

        res.json({
            message: 'Login successful',
            token,
            trainer: {
                _id: trainer._id,
                name: trainer.name,
                email: trainer.email,
                department: trainer.department,
                specialization: trainer.specialization,
                assignedUnitsCount
            }
        });
    } catch (error) {
        console.error('Trainer login error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update trainer email
app.put('/api/trainers/:trainerId/email', verifyToken, authorize('admin', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Check if email already exists
        const existingTrainer = await Trainer.findOne({ email: email.toLowerCase(), _id: { $ne: trainerId } });
        if (existingTrainer) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Update trainer email
        const trainer = await Trainer.findByIdAndUpdate(
            trainerId,
            { email: email.toLowerCase(), updatedAt: new Date() },
            { new: true }
        );

        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }

        res.json({
            message: 'Email updated successfully',
            trainer: {
                _id: trainer._id,
                name: trainer.name,
                email: trainer.email,
                phone: trainer.phone,
                department: trainer.department,
                specialization: trainer.specialization
            }
        });
    } catch (error) {
        console.error('Error updating trainer email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get trainer assignments - Clean production version
app.get('/api/trainers/:trainerId/assignments', verifyToken, authorize('admin', 'hod', 'registrar', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        
        // Validate trainerId format
        if (!trainerId || !trainerId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid trainer ID format' 
            });
        }
        
        // Verify trainer exists
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ 
                success: false, 
                message: 'Trainer not found' 
            });
        }
        
        // Get regular assignments with proper population
        const assignments = await TrainerAssignment.find({
            trainerId: trainerId,
            status: 'active'
        })
        .populate({
            path: 'unitId',
            select: 'unitName unitCode courseCode level department',
            match: { isActive: true }
        })
        .sort({ assignedAt: -1 })
        .lean();
        
        // Get common unit assignments
        const commonUnitAssignments = await CommonUnitAssignment.find({
            trainerId: trainerId,
            status: 'active'
        })
        .populate({
            path: 'commonUnitId',
            select: 'unitName unitCode courseCode level description',
            match: { isActive: true }
        })
        .sort({ assignedAt: -1 })
        .lean();
        
        // Filter out assignments with null/missing unit data
        const validAssignments = assignments.filter(assignment => 
            assignment.unitId && assignment.unitId.unitCode
        );
        
        const validCommonUnitAssignments = commonUnitAssignments.filter(assignment => 
            assignment.commonUnitId && assignment.commonUnitId.unitCode
        );
        
        // Format department unit assignments
        const formattedAssignments = validAssignments.map(assignment => ({
            _id: assignment._id,
            type: 'department',
            unitId: {
                _id: assignment.unitId._id,
                unitName: assignment.unitId.unitName,
                unitCode: assignment.unitId.unitCode,
                courseCode: assignment.unitId.courseCode,
                level: assignment.unitId.level,
                department: assignment.unitId.department
            },
            courseCode: assignment.courseCode,
            unitCode: assignment.unitCode,
            unitName: assignment.unitName,
            department: assignment.department,
            assignedBy: assignment.assignedBy,
            assignedAt: assignment.assignedAt,
            status: assignment.status,
            notes: assignment.notes || '',
            semester: assignment.semester || 'current'
        }));
        
        // Format common unit assignments
        const formattedCommonAssignments = validCommonUnitAssignments.map(assignment => ({
            _id: assignment._id,
            type: 'common',
            unitId: {
                _id: assignment.commonUnitId._id,
                unitName: assignment.commonUnitId.unitName,
                unitCode: assignment.commonUnitId.unitCode,
                courseCode: assignment.commonUnitId.courseCode,
                level: assignment.commonUnitId.level,
                department: 'common'
            },
            courseCode: assignment.commonUnitId.courseCode,
            unitCode: assignment.commonUnitId.unitCode,
            unitName: assignment.commonUnitId.unitName,
            department: 'common',
            assignedBy: assignment.assignedBy,
            assignedAt: assignment.assignedAt,
            status: assignment.status,
            notes: assignment.notes || '',
            assignedByDepartment: assignment.assignedByDepartment,
            trainerDepartment: assignment.trainerDepartment
        }));
        
        // Combine both types of assignments
        const allAssignments = [...formattedAssignments, ...formattedCommonAssignments]
            .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
        
        console.log(`✅ Fetched ${formattedAssignments.length} department assignments and ${formattedCommonAssignments.length} common unit assignments for trainer ${trainer.name}`);
        
        res.json({
            success: true,
            count: allAssignments.length,
            departmentAssignments: formattedAssignments.length,
            commonUnitAssignments: formattedCommonAssignments.length,
            assignments: allAssignments
        });
        
    } catch (error) {
        console.error('❌ Error fetching trainer assignments:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error while fetching assignments',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update trainer profile
app.put('/api/trainers/:trainerId/profile', verifyToken, authorize('admin', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { email, phone } = req.body;
        
        // Validate trainerId format
        if (!trainerId || !trainerId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid trainer ID format' 
            });
        }
        
        // Find trainer
        // SEV-C-005: load select:false password so the trainer.save() below
        // does not fail required-field validation on profile update.
        const trainer = await Trainer.findById(trainerId).select('+password');
        if (!trainer) {
            return res.status(404).json({
                success: false,
                message: 'Trainer not found'
            });
        }

        // Update fields if provided
        if (email && email !== trainer.email) {
            // Check if email is already in use
            const existingTrainer = await Trainer.findOne({ email: email, _id: { $ne: trainerId } });
            if (existingTrainer) {
                return res.status(400).json({
                    success: false,
                    message: 'Email address is already in use'
                });
            }
            trainer.email = email;
        }
        
        if (phone !== undefined) {
            trainer.phone = phone || null;
        }
        
        await trainer.save();
        
        console.log(`✅ Updated profile for trainer: ${trainer.name}`);
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            trainer: {
                _id: trainer._id,
                name: trainer.name,
                email: trainer.email,
                phone: trainer.phone,
                department: trainer.department,
                specialization: trainer.specialization
            }
        });
        
    } catch (error) {
        console.error('❌ Error updating trainer profile:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error while updating profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get students for trainer's assigned units/courses (only enrolled students)
app.get('/api/trainers/:trainerId/students', verifyToken, authorize('admin', 'hod', 'registrar', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        
        // Get trainer's assignments (both department and common units)
        const departmentAssignments = await TrainerAssignment.getAssignmentsByTrainer(trainerId);
        const commonAssignments = await CommonUnitAssignment.getAssignmentsByTrainer(trainerId);
        
        if ((!departmentAssignments || departmentAssignments.length === 0) && 
            (!commonAssignments || commonAssignments.length === 0)) {
            return res.json({ students: [], courseStats: {} });
        }
        
        // Get unit codes from all assignments
        const departmentUnitCodes = departmentAssignments.map(assignment => {
            return assignment.unitId?.unitCode || assignment.courseCode;
        }).filter(Boolean);
        
        const commonUnitCodes = commonAssignments.map(assignment => {
            return assignment.commonUnitId?.unitCode;
        }).filter(Boolean);
        
        const allUnitCodes = [...departmentUnitCodes, ...commonUnitCodes];
        
        console.log(`🔍 Trainer ${trainerId} has ${departmentAssignments.length} department assignments and ${commonAssignments.length} common assignments`);
        console.log(`🎯 Unit codes for registered student search:`, allUnitCodes);
        
        if (allUnitCodes.length === 0) {
            return res.json({ students: [], courseStats: {} });
        }
        
        // Get current academic settings
        const currentAcademicYear = await SystemSettings.getSetting('current_academic_year', '2024/2025');
        const currentSemester = await SystemSettings.getSetting('current_semester', '1');
        
        // Find students who are registered for these units
        const studentRegistrations = await StudentUnitRegistration.find({
            unitCode: { $in: allUnitCodes },
            academicYear: currentAcademicYear,
            semester: currentSemester,
            status: 'registered',
            isActive: true
        }).populate('unitId').populate('commonUnitId');
        
        console.log(`🔍 Searching for registrations with criteria:`, {
            unitCodes: allUnitCodes,
            academicYear: currentAcademicYear,
            semester: currentSemester,
            status: 'registered',
            isActive: true
        });
        
        console.log(`📋 Found ${studentRegistrations.length} student registrations:`, 
            studentRegistrations.map(reg => ({
                studentId: reg.studentId,
                unitCode: reg.unitCode,
                unitName: reg.unitName,
                academicYear: reg.academicYear,
                semester: reg.semester,
                status: reg.status
            }))
        );
        
        // Get unique student IDs
        const enrolledStudentIds = [...new Set(studentRegistrations.map(reg => reg.studentId))];
        
        console.log(`📋 Found ${studentRegistrations.length} registrations for ${enrolledStudentIds.length} unique students`);
        
        if (enrolledStudentIds.length === 0) {
            return res.json({ students: [], courseStats: {} });
        }
        
        // Fetch student details for enrolled students only
        const students = await Student.find({
            admissionNumber: { $in: enrolledStudentIds }
        }).select('name admissionNumber course intake year email phone totalPaid balance');
        
        console.log(`Found ${students.length} enrolled students for trainer ${trainerId}:`, students.map(s => ({ name: s.name, course: s.course })));
        
        // Group students by course and calculate stats
        const courseStats = {};
        const studentsByCourse = {};
        
        // Get unique course codes from enrolled students
        const courseCodes = [...new Set(students.map(s => s.course))];
        
        courseCodes.forEach(courseCode => {
            const courseStudents = students.filter(student => student.course === courseCode);
            studentsByCourse[courseCode] = courseStudents;
            
            // Count units assigned to this trainer for this course
            const courseUnitCodes = studentRegistrations
                .filter(reg => {
                    const student = students.find(s => s.admissionNumber === reg.studentId);
                    return student && student.course === courseCode;
                })
                .map(reg => reg.unitCode);
            
            const uniqueUnitsForCourse = [...new Set(courseUnitCodes)];
            
            courseStats[courseCode] = {
                totalStudents: courseStudents.length,
                courseName: formatCourseNameServer(courseCode),
                unitsAssigned: uniqueUnitsForCourse.length
            };
        });
        
        res.json({
            students: studentsByCourse,
            courseStats: courseStats,
            totalStudents: students.length,
            totalCourses: courseCodes.length,
            academicYear: currentAcademicYear,
            semester: currentSemester
        });
        
    } catch (error) {
        console.error('Error fetching trainer students:', error);
        res.status(500).json({ message: 'Failed to fetch trainer students' });
    }
});

// Diagnostic: Get units without trainer assignments
app.get('/api/diagnostics/unassigned-units', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        // Get all active units
        const allUnits = await Unit.find({ isActive: true }).select('unitCode unitName courseCode department');
        
        // Get all trainer assignments
        const assignments = await TrainerAssignment.find({ status: 'active' }).select('unitId');
        const assignedUnitIds = assignments.map(a => a.unitId.toString());
        
        // Find units without assignments
        const unassignedUnits = allUnits.filter(unit => 
            !assignedUnitIds.includes(unit._id.toString())
        );
        
        console.log(`📊 Diagnostic: ${unassignedUnits.length} units without trainer assignments:`, 
            unassignedUnits.map(u => ({ unitCode: u.unitCode, unitName: u.unitName }))
        );
        
        res.json({
            totalUnits: allUnits.length,
            assignedUnits: assignedUnitIds.length,
            unassignedUnits: unassignedUnits.length,
            unassignedUnitsList: unassignedUnits.map(unit => ({
                unitId: unit._id,
                unitCode: unit.unitCode,
                unitName: unit.unitName,
                courseCode: unit.courseCode,
                department: unit.department
            }))
        });
        
    } catch (error) {
        console.error('Error in diagnostics:', error);
        res.status(500).json({ message: 'Diagnostic failed' });
    }
});

// Get students by department (for HOD)
app.get('/api/students/department/:department', verifyToken, authorize('admin', 'registrar', 'hod', 'dean'), async (req, res) => {
    try {
        const { department } = req.params;
        
        // Get all units for this department
        const units = await Unit.find({ department: department });
        const courseCodes = [...new Set(units.map(unit => unit.courseCode))];
        
        console.log(`Department: ${department}, Found ${units.length} units, Course codes:`, courseCodes);
        
        // First, let's see what courses students actually have
        const allStudents = await Student.find({}).select('course').distinct('course');
        console.log(`All student courses in database:`, allStudents);
        
        // Fetch students enrolled in courses from this department
        const students = await Student.find({
            course: { $in: courseCodes }
        }).select('name admissionNumber course intake year email phone totalPaid balance');
        
        console.log(`Found ${students.length} students for department ${department}:`, students.map(s => ({ name: s.name, course: s.course })));
        
        // If no exact matches, try partial matching
        if (students.length === 0) {
            console.log(`No exact matches found. Trying partial matching for department ${department}...`);
            const partialStudents = await Student.find({
                course: { $regex: new RegExp(courseCodes.map(code => escapeRegex(code).replace(/_/g, '.*')).join('|'), 'i') }
            }).select('name admissionNumber course intake year email phone totalPaid balance');
            console.log(`Found ${partialStudents.length} students with partial matching:`, partialStudents.map(s => ({ name: s.name, course: s.course })));
        }
        
        // Group students by course
        const studentsByCourse = {};
        const courseStats = {};
        
        courseCodes.forEach(courseCode => {
            const courseStudents = students.filter(student => student.course === courseCode);
            studentsByCourse[courseCode] = courseStudents;
            courseStats[courseCode] = {
                totalStudents: courseStudents.length,
                courseName: formatCourseNameServer(courseCode)
            };
        });
        
        res.json({
            students: studentsByCourse,
            courseStats: courseStats,
            totalStudents: students.length,
            totalCourses: courseCodes.length
        });
        
    } catch (error) {
        console.error('Error fetching department students:', error);
        res.status(500).json({ message: 'Failed to fetch department students' });
    }
});

// Students API Routes

// Get Student Data by Admission Number
app.get('/api/students/admission/:admissionNumber', verifyToken, authorize('admin', 'registrar', 'finance', 'student'), verifyOwnership('admissionNumber'), async (req, res) => {
    try {
        const { admissionNumber } = req.params;
        console.log('Fetching student data for admission number:', admissionNumber);
        
        const student = await Student.findOne({ admissionNumber }).select('-password');
        
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        console.log('Found student:', student.name);
        res.json(student);
        
    } catch (error) {
        console.error('Error fetching student data:', error);
        res.status(500).json({ message: 'Error fetching student data' });
    }
});

// Get Latest Admission Number Endpoint with Intake Support
app.get('/api/students/latest-admission/:courseCode/:intake/:intakeYear', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { courseCode, intake, intakeYear } = req.params;
        
        // Generate intake code for this specific intake
        const intakeCode = generateIntakeCode(intake, parseInt(intakeYear));
        
        // Find latest admission number for this course and intake combination
        // SEV-H-019: courseCode comes from req.params; escape regex metachars.
        const latestStudent = await Student.findOne({
            admissionNumber: { $regex: `^${escapeRegex(courseCode)}/\\d{4}/${escapeRegex(intakeCode)}$` }
        }).sort({ admissionNumber: -1 });

        if (latestStudent) {
            res.json({ 
                latestNumber: latestStudent.admissionNumber,
                intakeCode: intakeCode 
            });
        } else {
            res.json({ 
                latestNumber: null,
                intakeCode: intakeCode 
            });
        }
    } catch (error) {
        console.error('Error fetching latest admission number:', error);
        res.status(500).json({ message: 'Error fetching latest admission number' });
    }
});

// Legacy endpoint for backward compatibility
app.get('/api/students/latest-admission/:courseCode', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { courseCode } = req.params;
        
        // Default to current September intake
        const currentYear = new Date().getFullYear();
        const defaultIntake = 'september';
        const intakeCode = generateIntakeCode(defaultIntake, currentYear);

        // SEV-H-019: courseCode comes from req.params; escape regex metachars.
        const latestStudent = await Student.findOne({
            admissionNumber: { $regex: `^${escapeRegex(courseCode)}/\\d{4}/${escapeRegex(intakeCode)}$` }
        }).sort({ admissionNumber: -1 });

        if (latestStudent) {
        res.json({
                latestNumber: latestStudent.admissionNumber,
                intakeCode: intakeCode 
            });
        } else {
            res.json({ 
                latestNumber: null,
                intakeCode: intakeCode 
            });
        }
    } catch (error) {
        console.error('Error fetching latest admission number:', error);
        res.status(500).json({ message: 'Error fetching latest admission number' });
    }
});

// Get All Students Endpoint - PROTECTED (Admin/Registrar only)
app.get('/api/students', verifyToken, authorize('admin', 'registrar', 'dean', 'finance'), async (req, res) => {
    try {
        const students = await Student.find({}, { password: 0 });
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Error fetching students' });
    }
});

// Update student
app.patch('/api/students/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Handle year promotion with balance update
        if (updates.year !== undefined) {
            // Get the current student to check if year is actually changing (promotion)
            const currentStudent = await Student.findById(id);
            
            if (currentStudent) {
                console.log(`🔄 Checking promotion: Current Year=${currentStudent.year}, New Year=${updates.year}, Course=${currentStudent.course}`);
                
                if (currentStudent.year !== updates.year) {
                    // Student is being promoted to a new year
                    console.log(`📚 Student ${currentStudent.admissionNumber} is being promoted from Year ${currentStudent.year} to Year ${updates.year}`);
                    
                    // Map course code to program name
                    const courseToProgram = {
                        'applied_biology_6': 'Applied Biology Level 6',
                        'analytical_chemistry_6': 'Analytical Chemistry Level 6',
                        'science_lab_technology_5': 'Science Lab Technology Level 5',
                        'science_laboratory_technology_5': 'Science Lab Technology Level 5',
                        'general_agriculture_4': 'General Agriculture Level 4',
                        'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
                        'building_construction_4': 'Building Construction Level 4',
                        'building_construction_5': 'Building Construction Level 5',
                        'plumbing_4': 'Plumbing Level 4',
                        'plumbing_5': 'Plumbing Level 5',
                        'electrical_engineering_4': 'Electrical Engineering Level 4',
                        'electrical_engineering_5': 'Electrical Engineering Level 5',
                        'electrical_engineering_6': 'Electrical Engineering Level 6',
                        'automotive_engineering_5': 'Automotive Engineering Level 5',
                        'automotive_engineering_6': 'Automotive Engineering Level 6',
                        'hospitality_management_5': 'Hospitality Management Level 5',
                        'hospitality_management_6': 'Hospitality Management Level 6',
                        'food_beverage_production_management_5': 'Food & Beverage Production Management Level 5',
                        'food_beverage_production_management_6': 'Food & Beverage Production Management Level 6',
                        'business_management_6': 'Business Management Level 6',
                        'supply_chain_management_6': 'Supply Chain Management Level 6',
                        'human_resource_management_6': 'Human Resource Management Level 6',
                        'journalism_mass_communication_6': 'Journalism & Mass Communication Level 6',
                        'information_communication_technology_6': 'Information Communication Technology Level 6',
                        'information_technology_5': 'Information Technology Level 5',
                        'computer_science_6': 'Computer Science Level 6'
                    };
                    
                    const programName = courseToProgram[currentStudent.course];
                    console.log(`🔍 Looking for program: ${programName} for course: ${currentStudent.course}`);
                    
                    // Get the program cost for their course
                    const program = programName ? await Program.findOne({ programName }) : null;
                    
                    if (program) {
                        const programCostNum = toMoneyNumber(program.programCost); // SEV-H-016
                        console.log(`✅ Program found: ${program.programName}, Cost: KES ${programCostNum}`);

                        if (programCostNum > 0) {
                            // SEV-H-016 TODO: `balance` is NOT a field on the Student
                            // schema, so this write is dropped by Mongoose strict mode
                            // and is not persisted today. A correct fix (a Decimal128
                            // Student.balance updated via an atomic $inc inside a
                            // replica-set transaction) needs a data-model decision and
                            // is deferred to Stage 3 — see STAGE2A_REPORT.md.
                            const existingBalance = toMoneyNumber(currentStudent.balance || 0);
                            const newBalance = existingBalance + programCostNum;
                            updates.balance = newBalance;

                            console.log(`💰 Adding program cost KES ${programCostNum.toLocaleString()} to existing balance KES ${existingBalance.toLocaleString()}`);
                            console.log(`💳 New balance will be: KES ${newBalance.toLocaleString()}`);
                        } else {
                            console.warn(`⚠️ Program cost is not set or is zero for ${program.programName}`);
                        }
                    } else {
                        console.warn(`⚠️ Program not found for course: ${currentStudent.course} (mapped to: ${programName})`);
                    }
                } else {
                    console.log(`ℹ️ Year not changed (both are ${updates.year}), no balance update needed`);
                }
            }
        }
        
        const student = await Student.findByIdAndUpdate(id, updates, { new: true });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        res.json(student);
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ message: 'Error updating student' });
    }
});

// Export Students by Admission Type
app.get('/api/students/export/:admissionType', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { admissionType } = req.params;
        
        // Validate admission type
        if (!['walk-in', 'KUCCPS'].includes(admissionType)) {
            return res.status(400).json({ message: 'Invalid admission type. Must be walk-in or KUCCPS' });
        }
        
        const students = await Student.find(
            { admissionType: admissionType }, 
            { password: 0 }
        ).sort({ createdAt: -1 });
        
        // Format data for export
        const exportData = students.map(student => ({
            'Admission Number': student.admissionNumber,
            'Full Name': student.name,
            'ID Number': student.idNumber,
            'KCSE Grade': student.kcseGrade,
            'Course': student.course,
            'Department': student.department,
            'Year of Study': student.year,
            'Intake': student.intake,
            'Intake Year': student.intakeYear,
            'Admission Type': student.admissionType,
            'Phone Number': student.phoneNumber,
            'Registration Date': new Date(student.createdAt).toLocaleDateString()
        }));
        
        res.json({
            success: true,
            data: exportData,
            count: students.length,
            admissionType: admissionType
        });
    } catch (error) {
        console.error('Error exporting students:', error);
        res.status(500).json({ message: 'Error exporting students' });
    }
});

// Login Endpoint
app.post('/api/students/login', authLimiter, async (req, res) => {
    try {
        const { admissionNumber, password } = req.body;

        if (!admissionNumber || !password) {
            return res.status(400).json({ message: 'Please provide both admission number and password' });
        }

        // Use one generic message for both "no such admission number" and "wrong password"
        // to prevent user enumeration. Do NOT log the password or the matched phone number.
        const genericFail = { message: 'Invalid admission number or password' };

        // SEV-H-018: password is select:false; load it for comparePassword.
        const student = await Student.findOne({ admissionNumber: String(admissionNumber) }).select('+password');
        if (!student) {
            return res.status(401).json(genericFail);
        }

        // SEV-H-014 transition: new students have a strong random password
        // (compared as-is). Existing students still have the legacy phone-number
        // password until the follow-up migration runs, so fall back to the
        // canonical Kenyan phone normalisation if the raw value does not match.
        let isValid = await student.comparePassword(String(password));
        if (!isValid) {
            const digits = String(password).replace(/\D/g, '');
            let candidate;
            if (digits.length === 9 && digits[0] === '7') {
                candidate = '0' + digits;
            } else if (digits.length === 10 && digits[0] === '0') {
                candidate = digits;
            } else if (digits.length === 12 && digits.startsWith('254')) {
                candidate = '0' + digits.slice(3);
            } else {
                candidate = digits;
            }
            isValid = await student.comparePassword(candidate);
        }
        if (!isValid) {
            return res.status(401).json(genericFail);
        }

        const firstLoginRequired = !!student.mustUpdatePassword;

        // Issue a JWT so subsequent API calls can be authenticated and authorised.
        const token = signToken({
            userId: String(student._id),
            email: student.email || null,
            role: 'student',
            admissionNumber: student.admissionNumber,
            tokenVersion: student.tokenVersion || 0, // SEV-H-013
            firstLoginRequired // SEV-H-014: gates all routes except the password-change endpoint
        });

        res.status(200).json({
            message: 'Login successful',
            token,
            firstLoginRequired,
            user: {
                id: student._id,
                name: student.name,
                admissionNumber: student.admissionNumber,
                course: student.course,
                department: student.department,
                year: student.year
            }
        });
    } catch (error) {
        console.error('Student login error:', error.message);
        res.status(500).json({ message: 'Error during login' });
    }
});

// SEV-H-014: forced first-login password change. The enforceStudentFirstLogin
// guard only lets a flagged student reach this route. Verifies the old
// password, enforces complexity, clears the flag, bumps tokenVersion (the
// pre-save hook does this) and returns a fresh token.
app.post('/api/students/:studentId/first-login-password-change', verifyToken, authorize('student'), async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: 'oldPassword and newPassword are required' });
        }

        const complexity = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!complexity.test(newPassword)) {
            return res.status(400).json({
                message: 'New password must be at least 8 characters and include an uppercase letter, a lowercase letter, a digit and a special character.'
            });
        }

        // SEV-H-018: password is select:false; load it for comparePassword.
        const student = await Student.findById(req.user.userId).select('+password');
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const ok = await student.comparePassword(String(oldPassword));
        if (!ok) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }
        if (String(newPassword) === String(oldPassword)) {
            return res.status(400).json({ message: 'New password must be different from the current password' });
        }

        student.password = String(newPassword); // pre-save hook hashes + bumps tokenVersion
        student.mustUpdatePassword = false;
        student.isFirstLogin = false;
        await student.save();

        const token = signToken({
            userId: String(student._id),
            email: student.email || null,
            role: 'student',
            admissionNumber: student.admissionNumber,
            tokenVersion: student.tokenVersion || 0,
            firstLoginRequired: false
        });

        res.json({
            success: true,
            message: 'Password updated successfully',
            token
        });
    } catch (error) {
        console.error('Student first-login password change error:', error.message);
        res.status(500).json({ message: 'Error updating password' });
    }
});

// Check if student can register (fee threshold check) - MUST be before /:id route
app.get('/api/students/:studentId/can-register', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    console.log('🔍 CAN-REGISTER API called for student:', req.params.studentId);
    try {
        const { studentId } = req.params;
        
        // Get fee threshold
        const feeThreshold = await SystemSettings.getSetting('fee_threshold', 50000);
        
        // Find student
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // Calculate outstanding balance using the same method as the dashboard
        const payments = await Payment.find({ studentId: studentId }).sort({ date: -1 });
        const paidAmount = payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0); // SEV-H-016
        
        // Get program cost using the same mapping as frontend
        const courseToProgram = {
            'applied_biology_6': 'Applied Biology Level 6',
            'analytical_chemistry_6': 'Analytical Chemistry Level 6',
            'science_lab_technology_5': 'Science Lab Technology Level 5',
            'science_laboratory_technology_5': 'Science Lab Technology Level 5',
            'general_agriculture_4': 'General Agriculture Level 4',
            'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
            'building_construction_4': 'Building Construction Level 4',
            'building_construction_5': 'Building Construction Level 5',
            'plumbing_4': 'Plumbing Level 4',
            'plumbing_5': 'Plumbing Level 5',
            'electrical_engineering_4': 'Electrical Engineering Level 4',
            'electrical_engineering_5': 'Electrical Engineering Level 5',
            'electrical_engineering_6': 'Electrical Engineering Level 6',
            'automotive_engineering_5': 'Automotive Engineering Level 5',
            'automotive_engineering_6': 'Automotive Engineering Level 6',
            'food_beverage_4': 'Food and Beverage Level 4',
            'food_beverage_5': 'Food & Beverage Level 5',
            'food_beverage_6': 'Food & Beverage Level 6',
            'hospitality_management_4': 'Hospitality Management Level 4',
            'hospitality_management_5': 'Hospitality Management Level 5',
            'hospitality_management_6': 'Hospitality Management Level 6',
            'business_administration_4': 'Business Administration Level 4',
            'business_administration_5': 'Business Administration Level 5',
            'business_administration_6': 'Business Administration Level 6',
            'liberal_studies_4': 'Liberal Studies Level 4',
            'liberal_studies_5': 'Liberal Studies Level 5',
            'liberal_studies_6': 'Liberal Studies Level 6',
            'computing_informatics_4': 'Computing & Informatics Level 4',
            'computing_informatics_5': 'Computing & Informatics Level 5',
            'computing_informatics_6': 'Computing & Informatics Level 6'
        };
        
        const programName = courseToProgram[student.course];
        const program = programName ? await Program.findOne({ programName: programName }) : null;
        const totalFees = program ? toMoneyNumber(program.programCost) : 67189; // SEV-H-016: numeric for comparison
        
        const outstandingBalance = totalFees - paidAmount;
        const canRegister = outstandingBalance < feeThreshold;
        
        res.json({
            canRegister,
            outstandingBalance,
            feeThreshold,
            totalFees,
            paidAmount
        });
        
    } catch (error) {
        console.error('Error checking registration eligibility:', error);
        res.status(500).json({ message: 'Error checking registration eligibility' });
    }
});

// Get Student by Mongo _id (used by registrar view/edit)
app.get('/api/students/:id', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('id'), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id, { password: 0 });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.json(student);
    } catch (error) {
        console.error('Error fetching student by id:', error);
        res.status(500).json({ message: 'Error fetching student' });
    }
});

// Update Student by Mongo _id
app.put('/api/students/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { name, idNumber, phoneNumber, year } = req.body;
        
        // Validate phone number format if provided
        if (phoneNumber) {
            const normalizedPhone = phoneNumber.replace(/\D/g, '');
            if (!/^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/.test(normalizedPhone)) {
                return res.status(400).json({
                    message: 'Invalid phone number format. Please enter a valid Kenyan phone number'
                });
            }
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (idNumber) updateData.idNumber = idNumber;
        if (phoneNumber) {
            const normalizedPhone = phoneNumber.replace(/\D/g, '');
            const formattedPhone = normalizedPhone.length === 12 ? '0' + normalizedPhone.slice(-9) : 
                                  normalizedPhone.length === 13 ? '0' + normalizedPhone.slice(-9) : 
                                  normalizedPhone;
            updateData.phoneNumber = formattedPhone;
        }
        
        // Handle year promotion with balance update
        if (year !== undefined) {
            updateData.year = year;
            
            // Get the current student to check if year is actually changing (promotion)
            const currentStudent = await Student.findById(req.params.id);
            
            if (currentStudent) {
                console.log(`🔄 Checking promotion: Current Year=${currentStudent.year}, New Year=${year}, Course=${currentStudent.course}`);
                
                if (currentStudent.year !== year) {
                    // Student is being promoted to a new year
                    console.log(`📚 Student ${currentStudent.admissionNumber} is being promoted from Year ${currentStudent.year} to Year ${year}`);
                    
                    // Map course code to program name
                    const courseToProgram = {
                        'applied_biology_6': 'Applied Biology Level 6',
                        'analytical_chemistry_6': 'Analytical Chemistry Level 6',
                        'science_lab_technology_5': 'Science Lab Technology Level 5',
                        'science_laboratory_technology_5': 'Science Lab Technology Level 5',
                        'general_agriculture_4': 'General Agriculture Level 4',
                        'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
                        'building_construction_4': 'Building Construction Level 4',
                        'building_construction_5': 'Building Construction Level 5',
                        'plumbing_4': 'Plumbing Level 4',
                        'plumbing_5': 'Plumbing Level 5',
                        'electrical_engineering_4': 'Electrical Engineering Level 4',
                        'electrical_engineering_5': 'Electrical Engineering Level 5',
                        'electrical_engineering_6': 'Electrical Engineering Level 6',
                        'automotive_engineering_5': 'Automotive Engineering Level 5',
                        'automotive_engineering_6': 'Automotive Engineering Level 6',
                        'hospitality_management_5': 'Hospitality Management Level 5',
                        'hospitality_management_6': 'Hospitality Management Level 6',
                        'food_beverage_production_management_5': 'Food & Beverage Production Management Level 5',
                        'food_beverage_production_management_6': 'Food & Beverage Production Management Level 6',
                        'business_management_6': 'Business Management Level 6',
                        'supply_chain_management_6': 'Supply Chain Management Level 6',
                        'human_resource_management_6': 'Human Resource Management Level 6',
                        'journalism_mass_communication_6': 'Journalism & Mass Communication Level 6',
                        'information_communication_technology_6': 'Information Communication Technology Level 6',
                        'information_technology_5': 'Information Technology Level 5',
                        'computer_science_6': 'Computer Science Level 6'
                    };
                    
                    const programName = courseToProgram[currentStudent.course];
                    console.log(`🔍 Looking for program: ${programName} for course: ${currentStudent.course}`);
                    
                    // Get the program cost for their course
                    const program = programName ? await Program.findOne({ programName }) : null;
                    
                    if (program) {
                        const programCostNum = toMoneyNumber(program.programCost); // SEV-H-016
                        console.log(`✅ Program found: ${program.programName}, Cost: KES ${programCostNum}`);

                        if (programCostNum > 0) {
                            // SEV-H-016 TODO: `balance` is NOT a field on the Student
                            // schema, so this write is dropped by Mongoose strict mode
                            // and is not persisted today. A correct fix (a Decimal128
                            // Student.balance updated via an atomic $inc inside a
                            // replica-set transaction) needs a data-model decision and
                            // is deferred to Stage 3 — see STAGE2A_REPORT.md.
                            const existingBalance = toMoneyNumber(currentStudent.balance || 0);
                            const newBalance = existingBalance + programCostNum;
                            updateData.balance = newBalance;

                            console.log(`💰 Adding program cost KES ${programCostNum.toLocaleString()} to existing balance KES ${existingBalance.toLocaleString()}`);
                            console.log(`💳 New balance will be: KES ${newBalance.toLocaleString()}`);
                        } else {
                            console.warn(`⚠️ Program cost is not set or is zero for ${program.programName}`);
                        }
                    } else {
                        console.warn(`⚠️ Program not found for course: ${currentStudent.course} (mapped to: ${programName})`);
                    }
                } else {
                    console.log(`ℹ️ Year not changed (both are ${year}), no balance update needed`);
                }
            }
        }

        const student = await Student.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json({
            message: 'Student updated successfully',
            student
        });
    } catch (error) {
        console.error('Error updating student:', error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'ID number or phone number already exists' });
        }
        res.status(500).json({ message: 'Error updating student' });
    }
});

// Update student email
app.put('/api/students/:studentId/email', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { email } = req.body;

        console.log('📧 Student email update request:', { studentId, newEmail: email });

        if (!email) {
            console.log('❌ Email is missing in request body');
            return res.status(400).json({ message: 'Email is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('❌ Invalid email format:', email);
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // Check if email already exists
        const existingStudent = await Student.findOne({ email: email.toLowerCase(), admissionNumber: { $ne: studentId } });
        if (existingStudent) {
            console.log('❌ Email already in use by another student:', existingStudent.admissionNumber);
            return res.status(400).json({ message: 'Email already exists' });
        }

        // Update student email using admission number as identifier
        const student = await Student.findOneAndUpdate(
            { admissionNumber: studentId },
            { email: email.toLowerCase() },
            { new: true, runValidators: true }
        ).select('-password');

        if (!student) {
            console.log('❌ Student not found:', studentId);
            return res.status(404).json({ message: 'Student not found' });
        }

        console.log('✅ Student email updated successfully:', { 
            admissionNumber: student.admissionNumber, 
            newEmail: student.email 
        });

        res.json({
            message: 'Email updated successfully',
            student: {
                admissionNumber: student.admissionNumber,
                name: student.name,
                email: student.email,
                phoneNumber: student.phoneNumber
            }
        });
    } catch (error) {
        console.error('❌ Error updating student email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ========================================
// SYSTEM SETTINGS API ROUTES
// ========================================

// Get all system settings
app.get('/api/system-settings', verifyToken, authorize('admin', 'registrar', 'student'), async (req, res) => {
    try {
        const { category } = req.query;
        let settings;
        
        if (category) {
            settings = await SystemSettings.getSettingsByCategory(category);
        } else {
            settings = await SystemSettings.find({ isActive: true }).sort({ category: 1, key: 1 });
        }
        
        res.json(settings);
    } catch (error) {
        console.error('Error fetching system settings:', error);
        res.status(500).json({ message: 'Error fetching system settings' });
    }
});

// Get a specific system setting
app.get('/api/system-settings/:key', verifyToken, authorize('admin', 'registrar', 'finance', 'dean', 'deputy', 'cibec', 'ilo'), async (req, res) => {
    try {
        const { key } = req.params;
        const setting = await SystemSettings.findOne({ key, isActive: true });
        
        if (!setting) {
            return res.status(404).json({ message: 'Setting not found' });
        }
        
        res.json(setting);
    } catch (error) {
        console.error('Error fetching system setting:', error);
        res.status(500).json({ message: 'Error fetching system setting' });
    }
});

// Update system setting
app.put('/api/system-settings/:key', verifyToken, authorize('admin'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value, description } = req.body;
        
        if (value === undefined) {
            return res.status(400).json({ message: 'Value is required' });
        }
        
        const setting = await SystemSettings.setSetting(key, value, description);
        res.json({ message: 'Setting updated successfully', setting });
    } catch (error) {
        console.error('Error updating system setting:', error);
        res.status(500).json({ message: 'Error updating system setting' });
    }
});

// ========================================
// STUDENT UNIT REGISTRATION API ROUTES
// ========================================

// Get student's unit registrations
app.get('/api/students/:studentId/registrations', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { status = 'registered' } = req.query;
        
        const registrations = await StudentUnitRegistration.getStudentRegistrations(studentId, status);
        res.json(registrations);
    } catch (error) {
        console.error('Error fetching student registrations:', error);
        res.status(500).json({ message: 'Error fetching student registrations' });
    }
});

// Register student for units
app.post('/api/students/register-units', verifyToken, authorize('admin', 'registrar', 'student'), async (req, res) => {
    try {
        const { studentId } = req.body;
        const { unitIds, commonUnitIds, academicYear, semester } = req.body;

        // SEV-H-007: a student may only register units for themselves. studentId
        // here is an admission number; trust the verified token, not the body.
        if (!['admin', 'registrar'].includes(req.user.role)) {
            if (!studentId || String(studentId) !== String(req.user.admissionNumber)) {
                return res.status(403).json({ message: 'You can only register units for your own account.' });
            }
        }

        // Get fee threshold
        const feeThreshold = await SystemSettings.getSetting('fee_threshold', 50000);
        
        // Check student's outstanding balance (you'll need to implement this based on your payment system)
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // Calculate outstanding balance using the same method as the dashboard
        const payments = await Payment.find({ studentId: studentId }).sort({ date: -1 });
        const paidAmount = payments.reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0); // SEV-H-016
        
        // Get program cost using the same mapping as frontend
        const courseToProgram = {
            'applied_biology_6': 'Applied Biology Level 6',
            'analytical_chemistry_6': 'Analytical Chemistry Level 6',
            'science_lab_technology_5': 'Science Lab Technology Level 5',
            'science_laboratory_technology_5': 'Science Lab Technology Level 5',
            'general_agriculture_4': 'General Agriculture Level 4',
            'sustainable_agriculture_5': 'Sustainable Agriculture Level 5',
            'building_construction_4': 'Building Construction Level 4',
            'building_construction_5': 'Building Construction Level 5',
            'plumbing_4': 'Plumbing Level 4',
            'plumbing_5': 'Plumbing Level 5',
            'electrical_engineering_4': 'Electrical Engineering Level 4',
            'electrical_engineering_5': 'Electrical Engineering Level 5',
            'electrical_engineering_6': 'Electrical Engineering Level 6',
            'automotive_engineering_5': 'Automotive Engineering Level 5',
            'automotive_engineering_6': 'Automotive Engineering Level 6',
            'food_beverage_4': 'Food and Beverage Level 4',
            'food_beverage_5': 'Food & Beverage Level 5',
            'food_beverage_6': 'Food & Beverage Level 6',
            'hospitality_management_4': 'Hospitality Management Level 4',
            'hospitality_management_5': 'Hospitality Management Level 5',
            'hospitality_management_6': 'Hospitality Management Level 6',
            'business_administration_4': 'Business Administration Level 4',
            'business_administration_5': 'Business Administration Level 5',
            'business_administration_6': 'Business Administration Level 6',
            'liberal_studies_4': 'Liberal Studies Level 4',
            'liberal_studies_5': 'Liberal Studies Level 5',
            'liberal_studies_6': 'Liberal Studies Level 6',
            'computing_informatics_4': 'Computing & Informatics Level 4',
            'computing_informatics_5': 'Computing & Informatics Level 5',
            'computing_informatics_6': 'Computing & Informatics Level 6'
        };
        
        const programName = courseToProgram[student.course];
        const program = programName ? await Program.findOne({ programName: programName }) : null;
        const totalFees = program ? toMoneyNumber(program.programCost) : 67189; // SEV-H-016: numeric for comparison
        
        const outstandingBalance = totalFees - paidAmount;
        
        console.log('🔍 Backend register-units balance calculation:', {
            studentId,
            studentCourse: student.course,
            programName: programName,
            programFound: !!program,
            actualProgramCost: toMoneyNumber(program?.programCost),
            finalProgramCost: totalFees,
            paidAmount,
            outstandingBalance,
            feeThreshold,
            paymentsCount: payments.length,
            canRegister: outstandingBalance < feeThreshold
        });
        
        // Check if student can register based on fee threshold
        if (outstandingBalance >= feeThreshold) {
            return res.status(400).json({ 
                message: `Cannot register units. Outstanding balance of ${outstandingBalance} exceeds threshold of ${feeThreshold}`,
                outstandingBalance,
                feeThreshold
            });
        }
        
        const registrations = [];
        const errors = [];
        
        // Register department units
        if (unitIds && unitIds.length > 0) {
            for (const unitId of unitIds) {
                try {
                    const unit = await Unit.findById(unitId);
                    if (!unit) {
                        errors.push(`Unit with ID ${unitId} not found`);
                        continue;
                    }
                    
                    const registrationData = {
                        studentId,
                        unitId,
                        courseCode: unit.courseCode,
                        unitCode: unit.unitCode,
                        unitName: unit.unitName,
                        unitType: 'department',
                        academicYear,
                        semester
                    };
                    
                    const registration = await StudentUnitRegistration.registerStudent(registrationData);
                    registrations.push(registration);
                } catch (error) {
                    errors.push(`Error registering unit ${unitId}: ${error.message}`);
                }
            }
        }
        
        // Register common units
        if (commonUnitIds && commonUnitIds.length > 0) {
            for (const commonUnitId of commonUnitIds) {
                try {
                    const commonUnit = await CommonUnit.findById(commonUnitId);
                    if (!commonUnit) {
                        errors.push(`Common unit with ID ${commonUnitId} not found`);
                        continue;
                    }
                    
                    const registrationData = {
                        studentId,
                        unitId: commonUnitId,  // Use unitId instead of commonUnitId for consistency
                        courseCode: commonUnit.courseCode,
                        unitCode: commonUnit.unitCode,
                        unitName: commonUnit.unitName,
                        unitType: 'common',
                        academicYear,
                        semester
                    };
                    
                    const registration = await StudentUnitRegistration.registerStudent(registrationData);
                    registrations.push(registration);
                } catch (error) {
                    errors.push(`Error registering common unit ${commonUnitId}: ${error.message}`);
                }
            }
        }
        
        res.json({
            message: `Successfully registered ${registrations.length} units`,
            registrations,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('Error registering student for units:', error);
        res.status(500).json({ message: 'Error registering student for units' });
    }
});


// Program Routes

// Create a new program
app.post('/api/programs', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { programName, programCost, department } = req.body;

        if (!programName || programCost === undefined || !department) {
            return res.status(400).json({ message: 'Please provide program name, cost, and department' });
        }

        if (isNaN(programCost) || programCost <= 0) {
            return res.status(400).json({ message: 'Program cost must be a positive number' });
        }

        const existingProgram = await Program.findOne({ programName });
        if (existingProgram) {
            return res.status(400).json({ message: 'A program with this name already exists' });
        }

        const program = new Program({
            programName,
            programCost: toDecimal128(programCost), // SEV-H-016: store exact money
            department
        });

        await program.save();

        res.status(201).json({
            message: 'Program created successfully',
            program
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: messages.join(', ') });
        }

        if (error.code === 11000) {
            return res.status(400).json({ message: 'A program with this name already exists' });
        }

        console.error('Error creating program:', error);
        res.status(500).json({ message: 'Error creating program' });
    }
});

// Get all programs - PUBLIC (needed for registration)
app.get('/api/programs', async (req, res) => {
    try {
        const programs = await Program.find().sort({ createdAt: -1 });
        res.json(programs);
    } catch (error) {
        console.error('Error fetching programs:', error);
        res.status(500).json({ message: 'Error fetching programs' });
    }
});

// Get a specific program
app.get('/api/programs/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const program = await Program.findById(req.params.id);
        
        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        res.json(program);
    } catch (error) {
        console.error('Error fetching program:', error);
        res.status(500).json({ message: 'Error fetching program' });
    }
});

// Update a program
app.put('/api/programs/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const { programName, programCost, department } = req.body;
        const { id } = req.params;

        if (!programName || programCost === undefined || !department) {
            return res.status(400).json({ message: 'Please provide program name, cost, and department' });
        }

        if (isNaN(programCost) || programCost <= 0) {
            return res.status(400).json({ message: 'Program cost must be a positive number' });
        }

        const program = await Program.findById(id);
        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        const existingProgram = await Program.findOne({ programName, _id: { $ne: id } });
        if (existingProgram) {
            return res.status(400).json({ message: 'A program with this name already exists' });
        }

        const updatedProgram = await Program.findByIdAndUpdate(
            id,
            { programName, programCost: toDecimal128(programCost), department }, // SEV-H-016
            { new: true, runValidators: true }
        );

        res.json({
            message: 'Program updated successfully',
            program: updatedProgram
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ message: messages.join(', ') });
        }

        console.error('Error updating program:', error);
        res.status(500).json({ message: 'Error updating program' });
    }
});

// Delete a program
app.delete('/api/programs/:id', verifyToken, authorize('admin', 'registrar'), async (req, res) => {
    try {
        const program = await Program.findByIdAndDelete(req.params.id);
        
        if (!program) {
            return res.status(404).json({ message: 'Program not found' });
        }

        res.json({ message: 'Program deleted successfully' });
    } catch (error) {
        console.error('Error deleting program:', error);
        res.status(500).json({ message: 'Error deleting program' });
    }
});

// Payment Routes

// Create a new payment
app.post('/api/payments', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { 
            studentId, 
            amount, 
            paymentMode, 
            bankName, 
            receiptNumber, 
            mpesaTransactionId, 
            bursaryReference, 
            reference, 
            paymentDate 
        } = req.body;

        console.log('💰 Processing payment:', { studentId, amount, paymentMode, reference });

        if (!studentId || !amount || !paymentMode || !reference) {
            return res.status(400).json({ message: 'Please provide all required payment details' });
        }

        // Validate payment mode specific details
        if (paymentMode === 'bank' && (!bankName || !receiptNumber)) {
            return res.status(400).json({ message: 'Bank name and receipt number are required for bank transfers' });
        }

        if (paymentMode === 'mpesa' && !mpesaTransactionId) {
            return res.status(400).json({ message: 'M-Pesa transaction ID is required for M-Pesa payments' });
        }

        if (paymentMode === 'bursary' && !bursaryReference) {
            return res.status(400).json({ message: 'Bursary reference is required for bursary payments' });
        }

        const payment = new Payment({
            studentId,
            amount: toDecimal128(amount), // SEV-H-016: store exact money
            paymentMode,
            bankName,
            receiptNumber,
            mpesaTransactionId,
            bursaryReference,
            reference,
            paymentDate: paymentDate || new Date()
        });

        await payment.save();

        console.log('✅ Payment saved successfully:', payment._id);

        res.status(201).json({
            message: 'Payment recorded successfully',
            payment
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            console.error('❌ Payment validation error:', messages);
            return res.status(400).json({ message: messages.join(', ') });
        }

        console.error('❌ Error recording payment:', error);
        res.status(500).json({ message: 'Error recording payment' });
    }
});

// Get all payments - PROTECTED (Finance/Admin only)
app.get('/api/payments', verifyToken, authorize('admin', 'finance', 'registrar'), async (req, res) => {
    try {
        const payments = await Payment.find().sort({ paymentDate: -1 });
        res.json(payments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ message: 'Error fetching payments' });
    }
});

// Get payments for a specific student
app.get('/api/payments/student/:studentId', verifyToken, authorize('admin', 'finance', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const payments = await Payment.find({ studentId: req.params.studentId }).sort({ paymentDate: -1 });
        res.json(payments);
    } catch (error) {
        console.error('Error fetching student payments:', error);
        res.status(500).json({ message: 'Error fetching student payments' });
    }
});





app.use((req, res, next) => {
    console.log(`Static file request: ${req.path}`);
    next();
});

// Tools of Trade API Endpoints

// Upload Tools of Trade
app.post('/api/tools/upload', verifyToken, authorize('admin', 'trainer', 'hod'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { trainerId, unitId, commonUnitId, toolType, academicYear, semester } = req.body;

        if (!trainerId || !toolType || !academicYear || !semester) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // SEV-H-007: a trainer may only upload as themselves. Trust the token,
        // not the body trainerId, unless the caller is admin or hod.
        if (!['admin', 'hod'].includes(req.user.role)) {
            if (String(trainerId) !== String(req.user.userId)) {
                return res.status(403).json({ message: 'You can only upload tools for your own account.' });
            }
        }

        if (!unitId && !commonUnitId) {
            return res.status(400).json({ message: 'Either unitId or commonUnitId is required' });
        }

        // SEV-H-011: authoritative magic-byte validation of the in-memory buffer.
        const v = validateUploadBuffer(req.file, 'tool');
        if (!v.ok) {
            return res.status(v.status).json({ message: v.message });
        }

        // SEV-H-011: storage name is a server-generated UUID; the original name
        // is kept only as sanitised display metadata. toolType is a server-side
        // enum-ish path segment — sanitised defensively, never the user filename.
        const safeToolType = String(toolType).replace(/[^A-Za-z0-9._-]/g, '_');
        const fileName = `${crypto.randomUUID()}.${v.ext}`;
        let filePath = null, s3Key = null, s3Bucket = null, storageType;

        if (isS3Configured()) {
            console.log('📤 Uploading tool to S3...');
            const folder = `tools-of-trade/${safeToolType}`;
            const s3Result = await uploadToS3(
                req.file.buffer,
                fileName,
                req.file.mimetype,
                folder,
                { displayName: v.displayName, inlineImage: v.isImage }
            );
            s3Key = s3Result.key;
            s3Bucket = s3Result.bucket;
            filePath = s3Result.location;
            storageType = 's3';
            console.log('✅ Tool uploaded to S3:', s3Key);
        } else {
            console.log('💾 S3 not configured, using local storage...');
            const correctFolder = path.join(uploadsDir, 'tools-of-trade', safeToolType);
            if (!fs.existsSync(correctFolder)) {
                fs.mkdirSync(correctFolder, { recursive: true });
            }
            const newPath = path.join(correctFolder, fileName);
            // memoryStorage: persist the validated buffer ourselves.
            fs.writeFileSync(newPath, req.file.buffer);
            filePath = newPath;
            storageType = 'local';
            console.log('✅ Tool saved locally:', fileName);
        }

        const toolSubmission = new ToolsOfTrade({
            trainerId,
            unitId: unitId || null,
            commonUnitId: commonUnitId || null,
            toolType,
            fileName: fileName,
            originalFileName: v.displayName,
            filePath: filePath,
            s3Key: s3Key || null,
            s3Bucket: s3Bucket || null,
            storageType: storageType,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            academicYear,
            semester
        });

        await toolSubmission.save();

        // Create notification for HOD
        const notification = new Notification({
            recipientId: 'hod', // This should be the actual HOD ID
            recipientType: 'hod',
            title: 'New Tools of Trade Submission',
            message: `New ${toolType.replace(/_/g, ' ')} submitted by trainer`,
            type: 'tool_request',
            relatedId: toolSubmission._id.toString(),
            priority: 'medium'
        });

        await notification.save();

        res.json({
            success: true,
            message: `File uploaded successfully to ${storageType === 's3' ? 'S3' : 'local storage'}`,
            data: {
                id: toolSubmission._id,
                fileName: toolSubmission.fileName,
                originalFileName: toolSubmission.originalFileName,
                fileSize: toolSubmission.fileSize,
                toolType: toolSubmission.toolType,
                status: toolSubmission.status,
                storageType: storageType
            }
        });
    } catch (error) {
        console.error('❌ Error uploading file:', error);
        res.status(500).json({ 
            message: 'Error uploading file', 
            error: error.message 
        });
    }
});

// Get Tools of Trade for a trainer
app.get('/api/tools/trainer/:trainerId', verifyToken, authorize('admin', 'trainer', 'hod'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { toolType, status, academicYear, semester } = req.query;

        let query = { trainerId };
        if (toolType) query.toolType = toolType;
        if (status) query.status = status;
        if (academicYear) query.academicYear = academicYear;
        if (semester) query.semester = semester;

        const tools = await ToolsOfTrade.find(query)
            .populate('unitId', 'unitName courseCode')
            .populate('commonUnitId', 'unitName unitCode')
            .sort({ submittedAt: -1 });

        res.json(tools);
    } catch (error) {
        console.error('Error fetching tools:', error);
        res.status(500).json({ message: 'Error fetching tools' });
    }
});

// Get all Tools of Trade (for HOD/Deputy)
app.get('/api/tools', verifyToken, authorize('admin', 'trainer', 'hod', 'registrar'), async (req, res) => {
    try {
        const { status, toolType, department, academicYear, semester } = req.query;

        let query = {};
        if (status) query.status = status;
        if (toolType) query.toolType = toolType;
        if (academicYear) query.academicYear = academicYear;
        if (semester) query.semester = semester;

        const tools = await ToolsOfTrade.find(query)
            .populate('unitId', 'unitName courseCode department')
            .populate('commonUnitId', 'unitName unitCode')
            .populate('trainerId', 'name department')
            .sort({ submittedAt: -1 });

        // Filter by department if specified
        let filteredTools = tools;
        if (department) {
            filteredTools = tools.filter(tool => {
                const toolDepartment = tool.unitId?.department || tool.trainerId?.department;
                return toolDepartment === department;
            });
        }

        res.json(filteredTools);
    } catch (error) {
        console.error('Error fetching tools:', error);
        res.status(500).json({ message: 'Error fetching tools' });
    }
});

// Update tool status (for Deputy only)
app.patch('/api/tools/:toolId/status', verifyToken, authorize('admin', 'deputy'), async (req, res) => {
    try {
        const { toolId } = req.params;
        const { status, feedback } = req.body;

        console.log('Status update request:', { toolId, status, feedback, reviewedBy: req.user.userId });

        const tool = await ToolsOfTrade.findById(toolId);
        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        console.log('Tool before update:', tool.status);
        
        // Only update if status is provided and not undefined
        if (status && status !== undefined && status !== '') {
            tool.status = status;
            console.log('Tool after update:', tool.status);
        } else {
            console.log('⚠️ Status is undefined or empty, not updating');
            return res.status(400).json({ message: 'Status is required' });
        }
        
        if (feedback) tool.feedback = feedback;
        tool.reviewedBy = req.user.userId; // Actor sourced from the verified token, never the client body
        tool.reviewedAt = new Date();

        const savedTool = await tool.save();
        
        console.log('Tool after save:', savedTool.status);
        console.log('Tool document after save:', { 
            id: savedTool._id, 
            status: savedTool.status, 
            feedback: savedTool.feedback,
            reviewedBy: savedTool.reviewedBy 
        });

        // Create notification for trainer
        const statusText = status ? status.replace(/_/g, ' ') : 'updated';
        const toolTypeText = tool.toolType ? tool.toolType.replace(/_/g, ' ') : 'tool';
        
        const notification = new Notification({
            recipientId: tool.trainerId,
            recipientType: 'trainer',
            title: `Tools of Trade ${statusText}`,
            message: `Your ${toolTypeText} has been ${statusText}`,
            type: status === 'approved' ? 'tool_approved' : status === 'rejected' ? 'tool_rejected' : 'tool_revision_needed',
            relatedId: toolId,
            priority: 'medium'
        });

        await notification.save();

        res.json({
            success: true,
            message: 'Tool status updated successfully',
            data: tool
        });
    } catch (error) {
        console.error('Error updating tool status:', error);
        res.status(500).json({ message: 'Error updating tool status' });
    }
});

// Get presigned URL for downloading a file from S3
app.get('/api/tools/:toolId/download', verifyToken, authorize('admin', 'trainer', 'hod'), async (req, res) => {
    try {
        const { toolId } = req.params;

        const tool = await ToolsOfTrade.findById(toolId);
        // SEV-H-007 pattern: 403 for both not-found and not-owner.
        if (!tool) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        // SEV-H-012: ownership — admin/hod may access any tool; otherwise the
        // requester must be the owning trainer.
        if (!['admin', 'hod'].includes(req.user.role) &&
            String(tool.trainerId) !== String(req.user.userId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const isImg = FILE_IMAGE_EXT_RE.test(tool.fileName || '');
        if (tool.storageType === 's3' && tool.s3Key) {
            // SEV-H-011: 15-min cap + safe disposition are enforced in s3Service.
            const presignedUrl = await getPresignedUrl(tool.s3Key, 900, {
                displayName: tool.originalFileName, inlineImage: isImg, contentType: tool.mimeType
            });
            res.json({ success: true, url: presignedUrl, fileName: tool.originalFileName, storageType: 's3' });
        } else {
            // SEV-H-012: no more /uploads/ static path. Hand back a short-lived
            // signed capability URL to the authenticated streaming route so the
            // existing window.open flow still works for local storage.
            const grant = signFileGrant({ cat: 'tool', id: String(tool._id) });
            res.json({
                success: true,
                url: `/api/files/tool/${tool._id}/download?t=${encodeURIComponent(grant)}`,
                fileName: tool.originalFileName,
                storageType: 'local'
            });
        }
    } catch (error) {
        console.error('❌ Error getting download URL:', error);
        res.status(500).json({
            message: 'Error getting download URL',
            error: error.message
        });
    }
});

// SEV-H-012: authenticated, ownership-checked file streaming. Replaces the
// removed unauthenticated /uploads static mount. Accepts either a Bearer
// session or a short-lived signed ?t= capability token (see fileDownloadAuth).
app.get('/api/files/:category/:id/download', fileDownloadAuth, async (req, res) => {
    try {
        const { category, id } = req.params;
        if (!/^[0-9a-fA-F]{24}$/.test(String(id))) {
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
            const tool = await ToolsOfTrade.findById(id);
            if (!tool) return res.status(403).json({ success: false, message: 'Forbidden' });
            if (!req.fileGrant) {
                const role = req.user && req.user.role;
                if (!['admin', 'hod'].includes(role) &&
                    String(tool.trainerId) !== String(req.user && req.user.userId)) {
                    return res.status(403).json({ success: false, message: 'Forbidden' });
                }
            }
            const isImg = FILE_IMAGE_EXT_RE.test(tool.fileName || '');
            if (tool.storageType === 's3' && tool.s3Key) {
                const url = await getPresignedUrl(tool.s3Key, 900, {
                    displayName: tool.originalFileName, inlineImage: isImg, contentType: tool.mimeType
                });
                res.set('X-Content-Type-Options', 'nosniff');
                return res.redirect(url);
            }
            // Local storage: stream from disk after a path-traversal check that
            // the resolved path is inside the uploads directory.
            const abs = path.resolve(tool.filePath || '');
            const root = path.resolve(uploadsDir) + path.sep;
            if (!abs.startsWith(root) || !fs.existsSync(abs)) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            res.set('X-Content-Type-Options', 'nosniff');
            res.set('Content-Type', 'application/octet-stream');
            res.set('Content-Disposition', `attachment; filename="${sanitizeDisplayName(tool.originalFileName)}"`);
            return res.sendFile(abs);
        }

        return res.status(400).json({ success: false, message: 'Unknown file category' });
    } catch (err) {
        console.error('❌ File download error:', err.message);
        return res.status(500).json({ success: false, message: 'Error serving file' });
    }
});

// Delete tool submission
app.delete('/api/tools/:toolId', verifyToken, authorize('admin', 'trainer', 'hod'), async (req, res) => {
    try {
        const { toolId } = req.params;

        const tool = await ToolsOfTrade.findById(toolId);
        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        // Delete the file from storage
        if (tool.storageType === 's3' && tool.s3Key) {
            // Delete from S3
            await deleteFromS3(tool.s3Key);
            console.log('✅ File deleted from S3:', tool.s3Key);
        } else if (tool.filePath && fs.existsSync(tool.filePath)) {
            // Delete from local filesystem
            fs.unlinkSync(tool.filePath);
            console.log('✅ File deleted from local storage:', tool.filePath);
        }

        await ToolsOfTrade.findByIdAndDelete(toolId);

        res.json({
            success: true,
            message: 'Tool submission deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting tool:', error);
        res.status(500).json({ 
            message: 'Error deleting tool',
            error: error.message 
        });
    }
});

// Notifications API

// Get all notifications (for admin/deputy)
app.get('/api/notifications', verifyToken, authorize('admin', 'registrar', 'finance', 'dean', 'cibec', 'ilo', 'deputy', 'hod'), async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching all notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// Get notifications for a user
app.get('/api/notifications/:userId', verifyToken, authorize('admin', 'student', 'trainer', 'hod', 'registrar', 'cibec', 'ilo'), verifyOwnership('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { isRead, type, limit = 50 } = req.query;

        let query = { recipientId: userId };
        if (isRead !== undefined) query.isRead = isRead === 'true';
        if (type) query.type = type;

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

// Mark notification as read
app.patch('/api/notifications/:notificationId/read', verifyToken, authorize('admin', 'student', 'trainer', 'hod', 'registrar', 'finance', 'dean', 'deputy', 'ilo', 'cibec'), async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error marking notification as read' });
    }
});

// Mark all notifications as read for a user
app.patch('/api/notifications/:userId/read-all', verifyToken, authorize('admin', 'student', 'trainer', 'hod', 'registrar', 'finance', 'dean', 'deputy', 'ilo', 'cibec'), verifyOwnership('userId'), async (req, res) => {
    try {
        const { userId } = req.params;

        await Notification.updateMany(
            { recipientId: userId, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ message: 'Error marking notifications as read' });
    }
});

// Create notification
app.post('/api/notifications', verifyToken, authorize('admin', 'registrar', 'hod', 'cibec', 'ilo', 'dean', 'finance'), async (req, res) => {
    try {
        const { recipientId, recipientType, title, message, type, relatedId, priority = 'medium' } = req.body;

        if (!recipientId || !recipientType || !title || !message || !type) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const notification = new Notification({
            recipientId,
            recipientType,
            title,
            message,
            type,
            relatedId,
            priority
        });

        await notification.save();

        res.json({
            success: true,
            message: 'Notification created successfully',
            data: notification
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ message: 'Error creating notification' });
    }
});

// Broadcast notification to all users of a type
app.post('/api/notifications/broadcast', verifyToken, authorize('admin', 'registrar', 'deputy'), async (req, res) => {
    try {
        const { recipientType, title, message, type, relatedId, priority = 'medium' } = req.body;

        if (!recipientType || !title || !message || !type) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Get all users of the specified type
        let users = [];
        if (recipientType === 'trainer') {
            users = await Trainer.find({}, '_id');
        } else if (recipientType === 'student') {
            users = await Student.find({}, '_id');
        } else if (recipientType === 'hod') {
            users = await HOD.find({}, '_id');
        }

        // Create notifications for all users
        const notifications = users.map(user => ({
            recipientId: user._id,
            recipientType,
            title,
            message,
            type,
            relatedId,
            priority
        }));

        await Notification.insertMany(notifications);

        res.json({
            success: true,
            message: `Notification sent to ${users.length} ${recipientType}s`,
            count: users.length
        });
    } catch (error) {
        console.error('Error broadcasting notification:', error);
        res.status(500).json({ message: 'Error broadcasting notification' });
    }
});

// ========================================
// GRADUATION APPLICATION ENDPOINTS
// ========================================

// Check if student can apply for graduation
app.get('/api/students/:studentId/graduation-eligibility', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // Extract level from course name (e.g., "science_laboratory_technology_5" -> level 5)
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const yearOfStudy = student.year || 1;
        
        const canApply = GraduationApplication.canStudentApply(level, yearOfStudy);
        
        // Check if already applied for current academic year
        const currentAcademicYear = await SystemSettings.getSetting('current_academic_year', '2024/2025');
        
        const existingApplication = await GraduationApplication.findOne({
            studentId,
            academicYear: currentAcademicYear
        });
        
        res.json({
            canApply: canApply && !existingApplication,
            level,
            yearOfStudy,
            hasExistingApplication: !!existingApplication,
            existingApplication: existingApplication,
            reason: !canApply ? `Level ${level} students can only apply in Year ${level - 3}` : null
        });
        
    } catch (error) {
        console.error('Error checking graduation eligibility:', error);
        res.status(500).json({ message: 'Error checking eligibility' });
    }
});

// Submit graduation application
app.post('/api/students/:studentId/graduation-application', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // Extract level from course name
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const yearOfStudy = student.year || 1;
        
        // Validate eligibility
        if (!GraduationApplication.canStudentApply(level, yearOfStudy)) {
            return res.status(400).json({ 
                message: `Level ${level} students can only apply for graduation in Year ${level - 3}` 
            });
        }
        
        // Get current academic settings
        const currentAcademicYear = await SystemSettings.getSetting('current_academic_year', '2024/2025');
        
        // Check if already applied
        const existingApplication = await GraduationApplication.findOne({
            studentId,
            academicYear: currentAcademicYear
        });
        
        if (existingApplication) {
            return res.status(400).json({ message: 'You have already applied for graduation this academic period' });
        }
        
        // Get student's unit registrations to check completion
        const registrations = await StudentUnitRegistration.find({
            studentId,
            status: 'registered',
            isActive: true
        });
        
        const application = new GraduationApplication({
            studentId,
            name: student.name,
            admissionNumber: student.admissionNumber,
            idNumber: student.idNumber,
            phoneNumber: student.phoneNumber,
            kcseGrade: student.kcseGrade,
            course: student.course,
            department: student.department,
            yearOfStudy,
            intake: student.intake,
            admissionType: student.admissionType,
            level,
            academicYear: currentAcademicYear,
            unitsCompleted: registrations.length,
            totalUnits: registrations.length // This should be calculated based on course requirements
        });
        
        await application.save();
        
        // Create notification for ILO office
        const notification = new Notification({
            recipientId: 'ilo_office',
            recipientType: 'deputy',
            title: 'New Graduation Application',
            message: `${student.name} (${studentId}) has applied for graduation`,
            type: 'general',
            relatedId: application._id.toString(),
            priority: 'medium'
        });
        
        await notification.save();
        
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

// ========================================
// ATTACHMENT APPLICATION ENDPOINTS
// ========================================

// Check if student can apply for attachment
app.get('/api/students/:studentId/attachment-eligibility', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        // Extract level from course name
        const level = parseInt(student.course.match(/(\d+)$/)?.[1]) || 4;
        const yearOfStudy = student.year || 1;
        
        const canApply = AttachmentApplication.canStudentApply(level, yearOfStudy);
        
        // Check if already applied for current academic year
        const currentAcademicYear = await SystemSettings.getSetting('current_academic_year', '2024/2025');
        
        const existingApplication = await AttachmentApplication.findOne({
            studentId,
            academicYear: currentAcademicYear
        });
        
        res.json({
            canApply: canApply && !existingApplication,
            level,
            yearOfStudy,
            hasExistingApplication: !!existingApplication,
            existingApplication: existingApplication,
            reason: !canApply ? `Level ${level} students can only apply in Year ${level - 3}` : null
        });
        
    } catch (error) {
        console.error('Error checking attachment eligibility:', error);
        res.status(500).json({ message: 'Error checking eligibility' });
    }
});

// Submit attachment application
app.post('/api/students/:studentId/attachment-application', verifyToken, authorize('admin', 'registrar', 'student'), verifyOwnership('studentId'), async (req, res) => {
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
        const yearOfStudy = student.year || 1;
        
        // Validate eligibility
        if (!AttachmentApplication.canStudentApply(level, yearOfStudy)) {
            return res.status(400).json({ 
                message: `Level ${level} students can only apply for attachment in Year ${level - 3}` 
            });
        }
        
        // Get current academic settings
        const currentAcademicYear = await SystemSettings.getSetting('current_academic_year', '2024/2025');
        
        // Check if already applied
        const existingApplication = await AttachmentApplication.findOne({
            studentId,
            academicYear: currentAcademicYear
        });
        
        if (existingApplication) {
            return res.status(400).json({ message: 'You have already applied for attachment this academic period' });
        }
        
        // Get student's unit registrations to check completion
        const registrations = await StudentUnitRegistration.find({
            studentId,
            status: 'registered',
            isActive: true
        });
        
        const application = new AttachmentApplication({
            studentId,
            name: student.name,
            admissionNumber: student.admissionNumber,
            idNumber: student.idNumber,
            phoneNumber: student.phoneNumber,
            kcseGrade: student.kcseGrade,
            course: student.course,
            department: student.department,
            yearOfStudy,
            intake: student.intake,
            admissionType: student.admissionType,
            level,
            county: county.trim(),
            nearestTown: nearestTown.trim(),
            academicYear: currentAcademicYear,
            unitsCompleted: registrations.length,
            totalUnits: registrations.length // This should be calculated based on course requirements
        });
        
        await application.save();
        
        // Create notification for ILO office
        const notification = new Notification({
            recipientId: 'ilo_office',
            recipientType: 'deputy',
            title: 'New Attachment Application',
            message: `${student.name} (${studentId}) has applied for attachment in ${county}, ${nearestTown}`,
            type: 'general',
            relatedId: application._id.toString(),
            priority: 'medium'
        });
        
        await notification.save();
        
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

// ========================================
// ILO OFFICE MANAGEMENT ENDPOINTS
// ========================================

// Get all graduation applications
app.get('/api/ilo/graduation-applications', verifyToken, authorize('admin', 'ilo', 'registrar'), async (req, res) => {
    try {
        const { status, department } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (department) query.department = department;
        
        const applications = await GraduationApplication.find(query)
            .sort({ applicationDate: -1 });
            
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
app.get('/api/ilo/attachment-applications', verifyToken, authorize('admin', 'ilo', 'registrar'), async (req, res) => {
    try {
        const { status, department, county } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (department) query.department = department;
        if (county) query.county = county;
        
        const applications = await AttachmentApplication.find(query)
            .sort({ applicationDate: -1 });
            
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
app.patch('/api/ilo/applications/:type/:applicationId/status', verifyToken, authorize('admin', 'ilo', 'registrar'), async (req, res) => {
    try {
        const { type, applicationId } = req.params;
        const { status, comments } = req.body;
        
        if (!['graduation', 'attachment'].includes(type)) {
            return res.status(400).json({ message: 'Invalid application type' });
        }
        
        const Model = type === 'graduation' ? GraduationApplication : AttachmentApplication;
        
        const application = await Model.findById(applicationId);
        if (!application) {
            return res.status(404).json({ message: 'Application not found' });
        }
        
        application.status = status;
        if (comments) application.comments = comments;
        application.reviewedBy = req.user.userId; // Actor sourced from the verified token, never the client body
        application.reviewedAt = new Date();
        
        await application.save();
        
        // Create notification for student
        const notification = new Notification({
            recipientId: application.studentId,
            recipientType: 'student',
            title: `${type === 'graduation' ? 'Graduation' : 'Attachment'} Application ${status}`,
            message: `Your ${type} application has been ${status}${comments ? `: ${comments}` : ''}`,
            type: 'general',
            relatedId: applicationId,
            priority: 'high'
        });
        
        await notification.save();
        
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

// ========================================
// CLEAN URL ROUTES (Hide .html extensions)
// ========================================

// Admin routes are defined at the top of the file (after API routes)
// See lines 630-659

// Student routes
app.get('/student/login', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'login.html'));
});

app.get('/student/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'student', 'StudentPortalTailwind.html'));
});

// Trainer routes
app.get('/trainer/login', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'trainer', 'TrainerLogin.html'));
});

app.get('/trainer/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'trainer', 'TrainerDashboard.html'));
});

// Finance routes
app.get('/finance/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'AdminStaffLogin.html'));
});

app.get('/finance/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'finance', 'FinanceDashboard.html'));
});

// Registrar routes
app.get('/registrar/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'AdminStaffLogin.html'));
});

app.get('/registrar/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'registrar', 'RegistrarDashboardNew.html'));
});

// Dean routes
app.get('/dean/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'AdminStaffLogin.html'));
});

app.get('/dean/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'dean', 'DeanDashboard.html'));
});

// Deputy routes
app.get('/deputy/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'AdminStaffLogin.html'));
});

app.get('/deputy/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'deputy', 'DeputyDashboard.html'));
});

// HOD routes
app.get('/hod/login', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'hod', 'HODLogin.html'));
});

app.get('/hod/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'hod', 'HODDashboard.html'));
});

// ILO routes (Industrial Liaison Office)
app.get('/ilo/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'AdminStaffLogin.html'));
});

app.get('/ilo/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'ilo', 'ILODashboard.html'));
});

// CIBEC routes (Competency-Based Education & Training Center)
app.get('/cibec/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'admin', 'AdminStaffLogin.html'));
});

app.get('/cibec/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'cibec', 'CIBECDashboard.html'));
});

// Root redirect to student login
app.get('/', (req, res) => {
    res.redirect('/student/login');
});

// Serve static files after routes
// Prevent caching for admin dashboard JS file
app.use(express.static(path.join(__dirname, 'src', 'components'), {
    setHeaders: (res, filePath) => {
        if (filePath.includes('adminDashboard.js')) {
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
        }
    }
}));
// SEV-C-003: `app.use(express.static('.'))` was removed. Serving the project
// root exposed source, configs and temp_diff.txt to anonymous download. Client
// assets are served by the explicit mounts above (/src/components, /public,
// /uploads) and the src/components static mount; the repo root is never served.

const PORT = config.port;
// ========================================
// STUDENT UPLOADS API ENDPOINTS
// ========================================

// Upload student file (profile, KCSE, KCPE, assessment, practical)
app.post('/api/student-uploads', verifyToken, authorize('admin', 'registrar', 'student', 'trainer'), upload.single('file'), async (req, res) => {
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
            console.log('✅ Marked old upload as replaced:', existingUpload._id);
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
            year: student.year,
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
        console.log('✅ Saved new upload:', newUpload._id, 'version:', newUpload.version);

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

        // Notify CIBEC
        await Notification.create({
            recipientId: 'cibec',
            recipientType: 'cibec',
            title: `New ${uploadType.replace(/_/g, ' ')} Upload`,
            message: `${student.name} (${student.admissionNumber}) uploaded ${uploadType.replace(/_/g, ' ')}${unitName ? ` for ${unitName}` : ''}`,
            type: 'student_upload',
            relatedId: newUpload._id.toString(),
            priority: 'medium'
        });

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
        console.error('❌ Error uploading student file:', error);
        res.status(500).json({
            message: 'Error uploading file',
            error: error.message
        });
    }
});

// Get student's uploads
app.get('/api/student-uploads/:studentId', verifyToken, authorize('admin', 'registrar', 'student', 'trainer', 'cibec'), verifyOwnership('studentId'), async (req, res) => {
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
app.get('/api/student-uploads/:studentId/unit/:unitId', verifyToken, authorize('admin', 'registrar', 'student', 'trainer', 'cibec'), verifyOwnership('studentId'), async (req, res) => {
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
app.get('/api/student-uploads/:uploadId/download', verifyToken, authorize('admin', 'registrar', 'student', 'trainer', 'cibec'), async (req, res) => {
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
        console.error('❌ Error getting download URL:', error);
        res.status(500).json({
            message: 'Error getting download URL',
            error: error.message
        });
    }
});

// Delete student upload
app.delete('/api/student-uploads/:uploadId', verifyToken, authorize('admin', 'registrar', 'student', 'cibec'), async (req, res) => {
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
        console.error('❌ Error deleting upload:', error);
        res.status(500).json({
            message: 'Error deleting file',
            error: error.message
        });
    }
});

// ========================================
// CIBEC PORTAL API ENDPOINTS
// ========================================

// Get all uploads with filters (CIBEC)
app.get('/api/cibec/uploads', verifyToken, authorize('admin', 'cibec', 'registrar'), async (req, res) => {
    try {
        const filters = {
            course: req.query.course,
            department: req.query.department,
            unitCode: req.query.unitCode,
            year: req.query.year,
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
app.get('/api/cibec/statistics', verifyToken, authorize('admin', 'cibec', 'registrar', 'dean'), async (req, res) => {
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
app.get('/api/cibec/student/:studentId/uploads', verifyToken, authorize('admin', 'cibec', 'registrar'), async (req, res) => {
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
                year: student.year
            },
            uploads
        });
    } catch (error) {
        console.error('Error fetching student uploads for CIBEC:', error);
        res.status(500).json({ message: 'Error fetching student uploads' });
    }
});

// Get audit logs (CIBEC)
app.get('/api/cibec/audit-logs', verifyToken, authorize('admin', 'cibec'), async (req, res) => {
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

// ========================================
// DEAN PORTAL API ENDPOINTS
// ========================================

// Get all students for Dean Portal
app.get('/api/dean/students', verifyToken, authorize('admin', 'dean', 'registrar'), async (req, res) => {
    try {
        const { course, department, year, intake, search } = req.query;
        
        let query = {};
        if (course) query.course = course;
        if (department) query.department = department;
        if (year) query.year = parseInt(year);
        if (intake) query.intake = intake;
        
        if (search) {
            // SEV-H-019: search comes from req.query; escape regex metachars.
            const safeSearch = escapeRegex(search);
            query.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { admissionNumber: { $regex: safeSearch, $options: 'i' } },
                { idNumber: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } }
            ];
        }
        
        const students = await Student.find(query)
            .select('-password')
            .sort({ name: 1 });
        
        res.json(students);
    } catch (error) {
        console.error('Error fetching students for dean:', error);
        res.status(500).json({ message: 'Error fetching students' });
    }
});

// Add note to student
app.post('/api/dean/students/:studentId/notes', verifyToken, authorize('admin', 'dean'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { noteType, title, content, category, priority, createdBy } = req.body;
        
        if (!noteType || !title || !content || !createdBy) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const student = await Student.findOne({ admissionNumber: studentId });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        
        const note = new StudentNote({
            studentId,
            studentName: student.name,
            admissionNumber: student.admissionNumber,
            noteType,
            title,
            content,
            category: category || 'general',
            priority: priority || 'medium',
            createdBy
        });
        
        await note.save();
        
        // If public note, create notification
        if (noteType === 'public') {
            await Notification.create({
                recipientId: studentId,
                recipientType: 'student',
                title: `New Note: ${title}`,
                message: content,
                type: 'general',
                relatedId: note._id.toString(),
                priority: priority || 'medium'
            });
        }
        
        res.json({
            success: true,
            message: 'Note added successfully',
            note
        });
    } catch (error) {
        console.error('Error adding student note:', error);
        res.status(500).json({ message: 'Error adding note', error: error.message });
    }
});

// Get student notes
app.get('/api/dean/students/:studentId/notes', verifyToken, authorize('admin', 'dean', 'registrar'), async (req, res) => {
    try {
        const { studentId } = req.params;
        const { noteType } = req.query;
        
        const notes = await StudentNote.getStudentNotes(studentId, noteType);
        res.json(notes);
    } catch (error) {
        console.error('Error fetching student notes:', error);
        res.status(500).json({ message: 'Error fetching notes' });
    }
});

// Get student's public notes (for student portal)
app.get('/api/students/:studentId/public-notes', verifyToken, authorize('student'), async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Public notes should be visible to all students, not just the assigned student
        // Remove studentId filter to show all public notes
        const notes = await StudentNote.find({
            noteType: 'public'
        }).sort({ createdAt: -1 });
        
        res.json({ notes });
    } catch (error) {
        console.error('Error fetching public notes:', error);
        res.status(500).json({ message: 'Error fetching public notes' });
    }
});

// Mark note as read
app.put('/api/students/:studentId/notes/:noteId/read', verifyToken, authorize('admin', 'dean', 'student'), verifyOwnership('studentId'), async (req, res) => {
    try {
        const { noteId } = req.params;
        
        const note = await StudentNote.findById(noteId);
        if (!note) {
            return res.status(404).json({ message: 'Note not found' });
        }
        
        note.isRead = true;
        note.readAt = new Date();
        await note.save();
        
        res.json({ success: true, message: 'Note marked as read' });
    } catch (error) {
        console.error('Error marking note as read:', error);
        res.status(500).json({ message: 'Error updating note' });
    }
});

// ========================================
// PAYSLIP API ENDPOINTS
// ========================================

// Generate payslips (Finance admin)
app.post('/api/payslips/generate', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { trainerIds, month, year, amount, description } = req.body;

        // SEV-H-008: actor identity comes from the verified token, never the body.
        const generatedBy = {
            userId: String(req.user.userId),
            userName: req.user.email || req.user.role
        };

        if (!trainerIds || !month || !year || !amount) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const period = `${month} ${year}`;
        const payslips = [];
        
        for (const trainerId of trainerIds) {
            // Find trainer by _id (MongoDB ObjectId)
            const trainer = await Trainer.findById(trainerId);
            if (!trainer) {
                console.warn(`Trainer ${trainerId} not found`);
                continue;
            }
            
            // Use trainer's email as the unique trainerId for payslip
            const trainerIdentifier = trainer.email;
            
            // Check if payslip already exists for this period
            const existing = await Payslip.findOne({ trainerId: trainerIdentifier, month, year });
            if (existing) {
                console.warn(`Payslip already exists for ${trainer.name} for ${period}`);
                continue;
            }
            
            const payslip = new Payslip({
                trainerId: trainerIdentifier,
                trainerName: trainer.name,
                email: trainer.email,
                department: trainer.department,
                month,
                year,
                amount: toDecimal128(amount), // SEV-H-016: store exact money
                period,
                description: description || 'Monthly Salary',
                generatedBy
            });
            
            await payslip.save();
            payslips.push(payslip);
            
            // Create notification for trainer (use email as recipientId)
            await Notification.create({
                recipientId: trainer.email,
                recipientType: 'trainer',
                title: 'New Payslip Generated',
                message: `Your payslip for ${period} has been generated. Amount: KES ${amount.toLocaleString()}`,
                type: 'payment',
                relatedId: payslip._id.toString(),
                priority: 'medium'
            });
        }
        
        res.json({
            success: true,
            message: `Generated ${payslips.length} payslips`,
            payslips
        });
    } catch (error) {
        console.error('Error generating payslips:', error);
        res.status(500).json({ message: 'Error generating payslips', error: error.message });
    }
});

// Get trainer's payslips
app.get('/api/trainers/:trainerId/payslips', verifyToken, authorize('admin', 'finance', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const { trainerId } = req.params;
        
        // Find trainer by _id to get their email
        const trainer = await Trainer.findById(trainerId);
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        
        // Fetch payslips using trainer's email (which is now the trainerId in payslips)
        const payslips = await Payslip.getTrainerPayslips(trainer.email);
        res.json({ payslips });
    } catch (error) {
        console.error('Error fetching trainer payslips:', error);
        res.status(500).json({ message: 'Error fetching payslips' });
    }
});

// Get all payslips (Finance admin)
app.get('/api/payslips', verifyToken, authorize('admin', 'finance'), async (req, res) => {
    try {
        const { month, year } = req.query;
        
        let payslips;
        if (month && year) {
            payslips = await Payslip.getPayslipsByPeriod(month, parseInt(year));
        } else {
            payslips = await Payslip.find().sort({ createdAt: -1 });
        }
        
        res.json({ payslips });
    } catch (error) {
        console.error('Error fetching payslips:', error);
        res.status(500).json({ message: 'Error fetching payslips' });
    }
});

// Mark payslip as viewed
app.put('/api/payslips/:payslipId/view', verifyToken, authorize('admin', 'finance', 'trainer'), async (req, res) => {
    try {
        const { payslipId } = req.params;

        const payslip = await Payslip.findById(payslipId);
        // SEV-H-007: payslip.trainerId is the trainer's email. A trainer may
        // only mark their own payslip viewed; admin and finance may view any.
        // Do not leak existence: 403 for both not-found and not-owner.
        if (!payslip) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (!['admin', 'finance'].includes(req.user.role)) {
            if (String(payslip.trainerId) !== String(req.user.email)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        payslip.isViewed = true;
        payslip.viewedAt = new Date();
        payslip.status = 'viewed';
        await payslip.save();
        
        res.json({ success: true, message: 'Payslip marked as viewed' });
    } catch (error) {
        console.error('Error marking payslip as viewed:', error);
        res.status(500).json({ message: 'Error updating payslip' });
    }
});

// Start server only in non-serverless environments
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    console.log('🚀 About to start listening on port', PORT);
    console.log('📍 Routes registered, starting server...');
    
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🔐 Admin Portal: http://localhost:${PORT}/admin/login`);
        console.log(`👨‍🎓 Student Portal: http://localhost:${PORT}/student/login`);
        console.log(`👨‍🏫 Trainer Portal: http://localhost:${PORT}/trainer/login`);
        console.log(`💰 Finance Portal: http://localhost:${PORT}/finance/dashboard`);
        console.log(`📝 Registrar Portal: http://localhost:${PORT}/registrar/dashboard`);
        console.log(`🎓 Dean Portal: http://localhost:${PORT}/dean/dashboard`);
        console.log(`👔 Deputy Portal: http://localhost:${PORT}/deputy/dashboard`);
        console.log(`🏢 HOD Portal: http://localhost:${PORT}/hod/dashboard`);
    });
    
    console.log('✅✅✅ SERVER FILE FULLY LOADED - AFTER APP.LISTEN() ✅✅✅');
} else {
    console.log('🌐 Running in serverless mode (Vercel)');
}

// Export the Express app for Vercel serverless functions
module.exports = app;