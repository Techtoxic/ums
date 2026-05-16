// Production-Grade Authentication Middleware
// JWT-based authentication with role-based access control (RBAC)

const jwt = require('jsonwebtoken');
const config = require('../config/config');

// Sourced from validated config (config will refuse to boot in prod without it)
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn;

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
 * Extract the bearer token from the request, supporting Authorization header
 * and the legacy x-auth-token header.
 */
function extractToken(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return req.headers['x-auth-token'] || null;
}

/**
 * Verify JWT and attach minimal user info to req.user.
 * Do NOT log the token or full headers anywhere.
 */
const verifyToken = (req, res, next) => {
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

        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            userType: decoded.userType || decoded.role
        };
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
 * Important: compares as strings; both Mongo ObjectIds and string IDs are handled.
 */
const verifyOwnership = (userIdParam = 'id') => {
    return (req, res, next) => {
        try {
            const requestedUserId = req.params[userIdParam] || req.query[userIdParam];
            const authenticatedUserId = req.user && req.user.userId;

            // Admin-level roles can access any resource (but their actions are still logged)
            const adminRoles = ['admin', 'registrar', 'dean', 'finance', 'deputy', 'cibec', 'ilo'];
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

            if (String(requestedUserId) !== String(authenticatedUserId)) {
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
    signToken,
    // Backward-compatible aliases
    authenticateToken: verifyToken,
    requireAuth: verifyToken
};
