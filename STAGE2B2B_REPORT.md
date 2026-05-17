# Stage 2B-2B Report - Content Security Policy (Report-Only)

Date: 2026-05-17
Scope: enable CSP in **Report-Only** mode (ref SEV-M-025; defense-in-depth pairing with the SEV-H-010 output-encoding pass). No dashboard files modified, no escaping changes, no auth changes, no auth.js changes. The only files touched are `server.js` (config wiring + report endpoint) and a new `src/config/csp.js`. No inline scripts were extracted (none needed extraction to keep the frontend working under Report-Only, since Report-Only blocks nothing).

Result: by default the server emits `Content-Security-Policy-Report-Only` (verified at runtime). It emits an enforcing `Content-Security-Policy` **only** when `CSP_ENFORCE=true` is explicitly set. `node --check` passes on `server.js` and `src/config/csp.js`. The CSP string is well-formed and runtime-verified for the default, production, enforce, and env-override cases. helmet's functional configuration is byte-unchanged, so HSTS / X-Content-Type-Options / X-Frame-Options / Referrer-Policy are provably unaffected.

---

## 1. Files modified / created

| File | Change | Lines (approx) |
|---|---|---|
| `src/config/csp.js` | **Created.** Single source of truth: `BASE_DIRECTIVES` config object, `buildCspString(isProduction)`, `isEnforce()`, `headerName()`, `reportToHeaderValue()`, per-directive env override (`envExtra`). | ~120 (new file) |
| `server.js` :18 | Added `const csp = require('./src/config/csp');` immediately after the `config` require. | +1 |
| `server.js` (helmet block) | Reworded the comment above `app.use(helmet({...}))` and the inline comment on `contentSecurityPolicy: false`. **The helmet call itself is functionally byte-identical** (option values unchanged). | comment-only |
| `server.js` (after helmet) | Added a dedicated CSP middleware: sets `Content-Security-Policy-Report-Only` (or `Content-Security-Policy` if enforcing) + `Report-To` on every response, using values computed once at startup. | +11 |
| `server.js` (after `cors`, before global body parser) | Added `POST /api/csp-report`: dedicated 1000/hr per-IP limiter, dedicated 64KB JSON parser (3 content-types), route-scoped error handler, structured `console.log`, always `204`. | ~90 (mostly comments) |

Net change to `server.js` for this stage is ~100 lines, the bulk of which is the report endpoint and its inline documentation - within the stated budget. (The large cumulative `git diff --stat` on `server.js` is prior-stage working-tree changes, not this stage.)

No frontend/dashboard `.js` or `.html` file was modified. No escape helper, no `auth.js` fetch logic, no auth/route-protection code was touched.

---

## 2. Mechanism - how CSP is emitted

helmet's own CSP stays `false` (as before this stage). CSP is emitted by a **separate, dedicated middleware** registered right after the helmet block:

```js
const CSP_HEADER_NAME  = csp.headerName();              // computed once at startup
const CSP_HEADER_VALUE = csp.buildCspString(config.isProduction);
const CSP_REPORT_TO    = csp.reportToHeaderValue();
app.use((req, res, next) => {
    res.setHeader(CSP_HEADER_NAME, CSP_HEADER_VALUE);
    res.setHeader('Report-To', CSP_REPORT_TO);
    next();
});
```

Why a standalone middleware instead of `helmet({ contentSecurityPolicy: {...} })`: it is the lowest-risk way to add CSP with **zero** chance of regressing the other helmet headers, gives full control over `report-uri` + `report-to` + the Report-Only/enforce toggle, and keeps the entire policy in one auditable module. "helmet may be reconfigured" was read as *permitted, not required*; the safer non-reconfiguration was chosen and is documented in §5 below.

**Configurability without redeploy:**
- `CSP_ENFORCE` (default unset/false) - the **only** switch from Report-Only to enforcing. Any value other than the literal string `true` (case-insensitive) keeps Report-Only. There is no code path that defaults this to true.
- `CSP_<DIRECTIVE>_EXTRA` - per-directive allowlist extension, space-separated, appended to that directive (e.g. `CSP_SCRIPT_SRC_EXTRA`, `CSP_CONNECT_SRC_EXTRA`). Lets an operator whitelist a newly-added CDN by env var alone, no code change.
- `upgrade-insecure-requests` is added **only** when `config.isProduction` is true (dev runs over http).

---

## 3. CSP directives and per-directive justification

Source lists were derived by grepping every frontend HTML/JS file for external `https://` origins actually referenced (see §4 for the file inventory).

| Directive | Value | Justification |
|---|---|---|
| `default-src` | `'self'` | Restrictive baseline; every fetch type not explicitly listed falls back to same-origin only. |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval' jsdelivr cdnjs cdn.tailwindcss.com unpkg` | `'unsafe-inline'`: inline `<script>` blocks and `on*=""` handlers are pervasive across every dashboard - Report-Only inventories these for the later nonce migration. `'unsafe-eval'`: the Tailwind Play CDN (`cdn.tailwindcss.com`) JITs styles via `eval`/`new Function` at runtime; required until Tailwind is compiled to a static stylesheet. The four CDN origins are the only external script hosts in use (jsdelivr, cdnjs, Tailwind Play, unpkg/jsPDF). |
| `style-src` | `'self' 'unsafe-inline' jsdelivr cdnjs fonts.googleapis.com` | `'unsafe-inline'` accepted this pass: Tailwind utility classes and pervasive inline `style=""` attributes. Nonce migration for styles is a much larger frontend change, deliberately deferred. `fonts.googleapis.com` serves the Google Fonts CSS. |
| `img-src` | `'self' data: https:` | `https:` blanket-allowed: profile pictures / uploaded content come from S3 via rotating presigned URLs (host varies), and `via.placeholder.com` is used as an image fallback. `data:` for inline icons. |
| `font-src` | `'self' cdnjs jsdelivr fonts.gstatic.com data:` | Google Fonts CSS (`fonts.googleapis.com`) pulls the actual font files from `fonts.gstatic.com`; cdnjs/jsdelivr serve icon-font webfonts; `data:` for inlined fonts. |
| `connect-src` | `'self'` | The frontend only calls its own origin for API/XHR/fetch. Extendable via `CSP_CONNECT_SRC_EXTRA` if a future integration needs it. |
| `frame-src` | `'none'` | No internal page embeds another page via `<iframe>` (verified). |
| `frame-ancestors` | `'none'` | No internal page is embedded by another; `'none'` = clickjacking protection, and matches helmet's existing `X-Frame-Options: DENY`. |
| `object-src` | `'none'` | No `<object>`/`<embed>`/`<applet>`; closes a legacy plugin XSS vector. |
| `base-uri` | `'self'` | Blocks `<base href>` hijacking that would re-point relative script URLs. |
| `form-action` | `'self'` | Forms only post to same origin; blocks form-jacking exfiltration. |
| `upgrade-insecure-requests` | (production only) | Auto-upgrades any stray `http://` subresource to `https://` in prod. Omitted in dev. |
| `report-uri` | `/api/csp-report` | Legacy reporting channel (still honored by all current browsers). |
| `report-to` | `default` | Modern Reporting API group; the `Report-To` response header defines the `default` group pointing at the same path. Both are emitted for maximum browser coverage. |

Runtime-verified default header: `Content-Security-Policy-Report-Only`. Enforce header (only with `CSP_ENFORCE=true`): `Content-Security-Policy`.

---

## 4. CDN inventory (grep-discovered) and which files use them

| Origin | Type | Files referencing it |
|---|---|---|
| `cdn.tailwindcss.com` | script | Nearly all dashboard/login HTML + `src/login.html` (Tailwind Play CDN, used site-wide) |
| `cdn.jsdelivr.net` | script + style | admin, AdminStaffLogin, ForgotPassword, ResetPassword, cibec, dean, deputy, finance, hod, ilo, registrar, StudentPortalTailwind, trainer |
| `cdnjs.cloudflare.com` | script + style + font | AdminLogin, FirstLogin, FinanceDashboard, HODLogin, AdmissionLetter, RegistrarDashboardNew, student/register, StudentPortalTailwind, TrainerDashboard, TrainerLogin, `src/login.html` |
| `fonts.googleapis.com` | style | ForgotPassword, ResetPassword, HODDashboard, StudentPortalTailwind, TrainerDashboard |
| `fonts.gstatic.com` | font | Indirect - font files referenced by the Google Fonts CSS above |
| `unpkg.com` | script | `StudentPortalTailwind.html:1176` - `https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js` |
| `via.placeholder.com` | img | `DeputyDashboard.html:638` - covered by `img-src https:`, not separately listed |

No `<iframe>` embedding an internal page was found, which is why `frame-src` and `frame-ancestors` are both `'none'`.

---

## 5. CSP report endpoint design

`POST /api/csp-report`, registered **after** `app.use(cors(corsOptions))` and **before** the global `express.json({ limit: '1mb' })` / `ensureDB` / `generalApiLimiter` / auth middleware. Placement rationale: the route's own 64KB parser is authoritative (the 1mb global parser never sees the body), and the endpoint bypasses DB connection, the general API limiter, and authentication - browsers post these reports unauthenticated and cross-context, often when the DB is irrelevant.

| Aspect | Decision | Rationale |
|---|---|---|
| Auth | None | Browsers send violation reports unauthenticated; requiring auth would discard all real data. |
| Body size | **64KB** (`limit: '64kb'`) | Real CSP reports are a few hundred bytes; 64KB is generous headroom while bounding memory against garbage payloads. |
| Content-Types accepted | `application/csp-report`, `application/reports+json`, `application/json` | Covers legacy `report-uri` (`application/csp-report`), the modern Reporting API (`application/reports+json`), and lenient browsers / manual `curl` testing (`application/json`). |
| Rate limit | **1000 / IP / hour** (dedicated `cspReportLimiter`) | A single misconfigured page can emit one report per blocked subresource per navigation, so the limit is intentionally high - it exists only to cap a hostile flood, not to shape normal volume. Rate-limited requests are silently dropped with `204` (no 429 - a 429 would itself generate client-side console noise and leak limiter state). |
| Wire formats handled | Legacy `{ "csp-report": {...} }` (object) **and** Reporting API `[ { type, body:{...} } ]` (array) | Normalized into a flat list; field names read in both kebab-case (legacy) and camelCase (Reporting API) - `violated-directive`/`effectiveDirective`, `blocked-uri`/`blockedURL`, `document-uri`/`documentURL`, `source-file`/`sourceFile`, line/column. Unknown shapes are logged raw rather than dropped. |
| Logging | `console.log` at info level, single structured line: `[CSP-REPORT] <ISO ts> ip=<ip> violated-directive="..." blocked-uri="..." document-uri="..." [source=file:line:col]` | Greppable, no DB write. |
| Persistence | **None** | Per scope - pure telemetry to the app log; no schema, no collection, no migration. |
| Failure behavior | **Always `204 No Content`** | A route-scoped 4-arg error handler catches body-parser rejections (`PayloadTooLargeError` > 64KB, `SyntaxError` on malformed JSON) and still returns 204; the handler body is wrapped in try/catch. The endpoint cannot 4xx/5xx on a bad report - it is deliberately "boring and unkillable". |

The violation log **will be noisy** under Report-Only (every inline script and `on*=` handler across every dashboard will report against `script-src`). That noise is the intended inventory data for the tightening roadmap and is not suppressed.

---

## 6. Tightening roadmap (operator rollout)

Report-Only is step 0. The path to a strict enforced policy, in priority order:

1. **Soak in Report-Only (now).** Deploy with `CSP_ENFORCE` unset. Collect `[CSP-REPORT]` lines for a representative period (all roles, all dashboards, PDF/CSV export flows, file uploads). Build the real-world violation inventory from the log.
2. **Triage the inventory.** Separate (a) legitimate origins missing from the allowlist - add via `CSP_<DIRECTIVE>_EXTRA` env var, no redeploy - from (b) genuine inline-script/handler violations to be remediated.
3. **Remove `'unsafe-inline'` from `script-src` via nonces (highest priority - this is the actual XSS hardening).** Generate a per-response nonce, attach it to every first-party `<script>` tag and migrate `on*=""` handlers to `addEventListener`. This is a frontend change across all dashboards (explicitly out of scope for this stage) and is the single biggest payoff: it is what makes CSP actually stop reflected/stored XSS.
4. **Remove `'unsafe-eval'` from `script-src`.** Replace the Tailwind Play CDN with a compiled static Tailwind stylesheet (build step). After this, `cdn.tailwindcss.com` also drops out of `script-src`.
5. **Tighten `style-src`** - remove `'unsafe-inline'` for styles via hashes/nonces and elimination of inline `style=""`. Largest frontend effort; lowest XSS value; do last.
6. **Narrow `img-src`** from blanket `https:` to the specific S3 bucket host(s) once the presigned-URL host is fixed/known.
7. **Flip to enforce.** Set `CSP_ENFORCE=true` in a staging environment first, verify zero functional regressions, then production. Keep the report endpoint live in enforce mode to catch regressions.

Priority summary: **nonces for `script-src` (step 3) is the only step that materially improves the security posture** - everything else is allowlist hygiene or deferred frontend cleanup. Enforcing the *current* policy (which still has `'unsafe-inline' 'unsafe-eval'` in `script-src`) would add little XSS protection, which is precisely why this stage ships Report-Only and does not flip the switch.

---

## 7. Did helmet reconfiguration affect other headers? - No.

The `app.use(helmet({...}))` call was **not functionally reconfigured**. The diff to that call is comment-only:

- `contentSecurityPolicy: false` - value unchanged (only the trailing `// ...` comment text changed from a TODO to a pointer at the new middleware).
- `crossOriginEmbedderPolicy: false` - unchanged (does not appear in the diff at all).
- No `hsts`, `frameguard`, `referrerPolicy`, `noSniff`, or other helmet option was added, removed, or altered.

Therefore every other security header helmet was already producing is byte-identical to before this stage:

| Header | Status after Stage 2B-2B |
|---|---|
| `Strict-Transport-Security` (HSTS) | Unchanged (helmet default, untouched) |
| `X-Content-Type-Options: nosniff` | Unchanged |
| `X-Frame-Options: DENY` | Unchanged (and consistent with the new `frame-ancestors 'none'`) |
| `Referrer-Policy` | Unchanged |
| `X-DNS-Prefetch-Control`, `X-Download-Options`, etc. | Unchanged |
| `Content-Security-Policy(-Report-Only)` | **New**, emitted by the dedicated middleware, not by helmet |
| `Report-To` | **New**, emitted alongside CSP for the Reporting API |

The only behavioral change introduced by this stage is the addition of the Report-Only CSP header pair and the new `/api/csp-report` endpoint. Nothing is blocked; nothing else changed.

---

## 8. Verification performed

- `node --check server.js` -> OK
- `node --check src/config/csp.js` -> OK
- Runtime: default `headerName()` = `Content-Security-Policy-Report-Only`; with `CSP_ENFORCE=true` = `Content-Security-Policy`.
- Runtime: production CSP string includes `upgrade-insecure-requests`; non-production string omits it.
- Runtime: `CSP_CONNECT_SRC_EXTRA` correctly appends to `connect-src`.
- Runtime: `Report-To` header value is valid JSON defining the `default` group at `/api/csp-report`.
- Diff inspection: confirmed the helmet call's option values are unchanged (comment-only delta).
- Confirmed no dashboard/frontend file was modified in this stage.

## 9. Out of scope / not done (by design)

- No nonce/hash migration (frontend-wide; roadmap step 3).
- No Tailwind compilation (roadmap step 4).
- No inline-script extraction (Report-Only blocks nothing, so none was needed to keep the frontend working; none done opportunistically).
- No enforce flip - `CSP_ENFORCE` defaults to false and there is no code path that defaults it true.
- No escape-helper, `auth.js`, auth, or route-protection changes.
