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
const { cspReportLimiter, generalApiLimiter } = require('./src/middleware/rateLimiters');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./src/config/config');
const csp = require('./src/config/csp'); // SEV-M-025: CSP (Report-Only by default)

// V2 Phase 1b: Drizzle/Postgres data layer + a thin model facade shim.
// The shim exposes the legacy V1 model APIs backed by Drizzle/Postgres, so the
// existing call sites in this file keep working AS-IS. See src/db/models.js.
const { db, client, schema } = require('./src/db');
const { eq, and, sql } = require('drizzle-orm');
const userService = require('./src/services/userService');

const { hodDepartmentDisplayName } = require('./src/utils/formatters');
const {
    Student, User, AdminStaff, Trainer, HOD,
    Program, Unit, CommonUnit,
    TrainerAssignment,
    ToolRequest,
    SystemSettings,
    Payment,
} = require('./src/db/models');

// Student Schema
// V2 Phase 1b: Student model + all V1 model facades now come from src/db/models.js
// (Drizzle/Postgres facade). See block above.

// Import services
const EmailService = require('./src/utils/emailService');

// Import authentication middleware
const { verifyToken, enforceStudentFirstLogin, clearAuthCookie, generateCsrfToken, setCsrfCookie, clearCsrfCookie, requireCsrfToken } = require('./src/middleware/auth');
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
        sendOTPEmail: async () => console.log('Email stub: sendOTPEmail'),
        sendResetLinkEmail: async () => console.log('Email stub: sendResetLinkEmail'),
        sendPassword: async () => console.log('Email stub: sendPassword'),
        sendStudentCredentials: async () => console.log('Email stub: sendStudentCredentials')
    };
}

// Import data parsers
const { parseTrainersFile } = require('./src/data/trainerData');

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

// Tabbed-SPA portal page routing — one reusable registrar for all 9 portals.
const { registerPortal } = require('./src/routes/portalPages');
const portalDeps = { serveHTML, noCacheAuthPages, path, __dirname };
// Minimal request logger - method, path, status only. Never log headers or bodies.
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
});

// Password reset API — extracted to src/routes/passwordReset.js
app.use('/api', require('./src/routes/passwordReset'));
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

// Admin portal pages (login, first-login, SPA tabs). MUST precede generic routes.
registerPortal(app, portalDeps, {
    role: 'admin',
    tabs: ['dashboard', 'students', 'trainers', 'financial', 'programs', 'reports', 'settings'],
    defaultTab: 'dashboard',
    login: { file: 'AdminLogin.html' },
    extraPages: [{ path: '/admin/first-login', file: 'FirstLogin.html' }],
});

// Serve main login page (Student/Trainer combined)
app.get('/login', noCacheAuthPages, (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'login.html'));
});

// HOD portal pages. defaultTab 'overview' != 'dashboard', so the legacy
// /hod/dashboard bare redirect is enabled.
registerPortal(app, portalDeps, {
    role: 'hod',
    tabs: ['overview', 'courses', 'trainers', 'common-units', 'assignments', 'analytics', 'profile'],
    defaultTab: 'overview',
    login: { file: 'HODLogin.html' },
    legacyDashboardRedirect: true,
});

// Trainer portal pages.
registerPortal(app, portalDeps, {
    role: 'trainer',
    tabs: ['dashboard', 'assignments', 'students', 'tools-of-trade', 'payslips', 'notifications', 'profile'],
    defaultTab: 'dashboard',
    login: { file: 'TrainerLogin.html' },
});

// (The legacy /student/dashboard alias was removed — /student/<tab> now serves
// the student SPA shell; see the Student routes block further below.)

// Serve admission letter template
app.get('/src/components/registrar/AdmissionLetter.html', (req, res) => {
    serveHTML(res, path.join(__dirname, 'src', 'components', 'registrar', 'AdmissionLetter.html'));
});

// Function to initialize trainers in database
async function initializeTrainers() {
    try {
        console.log('Initializing trainers (preserving existing ones)...');

        const trainersByDepartment = parseTrainersFile();
        console.log('Departments found in trainers.txt:', Object.keys(trainersByDepartment));
        
        let newTrainersAdded = 0;
        let existingTrainersFound = 0;
        
        for (const [department, trainers] of Object.entries(trainersByDepartment)) {
            console.log(`Checking ${trainers.length} trainers for department: ${department}`);
            
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
                        console.log(`  Updated trainer: ${trainerData.name}`);
                    } else {
                        console.log(`  Existing trainer: ${trainerData.name}`);
                    }
                    existingTrainersFound++;
                } else {
                    // Create new trainer
                    console.log(`  Adding new trainer: ${trainerData.name} to department: ${trainerData.department}`);
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

        console.log(`Trainer initialization complete!`);
        console.log(`Summary: ${existingTrainersFound} existing, ${newTrainersAdded} new trainers`);
        
        // Only fix references if we have broken ones
        const allAssignments = await TrainerAssignment.find({ status: 'active' });
        const allTrainers = await Trainer.find({});
        const currentTrainerIds = allTrainers.map(t => t._id.toString());
        
        const brokenAssignments = allAssignments.filter(assignment => 
            !assignment.trainerId || !currentTrainerIds.includes(assignment.trainerId.toString())
        );
        
        if (brokenAssignments.length > 0) {
            console.log(`Found ${brokenAssignments.length} broken trainer references, fixing...`);
            await fixBrokenTrainerReferences();
        } else {
            console.log('All trainer references are valid');
        }
        
        // Check unit references
        const allUnits = await Unit.find({ isActive: true });
        const currentUnitIds = allUnits.map(u => u._id.toString());
        
        const brokenUnitAssignments = allAssignments.filter(assignment => 
            !assignment.unitId || !currentUnitIds.includes(assignment.unitId.toString())
        );
        
        if (brokenUnitAssignments.length > 0) {
            console.log(`Found ${brokenUnitAssignments.length} broken unit references, fixing...`);
            await fixBrokenUnitReferences();
        } else {
            console.log('All unit references are valid');
        }
        
    } catch (error) {
        console.error('Error initializing trainers:', error);
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
        console.log('Fixing broken unit references in assignments...');
        
        // Get all active assignments
        const allAssignments = await TrainerAssignment.find({ status: 'active' });
        console.log(`Found ${allAssignments.length} total active assignments`);
        
        // Get all current units
        const currentUnits = await Unit.find({ isActive: true });
        const currentUnitIds = currentUnits.map(u => u._id.toString());
        
        console.log(`Found ${currentUnits.length} active units in database`);
        
        // Find assignments with invalid unit references
        const brokenAssignments = [];
        for (const assignment of allAssignments) {
            if (!assignment.unitId || !currentUnitIds.includes(assignment.unitId.toString())) {
                brokenAssignments.push(assignment);
            }
        }
        
        console.log(`Found ${brokenAssignments.length} assignments with broken/invalid unit references`);
        
        if (brokenAssignments.length === 0) {
            console.log('No broken unit references found');
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
                
                console.log(`Fixed unit reference for assignment ${assignment.courseCode} - assigned to unit ${unit.unitCode}`);
                fixedCount++;
            } else {
                console.warn(`No matching units found for assignment ${assignment.courseCode} in department ${assignment.department}`);
                
                // Try to find any unit with the same course code (ignore department)
                const anyMatchingUnit = currentUnits.find(u => u.courseCode === assignment.courseCode);
                if (anyMatchingUnit) {
                    assignment.unitId = anyMatchingUnit._id;
                    await assignment.save();
                    console.log(`Fixed unit reference for assignment ${assignment.courseCode} - assigned to unit ${anyMatchingUnit.unitCode} (cross-department)`);
                    fixedCount++;
                }
            }
        }
        
        console.log(`Successfully fixed ${fixedCount} broken unit references`);
        
    } catch (error) {
        console.error('Error fixing broken unit references:', error);
    }
}

// Initialize Common Units
async function initializeCommonUnits() {
    try {
        console.log('Initializing common units...');
        
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
                console.log(`  Updated common unit: ${unitData.unitName}`);
            } else {
                // Create new common unit
                const commonUnit = new CommonUnit(unitData);
                await commonUnit.save();
                newCount++;
                console.log(`  Created common unit: ${unitData.unitName}`);
            }
        }

        console.log(`Common units initialization complete!`);
        console.log(`Summary: ${existingCount} existing, ${newCount} new common units`);
        
    } catch (error) {
        console.error('Error initializing common units:', error);
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
        console.log('Initializing system settings...');
        
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
                console.log(`  Created setting: ${settingData.key} = ${settingData.value}`);
            }
        }

        console.log(`System settings initialization complete!`);
        console.log(`Summary: ${existingCount} existing, ${newCount} new settings`);
        
    } catch (error) {
        console.error('Error initializing system settings:', error);
    }
}

// V2 Phase 1b: ToolRequest, Program, Payment now come from src/db/models.js
// (Drizzle/Postgres facade). See the top-of-file imports.





// Tool requests API — extracted to src/routes/toolRequests.js
app.use('/api', require('./src/routes/toolRequests'));
// Student Routes

// Student admin/registrar API — extracted to src/routes/students.js
app.use('/api', require('./src/routes/students'));

// Units + courses API — extracted to src/routes/units.js
app.use('/api', require('./src/routes/units'));
// Common units + assignments API — extracted to src/routes/commonUnits.js
app.use('/api', require('./src/routes/commonUnits'));
// HOD-facing API (HOD auth/profile + trainer lookups) — extracted to src/routes/hod.js
app.use('/api', require('./src/routes/hod'));
// Trainer assignments API — extracted to src/routes/assignments.js
app.use('/api', require('./src/routes/assignments'));

// Trainer self-service API — extracted to src/routes/trainers.js
app.use('/api', require('./src/routes/trainers'));

// System settings + diagnostics API — extracted to src/routes/systemSettings.js
app.use('/api', require('./src/routes/systemSettings'));

// Students API Routes

// Student auth/account API — extracted to src/routes/studentsAuth.js
app.use('/api', require('./src/routes/studentsAuth'));

// Student registration/academic API — extracted to src/routes/studentRegistration.js
app.use('/api', require('./src/routes/studentRegistration'));

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

// Student portal pages. The login serves the shared src/login.html. The legacy
// alias is 'portal' (NOT 'dashboard'): /student/portal[/<tab>] -> /student[/<tab>];
// there is intentionally no /student/dashboard/:tab redirect ('dashboard' is a
// real tab, served by the catch-all).
registerPortal(app, portalDeps, {
    role: 'student',
    tabs: ['dashboard', 'profile', 'financial', 'payments', 'uploads', 'notes', 'units', 'transcript', 'graduation', 'attachment'],
    defaultTab: 'dashboard',
    login: { fileSegments: ['src', 'login.html'] },
    legacyAlias: 'portal',
    legacyDashboardRedirect: true,
});

// Finance portal pages.
registerPortal(app, portalDeps, {
    role: 'finance',
    tabs: ['dashboard', 'analytics', 'reports', 'revenue', 'expenditure', 'collections', 'payslips', 'settings'],
    defaultTab: 'dashboard',
    login: { redirectTo: '/admin/login' },
});

// Registrar portal pages.
registerPortal(app, portalDeps, {
    role: 'registrar',
    tabs: ['dashboard', 'admission', 'management', 'promotion', 'courses', 'enrollment', 'graduation', 'faculty', 'department', 'reports'],
    defaultTab: 'dashboard',
    login: { redirectTo: '/admin/login' },
});

// Dean portal pages. defaultTab 'students' != 'dashboard', so the legacy
// /dean/dashboard bare redirect is enabled.
registerPortal(app, portalDeps, {
    role: 'dean',
    tabs: ['students', 'notes', 'tools-of-trade'],
    defaultTab: 'students',
    login: { redirectTo: '/admin/login' },
    legacyDashboardRedirect: true,
});

// Deputy portal pages.
registerPortal(app, portalDeps, {
    role: 'deputy',
    tabs: ['dashboard', 'students', 'trainers', 'courses', 'units', 'tools', 'notifications'],
    defaultTab: 'dashboard',
    login: { redirectTo: '/admin/login' },
});

// ILO portal pages. defaultTab 'graduation-applications' != 'dashboard', so the
// legacy /ilo/dashboard bare redirect is enabled.
registerPortal(app, portalDeps, {
    role: 'ilo',
    tabs: ['graduation-applications', 'attachment-applications'],
    defaultTab: 'graduation-applications',
    login: { redirectTo: '/admin/login' },
    legacyDashboardRedirect: true,
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
app.use(express.static(path.join(__dirname, 'src', 'components')));
// SEV-C-003: `app.use(express.static('.'))` was removed. Serving the project
// root exposed source, configs and temp_diff.txt to anonymous download. Client
// assets are served by the explicit mounts above (/src/components, /public,
// /uploads) and the src/components static mount; the repo root is never served.

const PORT = config.port;

// Student uploads API — extracted to src/routes/studentUploads.js
app.use('/api', require('./src/routes/studentUploads'));

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