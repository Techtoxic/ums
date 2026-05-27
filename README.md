# EDTTI UMS — University Management System

A web-based University Management System for **Emurua Dikirr Technical Training Institute (EDTTI)**. It provides role-specific portals for institutional administration — admissions and registry, finance, academic departments, industrial liaison, and a student self-service portal — backed by a single Node/Express server and a PostgreSQL database.

The application is a server-rendered + single-page-app hybrid: each role gets a lightweight SPA portal (a static HTML shell plus a History-API router that lazily loads tab fragments), and all data flows over a JSON API under `/api`. Authentication is cookie-based JWT with role-based access control, and admin/staff logins are protected with an emailed one-time passcode (OTP).

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 |
| Web framework | Express 5 |
| Database | PostgreSQL (hosted on [Neon](https://neon.tech)) |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Frontend | Vanilla HTML + JavaScript, Tailwind CSS (CDN), Remix Icon |
| Auth | JWT in HTTP-only cookies, CSRF tokens, bcryptjs password hashing |
| Email | Brevo (Sendinblue) transactional HTTP API |
| File storage | AWS S3 (via `@aws-sdk`), multer for in-memory upload handling |
| Security | helmet, express-rate-limit, Content-Security-Policy (Report-Only), input sanitization |
| Validation | Zod (environment + request validation) |
| Process manager | pm2 (production) |

---

## Architecture overview

### Portals and the `/<role>/<tab>` convention

There are **nine SPA portals** plus a legacy CIBEC dashboard:

`admin`, `registrar`, `finance`, `trainer`, `hod` (Head of Department), `dean`, `deputy` (Deputy Principal), `ilo` (Industrial Liaison Office), `student` — and `cibec` (a non-SPA dashboard, not yet refactored).

Every SPA portal is served at a clean, bookmarkable URL of the form **`/<role>/<tab>`** (e.g. `/admin/students`, `/finance/revenue`, `/student/transcript`). Visiting the bare `/<role>` 302-redirects to that portal's default tab, and legacy `/<role>/dashboard[/<tab>]` paths 301-redirect to the new scheme.

### Portal structure

Each portal lives in `src/components/<role>/` and is composed of four parts:

```
src/components/<role>/
├── portal-shell.html     # The static chrome: header, nav, modals, <main id="tab-root">,
│                         #   and <script> includes. Served for every /<role>/<tab> URL.
├── portal-router.js      # Tiny History-API router. Reads the tab from the URL, lazily
│                         #   fetches that tab's partial into #tab-root (cached), toggles
│                         #   visibility, and calls the tab module's idempotent init().
├── portal-core.js        # Shared per-portal helpers (authFetch, toast, formatters) and the
│                         #   DOMContentLoaded bootstrap that wires identity + starts the router.
├── partials/<tab>.html   # One HTML fragment per tab (no <html>/<head>), injected on demand.
└── tabs/<tab>.js         # One module per tab exposing window.<Role>Tabs['<tab>'] = { init() }.
```

A new developer only needs to know: **the shell loads once; the router swaps tab fragments into `#tab-root` and runs each tab's `init()`; shared globals live in `portal-core.js`.**

### `registerPortal` helper

All nine portals share identical page-routing logic, so it is defined once in **`src/routes/portalPages.js`** and invoked per-portal with a small config object:

```js
registerPortal(app, portalDeps, {
  role: 'admin',
  tabs: ['dashboard', 'students', 'trainers', 'financial', 'programs', 'reports', 'settings'],
  defaultTab: 'dashboard',
  login: { file: 'AdminLogin.html' },
  extraPages: [{ path: '/admin/first-login', file: 'FirstLogin.html' }],
});
```

`registerPortal` registers — **in a deliberate order** (login → partials → legacy redirects → bare redirect → `/<role>/:tab` catch-all) — every page route a portal needs. The catch-all serves the shell only for whitelisted tabs and otherwise falls through.

### API and service layers

- **`src/routes/*.js`** — 24 Express routers mounted under `/api` (e.g. `students`, `trainers`, `payments`, `programs`, `units`, `assignments`, `tools`, `notifications`, `studentUploads`, `passwordReset`, plus the auth routers `adminAuth` / `studentsAuth`). `portalPages.js` is the page-routing helper described above.
- **`src/services/`** — the service layer: `userService` (user lookup/creation across roles) and `otpService` (login OTP generation/verification).
- **`src/db/`** — `index.js` opens the Drizzle/Postgres connection; `models.js` is a Mongoose-style facade (see *Known limitations*) that exposes V1 model APIs backed by Drizzle so existing call sites keep working.
- **`src/middleware/`** — `auth.js` (JWT cookie verification, CSRF, RBAC `authorize(...)`), `rateLimiters.js`.
- **`src/config/`** — `env.js` (Zod-validated environment), `config.js` (typed config object), `csp.js` (Content-Security-Policy), `endpointSecurity.js`.
- **`src/utils/`** — `emailService` (Brevo), `s3Service`, `uploads` (multer), `validators`, `formatters`, `academicPeriod`, `studentHelpers`.

---

## Project structure

```
ums/
├── server.js                 # Express entry point: env validation, security middleware,
│                             #   /api/health, API route mounting, registerPortal calls, statics.
├── drizzle.config.js         # drizzle-kit configuration (schema path, migrations dir, DB URL).
├── package.json
├── drizzle/
│   ├── schema.js             # Drizzle table definitions (the source of truth for the DB schema).
│   ├── migrations/           # Generated SQL migrations — DB history; never edit by hand.
│   └── seed.js               # Idempotent seed script (departments, programs, units, users, …).
├── src/
│   ├── config/               # env.js (Zod), config.js, csp.js, endpointSecurity.js
│   ├── db/                   # index.js (Drizzle connection), models.js (Mongoose-compat facade)
│   ├── middleware/           # auth.js (JWT/CSRF/RBAC), rateLimiters.js
│   ├── routes/               # 24 API routers + portalPages.js (registerPortal)
│   ├── services/             # userService, otpService
│   ├── utils/                # emailService, s3Service, uploads, validators, formatters, …
│   ├── components/           # Per-role portals (shell + router + core + partials/ + tabs/)
│   │   ├── admin/ registrar/ finance/ trainer/ hod/ dean/ deputy/ ilo/ student/
│   │   ├── cibec/            # Legacy non-SPA dashboard
│   │   ├── auth/ landing/ dev/ units/   # Shared auth pages, landing page, dev demo
│   │   └── …
│   └── login.html            # Shared student/trainer login page
└── public/
    ├── js/                   # auth.js (shared client auth helper), config.js, dashboard-theme.js
    ├── css/                  # dashboard-styles.css + one <role>-portal.css per portal
    └── index.html, favicon.ico, robots.txt
```

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd ums
npm install
```

### 2. Configure environment

Create a `.env` file in the project root. The environment is validated by Zod at boot (`src/config/env.js`) — the server **refuses to start** if a required variable is missing or invalid.

**Required:**

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string (must start with `postgres://` or `postgresql://`). |
| `JWT_SECRET` | Secret for signing auth tokens. **Minimum 32 characters.** |

**Optional (with defaults):**

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `5502` | HTTP port. |
| `NODE_ENV` | `development` | `development` \| `production` \| `test`. |
| `JWT_EXPIRES_IN` | `2h` | Access-token lifetime. |
| `SESSION_SECRET` | — | Optional; min 32 chars if set. |
| `ALLOWED_ORIGINS` | `''` | Comma-separated CORS allowlist (required in production). |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS. |
| `BREVO_API_KEY` | — | Email is skipped (degraded mode) if unset. |
| `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | — | Sender identity for Brevo. |
| `INITIAL_ADMIN_PASSWORD` | — | Used only by the seed script. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Required for S3 uploads. |
| `AWS_S3_BUCKET_NAME` | — | S3 bucket (`AWS_S3_BUCKET` is also accepted as a fallback). |
| `AWS_REGION` | `us-east-1` | S3 region. |

### 3. Run migrations

```bash
npm run db:migrate     # apply migrations in drizzle/migrations to the database
```

Other Drizzle commands:

```bash
npm run db:generate    # generate a new migration from changes to drizzle/schema.js
npm run db:push        # push schema directly (dev convenience)
npm run db:studio      # open Drizzle Studio
```

### 4. Seed test data

```bash
npm run db:seed        # idempotent — safe to re-run; seeds departments, programs, units,
                       #   common units, staff/trainer/student users, and sample data.
```

### 5. Start

```bash
npm start              # production-style start (node server.js)
npm run dev            # same entry point, for local development
```

The server prints a startup banner with per-portal URLs, e.g. `http://localhost:5502/admin/login`. Liveness probe: `GET /api/health` → `{ "status": "ok", "db": "postgres", … }`.

---

## Authentication & seeded accounts

- **Staff (admin, registrar, finance, dean, deputy, ilo, cibec)** log in via the admin login page. Login is **two-step**: password, then a **one-time passcode emailed via Brevo** (OTP). With `BREVO_API_KEY` unset (dev), email is skipped and the OTP is not delivered — configure Brevo to exercise the full flow.
- **Trainers** log in via the trainer login page; **students** via the shared `/login` page (admission number + password).

The seed script (`drizzle/seed.js`) hashes the documented default passwords fresh. Representative accounts:

| Role | Login (email / admission no.) | Password |
|---|---|---|
| Admin | `okmomanyi56@gmail.com` | `Admin@2026` |
| Registrar | `calvinnate6@gmail.com` | `Admin@2026` |
| Finance | `okmomanyi56+finance@gmail.com` | `Admin@2026` |
| Dean | `okmomanyi56+dean@gmail.com` | `Admin@2026` |
| Deputy | `okmomanyi56+deputy@gmail.com` | `Admin@2026` |
| ILO | `okmomanyi56+ilo@gmail.com` | `Admin@2026` |
| CIBEC | `okmomanyi56+cibec@gmail.com` | `Admin@2026` |
| Trainer | `whitenat16@gmail.com` | `Trainer@2026` |
| Demo presenter (admin / registrar) | `nashonbett18@gmail.com` / `nashonbett18+registrar@gmail.com` | `Mt5@2026` |
| Student | admission no. `AC6/0001/S25` | their phone number, e.g. `0712345689` |

> Each student's initial password is their **phone number**. See `drizzle/seed.js` for the full account list. These are seed/test credentials — rotate them for any real deployment.

---

## Deployment

Production runs under **pm2**. A typical deploy:

```bash
git pull
npm install
npm run db:migrate        # only if there are new migrations
pm2 restart ums           # or: pm2 reload ums
```

Set `NODE_ENV=production`, a strong `JWT_SECRET`, `ALLOWED_ORIGINS`, `COOKIE_SECURE=true`, and the Brevo/AWS credentials in the production environment. In production the server fails fast if `DATABASE_URL` or the CORS allowlist is missing.

---

## Known limitations / deferred work

These are tracked, intentional trade-offs — documented honestly so they aren't a surprise:

- **Mongoose-compatibility shim.** `src/db/models.js` exposes a V1 Mongoose-style API (`.findOne`, `.find`, `.create`, …) backed by Drizzle/Postgres so the large existing call surface (~170 endpoints) kept working through the Postgres migration. It is a facade, not real Mongoose: **`.populate()` and `.aggregate()` are not fully supported**, and code paths needing them have been rewritten to explicit joins. New code should prefer Drizzle queries directly.
- **Finance tables are temporary.** The `payments` and `payslips` tables are **flat, temporary structures** standing in until a proper financial-schema redesign. Treat their shape as provisional.
- **Uploads / unit-registration schema needs reconciliation.** The student-uploads and unit-registration tables carry some legacy field names and overlapping concerns that still need to be reconciled into a clean schema.
- **`db:reset` script is absent.** `package.json` defines `db:reset` → `node drizzle/reset.js`, but `drizzle/reset.js` is not present in the repo; the command will fail until the script is restored or the entry is removed. Use `db:push` / `db:migrate` against a fresh database instead.
- **A few tuning env vars are only partially wired.** Rate-limit windows are currently hardcoded in `src/middleware/rateLimiters.js` rather than driven by `RATE_LIMIT_*`; `MAX_FILE_SIZE` is honored for uploads but `UPLOAD_DIR` has no consumer (uploads use in-memory storage + S3).
