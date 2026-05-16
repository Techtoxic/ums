# Security Fixes Applied

This document lists every change made to the original codebase as part of the security review and the reasoning behind each. Read this before deploying.

## Before you run

You must do these two things or the server will refuse to start (in production) or behave strangely (in development):

1. **Install the new dependencies.** Three new packages are required: `helmet`, `express-mongo-sanitize`, `express-rate-limit`. Run:
   ```
   npm install
   ```

2. **Set the new environment variables in your `.env` file.** Copy from `env.example` and fill in real values. The two new mandatory ones are:
   - `JWT_SECRET` - a long random string, 32+ characters. Generate one with:
     ```
     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
     ```
   - `SESSION_SECRET` - same idea, generate the same way.
   The server will refuse to boot in production without these.

   Optional but recommended:
   - `ALLOWED_ORIGINS` - comma-separated list of domains that may call your API in production. Without this, CORS will reject all cross-origin requests when `NODE_ENV=production`.
   - `INITIAL_ADMIN_PASSWORD` - the password used for the six default staff accounts when the database is empty. Must meet complexity (12+ chars, upper + lower + digit + special character). If not set, a strong random password is generated and printed to the server log ONCE on first boot - capture it from the log immediately and log in to rotate it.

3. **Capture the initial admin password.** When the server starts against an empty database it will print the seeded password between two long rows of `=` characters. Save this value, log in as each role, change the email and password, and then this value can be discarded.

## Files deleted

- `src/admin-login.OLD.html` - legacy admin login page that was publicly fetchable via the static directory leak.
- `src/components/trainer/trainers.txt` - plaintext list of real staff names by department. PII leak via the same path.
- `src/components/units/INSTRUCTIONS.TXT` - internal development handover document. Was publicly fetchable.

## What changed and why

### 1. Static directory lockdown (server.js)

The original code did `app.use(express.static(__dirname + '/src'))` which served the entire `src/` tree including `config/`, `middleware/`, `routes/`, `models/`, and `utils/`. Anyone could fetch `/middleware/auth.js`, `/config/config.js`, or `/models/AdminStaff.js` directly from the browser and read your server-side code, schemas, and any config that contained secrets.

Two changes:
- Static serving is now restricted to `/src/components` only, since that is the only subdirectory the frontend actually needs.
- A new middleware actively blocks any request whose URL begins with a server-side path (`/middleware/`, `/routes/`, `/config/`, `/models/`, `/utils/`, `/data/`, etc) or ends in dangerous suffixes (`.OLD.html`, `.bak`, `.env`, `trainers.txt`, `INSTRUCTIONS.TXT`). This is defense in depth, so future regressions don't silently re-expose source files.

### 2. JWT_SECRET hardcoded fallback removed (config/config.js, middleware/auth.js, routes/adminAuth.js)

The original code in three places used `process.env.JWT_SECRET || 'your-secret-key-change-in-production'` (or a similar default). If `JWT_SECRET` was not set in the environment, the server happily started with the hardcoded fallback that anyone reading the public GitHub repo could see, and use to forge valid tokens.

`config.js` now:
- Validates JWT_SECRET and SESSION_SECRET at startup
- In production, refuses to start if either is missing or too weak
- In development, prints a loud warning and uses a per-process random fallback so it cannot be relied on

`middleware/auth.js` and `routes/adminAuth.js` now both pull the secret from `config.jwt.secret` rather than re-implementing the fallback.

### 3. JWT issuance for student, HOD, and trainer login (server.js)

The original code only signed JWTs in admin staff login. Student, HOD, and trainer login returned user data with no token. Then many API endpoints required a token via `verifyToken` middleware, which meant either those endpoints were unreachable for non-admin users, or the system worked around it by leaving endpoints unauthenticated (see fix 4 below).

The student, HOD, and trainer login endpoints now:
- Issue a JWT via the shared `signToken()` helper in `middleware/auth.js`
- Return a consistent response shape: `{ token, user }`
- Use a single generic error message (`Invalid X or password`) for both "no such user" and "wrong password" to prevent user enumeration

The three corresponding login HTML pages (`src/login.html`, `src/components/hod/HODLogin.html`, `src/components/trainer/TrainerLogin.html`) were updated to store the JWT in localStorage/sessionStorage so subsequent API calls can include it as a Bearer token.

### 4. Unauthenticated endpoints closed

Roughly 30 API endpoints had no auth at all, allowing anyone on the internet to read or modify data including: change any student's email, register units for any student, submit graduation applications, upload files claiming to be from any student, download student uploaded files, read all student records, write dean's notes, and more.

Every state-changing API endpoint now requires `verifyToken` plus an appropriate `authorize(...)` role check, and per-user resources additionally use `verifyOwnership(...)` so students cannot read each other's data.

The complete list of endpoints that gained authentication:

| Endpoint | Allowed roles |
|---|---|
| `PUT /api/students/:studentId/email` | admin, registrar, student (owner) |
| `POST /api/students/register-units` | admin, registrar, student |
| `POST /api/students/:studentId/graduation-application` | admin, registrar, student (owner) |
| `POST /api/students/:studentId/attachment-application` | admin, registrar, student (owner) |
| `POST /api/student-uploads` | admin, registrar, student, trainer |
| `GET /api/student-uploads/:studentId` | admin, registrar, student (owner), trainer, cibec |
| `GET /api/student-uploads/:studentId/unit/:unitId` | same |
| `GET /api/student-uploads/:uploadId/download` | admin, registrar, student, trainer, cibec |
| `DELETE /api/student-uploads/:uploadId` | admin, registrar, student, cibec |
| `GET /api/trainers/:trainerId/assignments` | admin, hod, registrar, trainer (owner) |
| `PUT /api/trainers/:trainerId/profile` | admin, trainer (owner) |
| `GET /api/trainers/:trainerId/students` | admin, hod, registrar, trainer (owner) |
| `GET /api/trainers/:trainerId/payslips` | admin, finance, trainer (owner) |
| `GET /api/diagnostics/unassigned-units` | admin, registrar |
| `GET /api/students/latest-admission/:courseCode` | admin, registrar |
| `GET /api/system-settings/:key` | admin, registrar, finance, dean, deputy, cibec, ilo |
| `POST /api/tools/upload` | admin, trainer, hod |
| `GET /api/tools/trainer/:trainerId` | admin, trainer (owner), hod |
| `GET /api/tools` | admin, trainer, hod, registrar |
| `GET /api/tools/:toolId/download` | admin, trainer, hod |
| `DELETE /api/tools/:toolId` | admin, trainer, hod |
| `GET /api/notifications` | admin and most staff roles |
| `GET /api/notifications/:userId` | self + admin/staff |
| `POST /api/notifications` | admin and most staff roles |
| `POST /api/notifications/broadcast` | admin, registrar, deputy |
| `GET /api/ilo/graduation-applications` | admin, ilo, registrar |
| `GET /api/ilo/attachment-applications` | admin, ilo, registrar |
| `GET /api/cibec/uploads` | admin, cibec, registrar |
| `GET /api/cibec/statistics` | admin, cibec, registrar, dean |
| `GET /api/cibec/student/:studentId/uploads` | admin, cibec, registrar |
| `GET /api/cibec/audit-logs` | admin, cibec |
| `GET /api/dean/students` | admin, dean, registrar |
| `POST /api/dean/students/:studentId/notes` | admin, dean |
| `GET /api/dean/students/:studentId/notes` | admin, dean, registrar |
| `PUT /api/students/:studentId/notes/:noteId/read` | admin, dean, student (owner) |
| `POST /api/payslips/generate` | admin, finance |
| `PUT /api/payslips/:payslipId/view` | admin, finance, trainer |

### 5. Security middleware stack added (server.js)

Three new pieces of middleware now run on every request:

- **helmet** sets baseline security headers (HSTS in production over HTTPS, no-sniff, frame-options, etc).
- **express-mongo-sanitize** strips MongoDB operator characters (`$`, `.`) from `req.body`, `req.query`, and `req.params` so an attacker cannot send `{"$ne": null}` as a password.
- **express-rate-limit** runs at two levels: 300 req/15min/IP across all `/api/*` (general), and a stricter 20 req/15min/IP on every login, OTP, and password-reset endpoint (`authLimiter`).

The in-memory rate limiter in `middleware/auth.js` was removed. It never worked on serverless (state was lost on every cold start) and could be bypassed because `trust proxy` was not set.

`app.set('trust proxy', 1)` is now called so `req.ip` reflects the real client IP when behind Vercel/Render/Cloudflare instead of the proxy's IP.

### 6. CORS locked down (server.js)

The original `app.use(cors())` allowed any origin. The new config:
- In development: allows any origin (so localhost workflows still work)
- In production: only allows origins listed in `ALLOWED_ORIGINS` env var
- Logs a warning at startup if production is set but `ALLOWED_ORIGINS` is empty

### 7. Body size limit (server.js)

`app.use(express.json())` now has an explicit `{ limit: '1mb' }` to prevent memory exhaustion via huge payloads. Same for `express.urlencoded`.

### 8. Logging cleanup (server.js, routes/adminAuth.js)

Removed every `console.log` that printed sensitive data, including:
- Student login plain-text password and stored phone number
- Admin OTP codes on send
- Full `req.headers` (which on authenticated requests leaked Bearer tokens)
- Full `req.body` on the forgot-password endpoint
- Full HOD login response (which included name, email, phone)
- Multiple `🔍 Validating token: xxx...` log lines that printed token prefixes

The remaining request logger now prints only method, path, status, and duration. It never touches headers or body.

### 9. Student initial password and error messages (server.js)

- The student login error response no longer says `Use your phone number as password.` That message announced the format to attackers.
- The error message for "no such admission number" and "wrong password" was unified to `Invalid admission number or password` to prevent user enumeration.
- The multi-format password-try loop (5 different formats, each one a brute-force hint) was replaced with a single canonical normalisation.

Note: the student initial password is still the phone number. Changing the initial-password scheme is a separate piece of work since it requires emailing students new credentials and updating the admission letter flow. Until that change ships, the recommendation is to make `phoneNumber` non-discoverable and to encourage students to change their password on first login.

### 10. Password reset complexity (server.js)

The password reset endpoint previously allowed any 6+ character password. It now enforces the same rule as the admin password change endpoint: 8+ characters with uppercase, lowercase, digit, and special character. The two paths now share one rule.

### 11. Default seeded staff passwords (server.js, env.example)

The original code seeded six privileged accounts (admin, deputy, finance, dean, ilo, registrar) all with the public hardcoded password `Admin@2024`. Anyone reading the GitHub repo knew the password for every staff role on every fresh deployment.

The new `initializeAdminStaff()` reads `INITIAL_ADMIN_PASSWORD` from env. If not set, it generates a strong random password and prints it ONCE to the server log between two `===` rows so the operator can capture it. The seeded accounts still have `mustUpdateEmail` and `mustUpdatePassword` set, so the first login forces both to change.

### 12. TLS certificate validation re-enabled (utils/emailService.js)

The email transporter had `tls: { rejectUnauthorized: false }`, which disabled certificate validation on outgoing SMTP. Removed.

### 13. Duplicate `dotenv.config()` removed (server.js)

The original called `require('dotenv').config()` twice (line 3 and again around line 1489). The second call was removed. The accompanying nodemailer `debug: true` and `logger: true` flags on the secondary transporter were also removed since they printed SMTP traffic.

## What still needs work

These were out of scope for this fix because they require significant rewrites:

1. **5,966-line server.js.** The file is hard to review and easy to break. Routes should be split into modules under `src/routes/` following the pattern already established for `adminAuth.js`. This is necessary before the code can be tested or reviewed cleanly.

2. **Client-side PDF generation.** Admission letters and any transcripts are generated in the browser via html2pdf.js, which means they have no integrity. An employer cannot verify them. Move to server-side generation (Puppeteer or pdfkit) and embed a verification code or QR code linking to a self-hosted verification page.

3. **Stale JWT claims.** The token encodes `isFirstLogin` at sign time. After a user completes setup, old tokens still claim `isFirstLogin: true`. Either remove non-essential claims from the JWT and look them up from the database on each request, or invalidate tokens when these flags change.

4. **Audit log coverage.** `AuditLog` is currently only written on student file uploads, and it sources the user ID from the request body rather than from the verified JWT. Expand coverage to grade changes, fee adjustments, email changes, password changes, and account creation/deletion, and always use `req.user.userId` as the actor.

5. **Student initial password.** Phone number is too predictable. Generate a random password on registration, email it to the student, and force a change on first login.

6. **Frontend coverage.** Several HTML/JS files (the registrar dashboard, finance dashboard, HOD dashboard, etc.) make API calls that may not yet send the Bearer token. The `public/js/auth.js` utility is already in place. Verify each dashboard either uses `window.AUTH.fetch()` or manually attaches the Authorization header on every call.

7. **Tests.** No automated tests exist. Before any further changes, add at least integration tests for the auth and ownership middleware so regressions get caught.
