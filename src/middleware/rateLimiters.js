const rateLimit = require('express-rate-limit');

// Small helper: read a positive integer from env, else fall back to a default.
function intFromEnv(name, fallback) {
    const n = parseInt(process.env[name], 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

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

// General API limiter — applies to all /api/*. Production note: the institution
// (and many users) share a single public egress IP (campus NAT), and each portal
// page fans out to several API calls. Set generously so legitimate shared-IP
// traffic is never throttled; this exists only to cap abusive floods. Tune via
// RATE_LIMIT_MAX without a code change.
const generalApiLimiter = rateLimit({
    windowMs: intFromEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 minutes
    max: intFromEnv('RATE_LIMIT_MAX', 600),                       // 600 req / IP / window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

// Brute-force limiter for authentication endpoints (login, OTP, password reset).
// skipSuccessfulRequests:true means ONLY failed attempts (HTTP >= 400) count
// toward the limit. This throttles credential-guessing while NOT penalising a
// classroom of students legitimately logging in from one shared campus IP.
// Tune via AUTH_RATE_LIMIT_MAX.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: intFromEnv('AUTH_RATE_LIMIT_MAX', 30), // 30 FAILED attempts / IP / window
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' }
});

module.exports = { cspReportLimiter, generalApiLimiter, authLimiter };
