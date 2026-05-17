# Stage 1 Report — Critical Findings Remediation

Date: 2026-05-16
Scope: SEV-C-001 through SEV-C-005 only. No High/Medium/Low/Informational issues were touched. server.js was not refactored into modules. No dependencies were added (only the already-present `express-rate-limit` and the Node built-in `crypto` were used).

All modified files pass `node --check`:
`node --check server.js src/routes/adminAuth.js src/models/AdminStaff.js src/models/HOD.js src/models/Trainer.js src/middleware/auth.js` → **PASSED**
(also checked: `src/models/LoginOTP.js`, `src/models/PasswordReset.js`, `scripts/migrate-trainer-passwords.js` → **PASSED**)

---

## 1. Per-finding sections

### SEV-C-001 — OTP brute force

**Files changed:** `src/routes/adminAuth.js`, `src/models/LoginOTP.js`, `src/models/PasswordReset.js`

- **`src/routes/adminAuth.js`**
  - Added `const rateLimit = require('express-rate-limit');` and a router-level limiter `adminAuthLimiter` (10 requests / 15 min per IP, standard headers) mounted with `router.use(adminAuthLimiter)` immediately after the router is created — so it covers the **entire** `/api/admin/auth/*` surface (login, verify-otp, update-email-send-otp, and every future route), not individual routes.
  - Rewrote the `verify-otp` handler (`POST /verify-otp`). It no longer queries by `{email, otp}`. It now:
    - Looks up the most recent unconsumed, unexpired OTP **by email only** (`LoginOTP.findOne({ email, isUsed:false, isVerified:false, expiresAt:{$gt:now} }).sort({createdAt:-1})`).
    - If the record exists but `canAttempt()` is false (cap reached / used / expired), consumes it (`isUsed = true`) and returns the generic `Invalid or expired OTP`.
    - Compares the supplied OTP; on mismatch calls `incrementAttempts()` (atomic), and once `otpAttempts >= 5` sets `isUsed = true` so all further attempts — correct or not — fail. Returns the generic message.
    - On match, the original success path is **unchanged** (staff lookup, `markAsVerified`, `updateLastLogin`, JWT issuance).
  - The email-sending behaviour and the success/JWT path were not modified.
- **`src/models/LoginOTP.js`**
  - Added `const crypto = require('crypto');`.
  - `incrementAttempts()` is now atomic: it performs `findOneAndUpdate({_id}, {$inc:{otpAttempts:1}}, {new:true})` and reflects the new count back onto the in-memory document (previous version was a non-atomic read-modify-`save()` that could race past the cap under concurrency).
  - `generateOTP()` now returns `crypto.randomInt(100000, 1000000).toString()` (was `Math.floor(100000 + Math.random()*900000)`).
- **`src/models/PasswordReset.js`**
  - Added top-level `const crypto = require('crypto');` (and removed the redundant inner `require('crypto')` in `generateResetToken`).
  - `generateOTP()` now returns `crypto.randomInt(100000, 1000000).toString()`.

**Not done / notes:** `LoginOTP.findValidOTP` and `canAttempt()` were left in place (still used as the cap gate). `PasswordReset.incrementAttempts` was left unchanged — only its `generateOTP` was in scope.

---

### SEV-C-002 — Unauthenticated state-changing endpoints

**File changed:** `server.js`

Middleware added to the five routes (handlers otherwise unchanged except actor fields):

| Route | Middleware added |
|---|---|
| `PATCH /api/students/:id` | `verifyToken, authorize('admin','registrar')` |
| `PATCH /api/tools/:toolId/status` | `verifyToken, authorize('admin','deputy')` |
| `PATCH /api/ilo/applications/:type/:applicationId/status` | `verifyToken, authorize('admin','ilo','registrar')` |
| `PATCH /api/notifications/:notificationId/read` | `verifyToken, authorize('admin','student','trainer','hod','registrar','finance','dean','deputy','ilo','cibec')` |
| `PATCH /api/notifications/:userId/read-all` | `verifyToken, authorize(<same 10-role list>), verifyOwnership('userId')` |

Actor fields no longer sourced from a hardcoded string:
- `PATCH /api/tools/:toolId/status`: `tool.reviewedBy = 'deputy_academics'` → `tool.reviewedBy = req.user.userId`; the adjacent `console.log` literal `reviewedBy:'deputy_academics'` → `req.user.userId`.
- `PATCH /api/ilo/applications/:type/:applicationId/status`: `application.reviewedBy = 'ilo_office'` → `application.reviewedBy = req.user.userId`.
- `PATCH /api/students/:id` and the two notification routes contain **no** `reviewedBy/createdBy/updatedBy` field sourced from the body or a constant, so there was nothing to replace there.

`verifyToken`, `authorize`, `verifyOwnership` are the existing middleware already imported and used throughout server.js — no new imports.

**Not done / notes (deliberately out of scope):** `PATCH /api/students/:id` accepts `req.body` wholesale into `findByIdAndUpdate` (mass-assignment / the year-promotion balance write). Field whitelisting and the float-money balance issue are separate (High/SEV-H) findings and were **not** changed in this pass, per scope discipline. They remain open.

---

### SEV-C-003 — Repository root served as static content

**Files changed:** `server.js`, `.gitignore`; **files deleted:** `temp_diff.txt`, `src/staff.html`, `src/form.html`

- `server.js`: removed `app.use(express.static('.'));` (replaced with an explanatory comment). The remaining static mounts are unchanged and cover all client assets:
  - `app.use('/uploads', express.static('uploads'))`
  - `app.use('/public', express.static(path.join(__dirname,'public')))`
  - `app.use('/src/components', express.static(path.join(__dirname,'src','components')))`
  - `app.use(express.static(path.join(__dirname,'src','components'), {...}))` (serves the dashboard JS/HTML at root paths, e.g. `/admin/adminDashboard.js`)
  - Plus the explicit `app.get('/<role>/login'|'/<role>/dashboard', ...)` routes that `sendFile`/`serveHTML` each page.
  These collectively serve every asset the frontend requests; no new mount was required because nothing the frontend needs lives in the project root.
- `.gitignore`: added a section ignoring `temp_diff.txt` and `*.diff`.
- Deleted from the working tree: `temp_diff.txt`, `src/staff.html`, `src/form.html`.
- No `*.OLD.html`, `*.bak`, `*.backup`, or `src/components/units/INSTRUCTIONS.TXT` exist in the working tree (searched; none present — the audit's `admin-login.OLD.html` was a diff artifact, not a tracked file here).

**Operator action required (cannot be done from code):** `temp_diff.txt` is still in git history. The operator must purge it:
`git filter-repo --path temp_diff.txt --invert-paths` (or BFG Repo-Cleaner), then force-push and have all clones re-clone. Deleting the working-tree file does **not** remove it from history.

---

### SEV-C-004 — Default passwords in model schemas

**Files changed:** `src/models/AdminStaff.js`, `src/models/HOD.js`, `src/models/Trainer.js` (Trainer field also covered under SEV-C-005), `server.js`

- `AdminStaff.js`: removed the `default: function(){ return 'Admin@2024'; }` from `password`. Field remains `required: true`. Pre-save hashing hook unchanged.
- `HOD.js`: removed `default: 'HOD'` from `password`. Field remains `required: true`. Pre-save hashing hook unchanged.
- `Trainer.js`: `password` is now `required: true` with **no default** (and `select: false` — see SEV-C-005).

**Codebase search for creators without an explicit password** (`new AdminStaff`/`new HOD`/`new Trainer`, `.create`, `insertMany`):
- `server.js:~1509` `new AdminStaff({...})` (admin seeding): already sets `password: initialPassword` explicitly. No change needed.
- `server.js:~1362` `new HOD({...})` (HOD seeding): already sets `password: 'HOD'` explicitly. Per the literal SEV-C-004 scope (remove schema default, make required, fix creators that don't set a password) this creator **does** set a password explicitly, so it was left as-is. The weak value `'HOD'` itself is a separate, non-Critical credential-strength concern and is **out of scope for this pass** — flagged here for visibility.
- `server.js:~1185` `new Trainer(trainerData)` (trainer seeding): `trainerData` from `parseTrainersFile()` has **no** password. Previously the removed `'trainer123'` default filled it. Updated to set an explicit unique strong random password per seeded trainer: `password: \`Aa1!${crypto.randomBytes(18).toString('base64').replace(/[+/=]/g,'A')}\`` (hashed by the new Trainer pre-save hook). It is intentionally not logged. (`crypto` is already required at `server.js:13`.)
- No other creators exist (no `.create`/`insertMany` for these three models).

---

### SEV-C-005 — Trainer plaintext passwords

**Files changed:** `src/models/Trainer.js`, `server.js`; **file added:** `scripts/migrate-trainer-passwords.js`

- `src/models/Trainer.js`:
  - Removed the comment `// Note: Password is stored as plain text as per requirements`.
  - `password` field: `required: true`, **no default**, `select: false`.
  - Replaced the timestamp-only pre-save hook with a bcrypt hashing hook **identical in behaviour to AdminStaff** (`if (!this.isModified('password')) return next();` then `bcrypt.genSalt(12)` + `bcrypt.hash`, sets `updatedAt`). Trainer has no `lastPasswordChange` field so that line is not present (matches the Trainer schema).
  - Rewrote `comparePassword` to `return await bcrypt.compare(candidatePassword, this.password);`.
- `server.js` — because `Trainer.password` is now `select:false`, three query sites that are followed by a document `.save()` would otherwise fail Mongoose `required` validation. Added `.select('+password')` to exactly these three (each annotated with a `SEV-C-005` comment):
  - `~line 1163` `Trainer.findOne({ email: trainerData.email })` in `initializeTrainers` (followed by `existingTrainer.save()`). This is inside the SEV-C-004 creator-fix code path.
  - `~line 2766` `Trainer.findOne({ email, isActive })` in `POST /api/trainers/login` (needed for `bcrypt.compare` and the subsequent `updateLastLogin().save()`). Explicitly permitted by scope ("strictly required to keep the affected logins working").
  - `~line 2996` `Trainer.findById(trainerId)` in the trainer profile update (followed by `trainer.save()` at the end of the handler).
  - The reset-password path (`server.js:~775`, `Trainer.findById` then `user.password = newPassword; user.save()`) was **not** changed: it assigns the password before save, so `required` passes and the new pre-save hook now correctly hashes the reset password (a positive side effect, no code change needed).
- `scripts/migrate-trainer-passwords.js` (new one-shot migration):
  - Connects with `mongoose.connect(config.mongodbUri)` (same config as the app).
  - Loads trainers with `.select('+password')`, skips any whose password already matches `/^\$2[aby]\$/` (idempotent), hashes the rest with `bcrypt.hash(pw, 12)`.
  - Writes via `Trainer.updateOne(...)` (not `doc.save()`) so the model pre-save hook does **not** double-hash.
  - Logs **only counts** (total / migrated / already-hashed / empty / failed) — never a plaintext value or a hash. Exits non-zero if any document failed.
  - Header documents that it must be run once after deploying the code change and that a maintenance window (no trainer logins/edits during the brief run) is required.

**Could not fully isolate within the 5 routes / model files:** the three `.select('+password')` additions touch `server.js` outside the five SEV-C-002 routes. This was unavoidable: SEV-C-005 mandates `select:false`, and without these three additions the mandated change would break trainer login (in scope to keep working), the trainer seeding save (SEV-C-004 path), and trainer profile update (a pre-existing working feature — a regression I was required to avoid introducing). The changes are minimal, localized, and annotated. No other behaviour was altered. This did not require a STAGE1_BLOCKERS.md because the change could be completed without modifying any other finding's logic.

---

## 2. Breaking changes for operators

Before/with deploying this change, the operator MUST:

1. **`npm install`** — run it to be safe. No new dependency was added (`express-rate-limit` was already in `package.json`; `crypto` is a Node built-in), but running install is harmless and recommended.
2. **Run the trainer password migration exactly once, after deploying the code:**
   `node scripts/migrate-trainer-passwords.js`
   Do this in a maintenance window with no trainer logins/profile edits in flight. Until it completes, **all trainer logins will fail** (bcrypt comparing against stored plaintext returns false). The script is idempotent — safe to re-run.
3. **Purge `temp_diff.txt` from git history** (the working-tree file was deleted, but history still contains it, with default credentials and full source):
   `git filter-repo --path temp_diff.txt --invert-paths` (or BFG), then force-push; all clones must re-clone. Treat the leaked `Admin@2024` default and the placeholder JWT secret as compromised — rotate `JWT_SECRET` and any real admin credentials.
4. **Re-seed / reset trainer credentials as needed.** Newly auto-seeded trainers (from `trainers.txt`, if used) now get a unique random password that is never logged; those accounts cannot be logged into until the operator sets/communicates a password via the existing password-reset flow. Existing trainers are handled by the migration in step 2.
5. **Admin/HOD seeding now requires an explicit password.** Existing seeders already pass one, so no action is needed for the default flow — but any custom script/migration/test that created `AdminStaff`/`HOD`/`Trainer` documents relying on the old schema default will now throw `Path 'password' is required`. Update such scripts to set a password explicitly.
6. **Note the stricter admin auth rate limit:** `/api/admin/auth/*` is now capped at 10 requests / 15 min / IP. Shared-NAT environments (e.g. a whole campus behind one egress IP) may hit this during legitimate bursts; adjust `adminAuthLimiter` in `src/routes/adminAuth.js` if the deployment topology requires it.

---

## 3. Manual verification checklist

**SEV-C-001 (OTP brute force):**
- Log in as an admin to reach the OTP step. Enter a wrong OTP 5 times; on the 6th attempt enter the **correct** OTP — it must still be rejected with "Invalid or expired OTP" (record locked after 5 fails).
- Repeat but enter the correct OTP on the 1st attempt — login succeeds normally (success path unchanged, JWT issued).
- Hit any `/api/admin/auth/*` endpoint >10 times within 15 minutes from one IP — the 11th returns HTTP 429 "Too many authentication attempts."
- Trigger an OTP and confirm a 6-digit code is still sent by email (generation switched to `crypto.randomInt`, format unchanged).

**SEV-C-002 (unauthenticated endpoints):**
- `curl -X PATCH <host>/api/students/<id>` with no token → 401. With a `student` token → 403. With an `admin`/`registrar` token → succeeds.
- `PATCH /api/tools/:toolId/status` and `PATCH /api/ilo/applications/:type/:id/status` with no token → 401; with a non-permitted role → 403; with `deputy`/`ilo` (resp.) → succeeds, and the saved `reviewedBy` equals the caller's user id (not `deputy_academics`/`ilo_office`).
- `PATCH /api/notifications/:notificationId/read` with no token → 401.
- `PATCH /api/notifications/:userId/read-all` as a student for **another** user's id → 403 (ownership); for own id → succeeds; as admin for any id → succeeds (admin bypass).

**SEV-C-003 (static root):**
- `curl -i <host>/temp_diff.txt` → 404 (file deleted; root no longer served). Also `curl -i <host>/server.js`, `/.gitignore`, `/CHANGES.md` → not served (404).
- Load each dashboard (admin/hod/trainer/finance/registrar/dean/deputy/ilo/cibec/student) and confirm CSS/JS still load (assets come from `/src/components`, `/public`, and the src/components static mount).
- Confirm `git check-ignore temp_diff.txt` and `git check-ignore foo.diff` both report ignored.

**SEV-C-004 (default passwords):**
- In a scratch DB, attempt to create an `AdminStaff`/`HOD`/`Trainer` document without a password → save rejected with `Path 'password' is required`.
- Fresh-DB admin seeding still works (it passes `initialPassword`); the generated password is printed once as before. (Note: the plaintext-in-logs issue is SEV-H-015, out of this pass.)

**SEV-C-005 (trainer hashing):**
- Before migration: pick a test trainer, confirm the stored `password` is plaintext. Run `node scripts/migrate-trainer-passwords.js`; confirm the summary prints counts and the stored value is now a `$2a$/$2b$/$2y$` hash.
- After migration: trainer login with the original password succeeds (bcrypt compare). Re-run the migration — summary shows 0 newly migrated, all "already hashed" (idempotent).
- Trainer profile update (`PUT /api/trainers/:id/profile` — email/phone) still succeeds and does not corrupt or re-hash the password.
- Trainer password reset via the forgot/reset flow still works and the new password is stored hashed.
- Confirm a normal API response that includes a trainer object does **not** contain the `password` field (`select:false`).

---

## 4. Known regressions

- **Trainer login is broken until the migration runs.** After deploying the SEV-C-005 code, every existing trainer has a plaintext password while the model now does a bcrypt compare → all trainer logins fail until `node scripts/migrate-trainer-passwords.js` completes. This is expected and unavoidable; mitigate with a maintenance window (Breaking change #2).
- **Newly auto-seeded trainers have no usable password.** `initializeTrainers` now assigns each new trainer a unique random password that is never logged (SEV-C-004 — the old `trainer123` shared default was removed). Such accounts cannot log in until an operator sets a password via the password-reset flow. Existing trainers are unaffected (migration handles them).
- **Stricter admin-auth rate limit may throttle legitimate bursts.** `/api/admin/auth/*` is now 10 req/15 min/IP. Multiple admins behind a single shared/NAT IP could be rate-limited during simultaneous logins. Tunable in `src/routes/adminAuth.js`.
- **OTP lockout is now real.** Previously wrong OTPs were never counted; now 5 wrong attempts permanently consume that OTP and the user must restart the login to get a new one. This is the intended fix but is a behavioural change for users who mistype.
- **HOD default password unchanged.** The HOD seeder still explicitly sets `'HOD'` (now hashed by the pre-save hook). This is within SEV-C-004's literal scope (the creator sets a password explicitly), but `'HOD'` remains a weak credential — a separate, non-Critical finding deliberately left for a later pass.
- **No functional regression expected** for: admin login success path, password reset (now additionally hashes trainer/HOD resets correctly), trainer profile/email update, trainer listing, payslip lookups, or the four other dashboards’ data flows. The `.select('+password')` additions were limited to the three Trainer query→save sites and verified by reading every Trainer query/save call site in server.js.

---

### Out-of-scope items observed but intentionally NOT changed (per scope discipline)
- Mass-assignment via `req.body` in `PATCH /api/students/:id` and the float-money year-promotion balance write (SEV-H-016 / SEV-H-007 area).
- Plaintext initial admin password logged to stdout (SEV-H-015).
- `endpointSecurity.js` dead policy, `localStorage` tokens, disabled CSP, `/uploads` static, IDOR set, and all other High/Medium/Low/Informational findings.
- No `server.js` modular refactor; no frontend dashboard changes (no login flow required a frontend change — the affected logins are server-side).
