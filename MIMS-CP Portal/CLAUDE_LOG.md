# CLAUDE_LOG — Scimax Engineering Changes
> Claude writes here on code changes. Codex reads via Explore subagent (never directly).
> Old entries → BACKUP.md

---

## Entries (Newest First)

### 2026-03-15 — System Activity Tab + Service Log IST + Structured Service Details
- **Files:** `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`, `mims/backend/routes/admin/systemActivity.js` (NEW), `mims/backend/services/emailPoller.js`, `mims/backend/services/serviceLogger.js`, `mims/backend/database/db.js`, `mims/backend/routes/admin/serviceLogs.js`, `mims/backend/server.js`
- **What:**
  1. **Service Log timezone** — Service Log dates now render in IST (`Asia/Kolkata`) with explicit `IST` suffix.
  2. **System Activity tab** — Implemented in Admin Console (tab 2): Refresh button, summary cards (total/success/failed/warning), filters (task, status, from date), and table with requested columns; paginated like Service Log.
  3. **Backend API** — Added `GET /api/admin/system-activity` to return email-import activity from `service_logs`, with summary counts and structured fields.
  4. **Structured service details** — Added `details` column to `service_logs` and updated `logService()` to accept JSON details. Email poller now logs start/end, counts, and last poll/activity timestamps per run.
- **Why:** Rohith requested IST display, System Activity tab for email import, and automatic structured service logging for future visibility.
- **Action:** Restart backend to apply DB schema change (`service_logs.details`).
- **Update:** System Activity summary counts are now unfiltered (complete totals). `last_poll_at` now reflects the latest run regardless of success/failure.

### 2026-03-15 — Fix IST Rendering for Service Log + System Activity
- **Files:** `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`
- **What:** Added UTC-safe parsing for SQLite timestamps (`YYYY-MM-DD HH:MM:SS`) using `Date.UTC`, and manual IST formatting (UTC+5:30) to avoid browser timezone inconsistencies. Fixes Service Log/System Activity display.
- **Why:** SQLite timestamps were parsed as local time; needed UTC-to-IST conversion for correct display.

### 2026-03-15 — Manual Fetch Logs to Service Log/System Activity
- **Files:** `mims/backend/routes/inbox.js`
- **What:** Added `logService()` entries for manual inbox fetch (`POST /api/inbox/fetch`) per account, including structured `details` (task_name, trigger, counts, start/end, last_poll_at). Also updates `last_ingest_at` with ISO timestamp.
- **Why:** Ensure manual fetch appears in Service Log and System Activity immediately.

### 2026-03-15 — Audit Inbox Status Changes
- **Files:** `mims/backend/routes/inbox.js`
- **What:** Added audit logging for `PATCH /api/inbox/:id` to record status/lock/color changes with before/after values in `audit_logs`.
- **Why:** Enables traceability for inquiry moves to Pending (who/when/what changed).

### 2026-03-15 — Audit Log Filters for Inquiry Tracking
- **Files:** `mims/backend/routes/admin/config.js`, `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`
- **What:** Added Audit Log filters for `entity` and `entity_id` so inquiry-specific status changes can be located quickly.
- **Why:** Rohith requested ability to trace which user moved an email to Pending.

### 2026-03-15 — Global Frontend/Backend Status Viewer
- **Files:** `mims/backend/server.js`, `mims/frontend/src/components/Topbar.jsx`, `mims/frontend/src/shared/components/Topbar.jsx`, `mims/frontend/src/pages/LoginPage.jsx`, `mims/frontend/src/modules/max/pages/LoginPage.jsx`
- **What:** Added `/api/health` endpoint and a status viewer beside the date on all screens and sign‑in pages. Shows “Frontend: On/Off” and “Backend: On/Off” with green/red dots and a 10s backend ping.
- **Why:** Rohith requested a global visibility widget for server status.

### 2026-03-15 — Inbox: Fetch Button + Attachment Downloads
- **Files:** `mims/backend/routes/inbox.js`, `mims/frontend/src/modules/max/pages/InboxPage.jsx`
- **What:**
  1. **POST /api/inbox/fetch** — new route (auth, any user). Triggers IMAP ingest for all active inbound accounts. Returns `{ ingested: n }`. Updates `last_ingest_at` per account.
  2. **GET /api/inbox/:id/attachments** — returns `{ attachments: [{id, filename, mime_type, size_bytes}] }` for an inquiry.
  3. **GET /api/inbox/attachments/:aid/download** — streams attachment file with auth check. Uses `fs.createReadStream`.
  4. **Inbox UI** — "Sync from Server" button replaced with "⬇ Fetch" button. Shows "+N new" or "Up to date" after fetch. Selecting an inquiry with attachments loads the file list. Each file is a download button using fetch + blob URL (auth header preserved — plain `<a href>` would have been rejected by the middleware).
- **Why:** Users can now fetch emails directly from inbox without going to Admin. Attachments are now visible and downloadable.

### 2026-03-15 — emailPoller.js: Replace imap with imapflow (Gmail fix)
- **File:** `mims/backend/services/emailPoller.js`
- **What:**
  1. Rewrote `ingestAccount()` to use `imapflow` v1.2.13 (async/await) instead of `imap` v0.8.19 (callback-based).
  2. Removed dead code: `toImapSinceDate`, `countAttachments`, `collectAttachmentParts`, `decodeQuotedPrintable`, `saveAttachment` — all made redundant by imapflow + mailparser `attachments` array.
  3. Attachment handling now reads directly from `parsedEmail.attachments[].content` (Buffer) — no separate per-part IMAP fetch needed.
  4. All other logic unchanged: cron scheduler, `logService` wiring, per-account interval checks, `module.exports`.
- **Why:** `imap` v0.8.19 sends `AUTHENTICATE PLAIN` (inline SASL) when it detects `SASL-IR` in Gmail's CAPABILITY response. Gmail rejects this with "Could not parse command". imapflow uses the standard `LOGIN` command which Gmail accepts. Root-caused via raw TLS socket test.

### 2026-03-15 — Remove Inbox Seed Data + Fetch Now Feature
- **Files:** `mims/backend/routes/inbox.js`, `mims/backend/services/emailPoller.js`, `mims/backend/routes/admin/config.js`, `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`
- **What:**
  1. **inbox.js** — removed `generateSeedInquiries()` and all 151-record dummy data. Inbox now returns real DB records only. Empty array when no emails ingested yet.
  2. **emailPoller.js** — exported `ingestAccount` so it can be called on-demand outside of cron.
  3. **POST /api/admin/email-accounts/:id/fetch-now** — new route that triggers immediate IMAP ingest for a specific account, bypassing the polling interval. Logs to `service_logs` and `audit_logs`.
  4. **Fetch Now button** — added to each inbound email account row in Email Accounts UI. Shows "Fetching..." while in progress. Displays count of ingested emails on completion.
- **Why:** Rohith created a new email account and needed to pull real emails immediately without waiting for the cron tick. Dummy data also needed to be removed permanently.


### 2026-03-15 — Service Log: Wire IMAP/SMTP Test Events to DB
- **Files:** `mims/backend/routes/admin/config.js`
- **What:** Added `logService()` to all 3 email test routes — IMAP test (pass/fail), SMTP test (pass/fail), Send Test email (pass/fail). Every manual test action now writes a permanent entry to `service_logs`.
- **Why:** Rohith requirement — service history must never be lost on server restart or browser cache clear. All service events must persist to DB.
- **Rule going forward:** Any new service action must call `logService()`. console.log alone is not sufficient.

### 2026-03-15 — Service Log Tab (Admin Console)
- **Files:** `mims/backend/database/db.js`, `mims/backend/services/serviceLogger.js` (NEW), `mims/backend/routes/admin/serviceLogs.js` (NEW), `mims/backend/server.js`, `mims/backend/services/emailPoller.js`, `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`
- **What:**
  1. **DB** — new `service_logs` table: `id, source, service_type, description, status, created_at`. Indexed on `source` and `created_at` for performance.
  2. **serviceLogger.js** — lightweight `logService({ source, service_type, description, status })` utility. Never throws — logs failures as warnings so parent service is never disrupted.
  3. **GET /api/admin/service-logs** — paginated API with filters: `source`, `status`, `date_from`, `date_to`, `page`, `page_size` (10/20/50). Returns `{ data, total, page, page_size, total_pages, sources }`.
  4. **emailPoller.js** — wired: IMAP ingest success logs `status: success`; ingest failure logs `status: failed`.
  5. **ServiceLogTab component** — filter bar (Source dropdown, Status dropdown, Date From/To, Refine), table (Source / Service Type / Description / Status badge / Date), page-number pagination with page size selector (10/20/50).
- **Why:** Rohith requested Service Log tab — centralised view of all service events, extensible to future services beyond Email.
- **Architecture:** Any future service calls `logService()` to write an entry. The UI picks it up automatically via the Source dropdown.
- **Next:** Remaining Admin Console tabs or F2 Case Management Queues per Rohith direction.

### 2026-03-15 — Admin Console Top Tab Nav + Automated Testing Framework
- **Files:** `mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx`, `mims/frontend/src/index.css`, `mims/frontend/vite.config.js`, `mims/frontend/package.json`, `mims/package.json`, `mims/frontend/src/test/setup.js` (NEW), `mims/frontend/src/test/AdminConsoleTabs.test.jsx` (NEW), `mims/backend/tests/auth.test.js` (NEW), `mims/e2e/admin-console.spec.js` (NEW), `mims/playwright.config.js` (NEW)
- **What:**
  1. **Admin Console redesign** — Removed left Sidebar, added 9-tab horizontal top nav: Service Log, System Activity, Service Dashboard, Configuration, Escalation, Documents, Tables, System, Help. Configuration tab shows existing admin-wrapper + admin-nav (unchanged). All other 8 tabs show SkeletonTab ("🚧 This section is under construction."). Added `.admin-top-tabs` and `.admin-tab` CSS classes with active border-bottom indicator.
  2. **Testing framework** — Vitest + React Testing Library (frontend), Jest + Supertest (backend), Playwright (E2E). `vitest`, `jsdom`, `@testing-library/*` added to frontend devDeps. `jest`, `supertest`, `@playwright/test` added to root devDeps. `module.exports = { app }` added to `server.js` for Supertest.
  3. **5 frontend Vitest tests passing** — renders all 9 tabs, defaults to Configuration, skeleton for non-Config tabs, switches active highlight, shows Configuration content.
  4. **Team structure expanded** — QA team (Narasimha Dir, Bindu Mgr, Krishnapriya Lead, Ramya Sr, Tharun Eng) + Product team (Vanaja PM, Priya PBA, Ananya Sr BA, Meera BA). Rohith speaks to 3 leads: Rajeev, Narasimha, Vanaja.
- **Why:** Rohith requested new tab layout for Admin Console. Narasimha requested automated testing framework setup.
- **Known:** `setThemeState` has no UI caller (theme loads from localStorage on mount; ThemeSwitcher was in old Sidebar). Not a bug, can add later.
- **Next:** Sprint 4 F2 — Case Management Queues (8 pts), or Admin Console tab content per Rohith direction

### 2026-03-15 — Superadmin: Audit Trail + Login Audit
- **Files:** `mims/backend/routes/superadmin.js`, `mims/frontend/src/modules/superadmin/pages/SuperadminPage.jsx`, `mims/frontend/src/modules/superadmin/components/Sidebar.jsx`
- **What:** (1) Added `GET /api/superadmin/audit` — paginated query of `audit_logs` table (limit/offset, max 200, details JSON-parsed); (2) Added `GET /api/superadmin/login-audit` — paginated query of `login_audit` with optional `?status=success|failed` filter; (3) Sidebar — added "Audit Trail" (📋) and "Login Audit" (🔐) nav items, now driven by `activePage`/`onNavigate` props; (4) SuperadminPage refactored into 3 sub-views: `ModuleAccessView`, `AuditView`, `LoginAuditView` — each loads independently; pagination controls on both audit views
- **Why:** Superadmin needs visibility into who changed module access and all login events (Part 11 compliance readiness)
- **Architecture note:** Superadmin = module-level access control. Admin Console User Mgmt = feature-level access. Two separate tiers by design.
- **Next:** Sprint 4 F2 — Case Management Queues (8 pts)

### 2026-03-13 — Inbox Fixes (Review Items)
- **Files:** db.js, routes/inbox.js, services/emailPoller.js, frontend/InboxPage.jsx
- **What:** (1) Added `is_locked`/`locked_by`/`color` columns to `inquiries` table via ALTER TABLE; (2) GET inbox now returns these fields from DB; (3) Added `PATCH /api/inbox/:id` route for status/lock/color updates; (4) Fixed `source_tag` in poller — now always `'Email'` not provider name; (5) Frontend lock, color, and Mark Pending all call PATCH API when inbox is DB-backed
- **Why:** Varun code review of inbox — 3 gaps identified and fixed
- **Next:** Sprint 4 F2 — Case Management Queues skeleton

### 2026-03-12 — Sprint 4 F1: Email Accounts
- **Files:** db.js, config.js, server.js, services/emailPoller.js (NEW), AdminConsolePage.jsx
- **What:** Full Email Accounts — DB schema, 7 API routes (CRUD + test-imap/smtp + send-test), node-cron poller, full UI (list + Add/Edit modal + Send Test modal)
- **Why:** Sprint 4 F1 per frozen FSD
- **Next:** Sprint 4 F2 — Case Management Queues skeleton
