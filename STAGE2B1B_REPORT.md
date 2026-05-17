# Stage 2B-1B Report — Frontend auth-fetch normalization

Date: 2026-05-17
Scope: plumbing only. Every dashboard's `/api/*` calls now go through the single shared helper `window.AUTH.fetch` (directly, or via a thin local `authFetch` wrapper that delegates to it). No security logic, XSS, CSP, cookie, error-text, or feature changes. Server untouched. This is preparation for the Stage 2B-2 XSS pass.

`node --check` passes on every modified `.js` file and on `public/js/auth.js`. Inline-HTML edits were pure token substitutions (`await fetch(` → `await window.AUTH.fetch(`), no structural change.

## 1. Files modified — fetch call sites before → after

| File | How normalized | Bare `/api` fetch before → after |
|---|---|---|
| `public/js/auth.js` | **Helper bug fix** (see §5): default JSON Content-Type now skipped for FormData bodies | n/a |
| `admin/adminDashboard.js` | local `authFetch` wrapper body → delegates to `window.AUTH.fetch`; 1 missed bare `${API_BASE}/programs` → `authFetch` | 1 → 0 |
| `finance/financeDashboard.js` | wrapper → delegates (its 15 call sites unchanged) | 0 → 0 |
| `finance/financeAnalytics.js` | wrapper → delegates (3 call sites) | 0 → 0 |
| `hod/hodDashboard.js` | wrapper → delegates; 6 literal `'/api/...'` bare calls → `authFetch` | 6 → 0 |
| `dean/deanDashboard.js` | wrapper → delegates; 1 bare `fetch(url)` (loadStudents) → `authFetch` | 1 → 0 |
| `cibec/cibecDashboard.js` | wrapper → delegates (5 call sites) | 0 → 0 |
| `trainer/trainerDashboard.js` | wrapper → delegates; 15 bare `fetch(${API_BASE_URL}…)` → `authFetch` (incl. 2 FormData uploads) | 15 → 0 |
| `student/studentPortal.js` | wrapper → delegates; 8 bare → `authFetch` | 8 → 0 |
| `ilo/iloDashboard.js` | wrapper → delegates; 3 bare → `authFetch` | 3 → 0 |
| `student/uploadSection.js` | **added** delegating `authFetch`; 7 bare → `authFetch` (incl. 2 FormData uploads) | 7 → 0 |
| `student/studentService.js` | **added** delegating `authFetch`; 3 data fetches → `authFetch`; `/students/auth` left bare (login step) | 3 → 0 (+1 exempt) |
| `registrar/exportUtils.js` | **added** delegating `authFetch`; 1 bare → `authFetch` | 1 → 0 |
| `registrar/RegistrarDashboardNew.html` (inline) | 12 `${API_BASE_URL}` fetches → `window.AUTH.fetch`; static `AdmissionLetter.html` fetch left (non-/api) | 12 → 0 |
| `deputy/DeputyDashboard.html` (inline) | 26 `${API_BASE_URL}` fetches → `window.AUTH.fetch` | 26 → 0 |
| `finance/FinanceDashboard.html` (inline) | 2 `${API_BASE_URL}` fetches → `window.AUTH.fetch` | 2 → 0 |
| `student/StudentPortalTailwind.html` (inline) | 5 `/api` fetches (4 template + 1 url-var) → `window.AUTH.fetch` | 5 → 0 |

The six pre-existing local `authFetch` wrappers (admin, financeDashboard, financeAnalytics, hod, dean, cibec) plus trainer/studentPortal/ilo each had a body that read a cascade of `localStorage` token keys and manually set the `Authorization` header. **All wrapper names and call sites are unchanged**; only the body was replaced with `return window.AUTH.fetch(url, options);`. Side effect of this mandated replacement: `financeDashboard.js`'s per-call `console.log('🔐 authFetch called', {tokenLength,…})` is gone (it lived inside the wrapper body). That is a net positive and was an unavoidable consequence of delegating; no other logging was touched.

Verification performed: `node --check` per file; repo-wide grep confirms **zero** bare `fetch(` to `/api` in any non-login dashboard file; grep confirms no manually-attached `Authorization` header remains (only the word appears in explanatory comments); token `localStorage` reads remain only in dashboards' own "am I logged in / which login page" state code (left for Stage 3, per instructions).

## 2. Previously broken — now functional (were silently failing / unauthenticated)

These made `/api/*` calls with **no auth at all** and are now properly authenticated (the audit's "no Authorization header" flags):

- `dean/deanDashboard.js` → `GET /api/dean/students` (loadStudents) — audit-flagged.
- `registrar/exportUtils.js` → `GET /api/students` (bulk student export).
- `student/uploadSection.js` → `GET /api/system-settings`, `GET /api/student-uploads/:id`, `GET /api/students/:id/registrations`, `POST /api/student-uploads` (×2 FormData), `GET /api/student-uploads/:id/download`.
- `student/studentService.js` → `GET /api/students/:adm`, `…/finances`, `…/courses`.
- `registrar/RegistrarDashboardNew.html` → `GET/PUT/POST /api/students*`, `…/register`, `…/latest-admission/*` (12 calls) — audit-flagged.
- `deputy/DeputyDashboard.html` → `/api/tools*`, `/api/notifications*`, `/api/trainers*`, `/api/students`, `/api/courses`, `/api/units` (26 calls) — audit-flagged.
- `finance/FinanceDashboard.html` (inline) → `GET/PUT /api/system-settings*`.
- `ilo/iloDashboard.js` → `/api/ilo/graduation-applications`, `/api/ilo/attachment-applications`, `…/status` (3 calls) — audit-flagged.
- `student/StudentPortalTailwind.html` (inline) → graduation/attachment eligibility & application, profile email update (5 calls).
- `trainer/trainerDashboard.js` → 15 `/api/trainers*`, `/api/tools*`, `/api/notifications*`, `/api/payslips*` calls (incl. tool uploads).
- `student/studentPortal.js`, `hod/hodDashboard.js`, `admin/adminDashboard.js` → individual bare calls that bypassed their own wrappers (units/course, register-units, public-notes, notes/read; `/api/assignments/*`, `/api/common-units*`; `/api/programs`).

These will start sending `Authorization: Bearer` and should now get 200s where they previously got 401s (assuming a valid session; behaviour otherwise unchanged).

## 3. Not fully normalized / deliberately left (with reasons)

- **Login & public pages — exempt by scope, untouched:** `*/AdminLogin.html`, `admin/AdminStaffLogin.html`, `admin/FirstLogin.html`, `hod/HODLogin.html`, `trainer/TrainerLogin.html`, `auth/ForgotPassword.html`, `auth/ResetPassword.html`. Note: `FirstLogin.html` and `AdminStaffLogin.html` *do* call authenticated `/api/admin/auth/update-*` endpoints with a bearer token they hold, but they are part of the admin login/first-login flow (not dashboards) and the scope explicitly exempts login pages — left as-is and flagged here for transparency.
- **`student/otp.js`** (`/api/send-otp`, `/api/verify-otp`): the public OTP/forgot-password flow — exempt (public endpoints), left bare.
- **`student/studentService.js` line 20** `POST /api/students/auth`: the credential-verification (login) step — exempt; left a bare `fetch` with a code comment.
- **`registrar/RegistrarDashboardNew.html` line 1609** `fetch('/src/components/registrar/AdmissionLetter.html')`: not an `/api` call (static template fetch) — correctly left alone.
- **No jQuery `$.ajax` or `axios`** found anywhere in scope — nothing deferred for that reason.
- The four inline-HTML dashboards (Registrar, Deputy, Finance, StudentPortal) use **direct `window.AUTH.fetch`** rather than a local `authFetch` wrapper, because their inline JS spans multiple `<script>` blocks and `window.AUTH` is the only reliably cross-block reference (auth.js is loaded on all four pages — verified). This satisfies normalization option 1.

## 4. Manual verification checklist (one action per dashboard, post-deploy)

- **Admin:** open dashboard → students list loads; “Programs” section loads (`/api/programs` now via authFetch).
- **Finance:** open dashboard → payments load; open Fee-Threshold setting (FinanceDashboard inline `GET /api/system-settings`) → value displays; generate a payslip.
- **HOD:** assign a unit to a trainer (`POST /api/assignments/assign`, formerly literal bare fetch) → succeeds; common-units list loads.
- **Dean:** open dashboard → student list loads (this was the broken `loadStudents`); add a student note.
- **Registrar:** open dashboard → student table loads; register a student; open an admission letter (static fetch still works).
- **Deputy:** open dashboard → pending tools load; broadcast a notification; dashboard stats panel populates.
- **ILO:** open dashboard → graduation & attachment applications load; approve/reject one (`PATCH …/status`).
- **CIBEC:** open dashboard → statistics + uploads list load; view/download a student upload.
- **Trainer:** open dashboard → assignments & students load; upload a tool file (FormData — confirm it uploads, i.e. the auth.js FormData fix works); view payslips.
- **Student portal:** log in → profile/payments load; check graduation/attachment eligibility (inline SPT calls); upload an assessment (uploadSection FormData).

Trace sanity (3 flows): Trainer “upload tool” → button → `authFetch('/api/tools/upload',{method:'POST',body:FormData})` → `window.AUTH.fetch` attaches Bearer, **omits** JSON Content-Type for FormData → multipart reaches server → response handled as before. Dean “view students” → `loadStudents()` builds `${API_BASE}/dean/students?…` → `authFetch(url)` → 200 with Bearer (was 401). ILO “approve application” → `authFetch(API_BASE_URL + '/ilo/applications/…/status',{method:'PATCH',body:JSON})` → Bearer + JSON Content-Type added by helper → server updates. All make sense.

## 5. Note on `window.AUTH.fetch` correctness

**Bug found and fixed (minimal, scope-permitted because it blocked normalization):** the helper unconditionally set `Content-Type: application/json`. Routing the FormData upload endpoints (`POST /api/tools/upload`, `POST /api/student-uploads`) through it would have forced `application/json` onto multipart bodies and **broken every file upload**. Fix: default the JSON Content-Type only when the body is **not** a `FormData` instance (and callers can still override via `options.headers`). All existing JSON callers are unaffected.

**Pre-existing quirks observed but NOT fixed (out of scope — Stage 3 / behaviour-change territory):**
1. On a 401 it hardcodes `window.location.href = '/admin/login'` regardless of role — a student/trainer/HOD whose token expires is sent to the *admin* login page. Pre-existing; several local wrappers previously had role-aware redirects, so delegating slightly regresses redirect-target accuracy (functionality otherwise intact). Flagged, not changed (no behaviour/UX changes permitted this pass).
2. It only special-cases 401 codes `TOKEN_EXPIRED` / `INVALID_TOKEN`. The Stage-2A codes `TOKEN_REVOKED`, `ACCOUNT_DISABLED`, and the 403 `FIRST_LOGIN_REQUIRED` are **not** handled, so those responses propagate to callers without an auto clear/redirect. Pre-existing gap; should be addressed alongside the Stage-3 session/cookie work.
3. It calls `response.json()` on a 401 to read `.code`; a 401 with an empty/non-JSON body would throw inside the helper. Low risk (server 401s are JSON), noted for Stage 3.

These three are recorded for the next stage; none block the XSS pass and none were altered here.
