require('dotenv').config();
const dns = require('dns');
// Force IPv4 DNS resolution (avoids occasional dual-stack hiccups on Neon).
dns.setDefaultResultOrder('ipv4first');

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled promise rejection:', reason);
    // Do not exit. The per-request error handler catches in-flight rejections;
    // this only fires for orphans. pm2 restart loses sessions for ~2s.
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err && err.stack ? err.stack : err);
    // Node docs: exit after uncaughtException because state is undefined.
    // pm2 restarts within 1-2s. The lesser evil vs a poisoned process.
    process.exit(1);
});

// V2 Phase 1b: validate environment early (refuses to start without DATABASE_URL / JWT_SECRET).
require('./src/config/env');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { cspReportLimiter, generalApiLimiter, authLimiter } = require('./src/middleware/rateLimiters');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./src/config/config');
const csp = require('./src/config/csp'); // SEV-M-025: CSP (Report-Only by default)

// V2 Phase 1b: Drizzle/Postgres data layer + a thin model facade shim.
// The shim exposes the legacy V1 model APIs backed by Drizzle/Postgres, so the
// existing call sites in this file keep working AS-IS. See src/db/models.js.
const { db, client, schema } = require('./src/db');
const { eq, and, sql, inArray, isNull, desc } = require('drizzle-orm');
const userService = require('./src/services/userService');

const { escapeRegex, isValidId } = require('./src/utils/validators');
const { hodDepartmentDisplayName, toMoneyNumber, toDecimal128, formatCourseNameServer, DEPT_TEXT_TO_SHORT } = require('./src/utils/formatters');
const { resolveAcademicPeriod } = require('./src/utils/academicPeriod');
const { upload, validateUploadBuffer, sniffMagic, sanitizeDisplayName, fileDownloadAuth, verifyFileGrant, b64url, FILE_IMAGE_EXT_RE, MAX_IMAGE_BYTES, UPLOAD_ALLOWLIST } = require('./src/utils/uploads');
const { generateStudentInitialPassword, generateIntakeCode, isEligibleToApply } = require('./src/utils/studentHelpers');
const {
    Student, User, AdminStaff, Trainer, HOD,
    Program, Unit, CommonUnit, CommonUnitAssignment,
    TrainerAssignment, StudentUnitRegistration,
    ToolRequest, ToolUpload,
    AttachmentApplication, GraduationApplication,
    Notification, StudentNote, StudentUpload,
    AuditLog, SystemSettings, PasswordReset, LoginOTP,
    Payment, Payslip,
} = require('./src/db/models');

// Student Schema
// V2 Phase 1b: Student model + all V1 model facades now come from src/db/models.js
// (Drizzle/Postgres facade). See block above.

// Import services
const EmailService = require('./src/utils/emailService');
const { uploadToS3, getPresignedUrl, deleteFromS3, isS3Configured } = require('./src/utils/s3Service');

// Import authentication middleware
const { verifyToken, authorize, verifyOwnership, optionalAuth, enforceStudentFirstLogin, signToken, setAuthCookie, clearAuthCookie, generateCsrfToken, setCsrfCookie, clearCsrfCookie, requireCsrfToken } = require('./src/middleware/auth');
const jwt = require('jsonwebtoken');

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

const adminAuthRoutes = require('./src/routes/adminAuth');

console.log('🔵 All imports loaded successfully');

const app = express();

console.log('🔵 Express app created');

// V2 Phase 1b: liveness/readiness probe (defined inline; no DB lookup beyond SELECT 1).
app.get('/api/health', async (_req, res) => {
    try {
        const start = Date.now();
        await client`SELECT 1 as ok`;
        res.json({
            status: 'ok',
            db: 'postgres',
            latency_ms: Date.now() - start,
            commit: 'v2-postgres Phase 1b',
        });
    } catch (err) {
        res.status(503).json({ status: 'down', error: err.message });
    }
});

// Logout endpoint is registered AFTER cookie-parser (search for the matching
// app.post('/api/auth/logout') below) so req.cookies is populated. Don't add
// it here — placing it before cookieParser() leaves req.cookies undefined and
// the token_version bump silently never fires.

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

// ===============================
// DATABASE CONNECTION
// ===============================

// V2 Phase 1b: Postgres connection (Drizzle/Neon). Boot-time SELECT 1 health
// check; lazy on first request to keep serverless cold-start cheap.
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    try {
        await client`SELECT 1`;
        isConnected = true;
        console.log('✅ Postgres (Neon) connected');
        // Initialize default data — best-effort; do not crash the boot if these
        // legacy helpers don't translate cleanly to Postgres yet.
        try { await initializeSystemSettings(); } catch (e) { console.warn('   initializeSystemSettings skipped:', e.message); }
        try { await initializeCommonUnits(); }    catch (e) { console.warn('   initializeCommonUnits skipped:',    e.message); }
        try { await initializeTrainers(); }       catch (e) { console.warn('   initializeTrainers skipped:',       e.message); }
        try { await initializeAdminStaff(); }     catch (e) { console.warn('   initializeAdminStaff skipped:',     e.message); }
    } catch (error) {
        console.error('❌ Postgres connection failed:', error.message);
        throw error;
    }
};

const ensureDB = async (req, res, next) => {
    try {
        if (!isConnected) await connectDB();
        next();
    } catch (err) {
        res.status(500).json({ message: 'Database connection failed' });
    }
};

// V2 Phase 1b: /api/health — lightweight Postgres ping for liveness probes.
// Defined here (before the route registration loop) so it doesn't need ensureDB.
// (We attach to app below the express() construction; this is just the handler.)
const healthHandler = async (_req, res) => {
    try {
        const start = Date.now();
        await client`SELECT 1 as ok`;
        res.json({
            status: 'ok',
            db: 'postgres',
            latency_ms: Date.now() - start,
            commit: 'v2-postgres Phase 1b',
        });
    } catch (err) {
        res.status(503).json({ status: 'down', error: err.message });
    }
};

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

// Parse Cookie headers into req.cookies. No signed-cookie secret here — we
// only read the JWT cookie (which is itself signed via JWT_SECRET); we don't
// rely on cookie-parser's signature feature.
app.use(cookieParser());

// CSRF protection for state-changing requests under /api.
//
// We allow-list a small set of endpoints that legitimately don't have a CSRF
// token yet (login flow — no session) or for which CSRF doesn't apply (logout
// is idempotent and only clears client state, csp-report is browser-initiated).
// All other /api POST/PUT/DELETE/PATCH go through the double-submit check.
//
// Each entry is "METHOD PATH". Match is on req.method + req.path with no query
// string. Add to this list with care — every exemption is a CSRF gap.
const CSRF_EXEMPT_ROUTES = new Set([
    // Login flow (no session yet to check token against)
    'POST /api/admin/auth/login',          // admin / registrar / etc. login
    'POST /api/admin/auth/verify-otp',     // admin OTP step
    'POST /api/hod/login',
    'POST /api/trainers/login',
    'POST /api/students/login',
    'POST /api/auth/verify-otp',           // standalone OTP endpoint (admin-flow alias)
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password',
    // Logout: idempotent, only clears client state. Allowing without CSRF
    // means a malicious site could log a user out — annoying but not a
    // security issue.
    'POST /api/auth/logout',
    // Browser-initiated, no JS context to read cookie
    'POST /api/csp-report',
]);

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

app.use((req, res, next) => {
    // Only check /api routes. HTML pages, static files, etc. are unaffected.
    if (!req.path.startsWith('/api/')) return next();
    if (!STATE_CHANGING_METHODS.has(req.method)) return next();
    const key = `${req.method} ${req.path}`;
    if (CSRF_EXEMPT_ROUTES.has(key)) return next();
    return requireCsrfToken(req, res, next);
});

// Logout endpoint — clears the auth cookie AND revokes all outstanding JWTs
// for staff users by bumping users.token_version. Students don't have a
// token_version column yet (separate schema migration), so their JWTs live
// until natural expiry — clear the cookie only.
//
// Best-effort throughout: a malformed or expired token still results in 200
// with the cookie cleared. The endpoint must never fail — it exists to clean
// up client state. Must be registered after cookieParser() so req.cookies is
// populated.
app.post('/api/auth/logout', async (req, res) => {
    try {
        // Pull token from cookie or header without throwing if missing.
        let token = null;
        if (req.cookies && req.cookies.authToken) {
            token = req.cookies.authToken;
        } else {
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            } else if (req.headers['x-auth-token']) {
                token = req.headers['x-auth-token'];
            }
        }

        if (token) {
            // Decode without verification first so we can act even if the token
            // is expired (the most common reason to log out is "I think my
            // session is stale"). jwt.decode does NOT validate the signature
            // — that's intentional, we're not granting access here, just
            // revoking the version on a row we identify by claim.
            const decoded = jwt.decode(token);
            const userId = decoded && decoded.userId;
            const role = decoded && decoded.role;

            // Bump token_version so the SEV-H-013 revocation check rejects this JWT
            // on subsequent requests. Staff live in users; students have their own
            // table with its own token_version column (added in C-SECURITY-step3).
            const STAFF_ROLES = ['admin', 'registrar', 'finance', 'dean', 'deputy', 'ilo', 'cibec', 'hod', 'trainer'];
            if (userId && STAFF_ROLES.includes(role)) {
                try {
                    await userService.bumpTokenVersion(userId);
                } catch (dbErr) {
                    // Don't fail logout on DB error — still clear the cookie.
                    // Log so we can spot persistent issues.
                    console.error('Logout: bumpTokenVersion (staff) failed', dbErr.message);
                }
            } else if (userId && role === 'student') {
                try {
                    await db
                        .update(schema.students)
                        .set({
                            token_version: sql`${schema.students.token_version} + 1`,
                            updated_at: new Date(),
                        })
                        .where(eq(schema.students.id, userId));
                } catch (dbErr) {
                    console.error('Logout: bumpTokenVersion (student) failed', dbErr.message);
                }
            }
        }
    } catch (err) {
        // Catch-all so logout never 500s.
        console.error('Logout handler unexpected error:', err.message);
    } finally {
        clearAuthCookie(res);
        clearCsrfCookie(res);
        res.json({ success: true, message: 'Logged out' });
    }
});

// Return the currently authenticated user. Replaces dashboards reading user
// data from localStorage. Frontend calls this once on page load to populate
// the user identity. The response shape is a discriminated union by role:
// staff users vs students, with role-specific extra fields where relevant.
app.get('/api/me', verifyToken, async (req, res) => {
    try {
        const { userId, role } = req.user;

        // Lazy-issue CSRF token if missing (for sessions established before
        // CSRF rollout — they have a valid authToken but no csrfToken yet).
        if (!req.cookies || !req.cookies.csrfToken) {
            setCsrfCookie(res, generateCsrfToken());
        }

        if (role === 'student') {
            const rows = await db
                .select({
                    id: schema.students.id,
                    name: schema.students.name,
                    admissionNumber: schema.students.admission_number,
                    email: schema.students.email,
                    phone: schema.students.phone_number,
                    course: schema.students.course,
                    department: schema.students.department,
                    year: schema.students.year,
                })
                .from(schema.students)
                .where(eq(schema.students.id, userId))
                .limit(1);
            if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
            return res.json({ success: true, user: { ...rows[0], role: 'student' } });
        }

        // Staff roles live in `users`
        const rows = await db
            .select({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                role: schema.users.role,
                department: schema.users.department,
                phone: schema.users.phone,
                staffId: schema.users.staff_id,
                isFirstLogin: schema.users.is_first_login,
            })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });

        const user = { ...rows[0] };
        if (user.role === 'hod') {
            user.departmentName = hodDepartmentDisplayName(user.department);
        }
        user._id = user.id; // V1-compat alias

        return res.json({ success: true, user });
    } catch (error) {
        console.error('Error in /api/me:', error.message);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

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

// Strip operator characters ($ and . at object-key positions) from req.body,
// req.query, req.params to defeat operator-injection attacks (e.g. submitting
// {"$ne": null} as a password). The shim's query translator interprets $-prefixed
// keys, so this scrub keeps that surface safe.
function sanitizeQueryOperators(options) {
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

app.use(sanitizeQueryOperators({
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

// Design system demo (dev only — for visual verification)
app.get('/design-system', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'dev', 'design-system-demo.html'));
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

app.get('/admin/dashboard', noCacheAuthPages, (req, res) => {
    console.log('📊 Admin dashboard requested');
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

app.get('/hod/dashboard', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'hod', 'HODDashboard.html'));
});

// Serve trainer pages
app.get('/trainer/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'trainer', 'TrainerLogin.html'));
});

app.get('/trainer/dashboard', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'trainer', 'TrainerDashboard.html'));
});

// Serve student pages
app.get('/student/dashboard', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'student', 'StudentPortalTailwind.html'));
});

// Serve admission letter template
app.get('/src/components/registrar/AdmissionLetter.html', (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'registrar', 'AdmissionLetter.html'));
});

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

// V2 Phase 1b: ToolRequest, Program, Payment now come from src/db/models.js
// (Drizzle/Postgres facade). See the top-of-file imports.





// Tool Request Routes

// Get all open tool requests (Deputy/admin overview). Soft-deleted rows are excluded
// in JS because the makeModel shim's .find() does not auto-filter deleted_at, and the
// chained .sort() on its result is a no-op (so sorting is done via the DB queryOpts).
app.get('/api/tool-requests', verifyToken, authorize('admin', 'deputy', 'trainer', 'hod'), async (req, res) => {
    try {
        const rows = await ToolRequest.find({ status: 'open' }, null, { sort: { createdAt: -1 } });
        const requests = rows.filter(r => !r.deletedAt);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching tool requests:', error);
        res.status(500).json({ message: 'Failed to fetch tool requests' });
    }
});

// Get open tool requests targeted at a specific trainer (uuid param). A request applies to a
// trainer if it targets the whole faculty, their department, or them directly.
app.get('/api/tool-requests/trainer/:trainerId', verifyToken, authorize('admin', 'trainer'), verifyOwnership('trainerId'), async (req, res) => {
    try {
        const trainer = await User.findById(req.params.trainerId);
        if (!trainer) {
            return res.status(404).json({ message: 'Trainer not found' });
        }
        const rows = await ToolRequest.find({ status: 'open' }, null, { sort: { createdAt: -1 } });
        const requests = rows.filter(r => !r.deletedAt && (
            r.targetType === 'faculty' ||
            (r.targetType === 'department' && r.targetDepartment === trainer.department) ||
            (r.targetType === 'trainer' && r.targetTrainerId === trainer.id)
        ));
        res.json(requests);
    } catch (error) {
        console.error('Error fetching trainer requests:', error);
        res.status(500).json({ message: 'Failed to fetch trainer requests' });
    }
});

// Create a tool request (a Deputy asks a trainer/department/faculty to submit a tool).
app.post('/api/tool-requests', verifyToken, authorize('admin', 'deputy'), async (req, res) => {
    try {
        const { toolType, targetType, targetTrainerId, targetDepartment, dueDate, instructions } = req.body;

        if (!toolType || !targetType || !dueDate) {
            return res.status(400).json({ message: 'toolType, targetType and dueDate are required' });
        }
        if (!['trainer', 'department', 'faculty'].includes(targetType)) {
            return res.status(400).json({ message: "targetType must be 'trainer', 'department' or 'faculty'" });
        }
        if (targetType === 'trainer' && !targetTrainerId) {
            return res.status(400).json({ message: 'targetTrainerId is required when targetType is trainer' });
        }
        if (targetType === 'department' && !targetDepartment) {
            return res.status(400).json({ message: 'targetDepartment is required when targetType is department' });
        }

        const request = await ToolRequest.create({
            toolType,
            targetType,
            targetTrainerId: targetTrainerId || null,
            targetDepartment: targetDepartment || null,
            dueDate,
            instructions: instructions || null,
            requestedBy: req.user.userId,
            status: 'open',
        });

        // Resolve recipients — trainers are users with role 'trainer'.
        let recipientIds = [];
        if (targetType === 'trainer') {
            recipientIds = [targetTrainerId];
        } else if (targetType === 'department') {
            const trainers = await User.find({ role: 'trainer', department: targetDepartment });
            recipientIds = trainers.map(t => t.id);
        } else { // faculty — every trainer
            const trainers = await User.find({ role: 'trainer' });
            recipientIds = trainers.map(t => t.id);
        }

        const body = `You have a request to submit a ${toolType.replace(/_/g, ' ')}${dueDate ? ' by ' + new Date(dueDate).toLocaleDateString() : ''}.${instructions ? ' Instructions: ' + instructions : ''}`;
        for (const recipientId of recipientIds) {
            await Notification.create({
                recipientId,
                recipientType: 'user',
                title: 'New Tools of Trade Request',
                body,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tool request created',
            request,
            notified: recipientIds.length,
        });
    } catch (error) {
        console.error('Error creating tool request:', error);
        res.status(500).json({ message: 'Failed to create tool request', error: error.message });
    }
});

// Student Routes

// Student admin/registrar API — extracted to src/routes/students.js
app.use('/api', require('./src/routes/students'));

// Units API Routes

// Get units by course code (for student portal)
app.get('/api/units/course/:courseCode', async (req, res) => {
    try {
        const { courseCode } = req.params;
        const { studentId } = req.query; // Optional admission number for registration status

        // Validate course code
        if (!courseCode || courseCode.trim() === '') {
            return res.status(400).json({ message: 'Course code is required' });
        }

        // Fetch the course's units. A unit belongs to a program via program_id;
        // "units for course AC6" = units whose program has programs.code = 'AC6'.
        // Program codes are stored uppercase, so match on .toUpperCase().
        // Modeled on the GET /api/units/department/:department endpoint below.
        const unitRows = await db
            .select({
                _id: schema.units.id,
                unitCode: schema.units.code,
                unitName: schema.units.name,
                year: schema.units.year,
                semester: schema.units.semester,
                isCommon: schema.units.is_common,
                courseCode: schema.programs.code,
                courseName: schema.programs.name,
            })
            .from(schema.units)
            .innerJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
            .where(and(
                eq(schema.programs.code, courseCode.toUpperCase()),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.units.year, schema.units.code);

        // Registration status — only when an admission number is supplied.
        // studentId arrives as an admission number; resolve it to the student uuid,
        // then collect the unit_id uuids the student is registered for. A unit counts
        // as registered if any registration row exists for that student + unit.
        let registeredUnitIds = new Set();
        if (studentId) {
            const student = await Student.findOne({ admissionNumber: studentId });
            if (student) {
                const regs = await StudentUnitRegistration.find({ studentId: student.id });
                registeredUnitIds = new Set(regs.map(r => r.unitId));
            }
        }

        // Common units are just units rows with is_common = true (already included above).
        const units = unitRows.map(u => ({
            ...u,
            department: u.isCommon ? 'common' : 'department',
            type: u.isCommon ? 'common' : 'department',
            isRegistered: registeredUnitIds.has(u._id),
        }));

        if (units.length === 0) {
            return res.status(404).json({ message: 'No units found for this course' });
        }

        res.json({
            success: true,
            courseCode: courseCode,
            totalUnits: units.length,
            departmentUnits: units.filter(u => !u.isCommon).length,
            commonUnits: units.filter(u => u.isCommon).length,
            registeredUnits: units.filter(u => u.isRegistered).length,
            units: units,
        });
    } catch (error) {
        console.error('Error fetching units by course:', error);
        res.status(500).json({ message: 'Server error while fetching units' });
    }
});

// Get units by department (for admin use)
app.get('/api/units/department/:department', verifyToken, authorize('admin', 'registrar', 'hod', 'deputy'), async (req, res) => {
    try {
        const { department } = req.params;
        const validDepartments = ['applied_science', 'agriculture', 'building_civil', 'electromechanical', 'hospitality', 'business_liberal', 'computing_informatics', 'business_administration'];
        if (!validDepartments.includes(department)) {
            return res.status(400).json({ message: 'Invalid department' });
        }
        const shortCode = DEPT_TEXT_TO_SHORT[department];
        if (!shortCode) {
            // Known department code with no row in `departments` table (e.g. business_administration).
            return res.json({ success: true, department, totalUnits: 0, units: [] });
        }
        const rows = await db
            .select({
                _id: schema.units.id,
                unitCode: schema.units.code,
                unitName: schema.units.name,
                year: schema.units.year,
                semester: schema.units.semester,
                isCommon: schema.units.is_common,
                courseCode: schema.programs.code,
                courseName: schema.programs.name,
            })
            .from(schema.units)
            .innerJoin(schema.programs, eq(schema.programs.id, schema.units.program_id))
            .innerJoin(schema.departments, eq(schema.departments.id, schema.programs.department_id))
            .where(and(
                eq(schema.departments.code, shortCode),
                isNull(schema.units.deleted_at),
            ))
            .orderBy(schema.programs.code, schema.units.code);
        // Tag each unit with the requested department text code for frontend compatibility.
        const units = rows.map(r => ({ ...r, department }));
        res.json({
            success: true,
            department,
            totalUnits: units.length,
            units,
        });
    } catch (error) {
        console.error('Error fetching units by department:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching units' });
    }
});

// Get all units (for admin use with pagination)
app.get('/api/units', verifyToken, authorize('admin', 'registrar', 'hod', 'deputy'), async (req, res) => {
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

// Common units + assignments API — extracted to src/routes/commonUnits.js
app.use('/api', require('./src/routes/commonUnits'));
// Get trainers from all departments for common unit assignment
app.get('/api/trainers/all-departments', verifyToken, authorize('admin', 'hod', 'registrar', 'deputy', 'finance'), async (req, res) => {
    try {
        // A trainer is a users row with role = 'trainer'. Select only real
        // columns (the old V1 select referenced a field that has no column).
        // Finance lists these to pick whose payslips to generate, then posts
        // the ids to /api/payslips/generate.
        const trainers = await db
            .select({
                id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                department: schema.users.department,
            })
            .from(schema.users)
            .where(and(
                eq(schema.users.role, 'trainer'),
                eq(schema.users.is_active, true),
            ))
            .orderBy(schema.users.department, schema.users.name);

        // Group by department. Trainers with no department land under 'Unassigned'.
        const trainersByDepartment = trainers.reduce((acc, trainer) => {
            const dept = trainer.department || 'Unassigned';
            if (!acc[dept]) {
                acc[dept] = [];
            }
            acc[dept].push(trainer);
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

        // V2 Path B: direct Drizzle via userService.
        const hod = await userService.findActiveByDepartmentAndRole(String(department), 'hod');
        if (!hod) {
            return res.status(401).json(genericFail);
        }

        const isValidPassword = await userService.comparePassword(hod, password);
        if (!isValidPassword) {
            return res.status(401).json(genericFail);
        }

        await userService.updateLastLogin(hod.id);

        const token = signToken({
            userId: String(hod.id),
            email: hod.email,
            role: 'hod',
            tokenVersion: hod.token_version || 0 // SEV-H-013
        });

        setAuthCookie(res, token);
        setCsrfCookie(res, generateCsrfToken());
        res.json({
            message: 'Login successful',
            token,
            user: {
                _id: hod.id,                              // V1-compat alias
                department: hod.department,
                departmentName: hodDepartmentDisplayName(hod.department),
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
        if (!isValidId(hodId)) {
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
app.get('/api/hod/departments', (req, res) => {
    const departments = [
        { code: 'applied_science',       name: 'Applied Science' },
        { code: 'agriculture',           name: 'Agriculture' },
        { code: 'building_civil',        name: 'Building & Civil Engineering' },
        { code: 'electromechanical',     name: 'Electromechanical Engineering' },
        { code: 'hospitality',           name: 'Hospitality' },
        { code: 'business_liberal',      name: 'Business & Liberal Studies' },
        { code: 'computing_informatics', name: 'Computing & Informatics' },
    ];
    res.json(departments);
});

// Get trainers by department
app.get('/api/trainers/department/:department', verifyToken, authorize('admin', 'hod', 'registrar', 'deputy'), async (req, res) => {
    try {
        const { department } = req.params;
        const rows = await db
            .select({
                _id: schema.users.id,
                name: schema.users.name,
                email: schema.users.email,
                department: schema.users.department,
                phone: schema.users.phone,
            })
            .from(schema.users)
            .where(and(
                eq(schema.users.role, 'trainer'),
                eq(schema.users.department, department),
                eq(schema.users.is_active, true),
                isNull(schema.users.deleted_at),
            ))
            .orderBy(schema.users.name);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching trainers:', error);
        res.status(500).json({ message: 'Failed to fetch trainers' });
    }
});

// Trainer assignments API — extracted to src/routes/assignments.js
app.use('/api', require('./src/routes/assignments'));

// Trainer self-service API — extracted to src/routes/trainers.js
app.use('/api', require('./src/routes/trainers'));

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

// Students API Routes

// Student auth/account API — extracted to src/routes/studentsAuth.js
app.use('/api', require('./src/routes/studentsAuth'));

// Student registration/academic API — extracted to src/routes/studentRegistration.js
app.use('/api', require('./src/routes/studentRegistration'));

// ========================================
// SYSTEM SETTINGS API ROUTES
// ========================================

// Get all system settings
app.get('/api/system-settings', verifyToken, authorize('admin', 'registrar', 'student', 'finance'), async (req, res) => {
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

// Program Routes — extracted to src/routes/programs.js
app.use('/api', require('./src/routes/programs'));

// Payment Routes — extracted to src/routes/payments.js
app.use('/api', require('./src/routes/payments'));





app.use((req, res, next) => {
    console.log(`Static file request: ${req.path}`);
    next();
});

// Tools of Trade API — extracted to src/routes/tools.js
app.use('/api', require('./src/routes/tools'));

// File download API (shared: tools + student-uploads) — extracted to src/routes/files.js
app.use('/api', require('./src/routes/files'));

// Notifications API — extracted to src/routes/notifications.js
app.use('/api/notifications', require('./src/routes/notifications'));

// Graduation/Attachment applications API — extracted to src/routes/applications.js
app.use('/api', require('./src/routes/applications'));
// ILO Office API — extracted to src/routes/ilo.js
app.use('/api', require('./src/routes/ilo'));

// ========================================
// CLEAN URL ROUTES (Hide .html extensions)
// ========================================

// Admin routes are defined at the top of the file (after API routes)
// See lines 630-659

// Student routes
app.get('/student/login', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'login.html'));
});

app.get('/student/portal', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'student', 'StudentPortalTailwind.html'));
});

// Finance routes
app.get('/finance/login', (req, res) => res.redirect('/admin/login'));

app.get('/finance/dashboard', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'finance', 'FinanceDashboard.html'));
});

// Registrar routes
app.get('/registrar/login', (req, res) => res.redirect('/admin/login'));

app.get('/registrar/dashboard', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'registrar', 'RegistrarDashboardNew.html'));
});

// Dean routes
app.get('/dean/login', (req, res) => res.redirect('/admin/login'));

app.get('/dean/dashboard', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'dean', 'DeanDashboard.html'));
});

// Deputy routes
app.get('/deputy/login', (req, res) => res.redirect('/admin/login'));

app.get('/deputy/dashboard', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'deputy', 'DeputyDashboard.html'));
});

// ILO routes (Industrial Liaison Office)
app.get('/ilo/login', (req, res) => res.redirect('/admin/login'));

app.get('/ilo/dashboard', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'ilo', 'ILODashboard.html'));
});

// CIBEC routes (Competency-Based Education & Training Center)
app.get('/cibec/login', (req, res) => res.redirect('/admin/login'));

app.get('/cibec/dashboard', noCacheAuthPages, (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'cibec', 'CIBECDashboard.html'));
});

// Root: public institutional landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'src', 'components', 'landing', 'Landing.html'));
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

// CIBEC API — extracted to src/routes/cibec.js
app.use('/api', require('./src/routes/cibec'));

// Dean Portal + student notes API — extracted to src/routes/dean.js
app.use('/api', require('./src/routes/dean'));

// ========================================
// PAYSLIP API ENDPOINTS
// ========================================

// Payslips API — extracted to src/routes/payslips.js
app.use('/api', require('./src/routes/payslips'));

// Catch-all 404. JSON for /api/*, plain text otherwise.
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            message: 'Endpoint not found',
            code: 'NOT_FOUND'
        });
    }
    res.status(404).type('text/plain').send('Page not found');
});

// Global error handler. Logs full detail server-side, returns minimal info to client.
app.use((err, req, res, next) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    console.error(`[ERR ${requestId}] ${req.method} ${req.path}`, err && err.stack ? err.stack : err);
    if (res.headersSent) return next(err);
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({ success: false, message: 'Request body too large', requestId });
    }
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Malformed JSON', requestId });
    }
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        requestId
    });
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