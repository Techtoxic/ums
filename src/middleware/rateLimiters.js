const rateLimit = require('express-rate-limit');

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
    max: 100,                          // TEMP: raised from 20 for demo. Revert after.
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' }
});

module.exports = { cspReportLimiter, generalApiLimiter, authLimiter };
