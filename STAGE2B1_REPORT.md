# Stage 2B-1 Report — SEV-H-011 & SEV-H-012 Remediation

Date: 2026-05-16
Scope: **SEV-H-011** (insecure file upload) and **SEV-H-012** (unauthenticated `/uploads` serving) plus the minimal collateral they require. No XSS escaping, no CSP, no cookie migration, no dashboard refactor, no auth-middleware changes beyond what these findings need. No model schema changes (existing `fileName`/`originalFileName`/`storageType`/`s3Key`/`filePath` fields sufficed).

Syntax: `node --check` run after every change and once over **every** `.js` file in the project — **ALL JS SYNTAX OK**.

**Dependency note:** the task suggested `file-type`. It is **not installed**, and its current major is **ESM-only** while this codebase is CommonJS (`require`), so it cannot be `require()`d, and `npm install` is not reliably available here. Per the standing "do not invent/break dependencies" rule, a small **self-contained magic-byte sniffer** (`sniffMagic`) was implemented instead — no new dependency. This is called out as a deliberate substitution; it covers exactly the allowlisted types (see Known limitations).

---

## 1. Per-finding sections

### SEV-H-011 — File upload content validation, sanitization, presigned caps

**Files:** `server.js`, `src/utils/s3Service.js`.

**Multer (server.js):**
- Replaced the conditional disk/memory storage with **`multer.memoryStorage()` always**, so bytes are inspected before anything is persisted. The old `multer.diskStorage` (which named files from `file.originalname`) is gone entirely.
- Removed the old mimetype-based `fileFilter` (client-controlled, accepted video types). Multer now only enforces the **10 MB hard size cap** (`limits.fileSize`) so oversize files are rejected before a full read; the authoritative type decision is post-multer.

**Magic-byte validation (server.js helpers):**
- `sniffMagic(buf)` inspects the leading bytes and returns `pdf | jpg | png | webp | zip` (OOXML container) or `null`. PDF `%PDF`, JPEG `FF D8 FF`, PNG 8-byte signature, WEBP `RIFF…WEBP`, ZIP/OOXML `PK\x03\x04`. The client mimetype is ignored.
- `UPLOAD_ALLOWLIST` per endpoint: `student-upload` → `pdf,jpg,png,webp,docx`; `tool` → `pdf,docx,xlsx,pptx`.
- `validateUploadBuffer(file, category)` returns `{ok, ext, displayName, isImage}` or `{ok:false,status,message}`. It rejects unrecognised content (400), enforces the per-endpoint allowlist, **caps images at 5 MB** (`MAX_IMAGE_BYTES`), and for OOXML (all ZIP) picks the concrete `docx/xlsx/pptx` from the *claimed* extension constrained to the endpoint's allowed OOXML set (the security boundary — "is this a ZIP/PDF/image, not an EXE/script" — is enforced by the signature; see Known limitations).
- `sanitizeDisplayName(name)` → `path.basename` (strips path components), strips control chars/null bytes, conservative charset, collapses dots, caps 255, fallback `file`.

**Upload handlers rewritten:**
- `POST /api/tools/upload`: validates with category `tool`; storage filename is **`${crypto.randomUUID()}.${ext}`** (no `originalname` in the name or S3 key); `toolType` path segment sanitised; S3 path passes `{displayName, inlineImage}`; **local path now `fs.writeFileSync(buffer)`** (required because memoryStorage means there is no `req.file.path`); `originalFileName` stored as the sanitised display name.
- `POST /api/student-uploads`: validates with category `student-upload` early; the practical-must-be-PDF check now uses the **magic-byte result (`v.ext`)** not `req.file.mimetype`; storage filename is a UUID; folder path identifier segments (`unitId`, `studentId`, `uploadType`) sanitised; `originalFileName` and the audit `details.fileName` use the sanitised display name. (Student uploads remain S3-only, as before.)

**s3Service.js:**
- `sanitizeS3Key(key)` (exported): rejects empty, `..`, `/./`, null byte, leading/trailing `/`, or any char outside `[A-Za-z0-9._/-]` — throws `Invalid storage key`.
- `uploadToS3(...folder, options)`: composes then **sanitises** the key; stores untrusted content as `ContentType: application/octet-stream` + `ContentDisposition: attachment; filename="<sanitised>"`; only when `options.inlineImage` is set does it keep the image `ContentType` with `inline` disposition; `ACL:'private'` retained.
- `getPresignedUrl(key, expiresIn=900, options)`: **caps TTL at 900 s** (`Math.min(... ,900)`) regardless of caller; sanitises the key; sets `ResponseContentType`/`ResponseContentDisposition` (octet-stream+attachment by default; image+inline only for images) and `ResponseCacheControl: no-store` on the presigned GET. Existing callers that passed `3600` now transparently get 900.
- `dispositionFilename()` strips quotes/backslashes/control chars for the header.

### SEV-H-012 — Authenticated upload serving

**Files:** `server.js` (+ relies on hardened `s3Service.js`).

- **Removed** `app.use('/uploads', express.static('uploads'))` entirely (replaced with an explanatory comment). Nothing is served from the `uploads` directory statically anymore.
- **New route `GET /api/files/:category/:id/download`** (`category` ∈ `student-upload | tool`):
  - Auth via `fileDownloadAuth`: a valid short-lived signed `?t=` capability token **or** a normal `verifyToken` Bearer session. (The token path exists only so the existing *authFetch → `{url}` → `window.open`* flow keeps working for **local** files, since a browser navigation cannot attach a Bearer header. S3 uses self-authorizing presigned URLs and needs no token.)
  - Validates the `:id` is a 24-hex ObjectId.
  - **Ownership** (skipped only when a valid capability token was presented, since the token is issued *after* an ownership check by the per-model endpoint and is file-scoped + 15-min): student-upload → admin/registrar/cibec bypass else `upload.studentId === req.user.admissionNumber`; tool → admin/hod bypass else `tool.trainerId === req.user.userId`.
  - **403 for both not-found and not-owner** (matches the SEV-H-007 pattern).
  - S3 → `res.redirect` to a 15-min presigned URL carrying the SEV-H-011 disposition/type protections + `X-Content-Type-Options: nosniff`.
  - Local (tools only) → **path-traversal check** (`path.resolve(filePath)` must start with `path.resolve(uploadsDir)+sep` and exist), then `res.sendFile` with `Content-Type: application/octet-stream`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- **Capability token** (`signFileGrant`/`verifyFileGrant`): a compact `base64url(payload).base64url(HMAC-SHA256(payload, JWT_SECRET))` with `{cat,id,exp}` and a 15-minute expiry, constant-time compared. No new dependency (Node `crypto` + existing `config.jwt.secret`). Verified offline: valid passes; tampered, garbage and expired all return `null`.
- **Existing download endpoints updated** so no `/uploads/...` URL is ever emitted and the frontend contract (`{url}`) is preserved:
  - `GET /api/tools/:toolId/download`: added the missing **ownership** check (admin/hod or owning trainer; 403 both cases); S3 → hardened 15-min presigned; **local → returns `/api/files/tool/<id>/download?t=<grant>`** instead of `/uploads/...`.
  - `GET /api/student-uploads/:uploadId/download`: kept its SEV-H-007 ownership; the presigned call now passes display/image options and is auto-capped to 15 min (was `3600`).

**Frontend changes:** a repo-wide grep for `/uploads/`, `href="/uploads`, `src="/uploads`, and fetch calls to `/uploads` in `src/` and `public/` found **zero** direct references — every consumer goes through the download endpoints' `{url}` (then `window.open`). Because those endpoints still return a usable self-authorizing URL (presigned for S3, signed `?t=` for local), **no frontend file needed changing**. The one permitted frontend change was therefore unnecessary; no dashboard was touched.

---

## 2. Breaking changes for operators

1. **`/uploads/...` URLs are dead.** Any externally bookmarked/emailed link to `https://host/uploads/...` now 404s. Files are reachable only via the app (authenticated download endpoints → `/api/files/...` or presigned S3). Old uploads themselves are untouched and still downloadable through the app (see Known regressions).
2. **Presigned URL lifetime is now 15 minutes** (was 1 hour). Any flow that cached/shared a presigned link for longer will need to re-request it.
3. **No new env required.** The capability token is signed with the existing `JWT_SECRET` (via `config.jwt.secret`) — ensure it remains set (already mandatory in prod). Rotating `JWT_SECRET` immediately invalidates any outstanding 15-min local-file capability links (acceptable, self-healing).
4. **Local-storage deployments**: files are streamed through Node now (not Nginx/static). For S3 deployments (production/Vercel) downloads still redirect to S3 — no bandwidth change.
5. **No dependency install needed** (no `file-type`); `npm install` not required for this stage.

---

## 3. Manual verification checklist (adversarial)

- **EXE disguised as PDF:** upload a Windows `.exe` (starts `MZ`) renamed `report.pdf` to `POST /api/tools/upload` or `/api/student-uploads` → **400** "Unsupported or unrecognised file content" (sniff returns `null`; `MZ` is not allowlisted). Verified offline: `sniff(MZ) → null`.
- **Path-traversal filename:** upload a valid PDF named `../../../../etc/passwd` → succeeds; confirm the stored `fileName` is `<uuid>.pdf`, the S3 key is `<folder>/<uuid>.pdf`, and `originalFileName` is the sanitised display value (`passwd`, no path). Verified offline: `sanitizeDisplayName('../../etc/passwd') → 'passwd'`.
- **Null/control bytes in name:** upload with name `a\x00\x01b.pdf` → stored UUID name; display name `ab.pdf`. Verified offline.
- **Disallowed-but-real type:** upload a genuine `.xlsx` to `POST /api/student-uploads` (allowlist pdf/jpg/png/webp/docx) → **400** "Office document type not allowed here". A genuine `.gif`/`.mp4` anywhere → **400**.
- **Image size cap:** upload a 7 MB PNG → **400** "Image files must be 5MB or smaller"; a 7 MB PDF → accepted (≤10 MB doc cap); a 12 MB anything → rejected by multer before full read.
- **IDOR on download (Bearer):** as student A, `GET /api/files/student-upload/<B's id>/download` → **403**; non-existent id → **403** (identical body). As trainer A, `GET /api/files/tool/<B's tool id>/download` → **403**. As admin → **200**/redirect.
- **IDOR on the per-model endpoints:** `GET /api/tools/:toolId/download` as a non-owner trainer → **403** (newly enforced).
- **Capability token:** call `GET /api/tools/:toolId/download` (local storage) as the owner → response `url` = `/api/files/tool/<id>/download?t=…`; `window.open` it → file streams with `Content-Disposition: attachment` + `nosniff`. Tamper one char of `t` → **403**. Wait >15 min → **403** (expired). Use a token for tool X on id Y → **403** (cat/id mismatch). Verified offline: tampered/garbage/expired all rejected.
- **Static path gone:** `curl -i https://host/uploads/<anything>` → **404** (mount removed).
- **Presigned cap:** request any S3 download; inspect the presigned URL `X-Amz-Expires` → **900**, and the response carries `Content-Disposition: attachment` (or `inline` for images) and octet-stream type.
- **S3 key sanitization:** unit-call `sanitizeS3Key('a/../b')` / `'/leading'` / `'bad*char'` → throws `Invalid storage key`.

---

## 4. Known regressions & limitations

- **Newly rejected file types that previously "worked":** the old filter accepted `application/msword` (.doc), `video/mp4`, `video/mpeg`, `video/quicktime`, and anything whose *claimed* mimetype matched. Now: `tool` accepts only pdf/docx/xlsx/pptx; `student-upload` only pdf/jpg/png/webp/docx. **Legacy `.doc`, all video uploads, and `combined_video` uploads are now rejected at upload time.** `combined_video` is a real `uploadType` in the student-uploads flow — video submissions for it will fail until video types are explicitly added to the allowlist with corresponding magic-byte signatures (deferred; flagged for product decision, as it expands the executable-content surface).
- **Existing files are still served.** Type/name hardening applies only to *new* uploads. Files already stored (including ones with weird original names or non-allowlisted types) are untouched and remain downloadable through the authenticated endpoints — `originalFileName` is only used for the Content-Disposition display and is sanitised at serve time too. **No data migration/cleanup script is required** (storage keys/paths were never derived from user input in a way that needs rewriting for security — the new download path validates the S3 key and the local path on every request). A cosmetic backfill of old `originalFileName` values is optional and not security-relevant; not provided.
- **OOXML type granularity:** docx/xlsx/pptx are all ZIP (`PK\x03\x04`); the first bytes cannot distinguish them. The concrete type is taken from the claimed extension *constrained to the endpoint's allowed OOXML set*. The security guarantee ("not an executable/script/HTML") holds via the ZIP signature; a user could still mislabel a docx as xlsx. Deep disambiguation (unzipping `[Content_Types].xml`) was out of minimal scope — documented, not guessed.
- **Presigned-URL response headers vs. very old S3 objects:** `ResponseContentDisposition/Type` are applied at presign time, so even objects uploaded before this stage get safe disposition on download. Objects' *stored* `ContentType` for legacy items may still be a real type, but the presigned response overrides it — inline execution is prevented on the download path.
- **15-min capability token for local files** is a bearer-style URL: anyone with the link within 15 minutes can fetch that one file. This matches the S3 presigned-URL trust model and is strictly better than the previous unauthenticated permanent static path. Acceptable, documented.
- **`enforceStudentFirstLogin`** (Stage 2A) also gates `/api/files/...` for a student still in forced-password-change — such a student can't download until they change their password. Minor, intended.
- No functional regression expected for the normal S3 production path: upload → magic-byte validated → UUID stored → record persisted with UUID `fileName` + sanitised `originalFileName` → dashboards call the download endpoint → presigned (15-min, attachment) → `window.open` works.

---

## 5. What's deferred / not done (per scope)

- Adding video support back (`combined_video`) with proper magic-byte signatures + an explicit, risk-reviewed allowlist entry — product decision.
- Migrating to the real `file-type` library if/when an ESM-compatible build path or a CJS-pinned version is approved (the self-contained sniffer is functionally sufficient for the current allowlist).
- A unified single file model / generic `/api/files/:id` lookup (kept the category-dispatch form to match existing per-model endpoints without a schema change).
- Cosmetic backfill of pre-existing `originalFileName` values (not security-relevant; no cleanup script needed).
- XSS escaping, CSP, cookie migration, and all other findings — explicitly out of this pass.
