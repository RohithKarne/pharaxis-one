# CODEX_LOG — PMO & Engineering Updates
> Codex writes here on changes. Claude reads via Explore subagent (never directly).
> Old entries → BACKUP.md

---

## Entries (Newest First)

### 2026-03-15 — System Activity + Service Log Fixes + Status Viewer + Inquiry Audit
- **Type:** Feature/Fix
- **What:**
  1. **System Activity tab** built (email import summary cards + filters + table).
  2. **Service Log IST** rendering fixed (UTC parsing + manual IST formatting).
  3. **Manual fetch logging** added to `service_logs` so Service Log/System Activity update immediately.
  4. **Inquiry audit logging** added for `PATCH /api/inbox/:id` with before/after values.
  5. **Audit filters** enhanced with `entity` and `entity_id`.
  6. **Global status viewer** beside date on all screens + login pages; `/api/health` endpoint added.
- **Action:** Restart backend to apply new routes/logging.

### 2026-03-15 — System Activity Tab + Service Log IST + Structured Service Details
- **Type:** Feature
- **Files:** `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`, `mims/backend/routes/admin/systemActivity.js` (NEW), `mims/backend/services/emailPoller.js`, `mims/backend/services/serviceLogger.js`, `mims/backend/database/db.js`, `mims/backend/server.js`
- **What:**
  1. Service Log dates now render in IST (`Asia/Kolkata`) with `IST` suffix. UTC-safe parsing via `Date.UTC` to avoid browser timezone drift.
  2. System Activity tab (Admin Console tab 2): summary cards (total/success/failed/warning), filters (task, status, from date), refresh button, paginated table.
  3. `GET /api/admin/system-activity` — returns email-import activity from `service_logs` with structured fields + unfiltered summary counts.
  4. `details` column added to `service_logs`. `logService()` now accepts JSON details. Poller logs: task_name, start_at, end_at, counts, last_poll_at, last_activity_at.
  5. Manual fetch (`POST /api/inbox/fetch`) also logs structured details including `trigger: manual`.
- **Action:** Restart backend to apply DB schema change (`service_logs.details` column).

### 2026-03-15 — Global Frontend/Backend Status Viewer
- **Type:** Feature
- **Files:** `mims/backend/server.js`, `mims/frontend/src/components/Topbar.jsx`, `mims/frontend/src/shared/components/Topbar.jsx`, `mims/frontend/src/pages/LoginPage.jsx`, `mims/frontend/src/modules/max/pages/LoginPage.jsx`
- **What:** `/api/health` endpoint added. Status widget on all screens + sign-in pages: "Frontend: On/Off" + "Backend: On/Off" with green/red dots. Backend ping every 10s.
- **Action:** Restart backend.

### 2026-03-15 — Inbox Audit Logging + Audit Log Filters
- **Type:** Feature
- **Files:** `mims/backend/routes/inbox.js`, `mims/backend/routes/admin/config.js`, `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`
- **What:** `PATCH /api/inbox/:id` now writes to `audit_logs` with before/after values (status, is_locked, locked_by, color). Audit Trail API + UI now support filtering by `entity` and `entity_id` for inquiry-level traceability.
- **Action:** No DB schema change.

### 2026-03-15 — Inbox: Fetch Button + Attachment Downloads (QA SIGNED OFF ✅)
- **Type:** Feature
- **Files:** `mims/backend/routes/inbox.js`, `mims/frontend/src/modules/max/pages/InboxPage.jsx`
- **What:**
  1. `POST /api/inbox/fetch` — any authenticated user triggers IMAP ingest for all active inbound accounts. Returns `{ ingested: n }`. Updates `last_ingest_at` per account.
  2. `GET /api/inbox/:id/attachments` — returns `{ attachments: [{ id, filename, mime_type, size_bytes }] }`.
  3. `GET /api/inbox/attachments/:aid/download` — streams attachment file with auth check (`fs.createReadStream`).
  4. UI: "Sync from Server" replaced with "⬇ Fetch" button (any user). Shows "+N new" or "Up to date" after fetch. Attachment files shown as download buttons using fetch + blob URL (auth header preserved — plain `<a href>` bypasses Authorization middleware).
- **QA:** 5/5 test cases passed. TC-03 and TC-04 confirmed by Rohith direct testing.
- **Action:** Restart backend. No DB schema change.

### 2026-03-15 — emailPoller.js: imapflow Rewrite (Gmail Fix) (QA SIGNED OFF ✅)
- **Type:** Fix
- **File:** `mims/backend/services/emailPoller.js`
- **What:** Replaced `imap` v0.8.19 callback API with `imapflow` v1.2.13 async/await. Removed 5 dead functions (toImapSinceDate, countAttachments, collectAttachmentParts, decodeQuotedPrintable, saveAttachment). Attachments now read from `parsedEmail.attachments[].content` (Buffer via mailparser).
- **Why:** `imap` sends `AUTHENTICATE PLAIN` (inline SASL) when it detects `SASL-IR` in Gmail's CAPABILITY — Gmail rejects this. imapflow uses standard `LOGIN` which Gmail accepts.
- **Action:** Restart backend. `npm install` already applied — imapflow was in package.json.

### 2026-03-14 — Superadmin Console (Module Access Control)
- **Type:** Feature
- **What:** Added `superadmin_console` + `mims_core` modules, per-user module assignments (`user_module_permissions`), `/api/superadmin/*` routes, and Superadmin MPA (`superadmin.html`) with user module assignment UI. MIMS routes are now gated by `mims_core`. Superadmin is separate from MIMS UI. Default Superadmin account is enforced at startup.
- **Action:** Restart backend to apply DB schema update.

### 2026-03-13 — Inbox Review Fixes (Locks + PATCH + source_tag)
- **Type:** Fix
- **What:** `is_locked`/`locked_by`/`color` added to `inquiries` via ALTER TABLE; GET inbox returns these fields; `PATCH /api/inbox/:id` added; UI calls PATCH for Lock/Color/Mark Pending when DB-backed; `source_tag` now consistently `'Email'`
- **Action:** Restart backend to apply DB schema change.

### 2026-03-13 — Inbox Hardening (Body + Poller + Auto-Sync)
- **Type:** Fix
- **What:** Poller uses `mailparser` for body parsing, caps 25 msgs/run, runs via `setImmediate`. Inbox API returns `source` field. UI does background sync to bust seed cache.
- **Action:** Restart backend + frontend dev servers.
