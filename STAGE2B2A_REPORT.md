# Stage 2B-2A Report — XSS Output-Encoding Pass

Date: 2026-05-17
Scope: escape server/response data at every DOM sink across the dashboards (ref SEV-H-010). No CSP, no auth.js logic changes (only escape helpers added), no structural refactor, no auth-fetch changes, no UI-text/behavior changes. This is the largest diff of the fix sequence.

Result: all modified `.js` files pass `node --check`; the inline `<script>` blocks of all four inline-HTML dashboards were extracted and pass `node --check`. A final residual grep confirms every remaining unescaped `${…}` in a DOM-sink context is a number, a constant, or a constant-map lookup.

---

## 1. Files modified — sinks before / escaped / left as-is

"Sinks" = content-setting `innerHTML`/`insertAdjacentHTML`/`outerHTML`/`document.write`/`.html()` plus each `${…}` interpolation inside HTML-building template/concat strings. Clears (`= ''`) and constant templates are not counted as needing work.

| File | Sink interpolations escaped (escapeHtml/escapeAttr added) | Left as-is (reason) |
|---|---|---|
| `dean/deanDashboard.js` | 18 (student row, notes list, toast, JSON-in-onclick) | `student.year`, `formatDate()`, constant alert/no-data templates, `priorityColors[]`/`categoryIcons[]` map lookups |
| `cibec/cibecDashboard.js` | 18 (upload cards, modal items, filter chips, onclick IDs) | `fileSize`/`year`/`version` numbers, `new Date()`, `uploadType*[]` constant maps |
| `ilo/iloDashboard.js` | 43 (graduation+attachment lists, review modal, **both `document.write` print reports**) | `new Date()`, `getStatusClass()` constant switch |
| `student/uploadSection.js` | 16 (unit cards, slots, profile-upload info, error msg, onclick IDs) | `version`/dates numbers, `unit.unitType` ternary→constant, `assessmentNum`/`practicalNum` ('1'..'3' constants) |
| `admin/adminDashboard.js` | 24 (student table+cards, trainers, financial table, programs, toast, `value=` search) | `student.year`, `formatCurrency()`, `.length` counts, `getTimeAgo()`, internal alert (commented), constant alert/icon maps |
| `finance/financeDashboard.js` | 20 (student rows + `data-*` attrs, receipts modal, `data-payment`, payslip group, toast) | currency/dates/`.length`, `formatPaymentMode`* via escape, `monthNames[]` constant |
| `hod/hodDashboard.js` | 45 (courses, units, trainers, assignments, common-unit assignments, options, onclick/value attrs) | `.length` counts, `new Date()`, `getStatusBadge()` (constant-map markup), profile fields use `.textContent`, numeric stats |
| `trainer/trainerDashboard.js` | 38 (already had escapeHtml in card builders; added onclick IDs + payslip list/modal fields) | jsPDF `doc.text` (own-data PDF, not a DOM sink), numbers/dates, `bulkToolType` (fixed dropdown), constant status maps |
| `student/studentPortal.js` | 25 (payment history `data-payment`, units grid + register onclick, receipt modal, bulk-register modal attrs, notes card+modal, toast, course header) | `formatCurrency()`, dates, `.length`, page numbers, `setAttribute('data-payment',…)` (DOM API, not HTML-parsed), `printReceipt` re-emits already-escaped DOM |
| `registrar/RegistrarDashboardNew.html` (inline) | 24 (student table, details modal, dept card, both promotion tables, toast) | `student.year` numbers; `letterHTML` injection is a **constant** static file fetch; search-string builders (`.toLowerCase()`, not innerHTML); `editStudent` sets form `.value` (DOM property, not HTML) |
| `deputy/DeputyDashboard.html` (inline) | 35 (tool cards/modal, students+trainers tables, dept course view, toast, pagination onclick) | numeric `assignedUnits`/`studentCount`/`creditHours`/`year`, `submittedAt` date, constant chart-error/option templates |
| `finance/FinanceDashboard.html` (inline) | 3 (department analysis name, export-format modal title, threshold-status message) | `stats.studentCount` number, formatCurrency, constant format buttons |
| `student/StudentPortalTailwind.html` (inline) | 12 (graduation & attachment existing-application detail blocks, eligibility error msgs, status info) | dates, `data.yearOfStudy`/`data.level` (escaped anyway), logout modal (constant), `.textContent` fields |
| `registrar/AdmissionLetter.html` | 0 changes (see §5) | already 100% `textContent` on pre-existing DOM nodes |
| `finance/financeAnalytics.js`, `registrar/exportUtils.js`, `student/studentService.js` | 0 — **no DOM HTML sinks exist** (jsPDF/CSV/SheetJS export of the operator's own downloaded data, or pure data fetch). Per scope "what not to escape", export-of-own-data is not an XSS sink. | entire files |

`document.write` count is now effectively neutralized: the two ilo print reports and `studentPortal.printReceipt` still call `document.write`, but every interpolated value is escaped at the source (ilo) or is an already-escaped serialized DOM fragment inside a constant template (studentPortal). Converting these to DOM construction would be a structural refactor, which is out of scope — flagged here.

---

## 2. Escape helpers — shape and location

Added to **`public/js/auth.js`** (every dashboard already loads it, so no HTML `<script>` changes were needed and there is one source of truth). Exposed as `window.escapeHtml`, `window.escapeAttr`, `window.escapeJs`, and `window.ESC = { … }`.

- `escapeHtml(v)` — HTML text context. Coerces null/undefined→`''`, `String(v)`, escapes `& < > " ' /` (6 chars). Safe inside double-quoted attributes too (since `"` is escaped).
- `escapeAttr(v)` — attribute context. `escapeHtml` plus backtick→`&#96;` and space→`&#32;` (safe even in unquoted attributes; browsers decode these back so display is unchanged in quoted attributes).
- `escapeJs(v)` — JS string context. `JSON.stringify` then strips the outer quotes (caller wraps), and additionally neutralizes `<` `>` `&` and U+2028/U+2029 so it is safe inside inline `<script>`/event-handler contexts. (Used rarely — most JS-context sinks here are `onclick="fn('${id}')"` which are attribute contexts and use `escapeAttr`.)

Verified functionally offline: `<img onerror>` → entity-encoded; quotes/slash/backtick/space encoded; `</script>` → `</script>`; null→`''`; number→string.

No `auth.js` behavior was changed beyond adding these helpers (the Stage 2B-1B `fetch` logic is untouched). No new dependencies.

---

## 3. Local escapeHtml reconciliation

Four files had their own `escapeHtml`:

| File | Old local behavior | Action |
|---|---|---|
| `trainer/trainerDashboard.js` | `div.textContent=…; return div.innerHTML` → escapes only `& < >` (NOT `"` `'` `/`) | removed; 38 call sites now use the stricter global |
| `hod/hodDashboard.js` | 5-char map: `& < > " '` (NOT `/`), and returned non-strings unchanged | removed; call sites use stricter global (also coerces non-strings) |
| `deputy/DeputyDashboard.html` | `div.textContent` style (only `& < >`) | removed; 24+ call sites use stricter global |
| `registrar/RegistrarDashboardNew.html` | `div.textContent` style (only `& < >`) | removed; call sites use stricter global |

Every local was **looser** than the centralized version (none escaped `/`; the div-based ones didn't escape quotes). Per the rule "match the stricter direction," the centralized helper (which escapes `& < > " ' /`) is kept as-is; no loosening. Replacing the locals strictly increases escaping coverage at those existing call sites.

---

## 4. Suspicious findings (potential pre-existing stored XSS)

This was a **static** code pass — no live database/response data was inspected, so no concrete payload was observed. Nothing in the code itself indicated previously-injected HTML (no hardcoded `<script>`/`<img onerror>` in seed/sample data within these files). The relevant risk remains theoretical-until-data-inspected: many escaped fields (student/trainer names, note titles/content, application comments, county/town, file names) are free-text written by other privileged users (registrar/dean/finance/ILO) and rendered to other roles — exactly the stored-XSS path SEV-H-010 describes. Escaping now neutralizes it at render time. **Server-side sanitization of already-stored values is out of scope** (per rules) and is recommended as a separate cleanup: if any stored name/comment already contains markup it will now render as visible literal text (safe but ugly), which is the expected, acceptable outcome.

---

## 5. AdmissionLetter.html — route taken

**Route 1 (textContent against pre-existing DOM nodes) — and it was already in that state.** Every student field is populated via `document.getElementById('…').textContent = studentData.…` (lines ~282–306); there is no template-literal/`innerHTML`/`document.write` construction of the letter from student data. The Stage 2A SEV-H-014 work had already replaced the "Initial Password: <phone>" line with a static `textContent` message. `textContent` does not parse HTML, so all fields are inherently XSS-safe. The PDF is generated by `html2pdf` from those already-safe DOM nodes (and is the registrar's own generated artifact). **No changes were required**; this is the cleanest approach and was chosen because the file already implemented it.

---

## 6. Manual verification checklist (one adversarial test per dashboard)

Use the payload `<img src=x onerror=alert('XSS')>` (and for attribute checks, a name like `a" onmouseover="alert(1)` ). In each case the payload must render as **literal visible text** and no alert/script must execute.

- **Admin:** register a student named `<img src=x onerror=alert(1)>`; open Admin → Students. Name shows as literal text in both desktop table and mobile card; "View" still works.
- **Registrar:** same student → Registrar dashboard student table + "View" details modal + Promotion tables: literal text, no alert; export still works.
- **Finance:** record a payment with M-Pesa ref `"><script>alert(1)</script>`; open Finance → student row, "Receipts" modal: literal; `data-payment` attribute does not break the row.
- **Dean:** add a student note with title `<svg onload=alert(1)>` and body containing `</p><script>…`; view Dean notes list + the public note as the student (Student Portal → Notes): literal text both places.
- **HOD:** create/seed a trainer named `<img onerror=alert(1)>` and a unit named with `</td><script>`; HOD → Courses, Trainers, Assignments, Common-Unit assignment list, options dropdowns: literal; assign/unassign buttons still pass the correct id.
- **Trainer:** upload a tool with original filename `x"><img src=x onerror=alert(1)>.pdf`; Trainer → Tools card + payslip list/modal: literal; Download/Delete still target the right tool id.
- **CIBEC:** with the malicious upload above, CIBEC → uploads list, student-details modal, filter chips (type a filter value `"><b>`): literal; view/download buttons work.
- **ILO:** an application from a student named `<script>alert(1)</script>` in county `'"><img>`; ILO → graduation + attachment lists, Review modal, and **Print** (print window): literal text in screen and printed report.
- **Deputy:** a tool whose trainer/unit names contain markup; Deputy → tools cards/modal, students & trainers tables, department course view: literal; pagination & review buttons work.
- **Student Portal:** as a student whose name was set with a payload by the registrar — payment receipt modal, units list (unit names with markup), bulk-register modal, dean notes card/modal: literal; "Register"/"View Note" still pass correct ids; print receipt shows literal text.

---

## 7. Coverage honesty — audited vs sampled

- **Fully read & escaped, then residual-grepped:** dean, cibec, ilo, uploadSection, admin, finance(JS), studentPortal, finance/FinanceDashboard.html, student/StudentPortalTailwind.html, AdmissionLetter (confirmed clean). For these I read every sink region in full.
- **Large files (hod ~1965, trainer ~2093, studentPortal ~1693, RegistrarDashboardNew.html ~2400+, DeputyDashboard.html ~2000):** I did **not** read every line. I located every sink via `grep` (`innerHTML`/`insertAdjacentHTML`/`document.write`/`outerHTML`/`${…}` in HTML), read each sink region with surrounding context, applied contextual escaping, then ran a **residual sweep grep** across the whole file for any server-shaped `${obj.prop}` in a tag/attr/onclick context not wrapped in an escape function. The final repo-wide sweep returned only numeric/constant interpolations (e.g., `student.year`, `*.length`, `monthName` constant array) which are intentionally left per the rules.
- **trainer/hod/deputy/registrar already had partial escaping** (their local `escapeHtml`); I preserved those call sites (now pointing at the stricter global) and only added escaping where it was missing (mostly onclick id attributes and newer payslip/common-unit code paths).
- **Not modified, reviewed and justified:** `financeAnalytics.js`, `exportUtils.js`, `studentService.js` (no DOM HTML sinks). Login pages `FirstLogin.html`, `HODLogin.html`, `TrainerLogin.html` are **out of scope** (login pages, excluded every stage); their `innerHTML` uses are constant icons/options or a password-strength badge built from constant maps keyed off the user's *own* typed password (self-only, not server data) — flagged here, not changed.
- **Residual `document.write`** (ilo ×2, studentPortal ×1) and `setAttribute('data-payment', JSON.stringify(...))` (studentPortal) retained: the `document.write` interpolations are escaped at source / already-escaped DOM; `setAttribute` is a DOM API that does not HTML-parse its value. Converting `document.write` to DOM building is a structural refactor and was deliberately not done.

### Deferred / recommended next
- Server-side sanitization or validation of stored free-text (names, notes, comments, filenames) — out of scope here; escaping makes it safe to display, but cleaning stored data is a separate task.
- Replacing the three `document.write` print flows with DOM construction (or a sandboxed print iframe) — structural, out of scope.
- CSP (explicitly excluded this stage) remains the defense-in-depth follow-up.
