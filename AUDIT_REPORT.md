# UMS Audit Report
Date: 2026-05-16
Auditor: Claude Code
Scope: full codebase, security and code quality

## Executive summary

The University Management System is functionally broad but its security posture is **poor and not safe for production in its current state**. The application mixes a 6,062-line monolithic `server.js`, a separate admin-auth router, 20 Mongoose models, and ~12,000 lines of vanilla frontend JavaScript. The most serious problems are systemic: at least five state-changing API endpoints are completely unauthenticated (including ones that rewrite student records, fee balances, tool approvals and graduation outcomes); the entire repository root is exposed as static content (so a 2 MB diff file containing default credentials and the full source is publicly downloadable); trainer passwords are stored in plain text; default passwords (`Admin@2024`, `HOD`, `trainer123`) are hardcoded in model files and can be persisted unhashed; and the admin OTP second factor can be brute-forced because failed attempts are never counted. A documented central permission model (`endpointSecurity.js`) is dead code and enforces nothing. Authorization is applied ad hoc per route and is missing or broken on many object-level endpoints, enabling student-to-student and trainer-to-trainer data access. Defense-in-depth is largely absent: CSP is disabled, tokens live in `localStorage`, API response data is rendered via `innerHTML` without escaping, money and grades use floating-point arithmetic, and audit-log actors are taken from client-controlled input.

Findings by severity: **Critical: 5**, **High: 14**, **Medium: 15**, **Low: 13**, **Informational: 7**. Total: **54**.

This report is read-only analysis. No source files were modified, the application was not run, and `npm audit` was not executed (the operator must run it for CVE data — see Dependency inventory).

---

## Findings by severity

> Findings are numbered sequentially across the whole report and ordered by severity, then category, then file path. Where the same class of issue occurs in many places it is reported once with a location table. Line numbers were taken from the working tree at audit time; large files shift, so treat them as anchors.

---

### [SEV-C-001] Admin OTP second factor can be brute-forced (failed attempts never counted)
**Severity**: Critical
**Category**: Auth
**Location**: `src/routes/adminAuth.js:276-294`; `src/models/LoginOTP.js:80-104,120-122`
**Description**: `verify-otp` looks up the OTP with `LoginOTP.findValidOTP({ email, otp })`, which matches on the OTP value itself. A wrong OTP simply returns `null`, and the handler responds "Invalid or expired OTP" without ever calling `incrementAttempts()`. The 5-attempt cap (`canAttempt()`) is only reached when a *correct* OTP is found, so it never throttles guessing. The OTP is also a 6-digit value generated with `Math.random()` (`LoginOTP.js:121`), and there is no per-IP rate limiter on the admin auth router.
```js
const loginOTP = await LoginOTP.findValidOTP({ email, otp }); // wrong OTP -> null
if (!loginOTP) {
    return res.status(400).json({ success:false, message:'Invalid or expired OTP' });
    // incrementAttempts() never called; canAttempt() never reached
}
```
**Attack scenario or consequence**: An attacker who knows a staff email can submit unlimited OTP guesses during the 10-minute validity window and brute-force the ~900,000-value space, fully bypassing the admin multi-factor login and taking over privileged accounts (admin, finance, registrar).
**Recommendation**: Look up the OTP by email only, atomically increment an attempt counter on every wrong guess, lock/invalidate after the cap, and apply a strict per-IP rate limiter to all admin auth endpoints.

### [SEV-C-002] Unauthenticated state-changing API endpoints
**Severity**: Critical
**Category**: Authorization
**Location**: `server.js` (see table)
**Description**: Several routes that mutate academic, financial and workflow data have **no `verifyToken`, no `authorize`, and no ownership check**. Confirmed by direct read: the handlers are declared `app.patch('<path>', async (req,res) => {…})` with no middleware, in contrast to neighbouring routes that do apply `verifyToken`.

| Method | Path | Line | Consequence |
|---|---|---|---|
| PATCH | `/api/students/:id` | 3357 | Anyone can rewrite any student record (name, course, year, `idNumber`, `phoneNumber`) and trigger the year-promotion balance write — arbitrary fee manipulation. |
| PATCH | `/api/tools/:toolId/status` | 4464 | Anyone can approve/reject any trainer tools-of-trade submission; `reviewedBy` hardcoded to `'deputy_academics'`. |
| PATCH | `/api/ilo/applications/:type/:applicationId/status` | 5073 | Anyone can approve/reject any graduation or attachment application; `reviewedBy` hardcoded to `'ilo_office'`. |
| PATCH | `/api/notifications/:notificationId/read` | 4636 | Anyone can mark any user's notification read (suppress payment/outcome alerts). |
| PATCH | `/api/notifications/:userId/read-all` | 4660 | Same, bulk. |
```js
// server.js:3346 has auth ...
app.get('/api/students', verifyToken, authorize('admin','registrar','dean','finance'), …)
// server.js:3357 does NOT:
app.patch('/api/students/:id', async (req, res) => { … Student.findByIdAndUpdate(id, req.body) … })
```
**Attack scenario or consequence**: An unauthenticated attacker can take over or corrupt any student record, zero or inflate fee balances, graduate students, and forge academic approvals — with no credentials and forged audit attribution.
**Recommendation**: Apply `verifyToken` + role `authorize(...)` (+ ownership where a user identifier is in the path) to every state-changing route. Treat "no middleware" as a build-failing condition; source `reviewedBy` from `req.user`.

### [SEV-C-003] Entire repository root served as static content; credentials and full source publicly downloadable
**Severity**: Critical
**Category**: Configuration
**Location**: `server.js:5227`; blocklist `server.js:391-425`; `temp_diff.txt` (repo root, ~2 MB)
**Description**: `app.use(express.static('.'))` serves the whole project root. The blocklist middleware only rejects specific source prefixes and a fixed suffix list (`.env`, `server.js`, `package.json`, `vercel.json`, `.old.html`, `.bak`, `trainers.txt`, `instructions.txt`). It does **not** cover `temp_diff.txt`, `README.md`, `CHANGES.md`, `env.example`, `.npmrc`, or `debug.html`, so `GET /temp_diff.txt` is served. That file is a 2 MB unified diff containing the `Admin@2024` default password (20+ times), the placeholder JWT secret `your-secret-key-change-in-production`, a sample Mongo Atlas URI, and the complete pre-fix `server.js`.
```js
// server.js:5227
app.use(express.static('.'));
// blocklist (391-425) has no entry matching temp_diff.txt / README.md / CHANGES.md
```
**Attack scenario or consequence**: Any anonymous visitor can download `temp_diff.txt`, `CHANGES.md` and `README.md` to obtain default privileged credentials, the documented student credential scheme, the weak JWT fallback, and a full annotated copy of the source including every previously-open endpoint.
**Recommendation**: Remove `express.static('.')`; serve only explicit asset subdirectories. Delete `temp_diff.txt` and purge it from git history; add it to `.gitignore`. Use an allowlist, not a blocklist, for static exposure.

### [SEV-C-004] Default passwords hardcoded in user models and may be stored unhashed
**Severity**: Critical
**Category**: Crypto
**Location**: `src/models/AdminStaff.js:35-42,113-130`; `src/models/HOD.js:24-28,51-62`; `src/models/Trainer.js:17-21`
**Description**: `AdminStaff` defines a `password` schema `default` returning `'Admin@2024'`; `HOD` defaults to `'HOD'`; `Trainer` defaults to `'trainer123'`. Mongoose does not mark schema defaults as modified, so the `pre('save')` hook's `if (!this.isModified('password')) return next()` guard skips hashing for any document created without an explicitly-set password — persisting the default in plain text. The values are also public in source and in `temp_diff.txt`/`CHANGES.md`.
```js
// AdminStaff.js:38-41
default: function () { /* Default password is 'Admin@2024' for all roles */ return 'Admin@2024'; }
// HOD.js:24-28  -> default: 'HOD'      Trainer.js:17-21 -> default: 'trainer123'
// HOD.js:51 pre-save: if (!this.isModified('password')) return next(); // skipped for defaults
```
**Attack scenario or consequence**: Any account created via a path that does not explicitly set a password (tests, migrations, future seeders) stores a publicly-known password unhashed; an attacker reading the DB or guessing `Admin@2024`/`HOD`/`trainer123` gains privileged access. HOD's `'HOD'` is a 3-character credential.
**Recommendation**: Remove the `default` from all password fields; require an explicit password and fail loudly if absent; force a password change on first login for every privileged role.

### [SEV-C-005] Trainer passwords stored and compared in plain text
**Severity**: Critical
**Category**: Crypto
**Location**: `src/models/Trainer.js:17-21,57-73`
**Description**: The `Trainer` schema stores passwords in plain text. The pre-save hook only updates `updatedAt`; `comparePassword` performs a direct string equality check. A code comment states "Password is stored as plain text as per requirements."
```js
// Trainer.js:57-70
// Note: Password is stored as plain text as per requirements
trainerSchema.methods.comparePassword = async function (candidate) {
    return this.password === candidate; // no hashing anywhere
};
```
**Attack scenario or consequence**: Any database read (injection, insider, backup leak, compromised credentials) exposes every trainer's cleartext password; reused passwords compromise other systems. Trainer accounts can mutate tools-of-trade and student-facing data.
**Recommendation**: Hash all trainer passwords with bcrypt (cost ≥ 12) like `AdminStaff`. There is no legitimate requirement for plaintext password storage; reject that "requirement."

---

### [SEV-H-006] Broken object-level authorization: ownership cannot be enforced on student routes
**Severity**: High
**Category**: Authorization
**Location**: `src/middleware/auth.js:54-59,116-155`; `server.js:3527-3532`
**Description**: `verifyToken` builds `req.user` from only `{userId,email,role,userType}` — it discards the `admissionNumber` claim that student logins embed in the JWT. `verifyOwnership` then compares `req.params` against `req.user.admissionNumber`, which is always `undefined`, so its admission-number branch is dead. Student-ownership routes key on `admissionNumber` while the token's `userId` is the Mongo `_id`, so the check cannot succeed legitimately. The admin-bypass list is also over-broad (`admin, registrar, dean, finance, deputy, cibec, ilo` all bypass ownership entirely).
```js
// auth.js:138-140 — second clause always false
const isOwner = String(requestedUserId) === String(authenticatedUserId) ||
    (req.user && req.user.admissionNumber && String(requestedUserId) === String(req.user.admissionNumber));
```
**Attack scenario or consequence**: Ownership enforcement on admission-number-keyed routes is non-functional (either blocking legitimate owners or, where developers "fixed" it by widening role lists, exposing every student's data to every student). Finance/ILO/dean/deputy can read any student's full record regardless of need.
**Recommendation**: Copy `admissionNumber` into `req.user` in `verifyToken`, or use Mongo `_id` consistently as the URL identifier. Reduce the ownership-bypass list to `['admin','registrar']` and scope other roles explicitly.

### [SEV-H-007] Insecure Direct Object References across student/trainer/upload endpoints
**Severity**: High
**Category**: Authorization
**Location**: `server.js` (see table)
**Description**: Multiple authenticated routes accept a user/student/trainer identifier from the URL or body and never verify it against the caller.

| Endpoint | Line | Problem |
|---|---|---|
| GET `/api/students/admission/:admissionNumber` | 3264 | `student` role allowed, no ownership — any student reads any student's full PII |
| POST `/api/students/register-units` | 3898 | `studentId` from `req.body`, not checked vs caller — register units for others |
| DELETE `/api/student-uploads/:uploadId` | 5545 | Ownership compared to `req.query.studentId` (client-supplied) |
| GET `/api/student-uploads/:uploadId/download` | 5503 | No ownership on the upload — any allowed role downloads any file |
| POST `/api/tools/upload` | 4293 | `trainerId` from body, not verified — upload as another trainer |
| GET `/api/common-unit-assignments/trainer/:trainerId` | 2319 | No ownership — trainer reads another trainer's data |
| PUT `/api/payslips/:payslipId/view` | 6019 | No ownership — mark any payslip viewed |
**Attack scenario or consequence**: A student with a valid token can read any other student's fee balance, ID number and phone, register their units, and delete their uploads; a trainer can act as another trainer.
**Recommendation**: Add `verifyOwnership` (fixed per SEV-H-006) to every parameterised personal route; for body/query identifiers, compare against `req.user` server-side and reject mismatches.

### [SEV-H-008] Audit-log and record actor sourced from client-controlled input
**Severity**: High
**Category**: Authorization
**Location**: `server.js:5405-5420,5469-5476,5517-5527,5569-5580,5618-5624,5706-5717,5801-5851`; client `src/components/cibec/cibecDashboard.js:43`, `src/components/finance/financeDashboard.js:1351-1356`
**Description**: `AuditLog.logAction()` calls take `userId`/`userType` from `req.query`/`req.body` (e.g. `userId: req.query.cibecUserId || 'cibec'`). `reviewedBy` (tools, ILO) and `createdBy` (dean notes) are hardcoded constants or `req.body`. The CIBEC/finance dashboards send hardcoded actor strings (`'cibec_admin'`, `'finance_admin'`).
```js
// server.js:5618-5620
await AuditLog.logAction({ userId: req.query.cibecUserId || 'cibec', userType: 'cibec', … });
```
**Attack scenario or consequence**: Any caller can attribute their actions to another identity (or an anonymous constant), destroying forensic accountability for grade/fee/file actions and letting an attacker frame other users.
**Recommendation**: Source actor identity exclusively from the verified `req.user`; never accept actor fields from request body/query or hardcode them client-side.

### [SEV-H-009] No server-side authentication on dashboard pages (client-side gate only)
**Severity**: High
**Category**: Authorization
**Location**: `server.js:915-949,5151-5205`; dashboards under `src/components/*`
**Description**: Every role dashboard (`/admin/dashboard`, `/hod/dashboard`, `/finance/dashboard`, `/registrar/dashboard`, `/dean/dashboard`, `/deputy/dashboard`, `/ilo/dashboard`, `/cibec/dashboard`, `/student/portal`, `/trainer/dashboard`) is served with no auth middleware; protection is a client-side `localStorage` token check that redirects. Several dashboards (Registrar, Deputy, ILO, Dean `loadStudents`) also call `/api/*` with no `Authorization` header at all.
```js
// server.js:915
app.get('/admin/dashboard', (req, res) => { serveHTML(res, …adminDashboard.html); }); // no verifyToken
```
**Attack scenario or consequence**: Dashboard markup and embedded client logic are served to anyone; combined with the unauthenticated APIs (SEV-C-002) and header-less calls, sensitive data and admin UI are reachable without logging in.
**Recommendation**: Gate dashboard routes with server-side session/Bearer verification; route every frontend API call through an auth wrapper that always attaches the token.

### [SEV-H-010] Tokens in localStorage + disabled CSP + unescaped innerHTML = stored XSS to account takeover
**Severity**: High
**Category**: Frontend
**Location**: `server.js:294-297` (helmet CSP off); `public/js/auth.js:18-21`; many dashboards (see table)
**Description**: JWTs and user objects are stored in `localStorage`, Helmet's `contentSecurityPolicy` is set to `false`, and API response fields (student names, notes, counties, filenames) are interpolated into `innerHTML`/`document.write` without escaping in most dashboards (`escapeHtml` exists only in `trainerDashboard.js`/`hodDashboard.js`).

| File | Lines | Tainted data into sink |
|---|---|---|
| `src/components/dean/deanDashboard.js` | 150-188, 309-349 | student PII, note title/content |
| `src/components/admin/adminDashboard.js` | 722-798, 830-851 | student/trainer fields |
| `src/components/ilo/iloDashboard.js` | 239-316, 360-386, 456-553 | application fields incl. `document.write` |
| `src/components/finance/financeDashboard.js` | 288-321, 409-449 | student/payment fields |
| `src/components/student/studentPortal.js` | 450-470, 1474-1556 | payment/note fields |
| `src/components/cibec/cibecDashboard.js` | 232-280 | upload/student fields |
```js
// deanDashboard.js:343
<p class="text-sm text-gray-700 mb-2">${note.content}</p> // note.content unescaped
```
**Attack scenario or consequence**: A crafted value stored via a registration/note/upload field executes JavaScript in a staff browser, exfiltrating the `localStorage` token (no CSP to stop it) and enabling full account takeover.
**Recommendation**: Escape/encode all server data before DOM insertion (or use `textContent`/DOMPurify); enable a strict CSP; move tokens to `HttpOnly`, `Secure`, `SameSite` cookies.

### [SEV-H-011] Client-controlled file type and unsanitized filenames/keys in uploads
**Severity**: High
**Category**: File upload
**Location**: `server.js:196-213,5235-5453`; `src/utils/s3Service.js:31,37,69`
**Description**: Multer's `fileFilter` accepts based solely on the client-supplied `file.mimetype` (no magic-byte inspection) and allows large binary/video types. `req.file.originalname` is concatenated into the storage filename/S3 key without `path.basename()` or character sanitization; `s3Service` builds `${folder}/${fileName}` with no traversal stripping, stores the client `ContentType`, and caps no presigned-URL expiry.
```js
// server.js fileFilter: if (allowedTypes.includes(file.mimetype)) cb(null,true) // no content check
// s3Service.js:31  const key = folder ? `${folder}/${fileName}` : fileName; // unsanitized
```
**Attack scenario or consequence**: An attacker uploads an HTML/SVG/script payload with a spoofed MIME type; served from `/uploads` or a presigned S3 URL with attacker-controlled `Content-Type` it executes in the browser (stored XSS on a trusted origin). Crafted filenames can traverse paths (local mode) or overwrite sibling S3 prefixes.
**Recommendation**: Validate content by magic bytes against a strict allowlist; generate server-side UUID filenames; sanitize/normalize keys; force `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`; cap presigned URL lifetime.

### [SEV-H-012] Uploaded files served without authentication
**Severity**: High
**Category**: File upload
**Location**: `server.js:459`
**Description**: `app.use('/uploads', express.static('uploads'))` exposes the local upload directory with no auth. When S3 is not configured, all uploaded student photos, KCSE results, ID scans and trainer assessment files are publicly downloadable by URL.
```js
app.use('/uploads', express.static('uploads'));
```
**Attack scenario or consequence**: Anyone who guesses or discovers an upload path retrieves sensitive academic and identity documents — a mass PII exposure.
**Recommendation**: Serve uploads only through an authenticated, ownership-checked endpoint regardless of storage backend; never static-serve the upload directory.

### [SEV-H-013] No token invalidation on password/email/role change, deactivation, or logout
**Severity**: High
**Category**: Auth
**Location**: `src/middleware/auth.js:41-82`; `src/routes/adminAuth.js:357-420,425-528,619-657`; `src/config/config.js:43`
**Description**: JWTs are stateless with a 24-hour expiry, no `jti`/version claim, and no blocklist. `verifyToken` never checks an `isActive` flag or `passwordChangedAt`. Password/email changes call `save()` but issue no revocation; `refresh-token` does not re-validate password-change state; mutable flags like `isFirstLogin` are trusted from the token.
**Attack scenario or consequence**: A stolen token (or a deactivated/compromised account's token) remains fully valid for up to 24 hours after a password reset or deactivation — the standard "reset my password" remediation does not log attackers out.
**Recommendation**: Add a `tokenVersion`/`passwordChangedAt` check, shorten access-token lifetime with refresh rotation, and check `isActive` per request.

### [SEV-H-014] Student credential is the student's phone number
**Severity**: High
**Category**: Auth
**Location**: `server.js:1937,3506-3521`; `src/components/registrar/AdmissionLetter.html:226,288`; `README.md:134-138`
**Description**: At registration the student password is set to the registered phone number; login normalizes and compares it. The admission letter prints "Initial Password: <phone number>", and the README documents the scheme publicly. There is no forced change on first login.
```js
// server.js:1937
password: formattedPhone, // phone number used as the credential
```
**Attack scenario or consequence**: Phone numbers are not secret (directories, social media, peers). Anyone who knows a student's admission and phone number logs into that student's portal; the small Kenyan-mobile number space is enumerable.
**Recommendation**: Issue a random one-time initial password delivered out-of-band, force change on first login, and remove the scheme from the admission letter and README.

### [SEV-H-015] Initial admin password written to logs in plaintext
**Severity**: High
**Category**: Logging
**Location**: `server.js:1525`
**Description**: On first boot against an empty DB, `initializeAdminStaff()` prints the generated initial password to stdout.
```js
console.log(`GENERATED initial password (visible ONCE): ${initialPassword}`);
```
**Attack scenario or consequence**: Cloud platforms (Vercel/Render/Heroku) persist and often forward stdout to log aggregators; anyone with log access — long after rotation — recovers a password that works across all six seeded privileged roles.
**Recommendation**: Never log credentials. Require `INITIAL_ADMIN_PASSWORD` via env, or write the generated value to a gitignored local file; log only that seeding occurred.

### [SEV-H-016] Money and grade values use floating-point; balance/registration races
**Severity**: High
**Category**: Data integrity
**Location**: `server.js:3363-3433,3569,3607-3610,3898-4050`; `src/models/Payslip.js:32-36`; `src/models/transcriptModel.js:93-123`
**Description**: All monetary fields (`amount`, `balance`, `programCost`, `totalFees`) are JS `Number` (IEEE-754) and combined with `+`/`-`/`reduce`. Year-promotion does a non-atomic read-modify-write of `balance`; `register-units` checks the fee threshold once then loops without a transaction. Transcript `totalMarks` is a float weighting and `isComplete` uses `||` instead of `&&`.
```js
// server.js:3415-3417
const newBalance = (currentStudent.balance || 0) + program.programCost; updates.balance = newBalance;
// server.js:3609  const outstandingBalance = totalFees - paidAmount; // float compare for gating
```
**Attack scenario or consequence**: Floating-point drift can flip the fee-threshold gate; concurrent promotions/registrations under-bill or create duplicate registrations; partially-entered marks lock a failing grade.
**Recommendation**: Store money as integer minor units or `Decimal128`; use atomic `$inc` and MongoDB transactions for balance and registration; fix `isComplete` to require all components.

### [SEV-H-017] OTPs and reset tokens stored in plaintext; generated with Math.random()
**Severity**: High
**Category**: Crypto
**Location**: `src/models/LoginOTP.js:23-26,69-70,120-122`; `src/models/PasswordReset.js:30-43,76,125-127`
**Description**: OTP and reset-token values are stored as plain strings and indexed (raw values persist in B-trees). Both `generateOTP` implementations use `Math.random()`, not a CSPRNG.
```js
// LoginOTP.js:120-122
loginOTPSchema.statics.generateOTP = function () { return Math.floor(100000 + Math.random()*900000).toString(); };
```
**Attack scenario or consequence**: Any DB/backup read yields live OTPs and reset tokens for immediate account takeover; predictable `Math.random()` output may let an attacker anticipate codes.
**Recommendation**: Store only a hash (e.g. SHA-256) of OTP/token, compare hashes, drop raw-value indexes, and generate with `crypto.randomInt()`.

### [SEV-H-018] Credential fields returned by default queries (no select:false / toJSON strip)
**Severity**: High
**Category**: Auth
**Location**: `src/models/AdminStaff.js:35-42,77-80,232-233`; `src/models/HOD.js`; `src/models/Trainer.js`
**Description**: None of `AdminStaff`/`HOD`/`Trainer` set `select:false` on `password` (or `passwordHistory`), and the `toJSON` transforms only enable virtuals — they do not strip secrets. Any route returning these documents without an explicit projection leaks the hash (or, for Trainer, the cleartext password).
```js
// AdminStaff.js:232-233
adminStaffSchema.set('toJSON', { virtuals: true }); // does NOT remove password/passwordHistory
```
**Attack scenario or consequence**: A single endpoint that forgets `.select('-password')` (e.g. trainer listing) discloses password hashes/cleartext and bcrypt history to API callers, enabling offline cracking or direct login.
**Recommendation**: Add `select:false` to `password`/`passwordHistory` on all credentialed models and a `toJSON` transform that deletes them.

### [SEV-H-019] Dynamic RegExp built from unescaped URL parameters (ReDoS / unintended matches)
**Severity**: High
**Category**: Input validation
**Location**: `server.js:3229-3231,3293-3295,3324-3326`
**Description**: `GET /api/students/department/:department` and `…/latest-admission/:courseCode/:intake/:intakeYear` interpolate path-derived values directly into `new RegExp(...)`/`$regex` strings without escaping regex metacharacters.
```js
// server.js:3294
admissionNumber: { $regex: `^${courseCode}/\\d{4}/${intakeCode}$` } // courseCode unescaped
```
**Attack scenario or consequence**: A crafted parameter (or DB value containing metacharacters) triggers catastrophic backtracking (ReDoS) against MongoDB or matches records outside intended scope.
**Recommendation**: Regex-escape any interpolated value, or replace `$regex` with structured `$in`/exact queries.

### [SEV-M-020] No account lockout on student/HOD/trainer logins
**Severity**: Medium
**Category**: Auth
**Location**: `server.js:3489-3550,2554-2597,2751-2796`
**Description**: Only the admin auth flow tracks failed attempts. Student, HOD and trainer logins rely solely on the IP-based `authLimiter` (20/15 min); there is no per-account failed-attempt counter or lockout.
**Attack scenario or consequence**: Distributed or shared-NAT attackers brute-force the small student phone-number password space (SEV-H-014) without per-account throttling.
**Recommendation**: Track and lock per-account after N consecutive failures with notification, in addition to IP rate limiting.

### [SEV-M-021] No rate limiting on the admin auth router
**Severity**: Medium
**Category**: Rate limiting
**Location**: `src/routes/adminAuth.js:42,154,265`; mounted `server.js:898`
**Description**: `authLimiter` is applied to specific server.js auth routes but the `/api/admin/auth/*` sub-router (login, verify-otp, update-email-send-otp) only inherits the generous 300/15 min general limiter.
**Attack scenario or consequence**: Enables the OTP brute-force (SEV-C-001) and password attempts against the unauthenticated email-change endpoint at near-network speed.
**Recommendation**: Apply a strict per-IP limiter (e.g. 10/15 min) directly to the admin auth router.

### [SEV-M-022] update-email-send-otp persists the new email before OTP verification and is unauthenticated
**Severity**: Medium
**Category**: Auth
**Location**: `src/routes/adminAuth.js:153-260` (esp. 206-213)
**Description**: The endpoint has no `verifyToken` (inline password check only, no lockout) and writes `staff.email = newEmail; await staff.save()` *before* the OTP to that address is verified.
```js
staff.email = newEmail.toLowerCase(); staff.mustUpdateEmail = false;
staff.emailVerified = false; await staff.save(); // email already changed; OTP sent after
```
**Attack scenario or consequence**: Someone with a staff member's current email + password (e.g. default `Admin@2024`) repoints the account email to an attacker address, then completes OTP from there — account takeover; unthrottled password guessing on this path.
**Recommendation**: Store a `pendingEmail` and only commit after OTP verification; require an authenticated session; apply lockout/rate limiting.

### [SEV-M-023] First-login setup not enforced server-side
**Severity**: Medium
**Category**: Auth
**Location**: `src/routes/adminAuth.js:313-323,533-570`
**Description**: After OTP a full token is issued even when `isFirstLogin/mustUpdateEmail/mustUpdatePassword` are true. Only the client decides to call `complete-first-login`; no middleware blocks other endpoints while setup is pending.
**Attack scenario or consequence**: A user (or session interceptor) skips mandatory email/password change by using the issued token directly against other endpoints.
**Recommendation**: Add middleware that rejects non-setup endpoints while first-login flags are set (verified from DB, not the token).

### [SEV-M-024] Documented permission model (endpointSecurity.js) is dead code
**Severity**: Medium
**Category**: Authorization
**Location**: `src/config/endpointSecurity.js:1-119`
**Description**: `ENDPOINT_PERMISSIONS`, `PUBLIC_ENDPOINTS`, `OWNERSHIP_ENDPOINTS` are never imported anywhere; all authorization is ad hoc in routes. The file diverges from actual route behaviour (e.g. it omits `student` on `/api/students/admission/:admissionNumber`, which the code allows).
**Attack scenario or consequence**: Maintainers editing this file believe they are tightening access control while runtime behaviour is unchanged — a false sense of security and a source of policy drift.
**Recommendation**: Either implement a middleware that enforces the maps, or delete the file and document policy at the routes.

### [SEV-M-025] Helmet Content-Security-Policy disabled
**Severity**: Medium
**Category**: Configuration
**Location**: `server.js:294-297`
**Description**: `helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })` ships no CSP (acknowledged TODO).
**Attack scenario or consequence**: Removes the primary browser mitigation for the many XSS sinks in SEV-H-010; an injected script runs and exfiltrates localStorage tokens unhindered.
**Recommendation**: Define an explicit CSP (script/style/connect/img) with nonces or hashes for inline scripts.

### [SEV-M-026] Pervasive logging of PII and token metadata
**Severity**: Medium
**Category**: Logging
**Location**: server: `server.js:2367,1848-1858,3267-3275,3767-3785,3096-3121`; client: `src/components/student/studentPortal.js:330,1092-1129`, `src/components/finance/financeDashboard.js:14-21`, `src/components/admin/AdminLogin.html:341-361`, `src/components/hod/hodDashboard.js:91-1576`; `src/utils/emailService.js:33-34,106`
**Description**: Server logs full `req.body`, admission numbers, new emails, recipient lists and registration records; clients `console.log` full student records, token length/source and partial tokens; email service logs full error objects (may include recipient/SMTP context).
```js
// server.js:2367
console.log('📝 Common unit assignment request body:', req.body);
// studentPortal.js:330  console.log('Full studentInfo:', studentInfo);
```
**Attack scenario or consequence**: Browser-console output is visible to anyone with DevTools/shared machines; server logs aggregate PII into third-party platforms — data-protection exposure and recon for attackers.
**Recommendation**: Strip PII/token data from all logs; log identifiers/counts only, gated by an explicit debug flag disabled in production.

### [SEV-M-027] Sensitive data and inconsistent tokens persisted in web storage
**Severity**: Medium
**Category**: Frontend
**Location**: `public/js/auth.js:18-21,56-66`; `src/components/student/studentPortal.js:32,1105`; `src/components/hod/hodDashboard.js:84`; `src/components/dean/deanDashboard.js:5-10,427-431`
**Description**: JWTs plus full user/student/HOD/trainer records (including `idNumber`, `phoneNumber`, `kcseGrade`) are stored in `localStorage`/`sessionStorage`. Token keys proliferate (`authToken`, `adminToken`, `hodToken`, …) with cascading fallbacks so any role's residual token satisfies another dashboard; dean logout clears only `sessionStorage`.
```js
// deanDashboard.js:5-10 — any leftover role token is accepted
const token = localStorage.getItem('adminToken') || localStorage.getItem('trainerToken') || …;
```
**Attack scenario or consequence**: XSS (SEV-H-010) exfiltrates tokens and full PII at once; stale cross-role tokens enable unintended access; incomplete logout leaves valid tokens behind.
**Recommendation**: Store only a minimal token (ideally an `HttpOnly` cookie); never cache full PII client-side; use one key; clear all auth on logout and revoke server-side.

### [SEV-M-028] Client-side generation of official documents from editable state
**Severity**: Medium
**Category**: Frontend
**Location**: `src/components/registrar/AdmissionLetter.html:280-340`; `src/components/student/studentPortal.js:958-1037`; `src/components/registrar/exportUtils.js:132-213`; `src/components/finance/financeAnalytics.js:369-484`
**Description**: Admission letters and payment receipts are rendered into the DOM (or a `data-payment` attribute) and exported via `html2pdf`/`jsPDF` from client state with no server signature.
```js
// studentPortal.js:972
const paymentData = JSON.parse(modal.getAttribute('data-payment') || '{}'); // editable in DevTools
```
**Attack scenario or consequence**: A user edits the DOM/attribute before export to produce a counterfeit admission letter or a forged payment receipt usable for enrollment/bursary fraud.
**Recommendation**: Generate official documents server-side as signed PDFs delivered via short-lived links; never trust client state for document content.

### [SEV-M-029] Admin password retained in window-global during OTP flow
**Severity**: Medium
**Category**: Frontend
**Location**: `src/components/admin/AdminLogin.html:286-287,481-484`; `src/components/admin/AdminStaffLogin.html:340-342`
**Description**: The plaintext password is assigned to `window.oldPassword` (and re-read in `resendOTP`) for the multi-step OTP flow, remaining in global scope until the page is closed.
**Attack scenario or consequence**: Any script with `window` access (XSS, extension, malicious CDN — see SEV-L-038) reads the admin's cleartext password during the login window.
**Recommendation**: Keep credentials only in function scope; re-authenticate with the server for the second step instead of replaying the password.

### [SEV-M-030] Email service: no per-recipient throttling; reset-link/HTML injection risk
**Severity**: Medium
**Category**: Configuration
**Location**: `src/utils/emailService.js:68,197,333-357,486` (whole-file: no rate limit)
**Description**: No per-recipient cooldown/counter on OTP/reset sends. `userName`/`userType`/`resetLink` are interpolated into HTML templates without entity-encoding; `resetLink` derives from `config.baseUrl` — if any path lets a request influence the base URL, the link points off-domain.
```js
const resetLink = `${baseUrl || config.baseUrl}/reset-password?token=${resetToken}&type=${userType}`;
```
**Attack scenario or consequence**: Email-bombing a victim/exhausting the Gmail send quota (silencing all mail); malformed or attacker-pointed reset links capture reset tokens.
**Recommendation**: Add per-recipient backoff and a minimum send interval; HTML-encode all interpolated values; pin `baseUrl` to configuration, never request headers.

### [SEV-M-031] Real personal email addresses and staff names hardcoded in source
**Severity**: Medium
**Category**: Data integrity
**Location**: `server.js:1780-1800`; `src/data/trainerData.js:11-12,73-80`
**Description**: Personal Gmail addresses (`maxxymaxxy04@gmail.com`, `gatewaytimer@gmail.com`, `severinawanjiku2022@gmail.com`) are hardcoded in an email-routing switch; `trainerData.js` parses a flat staff file and derives institutional emails from real names, logging names to console.
**Attack scenario or consequence**: PII committed to version control (and downloadable via SEV-C-003) — phishing/spam targeting and a possible data-protection violation; deterministic email formula enables enumeration.
**Recommendation**: Remove all real contact data from source; drive routing from the database; add a pre-commit secret/PII scan.

### [SEV-M-032] Missing unique/format constraints corrupt core data
**Severity**: Medium
**Category**: Data integrity
**Location**: `src/models/Unit.js:9-13`; `src/models/HOD.js:18-23`; `src/models/Trainer.js:11-16`; `src/models/AttachmentApplication.js:7`; `src/models/GraduationApplication.js:7`
**Description**: `Unit.unitCode` has no unique constraint though it is referenced by registrations, tools, transcripts and assignments; `HOD.email`/`Trainer.email` lack format validators (unlike `AdminStaff`); `idNumber`/`phoneNumber` have no format validation.
**Attack scenario or consequence**: Concurrent creates produce duplicate unit codes that make grade/transcript/tool lookups ambiguous; malformed emails silently break OTP/reset delivery; garbage national IDs persist.
**Recommendation**: Add `unique:true` + index on `unitCode`; add email/ID/phone validators consistently across models.

### [SEV-M-033] AuditLog enum omits roles, silently dropping their actions
**Severity**: Medium
**Category**: Configuration
**Location**: `src/models/AuditLog.js:11-14`
**Description**: `AuditLog.userType` enum lacks `finance`, `dean`, `ilo` (present in `LoginOTP`/`PasswordReset`/`Notification`). Saving an audit entry for those roles fails enum validation.
**Attack scenario or consequence**: Actions by finance/dean/ILO users (fee, note, application changes) are not recorded — compliance and forensic gaps exactly where money and outcomes change.
**Recommendation**: Centralize one authoritative role list and include all roles in `AuditLog.userType`.

### [SEV-M-034] Hardcoded client identities sent as server actor
**Severity**: Medium
**Category**: Authorization
**Location**: `src/components/cibec/cibecDashboard.js:43,153-354`; `src/components/finance/financeDashboard.js:1197,1351-1356`
**Description**: `CIBEC_USER_ID = 'cibec_admin'` and `getFinanceUserData()` → `userId:'finance_admin'` are sent to the server as the acting user for audit/attribution.
**Attack scenario or consequence**: Every CIBEC/finance action is attributed to one constant identity, defeating per-user accountability for file/payslip operations (compounds SEV-H-008).
**Recommendation**: Derive identity from the authenticated session server-side and ignore client-supplied actor fields.

### [SEV-L-035] Unbounded pagination/limit parameters
**Severity**: Low
**Category**: Input validation
**Location**: `server.js:2095-2098,4615-4619`
**Description**: `GET /api/units` and `GET /api/notifications/:userId` parse `limit` from the query with no upper bound.
**Attack scenario or consequence**: An authenticated caller sets `limit=999999` to dump large datasets, causing memory pressure / slow responses.
**Recommendation**: Clamp `limit` to a sane maximum (e.g. 100–200) server-side.

### [SEV-L-036] Client-supplied payment date allows back/forward-dating
**Severity**: Low
**Category**: Data integrity
**Location**: `server.js:4193-4235`
**Description**: `paymentDate: paymentDate || new Date()` accepts an arbitrary date from `req.body`.
**Attack scenario or consequence**: Finance staff can record payments with arbitrary dates, distorting financial periods/audit trails.
**Recommendation**: Use server time unless back-dating is an approved, separately-authorized workflow.

### [SEV-L-037] `/debug` route served unauthenticated
**Severity**: Low
**Category**: Configuration
**Location**: `server.js:892-894`
**Description**: `GET /debug` serves `debug.html` from root with no auth (and via SEV-C-003 the file itself may be directly fetchable).
**Attack scenario or consequence**: Potential diagnostic/info disclosure depending on file contents; at minimum advertises a debug surface.
**Recommendation**: Remove the route/file in production or gate behind `verifyToken`+`authorize('admin')`.

### [SEV-L-038] No Subresource Integrity on CDN scripts/styles
**Severity**: Low
**Category**: Frontend
**Location**: all dashboard/login HTML (e.g. `src/login.html:7-8`, `src/components/registrar/RegistrarDashboardNew.html:248-249`)
**Description**: Tailwind/Font-Awesome/Chart.js/jsPDF/html2pdf are loaded from public CDNs with no `integrity`/`crossorigin`.
**Attack scenario or consequence**: A CDN compromise or hijack serves malicious JS to all users (token theft, account takeover) — supply-chain risk.
**Recommendation**: Pin versions with SRI hashes; self-host critical libraries; replace the dynamic Tailwind CDN with a compiled stylesheet.

### [SEV-L-039] `trust proxy` may not match deployment topology
**Severity**: Low
**Category**: Configuration
**Location**: `server.js:285`
**Description**: `app.set('trust proxy', 1)` trusts exactly one hop; multi-proxy stacks (Cloudflare→Vercel→Node) yield a wrong client IP for rate limiting.
**Attack scenario or consequence**: Per-IP rate limits keyed on the wrong address are weakened or bypassable.
**Recommendation**: Set the hop count to match the actual deployment, or derive the client IP from the verified upstream header.

### [SEV-L-040] `bcryptjs` instead of native `bcrypt`; inconsistent cost factors
**Severity**: Low
**Category**: Dependencies
**Location**: `package.json:18`; `src/models/HOD.js:51-62` (cost 10) vs `src/models/AdminStaff.js:113-130` (cost 12)
**Description**: Pure-JS `bcryptjs` is slower per cost unit (pressuring lower factors / CPU under load); HOD hashes use cost 10, AdminStaff 12.
**Attack scenario or consequence**: Marginally weaker HOD hashes offline; higher CPU exhaustion risk under login flooding.
**Recommendation**: Standardize cost ≥ 12 everywhere; evaluate native `bcrypt` for production.

### [SEV-L-041] `public-notes` route ignores its `:studentId`
**Severity**: Low
**Category**: Authorization
**Location**: `server.js:5868-5883`
**Description**: `GET /api/students/:studentId/public-notes` intentionally drops the `studentId` filter and returns all public notes.
**Attack scenario or consequence**: Misleading scope; clients receive more than the URL implies (low impact if notes are genuinely public).
**Recommendation**: Rename to a global route or restore per-student filtering to match the contract.

### [SEV-L-042] Orphaned/static pages with no auth
**Severity**: Low
**Category**: Code quality
**Location**: `src/staff.html`; `src/form.html`; `*.OLD.html` (e.g. `src/components/admin/admin-login.OLD.html`)
**Description**: `staff.html` is a hardcoded fake staff dashboard (e.g. "Prof. John Doe") with no auth; `form.html` is an unrelated "Ace Up" template; `*.OLD.html` legacy files remain in the repo (the static blocklist rejects `.old.html` from serving but they still ship in VCS).
**Attack scenario or consequence**: Confusing/misleading attack surface and stale code; low direct risk.
**Recommendation**: Delete dead/legacy pages.

### [SEV-L-043] Mixed-type settings/audit fields without constraints
**Severity**: Low
**Category**: Input validation
**Location**: `src/models/SystemSettings.js:10-12`; `src/models/AuditLog.js:43-45`
**Description**: `SystemSettings.value` and `AuditLog.details` are `Mixed` with no schema/ACL; sensitive config or raw request data could be stored/returned unfiltered.
**Attack scenario or consequence**: Security-relevant settings alterable without typed validation; raw `req.body` could leak into audit `details`.
**Recommendation**: Strongly type security-critical settings; enumerate allowed `details` keys; never pass raw `req.body` to the audit logger.

### [SEV-L-044] Dangling references; no cascade/integrity handling
**Severity**: Low
**Category**: Data integrity
**Location**: `src/models/CommonUnitAssignment.js:6-16`; `src/models/ToolsOfTrade.js:7-12`; `src/models/StudentUnitRegistration.js:11`; `src/models/transcriptModel.js:7-30`; `src/models/AuditLog.js:33`
**Description**: ObjectId references have no application-level delete protection; server.js already contains a `fixBrokenTrainerReferences()` acknowledging the problem.
**Attack scenario or consequence**: Deleting a Trainer/Unit/HOD/CommonUnit orphans references; `populate()` silently returns null, breaking transcripts/assignments.
**Recommendation**: Add pre-delete checks that block or archive dependents; document deletion order.

### [SEV-L-045] Notifications without `expiresAt` never TTL-expire
**Severity**: Low
**Category**: Data integrity
**Location**: `src/models/Notification.js:43-44`
**Description**: `expiresAt` is optional but the TTL index only deletes documents that have it.
**Attack scenario or consequence**: Unbounded collection growth from notifications lacking an expiry.
**Recommendation**: Make `expiresAt` required with a default, or run a periodic cleanup.

### [SEV-L-046] ToolsOfTrade storage fields not validated for consistency
**Severity**: Low
**Category**: Configuration
**Location**: `src/models/ToolsOfTrade.js:33-45`
**Description**: `s3Key`/`s3Bucket` are not required when `storageType:'s3'`; `filePath` is always required.
**Attack scenario or consequence**: Records with `s3` storage but no key produce broken/incorrect download paths.
**Recommendation**: Add a conditional validator tying required fields to `storageType`.

### [SEV-L-047] CORS allows requests with no Origin header
**Severity**: Low
**Category**: Configuration
**Location**: `server.js:300-310`
**Description**: Production CORS is correctly origin-restricted, but `if (!origin) return callback(null, true)` always allows requests lacking an Origin (non-browser tools).
**Attack scenario or consequence**: CORS is browser-only and provides no protection against scripted/non-browser API abuse — a reminder that CORS is not the authorization boundary.
**Recommendation**: Treat CORS as UX-only; rely on JWT auth for authorization (and fix the unauthenticated endpoints).

### [SEV-I-048] Dev-only JWT secret rotates on every restart
**Severity**: Informational
**Category**: Configuration
**Location**: `src/config/config.js:42`
**Description**: The development fallback `'dev-only-not-for-production-' + Date.now()` changes per process start, invalidating local tokens on restart. Production is protected by the hard-fail in `readSecret`.
**Recommendation**: Use a stable, clearly non-production dev secret to avoid developer confusion.

### [SEV-I-049] Dead/ambiguous initialization and route-loading code
**Severity**: Informational
**Category**: Code quality
**Location**: `server.js:147-153,959-1025`
**Description**: `initializePrograms()` is defined but never called; an optional `./src/server/routes/student` is conditionally imported with a try/catch, creating ambiguity over which routes are active.
**Recommendation**: Remove dead code; maintain a single authoritative route definition and call seeders explicitly.

### [SEV-I-050] AI/editor config not gitignored
**Severity**: Informational
**Category**: Configuration
**Location**: `.cursor/rules/production.mdc`; `.claude/settings.local.json`
**Description**: These currently contain no secrets (only permissions/frontmatter) but are tracked and could later capture sensitive tool state.
**Recommendation**: Add `.cursor/` and `.claude/settings.local.json` to `.gitignore`.

### [SEV-I-051] `.npmrc` keeps `audit=true` (positive)
**Severity**: Informational
**Category**: Dependencies
**Location**: `.npmrc:5`
**Description**: Audits are not disabled (`audit=true`), which is the desired state. The operator must still run `npm audit` for current CVE data (see Dependency inventory).
**Recommendation**: Keep `audit=true`; wire `npm audit` into CI.

### [SEV-I-052] Config hard-fails on weak production secrets (positive)
**Severity**: Informational
**Category**: Configuration
**Location**: `src/config/config.js:11-24,79-86`
**Description**: `readSecret` refuses to boot in production when `JWT_SECRET`/`SESSION_SECRET` are missing, short, or match placeholder patterns; `MONGODB_URI` is required in production.
**Recommendation**: Retain this control; ensure it cannot be regressed by the hardcoded fallback in older code paths (cross-ref SEV-C-003 / `temp_diff.txt`).

### [SEV-I-053] Custom NoSQL key sanitizer present (positive, with caveat)
**Severity**: Informational
**Category**: Input validation
**Location**: `server.js:370-386`
**Description**: A custom middleware strips prohibited (`$`-prefixed) keys from inputs, mitigating classic NoSQL operator injection. No raw object-injection sink was found beyond the regex issues in SEV-H-019.
**Recommendation**: Keep it; still validate/cast types per route and address the regex-injection finding.

### [SEV-I-054] TLS validation not disabled in current email code (positive, with caveat)
**Severity**: Informational
**Category**: Crypto
**Location**: `src/utils/emailService.js` (current); `CHANGES.md:168-169`; `temp_diff.txt`
**Description**: The previous `tls:{rejectUnauthorized:false}` has been removed from the live code. However the insecure version still exists in `temp_diff.txt` and git history, so a rollback would silently reintroduce it.
**Recommendation**: Purge the diff/history (SEV-C-003) and add a CI grep for `rejectUnauthorized.*false`.

---

## Endpoint inventory

Middleware/roles as read from `server.js` (and the `/api/admin/auth/*` sub-router). "Ownership = yes\*" means `verifyOwnership` is called but is unreliable on admission-number routes per **SEV-H-006**. Critical gaps in **bold**.

| Method | Path | Middleware chain | Ownership | Roles allowed | File:line |
|---|---|---|---|---|---|
| POST | /api/auth/forgot-password | authLimiter | n/a | public | server.js:500 |
| POST | /api/auth/verify-otp | authLimiter | n/a | public | server.js:652 |
| POST | /api/auth/reset-password | authLimiter | n/a | public | server.js:724 |
| GET | /api/auth/validate-reset-token/:token | none | n/a | public | server.js:819 |
| GET | /debug | none | n/a | public | server.js:892 |
| USE | /api/admin/auth/* | adminAuth router | varies | varies | server.js:898 |
| GET | /admin\|/hod\|/trainer\|/student\|/finance\|/registrar\|/dean\|/deputy\|/ilo\|/cibec dashboards | **none** | n/a | **public (no server auth)** | server.js:915-949,5151-5205 |
| GET | /api/tool-requests | verifyToken, authorize | no | admin,trainer,hod | server.js:1723 |
| GET | /api/tool-requests/trainer/:email | verifyToken, authorize, verifyOwnership | yes(email) | admin,trainer | server.js:1734 |
| POST | /api/tool-requests | verifyToken, authorize | no | admin,trainer,hod | server.js:1750 |
| POST | /api/students/register | verifyToken, authorize | no | admin,registrar | server.js:1889 |
| GET | /api/units/course/:courseCode | none | n/a | public | server.js:1981 |
| GET | /api/units/department/:department | verifyToken, authorize | no | admin,registrar,hod | server.js:2070 |
| GET | /api/units | verifyToken, authorize | no | admin,registrar,hod | server.js:2095 |
| GET | /api/courses | none | n/a | public | server.js:2126 |
| GET | /api/common-units(/:unitCode) | verifyToken, authorize | no | admin,registrar,hod | server.js:2145-2163 |
| POST/PUT/DELETE | /api/common-units(/:unitCode) | verifyToken, authorize | no | admin,registrar | server.js:2189-2256 |
| GET | /api/common-unit-assignments | verifyToken, authorize | no | admin,registrar,hod | server.js:2289 |
| GET | /api/common-unit-assignments/trainer/:trainerId | verifyToken, authorize | **NO** | admin,registrar,hod,trainer | server.js:2319 |
| GET | /api/common-unit-assignments/department/:department | verifyToken, authorize | no | admin,registrar,hod | server.js:2341 |
| POST/PUT/DELETE | /api/common-unit-assignments(/:assignmentId) | verifyToken, authorize | no | admin,hod | server.js:2363-2490 |
| GET | /api/trainers/all-departments | verifyToken, authorize | no | admin,hod,registrar | server.js:2521 |
| POST | /api/hod/login | authLimiter | n/a | public | server.js:2554 |
| PUT | /api/hod/:hodId/profile | verifyToken, authorize, verifyOwnership | yes(hodId) | admin,hod | server.js:2600 |
| GET | /api/hod/departments | none | n/a | public | server.js:2659 |
| GET | /api/trainers/department/:department | verifyToken, authorize | no | admin,hod,registrar | server.js:2670 |
| GET | /api/assignments/department/:department | verifyToken, authorize | no | admin,hod,registrar | server.js:2689 |
| POST | /api/assignments/assign\|unassign | verifyToken, authorize | no | admin,hod | server.js:2705-2731 |
| POST | /api/trainers/login | authLimiter | n/a | public | server.js:2751 |
| PUT | /api/trainers/:trainerId/email | verifyToken, authorize, verifyOwnership | yes(trainerId) | admin,trainer | server.js:2799 |
| GET | /api/trainers/:trainerId/assignments | verifyToken, authorize, verifyOwnership | yes(trainerId) | admin,hod,registrar,trainer | server.js:2849 |
| PUT | /api/trainers/:trainerId/profile | verifyToken, authorize, verifyOwnership | yes(trainerId) | admin,trainer | server.js:2977 |
| GET | /api/trainers/:trainerId/students | verifyToken, authorize, verifyOwnership | yes(trainerId) | admin,hod,registrar,trainer | server.js:3044 |
| GET | /api/students/department/:department | verifyToken, authorize | no | admin,registrar,hod,dean | server.js:3205 |
| GET | /api/students/admission/:admissionNumber | verifyToken, authorize | **NO** | admin,registrar,finance,student | server.js:3264 |
| GET | /api/students/latest-admission/... | verifyToken, authorize | no | admin,registrar | server.js:3285-3315 |
| GET | /api/students | verifyToken, authorize | no | admin,registrar,dean,finance | server.js:3346 |
| PATCH | /api/students/:id | **NONE** | **NO** | **UNAUTHENTICATED** | server.js:3357 |
| GET | /api/students/export/:admissionType | verifyToken, authorize | no | admin,registrar | server.js:3446 |
| POST | /api/students/login | authLimiter | n/a | public | server.js:3489 |
| GET | /api/students/:studentId/can-register | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:3553 |
| GET | /api/students/:id | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:3627 |
| PUT | /api/students/:id | verifyToken, authorize | no | admin,registrar | server.js:3641 |
| PUT | /api/students/:studentId/email | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:3763 |
| GET | /api/system-settings(/:key) | verifyToken, authorize | no | admin (+ many on :key) | server.js:3826-3845 |
| PUT | /api/system-settings/:key | verifyToken, authorize | no | admin | server.js:3862 |
| GET | /api/students/:studentId/registrations | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:3884 |
| POST | /api/students/register-units | verifyToken, authorize | **NO (body studentId)** | admin,registrar,student | server.js:3898 |
| POST | /api/programs | verifyToken, authorize | no | admin,registrar | server.js:4056 |
| GET | /api/programs | none | n/a | public | server.js:4102 |
| GET/PUT/DELETE | /api/programs/:id | verifyToken, authorize | no | admin,registrar | server.js:4113-4175 |
| POST | /api/payments | verifyToken, authorize | no | admin,finance | server.js:4193 |
| GET | /api/payments | verifyToken, authorize | no | admin,finance,registrar | server.js:4260 |
| GET | /api/payments/student/:studentId | verifyToken, authorize, verifyOwnership | yes(studentId) | admin,finance,student | server.js:4271 |
| POST | /api/tools/upload | verifyToken, authorize | **NO (body trainerId)** | admin,trainer,hod | server.js:4293 |
| GET | /api/tools/trainer/:trainerId | verifyToken, authorize, verifyOwnership | yes(trainerId) | admin,trainer,hod | server.js:4407 |
| GET | /api/tools | verifyToken, authorize | no | admin,trainer,hod,registrar | server.js:4431 |
| PATCH | /api/tools/:toolId/status | **NONE** | **NO** | **UNAUTHENTICATED** | server.js:4464 |
| GET | /api/tools/:toolId/download | verifyToken, authorize | **NO** | admin,trainer,hod | server.js:4529 |
| DELETE | /api/tools/:toolId | verifyToken, authorize | **NO** | admin,trainer,hod | server.js:4566 |
| GET | /api/notifications | verifyToken, authorize | no | admin,registrar,finance,dean,cibec,ilo,deputy,hod | server.js:4604 |
| GET | /api/notifications/:userId | verifyToken, authorize, verifyOwnership | yes(userId) | admin,student,trainer,hod,registrar,cibec,ilo | server.js:4615 |
| PATCH | /api/notifications/:notificationId/read | **NONE** | **NO** | **UNAUTHENTICATED** | server.js:4636 |
| PATCH | /api/notifications/:userId/read-all | **NONE** | **NO** | **UNAUTHENTICATED** | server.js:4660 |
| POST | /api/notifications | verifyToken, authorize | no | admin,registrar,hod,cibec,ilo,dean,finance | server.js:4680 |
| POST | /api/notifications/broadcast | verifyToken, authorize | no | admin,registrar,deputy | server.js:4712 |
| GET | /api/students/:studentId/graduation-eligibility | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:4759 |
| POST | /api/students/:studentId/graduation-application | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:4798 |
| GET | /api/students/:studentId/attachment-eligibility | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:4888 |
| POST | /api/students/:studentId/attachment-application | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student | server.js:4927 |
| GET | /api/ilo/graduation-applications | verifyToken, authorize | no | admin,ilo,registrar | server.js:5024 |
| GET | /api/ilo/attachment-applications | verifyToken, authorize | no | admin,ilo,registrar | server.js:5048 |
| PATCH | /api/ilo/applications/:type/:applicationId/status | **NONE** | **NO** | **UNAUTHENTICATED** | server.js:5073 |
| POST | /api/student-uploads | verifyToken, authorize | **NO (body studentId)** | admin,registrar,student,trainer | server.js:5235 |
| GET | /api/student-uploads/:studentId(/unit/:unitId) | verifyToken, authorize, verifyOwnership | yes\* | admin,registrar,student,trainer,cibec | server.js:5456-5485 |
| GET | /api/student-uploads/:uploadId/download | verifyToken, authorize | **NO** | admin,registrar,student,trainer,cibec | server.js:5503 |
| DELETE | /api/student-uploads/:uploadId | verifyToken, authorize | **broken (req.query)** | admin,registrar,student,cibec | server.js:5545 |
| GET | /api/cibec/uploads\|statistics\|student/:studentId/uploads\|audit-logs | verifyToken, authorize | no | admin,cibec,registrar(+dean) | server.js:5599-5736 |
| GET | /api/dean/students | verifyToken, authorize | no | admin,dean,registrar | server.js:5770 |
| POST | /api/dean/students/:studentId/notes | verifyToken, authorize | **NO (createdBy from body)** | admin,dean | server.js:5801 |
| GET | /api/dean/students/:studentId/notes | verifyToken, authorize | no | admin,dean,registrar | server.js:5854 |
| GET | /api/students/:studentId/public-notes | verifyToken, authorize | no (ignores param) | student | server.js:5868 |
| PUT | /api/students/:studentId/notes/:noteId/read | verifyToken, authorize, verifyOwnership | yes\* | admin,dean,student | server.js:5886 |
| POST | /api/payslips/generate | verifyToken, authorize | no | admin,finance | server.js:5911 |
| GET | /api/trainers/:trainerId/payslips | verifyToken, authorize, verifyOwnership | yes(trainerId) | admin,finance,trainer | server.js:5980 |
| GET | /api/payslips | verifyToken, authorize | no | admin,finance | server.js:6000 |
| PUT | /api/payslips/:payslipId/view | verifyToken, authorize | **NO** | admin,finance,trainer | server.js:6019 |
| Admin auth | /api/admin/auth/login, /verify-otp, /update-email-send-otp, /update-email, /update-password, /complete-first-login, /profile, /refresh-token | adminAuth router (local verifyToken on some; no rate limiter) | n/a | public/staff | src/routes/adminAuth.js |

## Frontend inventory

| File | API endpoints called (summary) | Token attached | Logs sensitive data | innerHTML with response data |
|---|---|---|---|---|
| public/index.html | shell only | n/a | no | no |
| src/login.html | students/trainers login, forgot/verify/reset | no (login) | no | no |
| src/form.html | none (orphan template) | n/a | no | no |
| src/staff.html | none (static fake dashboard) | n/a | no | no |
| src/components/admin/AdminLogin.html | admin login/verify-otp/update-email-send-otp | no (login) | yes (user obj, partial token) | no |
| src/components/admin/AdminStaffLogin.html | admin login/verify-otp/update-email | no (login) | yes (email, login resp) | no |
| src/components/admin/FirstLogin.html | update-email/password, complete-first-login | yes | yes (email/name) | no |
| src/components/admin/adminDashboard.(html\|js) | students, trainers, payments, programs | yes (authFetch) | yes (counts) | yes (722-851) |
| src/components/auth/ForgotPassword.html | forgot-password | no | no | no |
| src/components/auth/ResetPassword.html | validate-reset-token, reset-password | no (token in URL) | no | no |
| src/components/registrar/RegistrarDashboardNew.(html) + exportUtils.js | students CRUD, register, export | **NO (no auth header)** | yes (full studentData) | yes (337-618) |
| src/components/registrar/AdmissionLetter.html | template only | n/a | no | no (textContent) but client-PDF |
| src/components/student/StudentPortalTailwind.html + studentPortal.js/studentService.js/uploadSection.js | students/*, ilo/*, uploads | partial (interceptor; many bare) | yes (full student record) | yes (notes/payments) |
| src/components/student/register.html | none (stub) | n/a | no | no |
| src/components/hod/HODLogin.html | hod login, departments, reset | no (login; shows "Default password: HOD") | no | no |
| src/components/hod/HODDashboard.html + hodDashboard.js | students, courses, trainers, assignments | partial (1768 bare) | yes (full HOD obj) | yes (escapeHtml used partially) |
| src/components/dean/DeanDashboard.html + deanDashboard.js | students, dean notes | partial (loadStudents bare) | no | yes (150-349) |
| src/components/deputy/DeputyDashboard.html | tools, notifications, students | **partial/NO** | yes (tool/student) | yes (38-1533) |
| src/components/finance/FinanceDashboard.html + financeDashboard.js/financeAnalytics.js | students, payments, programs, system-settings, payslips | yes (authFetch) | yes (token meta, form values) | yes (288-857) |
| src/components/ilo/ILODashboard.html + iloDashboard.js | ilo graduation/attachment apps + status | **NO (authFetch dead code)** | no (counts) | yes incl. document.write (239-553) |
| src/components/cibec/CIBECDashboard.html + cibecDashboard.js | cibec uploads/student, downloads | yes (authFetch) but hardcoded actor | no | yes (232-532) |
| src/components/trainer/TrainerLogin.html | trainer login, reset | no (login) | no | no |
| src/components/trainer/TrainerDashboard.html + trainerDashboard.js | assignments, students, tools, profile | partial (many bare fetch) | yes (names line 334) | no (escapeHtml used consistently) |
| public/js/auth.js | auth wrapper (localStorage authToken) | n/a | no (logs migration msgs) | no |
| public/js/config.js | config only | n/a | no (dev only) | no |
| src/components/units/courseUnits.js, unitAssignment.js | empty files | n/a | n/a | n/a |

## Dependency inventory

CVE data requires the operator to run `npm audit` (not run here; no CVE numbers invented).

| Package | Version | Notes / Status | Known vulnerabilities |
|---|---|---|---|
| express | ^5.1.0 | Express 5 recently stable; required custom sanitizer due to read-only `req.body`; shorter post-release track record | Run `npm audit` |
| cors | ^2.8.5 | Mature; correctly origin-restricted in prod (note SEV-L-047) | Run `npm audit` |
| helmet | ^7.1.0 | Current; **CSP disabled in app** (SEV-M-025) | Run `npm audit` |
| jsonwebtoken | ^9.0.2 | Current stable; verify `algorithms:['HS256']` is pinned in `jwt.verify` | Run `npm audit` |
| mongoose | ^7.6.0 | One major behind (8.x); still patched; ensure strict casting | Run `npm audit` |
| multer | ^2.0.2 | Current major; app-level validation gaps (SEV-H-011) | Run `npm audit` |
| nodemailer | ^6.10.1 | Current stable; TLS now correct in live code (SEV-I-054) | Run `npm audit` |
| bcryptjs | ^3.0.2 | Pure-JS; slower; consider native `bcrypt` (SEV-L-040) | Run `npm audit` |
| dotenv | ^16.6.1 | Current; `.env` is gitignored (verified) | Run `npm audit` |
| express-rate-limit | ^7.4.0 | Current; not applied to admin auth router (SEV-M-021) | Run `npm audit` |
| @aws-sdk/client-s3 | ^3.919.0 | Current; env-sourced creds; S3 ACL `private` (good) | Run `npm audit` |
| @aws-sdk/lib-storage | ^3.919.0 | Current | Run `npm audit` |
| @aws-sdk/s3-request-presigner | ^3.919.0 | Current; no expiry cap (SEV-H-011) | Run `npm audit` |

Missing/weak security middleware: no CSP (disabled), no `hpp`, no schema-based input validation library; authorization is ad hoc per route with a dead central policy file.

## Issues found but out of scope

- **No automated tests** anywhere in the repository; no CI security gates (lint/secret-scan/`npm audit`). Stated once here, not as a security finding.
- 6,062-line monolithic `server.js` mixing models, seeding, routing and HTML serving; a single `src/routes/` file — high maintenance risk and a reason auth is applied inconsistently.
- Duplicated `verifyToken` logic (shared `auth.js` vs local `adminAuth.js`) with divergent behaviour; backward-compat aliases (`authenticateToken`, `requireAuth`).
- `temp_diff.txt` (2 MB) and prior audit/guide markdown are committed scratch artifacts; repo hygiene is poor (dead `*.OLD.html`, `staff.html`, `form.html`).
- Inconsistent role lists across `AdminStaff`, `AuditLog`, `LoginOTP`, `Notification`, `verifyOwnership` (e.g. `cibec` bypasses ownership but is not a valid `AdminStaff` role).
- bcrypt cost-factor inconsistency (10 vs 12) and model-layer `console.log`/silently-swallowed errors (`TrainerAssignment.js`).

## Recommended fix order

1. **Remove `express.static('.')` and purge `temp_diff.txt`** (file + git history); switch static serving to an explicit allowlist. (SEV-C-003)
2. **Add `verifyToken`+`authorize`(+ownership) to every state-changing endpoint**; source `reviewedBy`/`createdBy`/audit actor from `req.user` only. (SEV-C-002, SEV-H-008)
3. **Remove model password defaults; hash all passwords (bcrypt ≥12) including Trainer**; force first-login change for every role. (SEV-C-004, SEV-C-005, SEV-H-018)
4. **Fix the OTP flow**: count failed attempts atomically, hash OTP/token at rest, use `crypto.randomInt`, and rate-limit the admin auth router. (SEV-C-001, SEV-H-017, SEV-M-021)
5. **Fix object-level authorization**: expose `admissionNumber` in `req.user`, narrow the bypass list, add ownership to the IDOR routes. (SEV-H-006, SEV-H-007)
6. **Stop serving `/uploads` statically**; serve files via an authenticated, ownership-checked, content-validated endpoint; sanitize filenames/keys. (SEV-H-012, SEV-H-011)
7. **Enable a strict CSP, escape all API data before DOM insertion, move tokens to HttpOnly cookies.** (SEV-M-025, SEV-H-010, SEV-M-027)
8. **Replace phone-number student credentials** with a random one-time password and forced change; remove the scheme from the letter/README; stop logging the initial admin password. (SEV-H-014, SEV-H-015)
9. **Convert money/grades to integer/Decimal128 and use atomic updates/transactions** for balance and unit registration. (SEV-H-016)
10. **Add per-account lockout, token revocation/short expiry, and remove PII/secret logging.** (SEV-M-020, SEV-H-013, SEV-M-026)

## Notes on methodology

- **Read in full by me**: `package.json`, `src/config/config.js`, `src/config/endpointSecurity.js`, `src/middleware/auth.js`, `.gitignore`, `.npmrc`, `env.example`, `vercel.json`, `.vercelignore`, `public/js/config.js`, `public/js/auth.js`; targeted-verified ranges of `server.js` (multer filter, helmet/CORS, static blocklist 391–467, `express.static('.')` 5227, the unauthenticated PATCH routes 3357/4464/5073, dashboard route 915).
- **Read by specialist sub-agents and cross-checked**: full `server.js` (6,062 lines, chunked), `src/routes/adminAuth.js`, all 20 files in `src/models/`, all 22 HTML files, all `src/components/**/*.js` and `public/js/*.js`, `src/utils/emailService.js`, `src/utils/s3Service.js`, `src/data/*`, `README.md`, `CHANGES.md`. The five highest-severity claims were independently re-verified by direct file reads before inclusion.
- **Skimmed / sampled**: very large client files (`hodDashboard.js` 1,965; `trainerDashboard.js` 2,093; `studentPortal.js` 1,693) were read in sections targeting auth, logging and DOM-sink patterns; line anchors are representative, not exhaustive of every occurrence.
- **Not assessed (state-dependent or out of policy)**: live database contents (whether default-password documents actually exist, whether `Unit.unitCode` duplicates exist, whether uploaded files are present on disk vs S3); runtime behaviour of the static blocklist vs all root files beyond those checked; actual CVEizable dependency versions (operator must run `npm audit`); production environment variables and the deployment proxy topology (affects SEV-L-039); whether `debug.html` exists/contains sensitive data. The application was not run and no source was modified, per the rules of engagement.
- **Confidence**: unauthenticated-endpoint, static-root, plaintext-password, default-password and OTP-brute-force findings were directly verified and are high-confidence. Items marked Low/Informational include the stated uncertainty. Line numbers reflect the working tree at audit time and will drift with edits.
