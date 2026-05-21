// Production-Grade Authentication Middleware
// JWT-based authentication with role-based access control (RBAC)

const jwt = require('jsonwebtoken');
const config = require('../config/config');
// V2 Phase 1b: models come from the Drizzle/Postgres facade (src/db/models.js).
const shim = require('../db/models');

// Sourced from validated config (config will refuse to boot in prod without it)
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

/**
 * SEV-H-013: Resolve the model that owns the account for a given role.
 * In V2 the unified `users` table holds admin / deputy / finance / dean / ilo /
 * registrar / cibec / hod / trainer — the shim's role-filtered facades return
 * the correct rows for each.
 */
function modelForRole(role) {
    if (role === 'student') return shim.Student;
    if (role === 'hod')     return shim.HOD;
    if (role === 'trainer') return shim.Trainer;
    // admin, deputy, finance, dean, ilo, registrar, cibec all live in users.
    // AdminStaff facade only matches role='admin'; for the broader staff roles
    // we use the unfiltered User model so the JWT can identify the row by id
    // regardless of its specific role.
    return shim.User;
}

/**
 * Sign a JWT for any user type. Centralised so we can change expiry, claims,
 * and rotation policy in one place.
 *
 * @param {Object} payload - claims to embed. Must include `userId` and `role`.
 * @param {Object} [overrides] - jwt.sign options to override defaults.
 */
function signToken(payload, overrides = {}) {
    if (!payload || !payload.userId || !payload.role) {
        throw new Error('signToken requires userId and role in payload');
    }
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, ...overrides });
}

/**
 * Set the authentication cookie on a response.
 *
 * httpOnly  — JavaScript cannot read this cookie, neutralising XSS token theft.
 * sameSite  — 'lax' allows the cookie on top-level GET navigations (so
 *             bookmarked links and external referrals still authenticate)
 *             while blocking cross-site POST/PUT, which gives us baseline CSRF
 *             protection until the explicit CSRF token lands in step 3.
 * secure    — bind to HTTPS in production. Off in staging/dev so HTTP works.
 *             When HTTPS lands later, NODE_ENV=production flips this on
 *             automatically with no code change.
 * maxAge    — 2 hours, matches the JWT expiry from config.jwt.expiresIn.
 *             Cookie auto-deletes when JWT expires anyway.
 * path: '/' — cookie is sent on every request to this origin.
 *
 * Centralised so the cookie policy lives in exactly one place. Every login
 * endpoint must call this helper rather than calling res.cookie directly.
 */
function setAuthCookie(res, token) {
    res.cookie('authToken', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 2 * 60 * 60 * 1000, // 2h in ms, matches JWT_EXPIRES_IN=2h
        path: '/',
    });
}

/**
 * Clear the authentication cookie. Used by the logout endpoint and any place
 * the session must be invalidated server-side.
 */
function clearAuthCookie(res) {
    res.clearCookie('authToken', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
}

/**
 * Extract the bearer token from the request, supporting Authorization header,
 * the legacy x-auth-token header, and the httpOnly authToken cookie.
 */
function extractToken(req) {
    // Header takes precedence so the existing Bearer flow keeps working during
    // migration (step 1 of cookie rollout). Once step 2 + 3 land, we can remove
    // the header path entirely.
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    if (req.headers['x-auth-token']) {
        return req.headers['x-auth-token'];
    }
    // Cookie fallback. cookie-parser populates req.cookies.
    if (req.cookies && req.cookies.authToken) {
        return req.cookies.authToken;
    }
    return null;
}

/**
 * Verify JWT and attach minimal user info to req.user.
 * Do NOT log the token or full headers anywhere.
 */
const verifyToken = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Authentication required.',
                code: 'NO_TOKEN'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        // SEV-H-006: carry identifier claims (admissionNumber etc.) and the
        // tokenVersion through to req.user so ownership checks and revocation work.
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            userType: decoded.userType || decoded.role,
            admissionNumber: decoded.admissionNumber,
            staffId: decoded.staffId,
            tokenVersion: decoded.tokenVersion
        };

        // SEV-H-013: revoke tokens on credential/role change and block disabled
        // accounts. One indexed _id read per authenticated request.
        const Model = modelForRole(decoded.role);
        if (Model && decoded.userId) {
            let userDoc;
            try {
                userDoc = await Model.findById(decoded.userId).select('tokenVersion isActive');
            } catch (dbErr) {
                console.error('verifyToken account lookup failed:', dbErr.message);
                return res.status(401).json({
                    success: false,
                    message: 'Authentication failed.',
                    code: 'AUTH_FAILED'
                });
            }
            if (!userDoc) {
                return res.status(401).json({
                    success: false,
                    message: 'Session is no longer valid. Please log in again.',
                    code: 'TOKEN_REVOKED'
                });
            }
            if (userDoc.isActive === false) {
                return res.status(401).json({
                    success: false,
                    message: 'This account has been disabled.',
                    code: 'ACCOUNT_DISABLED'
                });
            }
            const currentVersion = userDoc.tokenVersion || 0;
            const claimVersion = decoded.tokenVersion || 0;
            if (currentVersion !== claimVersion) {
                return res.status(401).json({
                    success: false,
                    message: 'Session is no longer valid. Please log in again.',
                    code: 'TOKEN_REVOKED'
                });
            }
        }

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token.',
                code: 'INVALID_TOKEN'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Authentication failed.',
            code: 'AUTH_FAILED'
        });
    }
};

/**
 * Role-based access control.
 * Usage: app.get('/x', verifyToken, authorize('admin', 'registrar'), handler)
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
                code: 'NOT_AUTHENTICATED'
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            // Log forbidden attempts but never log tokens or bodies
            console.warn(`FORBIDDEN: ${req.user.role} (${req.user.userId}) tried ${req.method} ${req.path}`);
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this resource.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        next();
    };
};

/**
 * Verify the authenticated user owns the resource they are accessing.
 * Admin-level roles bypass.
 *
 * Important: compares as strings; UUIDs and string IDs are both handled.
 */
const verifyOwnership = (userIdParam = 'id') => {
    return (req, res, next) => {
        try {
            const requestedUserId = req.params[userIdParam] || req.query[userIdParam];
            const authenticatedUserId = req.user && req.user.userId;

            // SEV-H-006: only admin and registrar may bypass ownership. Other
            // back-office roles (dean, finance, deputy, cibec, ilo) must reach
            // other users' data through routes that explicitly authorize them,
            // never by silently skipping the ownership check.
            const adminRoles = ['admin', 'registrar'];
            if (adminRoles.includes(req.user && req.user.role)) {
                return next();
            }

            if (!requestedUserId || !authenticatedUserId) {
                return res.status(403).json({
                    success: false,
                    message: 'Ownership check failed.',
                    code: 'NOT_OWNER'
                });
            }

            // For students, also allow matching by admissionNumber since URLs use that
            // rather than the row UUID.
            const isOwner = String(requestedUserId) === String(authenticatedUserId) ||
                          (req.user && req.user.admissionNumber &&
                           String(requestedUserId) === String(req.user.admissionNumber));

            if (!isOwner) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only access your own data.',
                    code: 'NOT_OWNER'
                });
            }
            next();
        } catch (error) {
            console.error('Ownership verification error:', error.message);
            res.status(500).json({ success: false, message: 'Ownership verification failed.' });
        }
    };
};

/**
 * Optional authentication. Attaches user info if a valid token is present,
 * but does not block anonymous access.
 */
const optionalAuth = (req, res, next) => {
    try {
        const token = extractToken(req);
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                req.user = {
                    userId: decoded.userId,
                    email: decoded.email,
                    role: decoded.role,
                    userType: decoded.userType || decoded.role
                };
            } catch (err) {
                req.user = null;
            }
        }
        next();
    } catch (error) {
        next();
    }
};

/**
 * SEV-H-014: while a student still has the forced-change flag set, every
 * authenticated request is rejected except the first-login password change.
 * Decodes the bearer token only; never blocks anonymous/non-student traffic.
 * Mounted globally under /api so it covers all student routes.
 */
const enforceStudentFirstLogin = (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) return next(); // no token -> let the route's verifyToken decide
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return next(); // invalid/expired -> verifyToken will reject properly
        }
        if (decoded && decoded.role === 'student' && decoded.firstLoginRequired) {
            const isPasswordChange =
                req.method === 'POST' && req.path.endsWith('/first-login-password-change');
            if (!isPasswordChange) {
                return res.status(403).json({
                    success: false,
                    message: 'You must change your initial password before continuing.',
                    code: 'FIRST_LOGIN_REQUIRED'
                });
            }
        }
        next();
    } catch (error) {
        next();
    }
};

/**
 * NOTE: the in-memory rate limiter that used to live here was removed.
 * It did not work on serverless (state was lost on every cold start) and was
 * easy to bypass behind a proxy. Use the express-rate-limit middleware
 * configured in server.js instead.
 */

module.exports = {
    verifyToken,
    authorize,
    verifyOwnership,
    optionalAuth,
    enforceStudentFirstLogin,
    signToken,
    setAuthCookie,
    clearAuthCookie,
    // Backward-compatible aliases
    authenticateToken: verifyToken,
    requireAuth: verifyToken
};
