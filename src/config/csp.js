// Content Security Policy configuration (SEV-M-025 / SEV-H-010 defense-in-depth).
//
// Stage 2B-2B ships this in REPORT-ONLY mode by default: the browser reports
// violations to /api/csp-report but does NOT block anything. Flip to enforcing
// ONLY via the env var CSP_ENFORCE=true (default false). Never default to true.
//
// Tightening without redeploy: each directive can be extended via an env var
//   CSP_<DIRECTIVE>_EXTRA="https://a.example https://b.example"
// e.g. CSP_SCRIPT_SRC_EXTRA, CSP_CONNECT_SRC_EXTRA. The value is appended
// (space-separated) to that directive's source list.

'use strict';

const REPORT_PATH = '/api/csp-report';

// Baseline directives. Source lists were derived by grepping every frontend
// HTML file for external https script/style/font/img origins actually used
// (see STAGE2B2B_REPORT.md §2).
const BASE_DIRECTIVES = {
    'default-src': ["'self'"],

    // 'unsafe-inline': inline <script> blocks + on*="" handlers across every
    //   dashboard (Report-Only inventories these for later nonce migration).
    // 'unsafe-eval': the Tailwind Play CDN (cdn.tailwindcss.com) JITs styles
    //   via eval/new Function at runtime; required until Tailwind is compiled.
    'script-src': [
        "'self'", "'unsafe-inline'", "'unsafe-eval'",
        'https://cdn.jsdelivr.net',
        'https://cdnjs.cloudflare.com',
        'https://cdn.tailwindcss.com',
        'https://unpkg.com'
    ],

    // 'unsafe-inline' for styles is accepted this pass: Tailwind utility
    // classes + pervasive inline style attributes. Nonce migration for styles
    // is a much larger frontend change, deliberately deferred.
    'style-src': [
        "'self'", "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
        'https://cdnjs.cloudflare.com',
        'https://fonts.googleapis.com'
    ],

    // https: blanket-allowed: profile pictures / uploaded content come from S3
    // via rotating presigned URLs; data: for inline icons.
    'img-src': ["'self'", 'data:', 'https:'],

    // fonts.gstatic.com: Google Fonts CSS (fonts.googleapis.com) pulls the
    // actual font files from fonts.gstatic.com.
    'font-src': [
        "'self'",
        'https://cdnjs.cloudflare.com',
        'https://cdn.jsdelivr.net',
        'https://fonts.gstatic.com',
        'data:'
    ],

    // Frontend only calls its own origin for API requests.
    'connect-src': ["'self'"],

    // The in-app book reader embeds the Internet Archive BookReader and external
    // textbook PDFs (OpenStax) in an iframe; blob: covers client-generated PDF
    // previews. Everything else is blocked.
    'frame-src': [
        "'self'", 'blob:',
        'https://archive.org', 'https://*.archive.org',
        'https://openstax.org', 'https://assets.openstax.org'
    ],
    // No external site may frame US (clickjacking protection), matches helmet's
    // X-Frame-Options.
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"]
};

function envExtra(directive) {
    // 'script-src' -> CSP_SCRIPT_SRC_EXTRA
    const key = 'CSP_' + directive.toUpperCase().replace(/-/g, '_') + '_EXTRA';
    const v = process.env[key];
    if (!v) return [];
    return v.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

function isEnforce() {
    const flag = String(process.env.CSP_ENFORCE).toLowerCase();
    if (flag === 'true') return true;
    if (flag === 'false') return false;            // explicit opt-out (e.g. to debug)
    // Default: ENFORCE in production, Report-Only elsewhere. Any host missed by
    // the policy can be allowed without a redeploy via CSP_<DIRECTIVE>_EXTRA.
    return String(process.env.NODE_ENV).toLowerCase() === 'production';
}

function headerName() {
    return isEnforce() ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
}

// Build the policy string. `isProduction` adds upgrade-insecure-requests.
function buildCspString(isProduction) {
    const parts = [];
    for (const [directive, sources] of Object.entries(BASE_DIRECTIVES)) {
        const all = sources.concat(envExtra(directive));
        parts.push(`${directive} ${all.join(' ')}`);
    }
    if (isProduction) {
        parts.push('upgrade-insecure-requests');
    }
    // Legacy (report-uri) + modern Reporting API (report-to group "default").
    parts.push(`report-uri ${REPORT_PATH}`);
    parts.push('report-to default');
    return parts.join('; ');
}

// Value for the Report-To header (Reporting API) defining the "default" group.
function reportToHeaderValue() {
    return JSON.stringify({
        group: 'default',
        max_age: 10886400,
        endpoints: [{ url: REPORT_PATH }]
    });
}

module.exports = {
    REPORT_PATH,
    BASE_DIRECTIVES,
    isEnforce,
    headerName,
    buildCspString,
    reportToHeaderValue
};
