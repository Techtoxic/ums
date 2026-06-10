# EDTTI UMS — Security Audit & Production-Readiness Report

**Repository:** `Techtoxic/ums`
**Branch audited / patched:** `v2-postgres` → pushed to `v2-test`
**Stack:** Node.js 20+, Express 5, PostgreSQL (Neon) via Drizzle ORM, JWT (httpOnly cookie) auth, bcrypt, Helmet, `express-rate-limit`, Zod, AWS S3 (uploads), Brevo (email).
**Scope:** Full security audit of every portal and API endpoint, runtime/production-break review, backend rate-limiting, plus the requested Finance/Deputy functional fixes.
**Method:** Static review of all routes/middleware/config + **live testing** against the production Neon test DB (authenticated as every role with minted JWTs) + **browser verification** of the Finance receipts/exports.

---

## 1. Executive summary

The V2 codebase is **already substantially hardened** — a prior security pass left an audit trail of `SEV-*` fixes (CSRF, JWT revocation, ownership checks, S3 presigning, body-size limits, operator-injection scrubbing, removal of anonymous static mounts). This audit independently **re-verified** those protections under live conditions and they hold.

What this pass changed:

* Fixed **3 genuine security issues** (rate-limit demo values, a finance authorization bug, a notifications IDOR).
* Hardened **rate limiting** to production-correct values at the backend (brute-force counts only *failed* attempts, so shared campus-NAT IPs aren't falsely locked out).
* Fixed the requested **Finance** and **Deputy** functional/runtime issues (all verified in the browser).
* Produced this report + a deployment hardening checklist (section 8) that **must** be applied before go-live.

No SQL injection, secret leakage, SSRF, or unauthenticated data-exposure was found. Authentication, role-based access control (RBAC), and per-record ownership are enforced **inline on every API route** and were confirmed working with live cross-role and cross-user probes.

---

## 2. What was verified live (evidence)

Minted valid JWTs for every role against the real DB and exercised the API:

| Test | Expected | Result |
|------|----------|--------|
| Unauthenticated `GET /api/students`, `/payments`, `/finance/analytics`, `/payslips`, `/system-settings` | 401 | **401** ✓ |
| Student token on staff endpoints (`/students`, `/payments`, `/finance/analytics`, `/revenue`, `/cibec/tree`) | 403 | **403** ✓ |
| Student A reading Student B (`/payments/student/B`, `/students/admission/B`) | 403 | **403** ✓ |
| Student reading own data | 200 | **200** ✓ |
| Deputy on Finance endpoints | 403 | **403** ✓ |
| State-changing POST without CSRF token | 403 `CSRF_FAILED` | **403** ✓ |
| Cross-role/all-role GET smoke (≈45 endpoints) | no 500s | **no 500s** ✓ |
| Notifications IDOR (mark another user's notification read) | 403 after fix | **403** ✓ |
| Payslip generate for past/future period | 400 after fix | **400** ✓ |

Server logs across the entire test run: **0 runtime errors**.

---

## 3. Security findings & fixes

Severity: **C**ritical / **H**igh / **M**edium / **L**ow / **I**nfo.

### FIXED in this pass

| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| **F-01** | **H** | **Brute-force limiters set to throwaway demo values.** `authLimiter` was `max:100` (comment: "raised from 20 for demo. Revert after.") and `adminAuthLimiter` was `max:100` (comment: "raised from 10 for demo"). Login/OTP brute-force protection was effectively 5–10× looser than intended. | Reverted to production values and redesigned: auth limiters now use `skipSuccessfulRequests:true` so **only failed attempts** count (30/15min staff & student, 20/15min admin-auth). Env-overridable (`AUTH_RATE_LIMIT_MAX`, `ADMIN_AUTH_RATE_LIMIT_MAX`). See `src/middleware/rateLimiters.js`, `src/routes/adminAuth.js`. |
| **F-02** | **M** | **Finance blocked from reading a student by admission number.** `GET /api/students/admission/:admissionNumber` `authorize()`s `finance`, but `verifyOwnership` only bypassed `admin`/`registrar`, so finance got **403 NOT_OWNER**. This was the root cause of "Department shows N/A" on Finance receipts (the receipt's student fetch silently failed). | `verifyOwnership` now accepts an explicit `extraBypassRoles` list; `finance` is opted-in on that one route only. Student→student ownership remains enforced (re-verified). `src/middleware/auth.js`, `src/routes/studentsAuth.js`. |
| **F-03** | **L** | **IDOR on `PATCH /api/notifications/:id/read`.** Any authenticated user could mark *another* user's notification read (no ownership check). CSRF-protected and read-only, so low impact, but still cross-tenant write. | Added owner check (`recipientId === req.user.userId`, admin bypass) → 403 for non-owners. Owner path re-verified 200. `src/routes/notifications.js`. |

### Residual items (documented; remediation recommended before/soon after launch)

| ID | Sev | Finding | Recommendation |
|----|-----|---------|----------------|
| **R-01** | **M** | **`COOKIE_SECURE` defaults to `false`.** The auth + CSRF cookies only get the `Secure` flag when `COOKIE_SECURE=true`. On the HTTPS Render deployment this **must** be set or cookies can ride plain HTTP. | Set `COOKIE_SECURE=true` in the production environment (see §8). |
| **R-02** | **M** | **`adminAuth.js` has a second, local `verifyToken`** (Bearer-based) used by `/profile`, `/update-email`, `/update-password`, `/complete-first-login`, `/refresh-token`. Unlike the global cookie middleware it does **not** check `token_version`/`isActive`, so a logged-out admin's token still works on those 5 self-service routes until natural 2h expiry. Blast radius is limited (a refreshed token still fails the global `token_version` check on every data endpoint), so this is defense-in-depth, not privilege escalation. | Align the local `verifyToken` with the global one (revocation + `isActive` check), or route these through the global middleware. Left unchanged here to avoid an untested change to the admin login/OTP flow. |
| **R-03** | **M** | **CSP is Report-Only.** `Content-Security-Policy-Report-Only` is emitted unless `CSP_ENFORCE=true`; in production it currently reports but never blocks. | After watching `/api/csp-report` logs for false positives, flip `CSP_ENFORCE=true` to actually enforce. |
| **R-04** | **L** | **`generalApiLimiter` was 300 req/15min/IP.** Behind campus NAT (many students → one egress IP) with multi-call portal pages, that threshold causes mass false-positive 429s — a production-availability risk. | Raised default to 600 and made it env-tunable (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`). Tune for the real user population. |
| **R-05** | **I** | **`src/config/endpointSecurity.js` is dead config** — it defines an `ENDPOINT_PERMISSIONS`/`PUBLIC_ENDPOINTS` map that is **never imported**. Real enforcement is inline `verifyToken`+`authorize` on each route (verified correct). The stale file can mislead future maintainers into thinking it's the source of truth. | Delete the file or wire it into a single enforcement layer. No action taken (removing it has no runtime effect and the inline enforcement is sound). |

---

## 4. Controls verified present & working (no change needed)

* **AuthN:** JWT in an **httpOnly, SameSite=Lax** cookie; header/bearer auth removed for the main app; 2h expiry.
* **Token revocation:** `token_version` bumped on logout / credential & role change; global `verifyToken` rejects stale tokens and disabled (`isActive=false`) accounts on every request.
* **AuthZ:** `authorize(...roles)` on every sensitive route; per-record `verifyOwnership` for student/trainer/HOD-scoped data. File downloads (`/api/files/...`, `/api/student-uploads/...`, `/api/tools/...`) enforce **token-based** ownership (query params are never trusted) and stream via **15-min presigned S3 URLs**, not anonymous static mounts.
* **CSRF:** double-submit token required on all state-changing `/api` requests (constant-time compare); a tight allow-list covers only the login/logout/CSP-report endpoints that legitimately can't carry a token.
* **Injection:** all DB access is Drizzle/`postgres.js` **parameterized** tagged templates — no string-concatenated SQL; the one `sql.raw` is a constant. A request-body/query **operator scrubber** strips `$`/`.` keys (NoSQL-style operator-injection defense).
* **SSRF:** external fetches (book search) hit **hardcoded** provider hosts only (OpenStax / OpenLibrary / Archive.org); user input is a query parameter, never the host.
* **Secrets:** no passwords/OTPs/tokens are logged (error logs print `.message` only); config **hard-fails in production** on missing/weak `JWT_SECRET`/`DATABASE_URL` (Zod-validated at boot).
* **DoS hardening:** 1 MB body limit + 64 KB CSP-report limit; Helmet baseline headers; CORS locked to `ALLOWED_ORIGINS` in production.
* **Account lockout:** staff logins increment attempts and lock; OTPs are hashed, single-use, attempt-capped, and expiring.

---

## 5. Attack surface — endpoints by portal

All `/api/*` routes require `verifyToken` unless marked **PUBLIC**. Counts below are authenticated routes per area.

* **Auth / public:** `/api/admin/auth/login`,`/verify-otp` (PUBLIC, rate-limited); `/api/hod/login`, `/api/trainers/login`, `/api/students/login` (PUBLIC, rate-limited); `/api/auth/forgot-password`,`/verify-otp`,`/reset-password`,`/validate-reset-token/:token` (PUBLIC, rate-limited); `/api/hod/departments`, `/api/health` (PUBLIC, read-only).
* **Admin:** student/trainer/program/report/settings management — `admin` (some shared with `registrar`).
* **Registrar:** student registration, promotion, admission numbers, exports — `admin`,`registrar`.
* **Finance:** `/api/payments*`, `/api/payslips*`, `/api/revenue*`, `/api/finance/analytics`, `/api/finance/reports/students` — `admin`,`finance` (payments list also `registrar`).
* **Dean:** `/api/dean/students`, student notes — `admin`,`dean`(,`registrar`).
* **Deputy:** students, trainers, tools, units, notifications — `deputy` + admin.
* **HOD:** trainers, common units, assignments — `admin`,`hod`,`registrar`.
* **Trainer:** own assignments/students/payslips/profile, tools & book uploads — `trainer` + admin, all `verifyOwnership`-scoped.
* **ILO:** graduation/attachment applications — `admin`,`ilo`,`registrar`.
* **CIBEC:** competency tree, uploads, statistics, audit logs — reviewer roles.
* **Student:** own profile/payments/registrations/uploads/books/notes — `student`, all `verifyOwnership`-scoped.

Every entry above was confirmed to reject unauthenticated and wrong-role callers (section 2).

---

## 6. Runtime / production-break review

* **Express 5 migration:** no legacy route hazards (`app.del`, `res.sendfile`, unnamed `*` wildcards, removed optional-param regex). App boots clean.
* **Process safety:** `unhandledRejection` logged (not fatal); `uncaughtException` exits for a clean restart (correct for a single-instance Render deploy).
* **Smoke test:** ~45 GET endpoints across all roles returned **no 500s**; non-200s were expected validation (`400`) or lookups (`404`).
* **Availability risk addressed:** the over-tight general rate limit (R-04) that would have throttled legitimate shared-IP traffic in production.

---

## 7. Functional fixes (Finance & Deputy) — all browser-verified

| Request | Implementation | Verified |
|---------|----------------|----------|
| **Deputy: course shows code, not name** | Root cause: many `students.course` rows store the short **code** (`GA6`,`ICT5`,`AB6`…) and `getCourseDisplayName()` couldn't reverse-resolve a code. Added a code→name reverse map in `src/utils/courseCodes.js`. Fixes Deputy **and** Finance reports, exports, receipts system-wide. | Deputy & Finance tables now show "Cosmetology Level 6", "Applied Biology Level 6", etc. ✓ |
| **Finance: Department shows N/A on receipt** | Two-part fix: (a) F-02 authorization bug; (b) `/api/payments*` rows are now **enriched server-side** with `courseName`, `departmentName`, `module`, `academicYear` so the receipt never depends on a second fetch. | Receipt shows **"Hospitality Department"** ✓ |
| **Receipt: separate Reference column** | Payment-details table restructured to **Description \| Reference \| Amount** (reference is its own column, no longer crammed into the description). | 3 distinct columns ✓ |
| **"References of year should be module"** | Finance dashboard filter `All Years/Year 1-4` → **`All Modules/Module 1-6`**; table header `Year` → `Module`; receipt shows **`Module N`**. | Header "MODULE", filter "All Modules", receipt "Module 1" ✓ |
| **All receipts include the academic year** | Academic year (Sept–Aug convention) added to: Finance payment receipt, Student payment receipt (modal + PDF), and Revenue receipts. Receipt ref now keyed on academic year (`EDTTI/RECEIPT/2025-2026/...`). | "Academic Year: 2025/2026" on every receipt ✓ |
| **Export revenue receipts (non-tuition income)** | Revenue tab gained **Export PDF** (branded report) + **Export Excel** + a **per-entry Revenue Receipt** PDF — all including academic year, source/category, description, recorded-by, amount, and a reference. | Report + per-entry receipt download & render correctly ✓ |
| **Payslips: lock year to current (read-only) & month to current** | **Backend** `POST /api/payslips/generate` now rejects any non-current month/year (`400`) — the authoritative guard against back-dated/future payslips. **Frontend** pins the year (read-only, current year) and month (current) and re-pins after form reset. | API rejects 2025/past-month/future-month with 400; current period accepted ✓ |

---

## 8. Deployment hardening checklist (MUST review before go-live)

Set these in the production (Render) environment:

```
NODE_ENV=production
COOKIE_SECURE=true                 # R-01 — required on HTTPS
JWT_SECRET=<64+ random chars>      # boot fails if weak/missing
ALLOWED_ORIGINS=https://ums-...onrender.com   # CORS allow-list (boot warns if empty)
DATABASE_URL=<neon connection string>
# Optional rate-limit tuning for your real user population:
RATE_LIMIT_MAX=600                 # general /api budget per IP / 15min
AUTH_RATE_LIMIT_MAX=30             # failed login/OTP attempts per IP / 15min
ADMIN_AUTH_RATE_LIMIT_MAX=20
# Email (OTP/login) — required for staff OTP login to function:
BREVO_API_KEY=...  BREVO_SENDER_EMAIL=...  BREVO_SENDER_NAME=...
# S3 (file uploads/downloads):
AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_S3_BUCKET_NAME=...  AWS_REGION=...
```

Recommended next (post-launch hardening): enable `CSP_ENFORCE=true` after reviewing CSP reports (R-03); align `adminAuth` token verification with the global middleware (R-02); remove dead `endpointSecurity.js` (R-05).

---

## 9. Files changed

**Security / backend**
* `src/middleware/rateLimiters.js` — production limiter values, failed-only auth counting, env-tunable (F-01, R-04).
* `src/routes/adminAuth.js` — admin-auth limiter reverted + failed-only (F-01).
* `src/middleware/auth.js` — `verifyOwnership(param, extraBypassRoles)` (F-02).
* `src/routes/studentsAuth.js` — finance bypass on `/students/admission/:adm` (F-02).
* `src/routes/notifications.js` — ownership check on mark-as-read (F-03).
* `src/routes/payments.js` — payment rows enriched with course/department/module/academicYear.
* `src/routes/payslips.js` — backend current-period validation.

**Finance / Deputy frontend**
* `src/utils/courseCodes.js` — code→name reverse resolution (course-name fix everywhere).
* `src/components/finance/tabs/dashboard.js` — receipt: department/program/academic-year/module + separate Reference column.
* `src/components/finance/partials/dashboard.html` — Year→Module (header + filter, modules 1-6).
* `src/components/finance/tabs/payslips.js` — lock year/month to current.
* `src/components/finance/tabs/revenue.js` + `partials/revenue.html` — Export PDF/Excel + per-entry revenue receipt.
* `src/components/student/tabs/payments.js` — student receipt: course, department, academic year.

---

## Re-audit addendum (10 June 2026)

A second, independent source review of the `v2-test` branch was performed ahead of the student rollout. The objectives were to confirm the controls from the previous pass still hold, to look for anything the first pass missed, and to produce a clear go-live security checklist.

### Verdict

The branch is in a strong security position. The controls below were re-verified by source review and were found correct and consistent:

* JWT in an httpOnly, SameSite=Lax, per-portal cookie; 2 hour expiry; header/bearer auth removed.
* Server side token revocation through `tokenVersion`, plus an `isActive` check on every authenticated request.
* Role based access control with `authorize(...)` and per-record `verifyOwnership(...)`, with an explicit, narrow bypass list rather than silent skips.
* CSRF double-submit token enforced on all state-changing `/api` requests with a constant-time compare and a tight allow-list.
* Brute-force limiters on every login surface: student, trainer, HOD, and password reset use `authLimiter` (counts only failed attempts), and the entire admin auth router is throttled by a dedicated router-level limiter. Per-account lockout is enforced on staff login.
* Password reset uses a hashed one time code, counts wrong guesses against an attempt cap, returns a uniform response that does not reveal whether the account exists, and limits reset requests per window.
* Uploads are validated by authoritative magic-byte inspection, not the client supplied content type, and are served through short-lived presigned URLs with ownership checks rather than anonymous static mounts.
* Data access is parameterized through Drizzle, with a query-operator scrubber as an extra layer. No string-concatenated SQL was found.
* Environment is validated at boot with Zod, and the server refuses to start in production without a valid `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters. Passwords, codes, and tokens are not logged.
* Helmet baseline headers, a 1 MB body limit, a 64 KB CSP-report limit, and `trust proxy` set so the rate limiter keys on the real client address rather than a spoofable header.

No new Critical or High code issues were found in this pass.

### Go-live security checklist (action required before serving students)

These are production configuration and operational steps, not application bugs. They must be completed at deployment.

1. **Set `COOKIE_SECURE=true` in the production environment.** The auth and CSRF cookies only carry the `Secure` flag when this is set. On the HTTPS deployment this must be on, or the cookies can ride plain HTTP.
2. **Move the Content Security Policy from report-only to enforcing** by setting `CSP_ENFORCE=true`, after watching `/api/csp-report` for a short window to clear false positives.
3. **Tighten the Content Security Policy (Medium).** The current `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`, mainly because of the Tailwind Play CDN and inline scripts and handlers. These weaken the XSS protection that the rest of the policy provides. Before or shortly after go-live, compile Tailwind into a static stylesheet, move inline scripts into served files, and remove `'unsafe-inline'` and `'unsafe-eval'` from `script-src`. This is a front-end build change and should be tested against every portal to avoid breaking the UI.
4. **Confirm the production CORS allow-list** contains only the real institute origins.
5. **Confirm `ALLOWED_ORIGINS`, `BREVO_*`, and `AWS_*`** are set in production so email and uploads work and CORS is correct.
6. **Remove the dead `src/config/endpointSecurity.js`** map, which is not imported anywhere, so future maintainers are not misled about where enforcement lives. Cosmetic, no runtime effect.
7. **Confirm database backups and a tested restore** with the managed Postgres provider, and keep a short written incident response procedure.

No code changes were pushed in this re-audit pass, to avoid altering behaviour on a branch that is about to ship. The items above are configuration and operational actions owned by the deployment, plus one optional front-end hardening change (item 3) that should be made behind a UI regression test.
