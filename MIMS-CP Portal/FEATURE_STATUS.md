# FEATURE_STATUS — MIMS-CP Portal
> Owned by: Rohith (CPO/PO). Updated by Claude after each delivery.
> Last updated: 2026-03-15

---

## Completed Features

### Email Accounts ✅
- DB: `email_accounts`, `inquiries` (+ `is_locked`/`locked_by`/`color`), `inquiry_attachments`
- Backend: 7 email account routes + `PATCH /api/inbox/:id` + `POST /api/inbox/fetch` + `GET /api/inbox/:id/attachments` + `GET /api/inbox/attachments/:aid/download`
- Poller: **imapflow v1.2.13** (Gmail fix — replaced imap v0.8.19 which used SASL-IR AUTHENTICATE PLAIN rejected by Gmail) + mailparser body + attachment save + graceful shutdown
- UI: Email Accounts list + Add/Edit modal + Send Test; Inbox: lock/color/status DB-persisted + **Fetch button (any user)** + **attachment file list with download**
- QA: All 5 test cases signed off (2026-03-15)

### Superadmin Console ✅
- DB: `user_module_permissions`, `role_permissions`, 13 modules, default role seeds
- Backend: `GET/PUT /api/superadmin/users` (module assignment) + `GET /api/superadmin/audit` + `GET /api/superadmin/login-audit`
- UI: Separate MPA (`superadmin.html`), 3-view sidebar — Module Access / Audit Trail / Login Audit
- Architecture: Superadmin = module-level access; Admin Console User Mgmt = feature-level access

### Service Log Tab ✅
- DB: `service_logs` table (source, service_type, description, status, created_at) — indexed
- Backend: `serviceLogger.js` utility + `GET /api/admin/service-logs` (paginated, filtered)
- Poller wired: IMAP ingest success/fail → writes to service_logs
- UI: filter bar (Source, Status, Date From/To, Refine) + table + page pagination (10/20/50 rows)

### System Activity (Email Import) ✅
- Summary cards: total/success/failed/warning
- Filters: task, status, from date; refresh button
- Table: task name, status, start/end date, counts, last activity/poll

### Global Status Viewer ✅
- UI: “Frontend: On/Off” + “Backend: On/Off” with green/red dots beside date on all screens and sign-in pages
- Backend: `/api/health` endpoint used for ping

### Inbox Audit Logging ✅
- `PATCH /api/inbox/:id` now writes audit entries with before/after values
- Admin Audit Trail supports filtering by `entity` and `entity_id`

### Admin Console Top Tab Nav ✅
- Replaced left Sidebar with 9-tab horizontal top nav
- Tabs: Service Log, System Activity, Service Dashboard, Configuration, Escalation, Documents, Tables, System, Help
- Configuration tab: shows full existing admin-wrapper + admin-nav (unchanged)
- All other 8 tabs: SkeletonTab ("This section is under construction.")

### Testing Framework ✅
- Frontend: Vitest + React Testing Library — `npm test` in `mims/frontend/`
- Backend: Jest + Supertest — `npm test` in `mims/`
- E2E: Playwright (Chromium) — `npm run test:e2e` in `mims/`
- 5 Vitest tests passing for AdminConsoleTabs

### Admin Console ✅
- Full delivery. Deferred items moved to backlog: products duplicate trade name check, user edit after creation, old→new value in audit UPDATE entries.

---

## Pending Features (prioritized by Rohith)

### F2: Case Management Queues — PENDING (8 pts est.)
- 3 sub-tabs: My Cases / Team Cases / All Cases
- 3rd sub-tab name: Rohith to confirm ("Team Cases" placeholder)

### F3: New Case Form — PENDING (13 pts est.)
- New case creation flow

---

## Upcoming Features (not yet started)

- Case Query
- Fulfillment
- Transmissions
- CP Portal (Phase 8)
- Integrations (Oracle Argus + Veeva CRM/Vault)

---

## Known / Deferred

- ESIG deferred to later
- O365 IMAP/SMTP must be tenant-enabled for testing
- `mergeLocalState` in InboxPage preserves lock/color when syncing from server
- `setThemeState` in AdminConsolePage has no UI caller — theme loads from localStorage (not a bug)
- Gmail App Password requirement not yet documented in IMAP config UI (backlog)
