# Stage 2A Report — High-Severity Findings Remediation

Date: 2026-05-16
Scope: SEV-H-006, SEV-H-007, SEV-H-008, SEV-H-013, SEV-H-014, SEV-H-015, SEV-H-016, SEV-H-017, SEV-H-018, SEV-H-019. No Medium/Low/Informational work. server.js was not modularised. Frontend changes were limited to the three explicitly permitted ones.

Syntax: `node --check` was run after every finding and once over **every** `.js` file in the project (excluding node_modules/.git) — **ALL JS SYNTAX OK**.

No new dependencies were added (only `crypto`, `mongoose`, `express-rate-limit` already present were used).

---

## 1. Per-finding sections

### SEV-H-006 — Broken object-level authorization

**Files:** `src/middleware/auth.js`, `src/config/config.js`, `src/routes/adminAuth.js`, `server.js` (login token payloads)

- `verifyToken` now copies `admissionNumber`, `staffId` and `tokenVersion` from the decoded JWT into `req.user` (previously only `userId,email,role,userType`). The dead `admissionNumber` branch in `verifyOwnership` now actually works.
- `verifyOwnership` admin-bypass list narrowed from `['admin','registrar','dean','finance','deputy','cibec','ilo']` to **`['admin','registrar']`**.
- Confirmed student login (`server.js` `/api/students/login`) already embeds `admissionNumber`; it now also embeds `tokenVersion` and `firstLoginRequired`. HOD/trainer/admin tokens now embed `tokenVersion`. No other login-handler logic changed.

**Routes whose semantics changed because of the narrowed bypass** (these roles can no longer reach other users' data via silent ownership bypass; not re-added, per instruction — flagged for product review):

| Route | `authorize()` roles | Effect of narrowed bypass |
|---|---|---|
| `GET /api/students/admission/:admissionNumber` (now + `verifyOwnership`) | admin,registrar,finance,student | **finance can no longer look up an arbitrary student by admission number** (was relied on for payments workflow) |
| `GET /api/payments/student/:studentId` (`verifyOwnership`) | admin,finance,student | **finance can no longer read another student's payment history** via bypass |
| `GET /api/common-unit-assignments/trainer/:trainerId` (now + `verifyOwnership`) | admin,registrar,hod,trainer | **hod can no longer read an arbitrary trainer's assignments** |
| `GET /api/trainers/:trainerId/assignments` and `/students` (`verifyOwnership`) | admin,hod,registrar,trainer | **hod** loses bypass (registrar/admin still bypass; trainer = owner) |
| `GET /api/notifications/:userId` (`verifyOwnership`) | admin,student,trainer,hod,registrar,cibec,ilo | **cibec, ilo, hod** lose bypass to other users' notifications |
| `PUT /api/students/:studentId/notes/:noteId/read` (`verifyOwnership`) | admin,dean,student | **dean** loses bypass |
| `PUT /api/hod/:hodId/profile` (`verifyOwnership`) | admin,hod | unaffected (admin bypass, hod=owner) |
| `GET /api/trainers/:trainerId/payslips` (`verifyOwnership`) | admin,finance,trainer | **finance** loses bypass to other trainers' payslips (admin still bypasses; trainer=owner) |

These are intentional per the instruction ("they must do it through routes that explicitly authorize them, not by silently bypassing ownership"). They will degrade those back-office workflows until dedicated, explicitly-authorized routes are built (deferred — see §5).

### SEV-H-007 — IDOR across student/trainer/upload endpoints

**File:** `server.js`. All seven endpoints fixed:

| Endpoint | Fix |
|---|---|
| `GET /api/students/admission/:admissionNumber` | added `verifyOwnership('admissionNumber')` (admin/registrar bypass) |
| `POST /api/students/register-units` | `studentId` (an admission number) from body must equal `req.user.admissionNumber` unless role ∈ {admin,registrar}; else 403. Deviation noted: the instruction said compare to `req.user.userId`, but this endpoint keys students by admission number (`Student.findOne({admissionNumber:studentId})`), and `userId` is the Mongo `_id`; comparing to `admissionNumber` is the correct ownership check (matching `userId` would block every student). |
| `DELETE /api/student-uploads/:uploadId` | removed the `req.query.studentId` trust; loads the upload, compares `upload.studentId` to `req.user.admissionNumber`; admin/registrar/cibec bypass. 403 for both not-found and not-owner (no existence leak). |
| `GET /api/student-uploads/:uploadId/download` | same pattern; removed unused `req.query.userId/userType`. 403 for both cases. |
| `POST /api/tools/upload` | body `trainerId` must equal `req.user.userId` unless role ∈ {admin,hod}; else 403. |
| `GET /api/common-unit-assignments/trainer/:trainerId` | added `verifyOwnership('trainerId')`. |
| `PUT /api/payslips/:payslipId/view` | loads payslip; `payslip.trainerId` (the trainer email) must equal `req.user.email` unless role ∈ {admin,finance}; 403 for both not-found and not-owner. |

Consistency choice: for the resource-load cases, **403 is returned for both "not found" and "not owner"** so existence is not leaked.

### SEV-H-008 — Audit-log actor from client input

**Files:** `server.js`, `src/models/AuditLog.js`, `src/components/cibec/cibecDashboard.js`, `src/components/finance/financeDashboard.js`

- All six `AuditLog.logAction()` calls in `server.js` now source `userId` from `req.user.userId` and `userType` from `req.user.role` (were `studentId`/`req.query.cibecUserId`/`'cibec'` constants).
- `AuditLog.userType` enum expanded to `['admin','deputy','finance','dean','ilo','registrar','cibec','hod','trainer','student','system']` (partially addresses SEV-M-033).
- `cibecDashboard.js`: removed the `cibec_admin` constant and the `cibecUserId=`/`userId=&userType=cibec` query params from all four request URLs.
- `financeDashboard.js`: removed the `generatedBy:{userId:'finance-admin',...}` block and the now-unused `getFinanceUserData()` call from the payslip-generate request. Required server collateral: `POST /api/payslips/generate` now builds `generatedBy` from `req.user` and no longer requires it in the body (without this the Payslip's required `generatedBy` would fail). `deanDashboard.js:242` also sends a client `userId`, but is **out of the permitted frontend scope**; the server now ignores it for audit purposes anyway — flagged in §5.

### SEV-H-013 — No token invalidation on credential/role change

**Files:** `src/models/{AdminStaff,HOD,Trainer}.js`, inline Student schema in `server.js`, `src/middleware/auth.js`, `src/config/config.js`, `env.example`, all login token payloads.

- `tokenVersion: { type:Number, default:0 }` added to AdminStaff, HOD, Trainer and the Student schema.
- A pre-save hook on each bumps `tokenVersion` when `password`/`email`(/`role` for AdminStaff) is modified on an existing doc. **AdminStaff additionally guards on `!this.isFirstLogin`** — the admin first-login flow changes email then password using a single token and `FirstLogin.html` is not editable in this pass, so bumping mid-setup would lock the user out; the account has no real session to protect until setup completes. After completion, credential/role changes revoke sessions normally.
- `signToken` callers / `jwt.sign` payloads now include `tokenVersion`.
- `verifyToken` is now async: after decoding it loads the owning account (`modelForRole`) selecting `tokenVersion isActive`, and returns **401 `TOKEN_REVOKED`** if the account is missing or the token's `tokenVersion` ≠ the stored one, **401 `ACCOUNT_DISABLED`** if `isActive === false`. One indexed `_id` read per authenticated request. A DB error during this lookup fails closed (401 `AUTH_FAILED`).
- `JWT_EXPIRES_IN` default reduced to `'2h'` in `config.js`; `env.example` updated to `2h`. Refresh tokens are explicitly out of scope (Stage 3 — see §5).

### SEV-H-014 — Student credential is the phone number

**Files:** `server.js` (Student schema, registration, login, new endpoint, guard wiring), `src/middleware/auth.js` (guard), `src/utils/emailService.js` (new method + stub), `src/components/registrar/AdmissionLetter.html`, `README.md`.

- Student schema: added `isFirstLogin`, `mustUpdatePassword` (default true), `tokenVersion`, `password` `select:false`, secret-stripping `toJSON`.
- Registration: `password` is now a strong random 14-char password (`generateStudentInitialPassword()`, `crypto.randomInt`, guaranteed lower/upper/digit/symbol) hashed by the pre-save hook; `isFirstLogin/mustUpdatePassword` set. The password is **emailed** via the new `emailService.sendStudentCredentials()`; the registrar request now also accepts `email`. If the student has no email on file (or send fails), the response returns `initialPassword` **once** with `credentialsEmailed:false` so the registrar can hand it over — never echoed when it was emailed.
- Login: loads `+password`; tries the supplied password as-is, then falls back to the legacy phone-number normalisation (transition — existing students keep working until the migration runs). Issues a token with `tokenVersion` and `firstLoginRequired`; returns `firstLoginRequired` in the body.
- New `POST /api/students/:studentId/first-login-password-change` (`verifyToken`, `authorize('student')`): verifies `oldPassword`, enforces complexity `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$`, rejects reuse of the same password, sets the new password (pre-save hashes + bumps tokenVersion), clears `mustUpdatePassword`/`isFirstLogin`, returns a fresh token.
- New middleware `enforceStudentFirstLogin`, mounted globally `app.use('/api', ...)`: if a student token has `firstLoginRequired`, every `/api/*` request is 403 `FIRST_LOGIN_REQUIRED` except `POST …/first-login-password-change`. No token / non-student → pass-through.
- `AdmissionLetter.html`: the phone-as-password line is replaced with "Your initial password has been sent to your registered email"; the JS that wrote `studentData.phoneNumber` into the password span removed.
- `README.md`: phone-as-password line replaced with the emailed-random-password description.
- Existing student passwords are **not** migrated this stage (transition state — see §4/§5).

### SEV-H-015 — Initial admin password logged

**Files:** `server.js` (`initializeAdminStaff`), `.gitignore`.

- The `GENERATED initial password (visible ONCE)` log is removed. If `INITIAL_ADMIN_PASSWORD` is used: logs only "password sourced from INITIAL_ADMIN_PASSWORD env." If generated: writes the password to `./.seed-credentials.txt` with `{ mode: 0o600 }` (+ best-effort `chmodSync`), logs only that the file was written. On write failure it does **not** fall back to logging the password — it tells the operator to set `INITIAL_ADMIN_PASSWORD` and re-seed.
- `.seed-credentials.txt` added to `.gitignore`.

### SEV-H-017 — OTPs and reset tokens stored in plaintext

**Files:** `src/models/LoginOTP.js`, `src/models/PasswordReset.js`, `src/routes/adminAuth.js`.

- LoginOTP: `otp` → `otpHash` (SHA-256 hex). Module-level `hashOtpValue()`; `statics.hashValue`; a virtual `otp` **setter** so existing `new LoginOTP({otp})` keeps working but only the hash persists; `methods.verifyOtp(raw)`; `findValidOTP` translates a raw `otp` criterion to `otpHash`. Indexes on raw `otp` removed; added `{email:1,createdAt:-1}`. `toJSON` strips `otpHash`. `adminAuth.js` verify-otp compares via `loginOTP.verifyOtp(...)`.
- PasswordReset: `otp`→`otpHash`, `resetToken`→`tokenHash`; module-level `hashResetValue()`; virtual setters for `otp` and `resetToken`; `findValidReset` translates raw `otp`/`resetToken` criteria to the hash fields (so every server.js caller is unchanged). Raw-value indexes removed; added `{email:1,createdAt:-1}`, `{tokenHash:1,isUsed:1}`, `{otpHash:1,isUsed:1}`. `toJSON` strips both hashes.
- Raw OTP/token values are still returned to the caller by `generateOTP()/generateResetToken()` for emailing (the local `resetData.otp` / `otp` variables) — only at-rest storage is hashed.

### SEV-H-018 — Credential fields returned by default

**Files:** `src/models/{AdminStaff,HOD,Trainer}.js`, inline Student schema, `src/routes/adminAuth.js`, `server.js`.

- `password` is `select:false` on AdminStaff, HOD, Trainer (Stage 1), Student. AdminStaff `passwordHistory` is `select:false`. Each model has a `toJSON`/`toObject` transform deleting `password`, `passwordHistory`, `tokenVersion`, `otpHash`, `tokenHash`.
- `.select('+password')` (and `+passwordHistory` where the history is read) added to every site that legitimately needs the secret:
  - `adminAuth.js`: login (`+password +passwordHistory`), update-email-send-otp (`+password`), verify-otp findById (`+password`, for `updateLastLogin().save()`), update-email findById (`+password`), update-password findById (`+password +passwordHistory`), complete-first-login findById (`+password`).
  - `server.js`: HOD login findOne (`+password`), HOD profile findById (`+password`), student login findOne (`+password`), student first-login-password-change findById (`+password`). Trainer's three sites were added in Stage 1.
- `findById(...).save()` paths needed `+password` because Mongoose runs `required` validation for the unselected `password` path on save (the Stage-1 Trainer rationale, applied to AdminStaff/HOD/Student). Reset-password (`server.js`) assigns the new password before save, so `required` passes there without `+password`.

### SEV-H-019 — RegExp built from user input

**File:** `server.js`. Added `escapeRegex()` helper. Fixed:

| Location | Source | Fix |
|---|---|---|
| `/api/students/department/:department` partial match (`new RegExp(courseCodes…)`) | DB course codes (not direct request input) | each code is `escapeRegex`-ed, then the intentional `_`→`.*` wildcard is re-applied (feature preserved, metacharacters neutralised) |
| `/api/students/latest-admission/:courseCode/:intake/:intakeYear` `$regex` | `req.params.courseCode` (+ derived `intakeCode`) | `escapeRegex(courseCode)` / `escapeRegex(intakeCode)` |
| legacy `/api/students/latest-admission/:courseCode` `$regex` | `req.params.courseCode` | same |
| `/api/dean/students` search `$or` (`name/admissionNumber/idNumber/email`) | `req.query.search` | single `safeSearch = escapeRegex(search)` used for all four |

### SEV-H-016 — Money & grades floating-point; balance races

**Models / fields changed to `mongoose.Schema.Types.Decimal128`:**

| Model (file) | Field | Notes |
|---|---|---|
| Program (inline `server.js`) | `programCost` | `min` validator removed (Decimal128 has no numeric min validator); route-level `programCost <= 0` check retained in POST/PUT |
| Payment (inline `server.js`) | `amount` | `min:[1,…]` removed; positivity still enforced by payment-mode validation flow; written via `toDecimal128(amount)` |
| Payslip (`src/models/Payslip.js`) | `amount` | `min:0` removed; written via `toDecimal128(amount)` |
| Transcript (`src/models/transcriptModel.js`) | `totalMarks` | `min/max` removed; computed in Number space, rounded to 2dp, stored as Decimal128 |

**Helpers added (`server.js`):** `toMoneyNumber(v)` (Decimal128/number/string → Number) and `toDecimal128(v)` (→ `Decimal128.fromString(n.toFixed(2))`). **Documented conversion choice:** storage is exact Decimal128; **arithmetic and comparisons are performed in Number space** via `parseFloat(String())` — KES amounts are well within JS safe-integer range, so the fee-threshold gate stays correct while the stored value is exact. Client responses emit money as a **string** (per-model `toJSON` transform converts the BSON Decimal128 to `String`), so the raw `{$numberDecimal}` is never sent and existing `parseFloat`-based frontends keep working.

**Endpoints / sites converted:**
- `POST /api/payments` → `amount: toDecimal128(amount)`.
- `POST /api/payslips/generate` → `amount: toDecimal128(amount)`.
- `POST /api/programs`, `PUT /api/programs/:id` → `programCost: toDecimal128(programCost)`.
- Fee-threshold computation in `GET /api/students/:studentId/can-register` and `POST /api/students/register-units`: `paidAmount` reduce uses `toMoneyNumber(payment.amount)`; `totalFees` uses `toMoneyNumber(program.programCost)`; `outstandingBalance`/`canRegister` now compare Numbers correctly.
- `initializePrograms()` seed left as numeric literals — Mongoose casts Number → Decimal128 on save (verified syntactically; no behavioural change to seeding).
- Transcript pre-save: total computed in Number space then stored Decimal128; **`isComplete` `||` bug fixed to `&&`** (now requires all three components > 0).

**Marked `TODO(SEV-H-016)` in code + deferred (NOT guessed, per the rules):**
- **Year-promotion balance write** in `PATCH /api/students/:id` and `PUT /api/students/:id`: `balance` is **not a field on the Student schema**, so `updates.balance`/`updateData.balance` is silently dropped by Mongoose strict mode and is **not persisted today**. A correct fix (add a Decimal128 `Student.balance`, update via atomic `$inc` inside a replica-set transaction) requires a data-model decision beyond safe Stage 2A scope. The arithmetic was made numerically correct (`toMoneyNumber`) and a clear `// SEV-H-016 TODO` comment added at both sites; full fix deferred to Stage 3.
- **Multi-document transaction** for `register-units` (debit + N unit inserts) is **not** implemented: it requires MongoDB as a replica set and threading a session through `StudentUnitRegistration.registerStudent`. Deferred to Stage 3; documented in §2/§5.

---

## 2. Breaking changes for operators (do before/at deploy)

1. **Environment:** set `JWT_EXPIRES_IN=2h` (now the default; was 24h). Strongly recommended: set a strong `INITIAL_ADMIN_PASSWORD` so seeding never has to write `.seed-credentials.txt`. `EMAIL_USER`/`EMAIL_APP_PASSWORD` must be valid — student registration now depends on email delivery for credentials.
2. **MongoDB must run as a replica set** for the Stage 3 SEV-H-016 transaction work (register-units atomicity). Stage 2A does **not** require it (no transactions were added), but the deferred fix will.
3. **Every active session is invalidated the moment a user's record is next saved with a credential/email/role change** (tokenVersion). More importantly, **all currently-issued tokens predate `tokenVersion` (claim 0) and remain valid only while the stored `tokenVersion` is still 0** — any credential change bumps it and logs that user out. Expect a wave of re-logins after deploy as records are touched. The 24h→2h expiry also shortens all sessions.
4. **In-flight OTPs and password-reset links become invalid at deploy** — old documents store a raw `otp`/`resetToken`; the new code only matches `otpHash`/`tokenHash`. These are ≤10-minute (OTP) / ≤1-hour (reset) windows; affected users simply request a new code/link.
5. **Existing students keep logging in with their phone number** until a follow-up migration (see §5) generates random passwords and emails them. New students get a random emailed password immediately and are forced to change it on first login.
6. **`.seed-credentials.txt`**: on a fresh DB with no `INITIAL_ADMIN_PASSWORD`, read this file (project root, mode 0600) for the initial admin password, then delete it. It is gitignored.
7. **TTL/index changes** on `loginotps` and `passwordresets`: old indexes on raw `otp`/`resetToken` are no longer declared. Mongoose will create the new indexes; operators may want to drop the now-unused old indexes manually (non-blocking).
8. **Decimal128 storage**: existing Payment/Program/Payslip/Transcript documents created as JS numbers remain numbers in the DB until rewritten; Mongoose reads them through the Decimal128 path. New writes are Decimal128. No data migration is required for reads (the helpers tolerate number/string/Decimal128), but a normalising migration is advisable (deferred — §5).

---

## 3. Manual verification checklist (end-to-end, adversarial where noted)

- **SEV-H-006:** Decode a fresh student token — confirm `admissionNumber` and `tokenVersion` claims present. As a `finance` user, `GET /api/students/admission/<someone-else>` → now 403 (bypass removed). As `admin` → 200.
- **SEV-H-007 (adversarial):** As student A (valid token), `GET /api/students/admission/<B's number>` → 403; `POST /api/students/register-units` with `studentId=<B>` → 403; `DELETE /api/student-uploads/<B's uploadId>` → 403 (and a non-existent uploadId also → 403, identical body, no existence leak); `GET /api/student-uploads/<B's uploadId>/download` → 403. As trainer A, `POST /api/tools/upload` with `trainerId=<trainer B _id>` → 403. As trainer A, `PUT /api/payslips/<B's payslip>/view` → 403; as finance → 200.
- **SEV-H-008:** Perform a CIBEC search and a file download; inspect the newest `auditlogs` docs — `userId`/`userType` equal the acting JWT's user, not `cibec`/`cibec_admin`. Generate payslips from the finance dashboard with no `generatedBy` in the request body — succeeds; `payslip.generatedBy.userId` = the finance user's id. Confirm a finance/dean/ilo action now logs without enum-validation failure.
- **SEV-H-013 (adversarial):** Log in (token T1). Change that account's password (admin via update-password, or HOD/trainer via reset). Re-use T1 → 401 `TOKEN_REVOKED`. Set a user `isActive:false` in the DB, reuse their token → 401 `ACCOUNT_DISABLED`. Confirm a token older than 2h → 401 `TOKEN_EXPIRED`.
- **SEV-H-014 (adversarial):** Register a student with an email → no `initialPassword` in the response, email received with a random password. Register one without an email → response contains `initialPassword` once, `credentialsEmailed:false`. Log in with that password → `firstLoginRequired:true`. With that token, call any other `/api/*` → 403 `FIRST_LOGIN_REQUIRED`. Call `POST /api/students/<id>/first-login-password-change` with the temp password + a compliant new one → success + new token; old behaviour now unblocked. Confirm an existing (pre-migration) student still logs in with their phone number. Confirm the admission letter no longer prints the phone number.
- **SEV-H-015:** Seed a fresh DB with no `INITIAL_ADMIN_PASSWORD` — server logs only "written to .seed-credentials.txt"; the file exists (mode 0600) and contains the password; **no password appears anywhere in stdout/logs**. `git check-ignore .seed-credentials.txt` → ignored.
- **SEV-H-016:** Record a payment of `100.10` then `0.20`; `GET /api/payments` returns `amount` as strings; the can-register `paidAmount` equals `100.30` exactly (no float drift) and the fee gate behaves correctly at the threshold boundary. Create/update a Program — `programCost` stored and returned as a string. Save a Transcript with only `finalExam` set → `isComplete:false` (the `&&` fix); set all three → `isComplete:true`; `totalMarks` returned as a 2dp string.
- **SEV-H-017:** Trigger an admin login OTP and a password-reset OTP/link; inspect the `loginotps`/`passwordresets` documents — only `otpHash`/`tokenHash` present, no raw value; the emailed code/link still works; a wrong OTP still increments attempts and locks after 5 (Stage-1 behaviour preserved through the new hash compare).
- **SEV-H-018:** Hit any endpoint returning a user/staff/trainer/HOD/student object (e.g. `/api/trainers`, admin `/profile`) and confirm no `password`, `passwordHistory`, `tokenVersion`, `otpHash`, `tokenHash` in the JSON. Confirm all logins still succeed (the `+password` sites).
- **SEV-H-019 (adversarial):** `GET /api/dean/students?search=.*` and `search=a(b` → returns literal matches / empty, no 500, no ReDoS hang. `GET /api/students/latest-admission/a.*b/january/2026` → treated literally.

---

## 4. Known regressions & transition states

- **Self-service credential change logs you out.** Changing your own password (HOD/Trainer reset; admin update-password) or HOD/Trainer email bumps `tokenVersion`; the current token is immediately rejected and the user must log in again. Expected security tradeoff of SEV-H-013; not papered over.
- **Admin first-login flow preserved by design exception.** `tokenVersion` is **not** bumped while `AdminStaff.isFirstLogin` is true (so the email→password→complete sequence on one token works, since `FirstLogin.html` can't be edited this pass). After completion, normal revoke-on-change applies. This is a deliberate, documented weakening for the onboarding window only.
- **Back-office roles lost silent cross-user access** (SEV-H-006 table): finance can't look up arbitrary students/payments/payslips by id; hod can't read arbitrary trainers' assignments/students; dean/cibec/ilo can't read other users' notifications/notes. These workflows will break until dedicated explicitly-authorized routes are added (deferred). This is the intended behaviour per the instruction.
- **Trainers can no longer download student uploads.** `GET /api/student-uploads/:uploadId/download` bypass is admin/registrar/cibec only; `trainer` is in `authorize()` but trainers never "own" a student upload, so the owner check blocks them. If trainers must view student submissions for grading, a dedicated authorized route is needed (deferred).
- **Existing students still authenticate with their phone number** until the follow-up migration runs; new students use the emailed random password. During this window two credential schemes coexist (login tries the raw value then the legacy phone normalisation).
- **Students with no email on file** cannot receive the initial password automatically; the registrar must read it from the registration response (`initialPassword`, returned once) and deliver it out-of-band.
- **In-flight OTPs/reset links die at deploy** (hash change) — ≤10min/≤1h windows.
- **Old sessions:** all pre-deploy tokens lack `tokenVersion`; they stay valid (claim 0 vs stored 0) only until that user's record is touched, then they're revoked. Net effect: gradual forced re-login.
- **Year-promotion balance is still not persisted** (it never was — `balance` isn't in the Student schema). Behaviour is unchanged from before this stage; only the arithmetic/logging was made Decimal-safe. Flagged as `TODO(SEV-H-016)` in code.
- **Decimal128 min validators dropped.** Negative/zero guards moved to / remain at the route layer for Program (`programCost <= 0` check) and Payment (mode-specific validation). Payslip/Transcript lost their `min` validators with no route-level replacement added this stage (low risk: amounts are staff-entered) — noted for Stage 3.

---

## 5. What's deferred (noticed, intentionally not done in Stage 2A)

- **Refresh tokens** — explicitly Stage 3. The 2h expiry + tokenVersion is the interim control.
- **Student password migration script** — a one-shot (like the Stage-1 trainer migration) that force-resets every existing student to a random password and emails it, then sets `mustUpdatePassword:true`. Until it runs, existing students log in with phone numbers. Recommended next.
- **Persisted student balance** — add a Decimal128 `Student.balance`, update via atomic `$inc`, wrap year-promotion + register-units in a replica-set transaction. The current `balance` writes are dropped by strict mode (pre-existing). `TODO(SEV-H-016)` markers in code.
- **register-units atomicity** — multi-document transaction (fee re-check + N inserts) needs a replica set and session threading through `StudentUnitRegistration.registerStudent`.
- **Dedicated explicitly-authorized back-office routes** to restore finance/hod/dean/cibec/ilo legitimate cross-user access removed by the SEV-H-006 narrowing (e.g., a finance "lookup student for payment" route, a trainer "view assigned students' uploads" route).
- **`deanDashboard.js:242`** still sends a client `userId` (out of permitted frontend scope this pass); the server already ignores it for audit. Strip it when dean frontend changes are in scope.
- **A normalising data migration** to rewrite existing numeric Payment/Program/Payslip/Transcript values to Decimal128 (reads already tolerate mixed types; this is hygiene).
- **Decimal128 negative-amount validators** at the route layer for Payslip/Transcript.
- **SEV-M-033 remainder** — only the `AuditLog` enum portion was in scope here; the broader centralised role-list refactor remains.
- All remaining Medium/Low/Informational findings from AUDIT_REPORT.md.
