# Architecture — Pharaxis One

Stack, folders, data flow, how to run it. One part for the whole repository, then one part per app.

> Changes only when Rohith confirms (RULES.md › Keeping these documents current). Built 2026-11-10 from the old SOP's CP Portal and MIMS sections, the old architecture and database notes, the backup and bridge runbooks, the MIMS help index and the two app READMEs (all now in git history). Stale lines fixed on the way: both apps keep the sign-in token in an HttpOnly cookie, not browser storage; push is enabled through pull requests.

## The whole picture

```
                          developer machine (local only — no cloud yet)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                                                                              │
 │  CP Portal frontend :5174 ──/api──► CP Portal backend :4000 ──► MySQL        │
 │   (Vite + React)                     (Node + Express)           pharaxis_    │
 │                                        │   │                    cp_portal_dev│
 │                                        │   └──► ClamAV :3310 (virus check)   │
 │                         OAuth token +  │                                     │
 │                         POST cases     ▼   ▲ polls status every 5 min        │
 │  MIMS frontend :5173 ──/api──► MIMS backend :3000 ──────────────► MySQL      │
 │   (Vite + React)                (Node + Express)                 pharaxis_   │
 │                                   │                              mims_dev    │
 │                                   └──► mailboxes (IMAP in, SMTP out)         │
 └──────────────────────────────────────────────────────────────────────────────┘
```

**The bridge.** The portal always starts the exchange; MIMS never calls the portal.

```
Doctor sends a report in CP Portal
   │
   ▼
CP Portal saves it ──► gets a MIMS token (OAuth client credentials, 1 hour, auto-refresh)
   │
   ▼
POST /api/v1/cases  (idempotent on the CP reference; attachments after virus check)
   │                         │
   │ fails                   ▼
   ▼                  MIMS case appears (contacts, AE/PC versions, MI tab — what the case screen reads)
retry every minute           │
   │                         ▼
   ▼                  agent works and closes the case
Sync Health shows            │
late / failed / not covered  ▼
                      CP Portal poller sees "closed" ──► CP inquiry closed, doctor told
```

`other_inquiry` stays in CP Portal by design.

## Folders

| Path | Holds |
|---|---|
| `apps/cp-portal/backend` | Express server, `routes/admin` (27 files), `routes/portal` (15), `database/migrations`, `utils`, `services` |
| `apps/cp-portal/frontend` | React app: `src/admin` (35 pages), `src/portal` (31 pages), `src/shared` |
| `apps/mims/backend` | Express server, `routes`, `services`, `middleware`, `catalogs`, `database/migrations`, `regression-tests` |
| `apps/mims/frontend` | React app; the real entry is `src/modules/max/App.jsx` |
| `docs/scripts` | Developer scripts (each climbs to the repository root from its own folder) |
| `.github/workflows` | CI per product (`ci-mims.yml`, `ci-cp-portal.yml`, shared `_app-ci.yml`), path-filtered, markdown ignored; release workflows (never run); PR labeler and label sync from `.github/labels.yml` |
| `docs/scripts/github` | `bootstrap-product-ops.sh` (labels, environments), `apply-main-branch-protection.sh` |

## Run it locally

**Prerequisites:** Node 18+ (20 for CP Portal PDF reading), MySQL 8 at `/usr/local/mysql` on port 3306, ClamAV for CP Portal.

```bash
# CP Portal — backend (starts ClamAV too) and frontend, two terminals
cd apps/cp-portal/backend && npm install && npm run dev
cd apps/cp-portal/frontend && npm install && npm run dev

# MIMS — backend and frontend together
cd apps/mims && npm install && npm run dev:all
```

| App | Backend | Frontend | Health | Settings file |
|---|---|---|---|---|
| CP Portal | 4000 (`CP_PORT`) | 5174 | `GET /api/health` | `apps/cp-portal/backend/.env` from `.env.example` |
| MIMS | 3000 (127.0.0.1) | 5173 | `GET /api/health` | `apps/mims/backend/.env` from `.env.example` |

Both Vite servers proxy `/api` (and `/uploads` for CP Portal) to their backend. Never commit a `.env`.

**ClamAV (CP Portal).** Every uploaded file is checked before it can be downloaded or sent to MIMS. Without the scanner, portal attachments are held and admin uploads refused.
- `brew install clamav`, then `freshclam` once.
- `npm run dev` and `npm start` run `scripts/start-scanner.sh`, which starts `clamd` and `freshclam` in daemon mode.
- `clamd.conf` needs `TCPSocket 3310`, `TCPAddr 127.0.0.1` and the same `DatabaseDirectory` as `freshclam.conf`. If `freshclam` fails with "NULL X509 store", add `CVDCertsDirectory /opt/homebrew/etc/clamav/certs` to both.
- Settings: `CLAMAV_HOST` (127.0.0.1), `CLAMAV_PORT` (3310), `CLAMAV_TIMEOUT_MS` (30000). Held files are rescanned every minute.

**MIMS single sign-on and Microsoft 365.** Google and Microsoft sign-in are set per organisation in Admin Console › Access Configurations › Auth Policy (local only, SSO only, or both). Users pick their organisation first. Microsoft 365 authoring stores the edit link on the CM document; approvals stay in MIMS. Needs `MIMS_FRONTEND_BASE_URL`, `MIMS_BACKEND_BASE_URL`, `MIMS_ALLOWED_FRONTEND_ORIGINS`, `SSO_CONFIG_ENCRYPTION_KEY`. Provider secrets are stored encrypted; the screen shows only Configured or Missing.

**MIMS tests.** `MYSQL_DATABASE=pharaxis_mims_test npm run test` and `npm run test:e2e` in `apps/mims`. Never against the dev database.

## Databases

| App | Database | Schema |
|---|---|---|
| CP Portal | `pharaxis_cp_portal_dev` | `backend/database/migrations/0000_baseline.sql` plus numbered migrations |
| MIMS | `pharaxis_mims_dev` | `backend/database/migrations`, run at start-up |

- MySQL 8, native install (no Docker), one database per app, same server.
- Settings: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.
- Bootstrap accounts exist in code for local use only (`cpadmin`, `platform_admin`); change them anywhere shared.
- Never commit `.env` files or SQL dumps.
- Every new migration is folded into the baseline.

## Backups

- **CP Portal:** `docs/scripts/backup-cp-portal.sh` copies uploads and the database to `~/Pharaxis-Backups/cp-portal/<date>`, keeping the newest 14. Run by hand (Rohith declined a nightly schedule, 2026-10-27). Same machine, unencrypted: not disaster recovery.
- **A database backup holds only where each file sits, not the file.** Back up each app's upload folder with its database and restore them together.

| App | Files on disk |
|---|---|
| MIMS | `apps/mims/backend/storage` — org logos, CM documents, case attachments (or `STORAGE_LOCAL_ROOT`, or S3 with `STORAGE_PROVIDER=s3`), email attachments, original emails |
| CP Portal | `apps/cp-portal/backend/uploads` — logos, documents, safety attachments, submission attachments. Local disk only |

```bash
# backup: database first, then files
mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" > backup.sql
tar -czf mims-files-$(date +%Y%m%d-%H%M).tar.gz -C apps/mims/backend storage
tar -czf cp-files-$(date +%Y%m%d-%H%M).tar.gz -C apps/cp-portal/backend uploads

# restore, app stopped: database, then move the folder aside and unpack
mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$RESTORE_DATABASE" < backup.sql
mv apps/mims/backend/storage apps/mims/backend/storage.pre-restore
tar -xzf mims-files-<stamp>.tar.gz -C apps/mims/backend
```

After a restore, open one logo and download one document named in the restored database. MIMS answers a missing logo with its home page, not an error — check it is an image.

---

# CP Portal

## Full Tech Stack

### Backend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Runtime | Node.js | v18+ |
| Framework | Express | Latest stable |
| Authentication | JSON Web Token | In an HttpOnly cookie (`cp_admin_token`, `cp_portal_token`) |
| Database driver | mysql2/promise | Latest stable |
| Email sending | nodemailer | Latest stable |
| Translation engine | MyMemory API | Free, no API key, chunked text, fire-and-forget |

### Frontend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Framework | React | Latest stable |
| Build tool | Vite | Latest stable |
| Routing | react-router-dom | Latest stable |

### Database
| Component | Detail |
|-----------|--------|
| Engine | MySQL 8.0.45 (native install, NOT Docker) |
| Location | `/usr/local/mysql/` on Mac |
| Port | 3306 |
| Database name | `pharaxis_cp_portal_dev` |
| User | `devuser` / `devpass` |
| Start | System Settings → MySQL → Start (or auto-starts on Mac boot via launchd) |
| CLI | `/usr/local/mysql/bin/mysql -u devuser -pdevpass pharaxis_cp_portal_dev` |
| GUI | DBeaver — host: `localhost`, port: `3306`, allowPublicKeyRetrieval: true, useSSL: false |
| Note | Migrated from SQLite → Docker MySQL (2026-03-24), then Docker removed — now same native MySQL instance as MIMS |

### Infrastructure
| Component | Detail |
|-----------|--------|
| Backend port | 4000 |
| Frontend port | 5174 (Vite dev server) |
| API proxy | Vite proxies `/api` and `/uploads` → `http://localhost:4000` |
| Git | `https://github.com/RohithKarne/pharaxis-one` — branch and pull request; never push to `main` |

---


## System Architecture

```
cp-portal/
  backend/
    server.js              — Express app, all route registrations
    database/db.js         — MySQL pool + the original table definitions; the full schema is migrations/0000_baseline.sql plus numbered migrations
    middleware/auth.js     — JWT auth for admin + portal, requireClientAccess
    routes/admin/          — 27 admin API route files
    routes/portal/         — 15 portal API route files
    utils/
      audit.js             — audit(admin, clientId, action, entity, entityId, meta)
      mailer.js            — email sending via nodemailer
      notify.js            — portal notifications helper
      translator.js        — MyMemory auto-translation engine
  frontend/
    src/
      admin/
        context/AdminAuthContext.jsx  — admin auth state + adminHeaders() helper
        components/AdminLayout.jsx    — sidebar nav, all client nav groups
        pages/                        — 35 admin pages
      portal/
        context/PortalContext.jsx     — portal config, user auth, language, t()
        components/PortalLayout.jsx   — header nav, language switcher, notifications
        pages/                        — 31 portal pages
        utils/translations.js         — UI string translations (en/fr/de/es/ja/zh)
```

### Authentication
- **Admin:** a password, then a second step (emailed code, authenticator app, backup code or passkey). The session is an HttpOnly cookie, `cp_admin_token`, never readable by page scripts.
- **Portal:** a password — then, where the client turns it on, a code emailed to the doctor (from 2026-10-27) — or single sign-on. The session is an HttpOnly cookie, `cp_portal_token`. `portalFetch()` in `PortalContext` handles 401 → sign-out.
- **Portal session restore:** `GET /api/portal/auth/me` called on mount to verify token against DB.

### Feature Flags
- Stored in `cp_features` table per client
- Read via `GET /api/portal/config/:clientCode` → returns `{ features: { key: bool } }`
- `isFeatureEnabled(key)` in PortalContext handles gate access matrix
- Portal pages are hidden/shown based on feature flags per client

### Auto-Translation
- Engine: `backend/utils/translator.js` — MyMemory API (free, no key), chunked text, fire-and-forget
- Storage: `translations_json` column on `cp_news_posts`, `cp_safety_alerts`, `cp_faq_items`, `cp_documents`
- On save: Admin routes call `autoTranslate(clientId, table, rowId, fields).catch(() => {})` — non-blocking
- On read: Portal routes call `applyTranslation(row, lang, fields)` — reads stored JSON, falls back to English
- Languages: `en`, `fr`, `de`, `es`, `ja`, `zh` (Chinese uses `zh-CN` for MyMemory API — mapped in `translator.js`)
- Backfill: Admin Language Settings page → "Retranslate All Content" → `POST /api/admin/language/:id/retranslate`
- Language switcher only shows in portal header when 2+ languages are enabled by admin

### Audit Trail
- `audit(adminObj, clientId, action, entity, entityId, meta)` in `backend/utils/audit.js`
- Actions: `CREATE`, `UPDATE`, `DELETE`, `ENABLE`, `DISABLE`, `UPLOAD`
- `ClientDetailPage` cockpit fetches `GET /api/admin/audit/:clientId?limit=5` for real recent activity

### Notifications
- `notify.js` creates rows in `cp_notifications` per portal user
- Portal layout fetches on mount — bell icon shows unread count

### Process Explorer — removed
No longer in the product: no screen, no route and no `cp_process_logs` table (checked 2026-10-27).

---

## Database Tables (75 in the database on 2026-10-27; the core ones below)

### Admin & Config
| Table | Purpose |
|-------|---------|
| `cp_admin_users` | Admin panel login accounts |
| `cp_clients` | One row per client — code, name, language_config_json |
| `cp_branding` | Colors, fonts, logos, portal name per client |
| `cp_features` | Feature flags per client (is_enabled) |
| `cp_form_config` | Medical inquiry form field config per client |
| `cp_integration_config` | CRM/external system integration settings |
| `cp_field_mapping` | Form field → CRM field mapping |
| `cp_gate_config` | User type gate config per client |
| `cp_gate_user_types` | HCP / Patient / Other user type definitions |
| `cp_feature_access` | Per-feature access by user type |
| `cp_compliance_config` | GDPR/consent jurisdiction config per client |
| `cp_templates` | Email templates per client |
| `cp_email_config` | SMTP config per client |
| `cp_chatbox_config` | AI chatbox config per client |

### Portal Users & Activity
| Table | Purpose |
|-------|---------|
| `cp_portal_users` | HCP/patient accounts per client portal |
| `cp_submissions` | Medical inquiry submissions |
| `cp_consent_records` | User consent audit records |
| `cp_saved_items` | Portal user bookmarks (news/documents) |
| `cp_notifications` | Portal user in-app notifications |
| `cp_feedback` | Portal user feedback submissions |
| `cp_msl_bookings` | MSL meeting requests |

### Content
| Table | Purpose |
|-------|---------|
| `cp_therapeutic_areas` | TA content per client |
| `cp_drugs` | Drug information per client |
| `cp_events` | Events/webinars per client |
| `cp_resources` | Resource links per client |
| `cp_msls` | MSL directory per client |
| `cp_news_posts` | News/announcements — has `translations_json` |
| `cp_safety_alerts` | Safety alerts with severity — has `translations_json` |
| `cp_documents` | PDF/doc uploads — has `translations_json` |
| `cp_document_categories` | Document category groups |
| `cp_faq_items` | FAQ Q&A per client — has `translations_json` |

### Analytics & Reporting
| Table | Purpose |
|-------|---------|
| `cp_audit_logs` | Every admin action logged (action, entity, admin_email) |

---

## Admin Panel Pages (35 on 2026-10-27; the main ones below)

All admin routes under `/admin/clients/:clientId/` except Dashboard, Clients list, and Process Explorer.

| Page | Route | What It Does |
|------|-------|-------------|
| DashboardPage | `/admin` | Stats, open submissions, recent activity across all clients |
| ClientsPage | `/admin/clients` | List all clients, create new client |
| ClientDetailPage | `/admin/clients/:id` | Overview — a "To do today" list of what is waiting, alerts, recent activity, setup checklist |
| BrandingPage | `:id/branding` | Four ready themes with a live preview; single colours under Advanced; fonts, logo, portal name |
| FeaturesPage | `:id/features` | Feature switches grouped into Content, Asking and reporting, and Accounts |
| ContentPage | `:id/content` | TAs, drugs, events, resources tabs |
| NewsPage | `:id/news` | Create/edit news posts (rich text, auto-translated) |
| SafetyPage | `:id/safety` | Create/edit safety alerts with severity. No review step: an alert reaches doctors when saved as live, or at its scheduled time (Rohith, 2026-10-10) |
| TrialsAdminPage | `:id/trials` | Clinical trials: Draft → Needs review → Live in portal. Whoever sent a trial for review cannot publish it; the server enforces this (Rohith, 2026-10-10) |
| DocumentsPage | `:id/documents` | Upload PDFs, manage document library |
| MSLPage | `:id/msls` | Add/edit MSL profiles |
| FAQPage | `:id/faq` | Create/edit FAQ items with categories |
| CompliancePage | `:id/compliance` | GDPR jurisdiction config |
| FormsPage | `:id/forms` | Medical inquiry form field builder |
| GatePage | `:id/gate` | User type gate setup + feature access matrix |
| ChatboxConfigPage | `:id/chatbox` | AI chatbox welcome message, enable/disable |
| IntegrationPage | `:id/integration` | CRM field mappings |
| PortalUsersPage | `:id/users` | View/manage portal user accounts |
| SubmissionsPage | `:id/submissions` | Inbox: the case opens beside the list, side-effect reports are flagged, MIMS links open the case |
| AuditTrailPage | `:id/audit` | Full audit log with filters; times in UTC to the second |
| AnalyticsPage | `:id/analytics` | Page views, submissions, user metrics |
| FeedbackPage | `:id/feedback` | Portal user feedback responses |
| ReviewQueuePage | `:id/review-queue` | Content pending review (badge count in nav) |
| AdminUsersPage | `:id/admin-users` | Per-client admin user management |
| EmailSettingsPage | `:id/email-settings` | SMTP + template config |
| LanguagePage | `:id/language` | Enable languages + Retranslate All Content button |

---

## Portal Pages (31 on 2026-10-27; the main ones below)

All under `/portal/:clientCode/`. Features gated via `isFeatureEnabled()`.

| Page | Path | Feature Gate |
|------|------|-------------|
| PortalHomePage | `/` | None |
| LoginPage | `login` | None (public) |
| VerifyEmailPage | `verify-email` | None |
| SubmitPage | `submit` | `medical_inquiry` |
| TherapeuticAreasPage | `therapeutic-areas` | `therapeutic_areas` |
| EventsPage | `events` | `events` |
| ResourcesPage | `resources` | `resources` |
| DrugInfoPage | `drug-info` | `drug_info` |
| FindMSLPage | `find-msl` | `find_msl` |
| NewsPage | `news` | `news_announcements` |
| NewsDetailPage | `news/:postId` | `news_announcements` |
| SafetyPage | `safety` | None (always on) |
| DocumentsPage | `documents` | `document_library` |
| FAQPage | `faq` | None (always on) |
| ContactPage | `contact` | None |
| MySubmissionsPage | `my-submissions` | Auth required |
| SavedItemsPage | `saved` | Auth required |
| PreferencesPage | `preferences` | Auth required |


## Integration with MIMS — LIVE since 2026-07-15

This section described the integration as a future plan long after it shipped. Corrected 2026-09-13.

- **CP Portal → MIMS:** MI/AE/PC submissions post to MIMS `POST /api/v1/cases`, idempotent on the CP reference, attachments forwarded
- **MIMS → CP Portal:** a poller reads MIMS case status and auto-closes the matching CP inquiry
- **Auth:** OAuth client-credentials with auto-refresh, secrets encrypted at rest
- **Admin surface:** Integration page (credentials, field mapping, test connection) and the Sync Health page

`other_inquiry` stays CP-only by design. See Version History 2026-07-15.

**Bridge watch (Rohith, 2026-10-27; CPPM-157 to CPPM-163, MIPM-223).** Nothing the bridge carries can be lost unseen:
- **Bridge heartbeat** — Sync Health shows when each bridge job last ran; one that misses three runs alerts every client with a MIMS connection, and the alert closes itself when the job runs.
- **Delivery target** — in MIMS within 15 minutes, 5 for a side effect reported as serious; an alert at twice the target; this month's figures on Sync Health.
- **Comparison coverage** — reports sent before keys existed are keyed once and compared; any still not covered is counted on Sync Health, never left out silently.
- **Seriousness** — a client's own side-effect form without a seriousness question gets the built-in one, required.
- **Other requests** — a default holder on arrival (Overview › Who is told) and an alert after the client's wait (48 hours unless set).
- **Zero-Loss Report** (Reports) — one page per month accounting for every report, print or PDF, fingerprint in the audit trail. It is not an electronic signature.
- MIMS's side of the watch is the Inquiry Ledger (PRD.md › MIMS).

---
---

# MIMS

## Full Tech Stack

### Backend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Runtime | Node.js | v18+ |
| Framework | Express | ^4.18.2 |
| Authentication | JSON Web Token (jsonwebtoken) | ^9.0.2 |
| Password hashing | bcrypt | ^6.0.0 |
| Database driver | mysql2 | ^3.20.0 |
| File upload | multer | ^2.1.1 |
| Email receiving | imapflow | ^1.2.13 |
| Email sending | nodemailer | ^8.0.2 |
| Email parsing | mailparser | ^3.9.4 |
| Scheduled jobs | node-cron | ^4.2.1 |
| CORS | cors | ^2.8.5 |
| Dev server | nodemon | ^3.0.3 |

### Frontend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Framework | React | ^19.2.0 |
| Build tool | Vite | ^7.3.1 |
| Routing | react-router-dom | ^7.13.1 |
| Rich text editor | TipTap | ^3.20.4 |
| PDF generation | jspdf | ^4.2.1 |
| Excel export | xlsx | ^0.18.5 |

### Database
| Component | Detail |
|-----------|--------|
| Engine | MySQL 8.0.45 (native install, NOT Docker) |
| Location | `/usr/local/mysql/` on Mac |
| Port | 3306 |
| Database name | `pharaxis_mims_dev` |
| User | `devuser` / `__SET_MYSQL_PASSWORD__` |
| Start | System Settings → MySQL → Start (or auto-starts on Mac boot via launchd) |
| CLI | `/usr/local/mysql/bin/mysql -u devuser -p__SET_MYSQL_PASSWORD__ pharaxis_mims_dev` |
| GUI | DBeaver — host: `localhost`, port: `3306`, allowPublicKeyRetrieval: true, useSSL: false |

### Infrastructure
| Component | Detail |
|-----------|--------|
| Backend port | 3000 |
| Frontend port | 5173 (Vite dev server) |
| API proxy | Vite proxies `/api` → `http://localhost:3000` |
| Git | `https://github.com/RohithKarne/pharaxis-one` — branch and pull request; never push to `main` |
| Docker | Fully removed. MySQL runs natively. |

### Testing
| Component | Detail |
|-----------|--------|
| API + integration tests | Custom Node.js scripts using `curl` via `execSync` |
| Browser tests | puppeteer-core + Chrome |
| Test files | `sprint6-phase1a-test.js`, `sprint6-phase1b-test.js`, `sprint6-phase2-test.js`, `sprint7-qa-test.js`, `sprint8-session-timeout-test.js`, `mims/backend/tests/smoke-2fa.js`, `mims/backend/tests/smoke-sprint9.js` (26/27 PASS), `mims/backend/tests/smoke-sprint10-seeds.js` (9/9 PASS), `mims/backend/tests/smoke-sprint10-formconfig.js` (8/8 PASS), `mims/backend/tests/smoke-sprint10-caseformui.js` (10/10 PASS — static analysis), `mims/backend/tests/smoke-sprint10-fieldsetupui.js` (10/10 PASS — static analysis) |
| Backfill script | `mims/backend/scripts/backfill-existing-orgs.js` — one-time run to seed org defaults for orgs created before Sprint 10. Run with `node mims/backend/scripts/backfill-existing-orgs.js`. |
| Run command | `node <test-file>.js` from project root. Both servers + MySQL must be running. |
| Backend test libs | Jest ^30.3.0, Supertest ^7.2.2 |
| Frontend test libs | Vitest ^4.0.18, @testing-library/react ^16.3.2 |
| E2E | @playwright/test ^1.58.2 |

---


## System Architecture

### Entry Point (CRITICAL)
Real app entry point:
```
index.html → src/modules/max/main.jsx → src/modules/max/App.jsx
```
Top-level `src/App.jsx` and `src/main.jsx` are **legacy files — do not edit**. All route additions go into `src/modules/max/App.jsx`.

### Auth Flow
1. User POSTs `/api/auth/login` with email + password
2. Server verifies password (bcrypt), checks `user_org_access` for org assignment
3. Returns JWT: `{ userId, email, role, orgId, siteId }`
4. The JWT is set as an HttpOnly cookie, `mims_token`, which page scripts cannot read
5. The browser sends it on every same-origin call; `Authorization: Bearer cookie-session` is ignored
6. `requireAuth` middleware decodes JWT, attaches `req.user`
7. `requireOrg` blocks non-platform-admin users without `orgId` in JWT (403)

### JWT Decode Pattern
```js
// ALWAYS use req.user.userId — NEVER req.user.id
req.user = decoded  // { userId, email, role, orgId, siteId }
```

### Multi-Org Data Isolation Pattern
```js
// Applied on every data-scoped route since Sprint 7
if (req.user.role !== 'platform_admin') {
  query += ' AND org_id = ?'
  params.push(req.user.orgId)
}
// Platform Admin has orgId = null in JWT → bypasses all org filters
```

### Module Access (screens)
- Screens: `mims_core` (Cases), `inbox`, `transmissions`, `browse_content`, `content_mgmt`, `reports`, `admin_console` (MIMS Admin). Nothing else (access review, 2026-10-14; migration 185 removed six keys with no screen).
- A person's screens are their role's defaults (`role_permissions`, shared by all organisations, changed only by a migration) plus their own differences (`user_module_permissions`, `can_access` 1 or 0), read by `utils/userModules.js` `getUserModules`.
- An administrator sets a person's screens on Add / Edit Users › Screens (`PUT /api/admin/users/:id/modules`); only differences from the role are stored (`setUserModules`). MIMS Admin is not set there: it needs the administrator role as well as the module, in the menu and at the address (`ModuleAccessGuard adminOnly`).
- The server enforces each screen: cases (`middleware/caseAccess.js`), Inbox (`routes/inbox.js`), content (`middleware/cmAccess.js` `cmReadAccess`), Reports and Transmissions (`requireModule`). The frontend hides what a person cannot open (`ModuleAccessGuard`, `MIMSNavbar`).
- Platform Admin bypasses all module checks
- The User Access Review report lists each person's screens as the server gives them and, under Differs from role, every screen added or taken away for them personally. It is where a screen given by mistake (e.g. Cases on a content manager) is found; it is removed on Edit User (2026-10-14).

### Case access (access review, 2026-10-14)
- Every request about a case — the case, its AE / PC versions and rows, MI tabs, letters, comments, contacts, attachments, field history, rich text, emails filed on it — needs Cases and View cases for that case (own or all); a change needs Update case. Pinning, following and presence need only View. Route checks (close, assign, escalate, letters, transmissions) apply after it.
- Without Update case the case page opens read only: a Read only label instead of Save Case, no version, transmit, add or delete buttons, fields locked.
- Reports follow the same rule (2026-10-14): every case report and the operations summary count all cases, only those the viewer owns or created, or none without Cases. A schedule uses its owner's access. The scope is set on the server; a filter cannot widen it (`services/reportDatasetService.js` `caseScopeOf`).
- The path a check compares is decoded and lower-cased first (`utils/gatePath.js`), as the server routes it.

### Permissions (Group Security)
- 32 permissions, each checked by the server (`access_activity_privileges`, migration 184 removed 46 that nothing checked). A group adds rights to its members' role and never removes them (MIPM-192): the role's rights show ticked and locked.
- Platform Admin hidden from User Management + Module Access screens — `WHERE role != 'platform_admin'` on both `/api/admin/platform/users` and `/api/admin/platform/all-users`

### In-app regression suite
- Off unless the server sets `ENABLE_INAPP_REGRESSION=true`; run by an administrator from MIMS Admin or `POST /api/admin/regression/run`, signed in as `REGRESSION_EMAIL`. Run it on a local or test copy only: it creates and deletes records. Its access-configuration check puts the organisation's sign-in policy back after it runs (2026-10-14). On 14 Oct: 178 checks, 150 pass; the 28 that fail expect behaviour later rounds changed on purpose.

### Session Timeout
- Per-org idle timeout set by platform admin. Stored as `session_timeout_minutes` in `organisations` table.
- Platform Admin global timeout in `system_config` (`key: platform_admin_session_timeout_minutes`).
- Defaults: **30 min** per org, **60 min** platform admin. Min enforced: **30 min**.
- Login + switch-org APIs return `sessionTimeout`.
- Frontend: `useIdleTimer.js` tracks mouse/keyboard/scroll. `SessionTimeoutModal.jsx` warns 2 min before logout. "Stay Logged In" resets timer.
- `sessionTimeout` stored in localStorage as `mims_session_timeout`. Wired into `App.jsx` via `AppRoutes`.

### User 2FA Architecture
- 2FA applies to **MIMS users only**. Platform Admin login does **not** use this flow.
- Platform Admin controls 2FA per org from `2FA Configuration` screen.
- Supported methods: `Email OTP` and `Authenticator App (TOTP)`.
- Login flow (same screen):
  1. User enters username/email + password
  2. If org 2FA enabled + user not enrolled, optional setup shown inline
  3. User chooses Email OTP or Authenticator App, or skips if allowed
  4. Once enrolled, 2FA required unless remembered device valid
- Backup codes generated on enrollment. Remember-device supported for org-configured duration. Lock after **3** invalid attempts.
- Platform Admin can reset user 2FA from User Management.
- Platform SMTP for 2FA emails in `system_config` — separate from org-level Email Accounts.
- Security challenge expiry must use **DB time** (`NOW()` / `DATE_ADD`), not JS timestamps. Real QA defect — fixed.

### Password Reset Flow
1. New users created with `password_reset_required = 1` and default password `__SET_SMOKE_TEST_PASSWORD__`
2. On login, if flag set, server returns `{ passwordResetRequired: true, token: resetToken }`
3. Frontend redirects to `/reset-password` (NOT `/dashboard`)
4. After reset, flag cleared, user gets fresh JWT with modules + org context
5. User navigates to `/dashboard` normally

### CSS Namespace Convention
| Prefix | Used For |
|--------|----------|
| `mims-` | Shared layout components |
| `ac-` | Admin Console pages |
| `cm-` | Content Management pages |
| `cf-` | Case Form pages |
| `tx-` | Transmissions page |
| `bc-` | Browse Content page |

---

## Frontend Route Map

All routes in `mims/frontend/src/modules/max/App.jsx`.

| Route | Component | Module Guard |
|-------|-----------|-------------|
| `/login` | LoginPage | None (public) |
| `/reset-password` | ResetPasswordPage | None (public) |
| `/no-access` | NoAccessPage | None |
| `/dashboard` | DashboardPage | `mims_core` |
| `/inbox` | InboxPage | `mims_core` |
| `/cases` | CasesPage | `mims_core` |
| `/cases/:id` | CaseFormPage | `mims_core` |
| `/case-query` | CaseQueryPage | `mims_core` |
| `/session-management` | SessionManagementPage | `mims_core` |
| `/exceptions` | ExceptionLogsPage | `mims_core` |
| `/process-explorer` | ProcessExplorerPage | `mims_core` |
| `/regression` | RegressionPage | ProtectedRoute only (admin/platform-admin) |
| `/admin-console/*` | AdminConsoleRouter | `admin_console` |
| `/content` | ContentPage | `content_mgmt` |
| `/analytics` | AnalyticsPage | `data_visualization` |
| `/reports` | ReportsPage | `reports` |
| `/transmissions` | TransmissionsPage | `mims_core` |
| `/browse-content` | BrowseContentPage | `content_mgmt` |
| `/response-log` | ResponseLogPage | `mims_core` |
| `/inquiry-ledger` | InquiryLedgerPage (MIPM-223) | `mims_core` |
| `*` | Redirect | → `/dashboard` |

### Navbar Structure (MIMSNavbar.jsx)
Left menu (`shared/components/MIMSNavbar.jsx`, Rohith 2026-10-14):

**New Case** (top; shown to people who may create cases) · **Work:** Overview · Inbox · Cases ▾ · Transmissions · **Knowledge:** Browse Content · Content Management · **Reporting:** Reports · **Administration:** MIMS Admin

- An item shows only to someone who can open its page — the same module rule as its route in `App.jsx`; a heading with nothing under it is not shown. Quick search (Ctrl-K, `CommandPalette.jsx`) and the Overview's Modules list use the same rules.
- **Cases** opens the case list; its arrow lists My Cases, Unassigned Cases, Correspondence (`/cases?view=correspondence`, the former Case Query), the Response Log and the Inquiry Ledger.
- **Inquiry Ledger** (MIPM-223, 2026-10-27): every open case from every channel, its stage and age, red past its limit (waiting for an owner 8 h, serious side effect 2 h, with an owner 5 days). The `inquiry-ledger-watch` job notifies the owner, or the case supervisors, once per red case; alert email only through `MIMS_ALERT_EMAIL`. A reader with own-cases access sees only their own.
- **Deleted Cases** is a tab in the case list for administrators only; the server refuses `GET /api/cases?deleted=true` to anyone else.
- Session Management is in the user menu; the logs and audit trails are in MIMS Admin.


## Backend API Map

Backend on port 3000. All routes under `/api/`.

### Auth
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | Login — returns JWT + modules + org data |
| POST | `/api/auth/forgot-password/send-code` | Forgot-password: send email verification code |
| POST | `/api/auth/forgot-password/verify-code` | Forgot-password: verify email code, issue short reset token |
| POST | `/api/auth/forgot-password/reset` | Forgot-password: set new password after code verification |
| POST | `/api/auth/2fa/send-email-code` | Send Email OTP for login/setup |
| POST | `/api/auth/2fa/setup/totp` | Begin authenticator app setup, return secret/QR payload |
| POST | `/api/auth/2fa/verify` | Verify email OTP, TOTP, or backup code |
| POST | `/api/auth/2fa/skip-setup` | Skip optional 2FA setup, complete login |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/switch-org` | Re-issue JWT with different orgId |
| POST | `/api/auth/reset-password` | Mandatory first-login reset |
| POST | `/api/auth/change-password` | In-app authenticated password change using current password |
| POST | `/api/auth/logout` | Record logout in login_audit |

### Cases
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cases` | List with filters + pagination |
| GET | `/api/cases/my` | Cases owned by logged-in user |
| GET | `/api/cases/unassigned` | Unassigned cases |
| POST | `/api/cases` | Create case (org_id from JWT only) |
| GET | `/api/cases/form-config` | Dynamic form config — merged sections + fields + picklist options for given case_type + org. Auth only (no requireOrg). Platform Admin passes `?org_id=`, regular users from JWT orgId. Returns `{ case_type, sections: [{ section_name, is_visible, fields: [{ ...field, options: [] }] }] }`. Since 2026-10-13 it also returns `hidden` (hidden fields, with their options, so a panel can leave them out and still fill a product-row list). |
| GET | `/api/cases/:id` | Single case detail |
| PUT | `/api/cases/:id` | Update case (COALESCE pattern — partial update) |
| DELETE | `/api/cases/:id` | Soft delete |
| POST | `/api/cases/:id/assign-number` | Assign case number (idempotent) |
| GET/POST/PUT/DELETE | `/api/cases/:id/contacts/:cid` | Case contacts with DNUMD support |
| GET/POST/PUT/DELETE | `/api/cases/:id/mi/:tabId` | MI multi-tab management |
| GET/POST/PUT | `/api/cases/:id/ae/versions` | AE version control (locks on new version) |
| GET/POST/DELETE | `/api/cases/ae/versions/:versionId/lab-results` | AE lab results multi-row CRUD |
| GET/POST/DELETE | `/api/cases/ae/versions/:versionId/medical-history` | AE medical history multi-row CRUD |
| GET/POST/DELETE | `/api/cases/ae/versions/:versionId/product-info` | AE product info multi-row CRUD |
| GET/POST/PUT | `/api/cases/:id/pc/versions` | PC version control |
| GET | `/api/cases/mi-responses/log` | Response Log — all MI responses cross-case, filterable by status/date/search (Sprint 19) |
| GET | `/api/cases/dashboard-summary` | Dashboard stats + MI KPIs (pending, pending_approval, sent_today, sla_breached) + recent cases + alerts |
| GET | `/api/cases/:id/mi-responses` | List MI responses with workflow status |
| POST | `/api/cases/:id/mi-responses` | Create MI response (always DRAFT — 21 CFR Part 11) |
| PATCH | `/api/cases/:id/mi-responses/:rid/status` | Transition MI response status with e-sign (DRAFT→READY→APPROVED→SENT). SENT triggers nodemailer delivery + transmission_audit_trail log. |
| PATCH | `/api/cases/:id/mi-responses/:rid/discard` | Void a DRAFT response (VOIDED terminal state) |
| POST | `/api/admin/impact-preview` | Blast-radius impact preview for workflow/field/taxonomy changes (5-min TTL cache) |

### Inbox
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inbox` | List inquiries from DB (real emails only) |
| GET | `/api/inbox/users` | Users for assign dropdown |
| GET/POST/PATCH | `/api/inbox/templates/:tid` | Reply templates |

### Admin Console
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PUT/DELETE | `/api/admin/picklists` | Dropdown values per org |
| GET/POST/PUT/DELETE | `/api/admin/field-setup` | Case form field config — standard fields |
| POST | `/api/admin/field-setup/flex` | Add flex field to section. Body: `{ section_name, field_name, field_type, picklist_type, is_required, sort_order }` |
| DELETE | `/api/admin/field-setup/flex/:id` | Delete flex field by id |
| GET | `/api/admin/case-fields` | Case Form Fields screen — every field with its step, E2B tag, "removed in the clean-up" mark, and each section's on/off |
| GET | `/api/admin/case-fields/usage` | **Used in cases** — how many cases hold a value in each field's own store |
| GET | `/api/admin/case-fields/picklist-types` | List types an added dropdown field can use |
| PUT | `/api/admin/case-fields/sections` | Switch a section on or off for one case type |
| POST | `/api/admin/case-fields` | Add a field to a section |
| PUT | `/api/admin/case-fields/:id` | Label, required, hidden, order; step (`display_tab`) for added fields |
| GET/POST/PUT/DELETE | `/api/admin/security-groups` | RBAC groups + privilege matrix |
| GET/POST/PUT/DELETE | `/api/admin/contacts` | Case contacts repository |
| GET/POST/PUT/DELETE | `/api/admin/orgs` | Organisations |
| GET/POST/PUT/DELETE | `/api/admin/sites` | Sites with workflow states |
| GET/PUT | `/api/admin/sites/:id/email-purpose` | Site email purpose assignments (4 purposes) |
| GET/POST/PUT/DELETE | `/api/admin/product-families` | Product families + products |
| GET/PUT | `/api/admin/case-number-config` | Per-org/per-type number format |
| GET/PUT | `/api/admin/case-form-definition` | Per-org/per-type section visibility |
| GET/POST/PUT/DELETE | `/api/admin/workflow-activities` | Named case activities |
| GET/POST | `/api/admin/case-audit-trail/:caseId` | Field-level audit trail (F-09) |
| GET | `/api/admin/transmission-audit-trail` | Transmission audit trail (F-10) |
| GET | `/api/admin/service-logs` | Platform-wide service log |
| GET | `/api/admin/system-activity` | Email import activity log |

### Platform Admin
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/platform/all-users` | Full user list with org assignments (excludes platform admin role) |
| GET | `/api/admin/platform/users` | Users for module access screen (excludes platform admin role) |
| POST | `/api/admin/platform/users/create` | Create user — roles: admin/agent/reviewer/content_manager only. platform admin blocked. |
| PUT | `/api/admin/platform/users/:id` | Update user — platform admin role blocked |
| POST | `/api/admin/platform/users/:id/reset-2fa` | Reset user 2FA enrollment, lock state, backup codes, trusted devices |
| GET/POST/PUT/DELETE | `/api/admin/platform/users/:id/org-access` | CRUD org assignments |
| GET | `/api/admin/platform/orgs-for-assignment` | Active orgs + sites for dropdown |
| PUT | `/api/admin/platform/users/:id/modules` | Set a person's screens (any of the seven); stores only differences from the role, leaves the platform-console row alone |
| GET | `/api/admin/platform/orgs` | List all orgs with sites + session_timeout_minutes |
| POST | `/api/admin/platform/orgs` | Create org |
| PUT | `/api/admin/platform/orgs/:id` | Update org name / is_active / session_timeout_minutes / 2FA settings |
| POST | `/api/admin/platform/orgs/:id/sites` | Create site — validates no duplicate name within org |
| PUT | `/api/admin/platform/sites/:id` | Update site name / country / is_primary / is_active |
| GET | `/api/admin/platform/config` | Get system config (platform-admin timeout + platform SMTP) |
| PUT | `/api/admin/platform/config` | Update system config (platform-admin timeout + platform SMTP) |
| POST | `/api/admin/platform/config/test-email` | Test SMTP connection or send test email from Platform Admin 2FA Configuration |
| GET | `/api/admin/platform/dashboard` | Platform Admin dashboard KPIs + recent audit/login activity |
| POST | `/api/admin/platform/users/:id/force-password-reset` | Force user to reset password on next login |
| POST | `/api/admin/platform/users/:id/unlock` | Clear user security lock / 2FA failed-attempt lock |
| POST | `/api/admin/platform/users/bulk-action` | Bulk activate, deactivate, or force password reset |
| GET | `/api/admin/platform/audit` | Paginated general audit log — all entity changes. Params: `limit` (max 200), `offset` |
| GET | `/api/admin/platform/login-audit` | Paginated login/logout event log. Params: `limit`, `offset`, `status` filter |
| GET/POST/PUT | `/api/admin/platform/alerts/rules` | List, create, update platform-admin alert rules |
| GET | `/api/admin/platform/alerts/events` | Alert event history with delivery statuses |
| GET | `/api/admin/platform/notifications` | Platform Admin in-app notifications |
| POST | `/api/admin/platform/notifications/:id/read` | Mark notification as read |

### Content Management
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cm/folders` | Active content folders the user may open (`?include_inactive=true` for Folder Manager), with published counts for Browse |
| POST/PUT/DELETE | `/api/cm/folders[/:id]` | Folder setup — needs Configure folders (`content.folder.configure`); a folder holding live documents, FAQs, modules or templates cannot be closed |
| GET/POST/DELETE | `/api/cm/folders/:id/permissions[/:groupId]` | Groups on a folder (`security_group_id`, level read / write / manage). Enforced by `services/cmFolderAccess.js` and `middleware/cmAccess.js`: no groups = open; with groups, only members see the folder's content (lists, items, downloads, Browse, letter builder); Write to change content, Manage to change the folder; administrators always pass |
| GET | `/api/cm/sites`, `/api/cm/mailboxes` | The organisation's sites (Folder Manager) and sending mailboxes (expiry alerts), for content managers |
| GET | `/api/cm/documents/:id/reviews` | The document's reviews and each reviewer's decision (Approve dialog) |
| GET | `/api/cm/documents/:id/publish-checks`, `/api/cm/faqs/:id/publish-checks` | The publishing checks run without publishing (publish dialogs) |
| GET | `/api/cm/publishing-checks` | The checks run at publish, read-only (Content Settings) |
| GET | `/api/cm/documents/:id/compare` | The versions in a document's line; with `?a=&b=` the text of two to compare (replaces `version-diff`, removed 2026-10-14) |
| GET | `/api/cm/{documents,modules,faqs,templates}/:id/versions` | Version history of the whole line of versions (`services/cmLineage.js`) |
| CRUD | `/api/cm/documents` | Documents — Draft → Published lifecycle |
| POST | `/api/cm/documents/:id/checkin` | Check in with version bump (bump_type: major/minor) and notes into the version history. Auto-sets owner_user_id on first checkin. |
| POST | `/api/cm/documents/:id/publish` | Publish — password and reason; next major version. Publishing a revision archives the version it replaces ("Superseded by version N"). |
| POST | `/api/cm/documents/:id/revise` | Draft the next version of a published document; the published one stays in use until the revision is published (`revision_of`, migration 179). Checking out a published document is refused. |
| POST | `/api/cm/documents/:id/release` | Return a Pending or checked-out document to Draft (not a published or approved one) |
| GET | `/api/cm/products` | The organisation's products, for tagging a document (`cm_documents.product_id`, migration 180) |
| POST | `/api/cm/documents/release-stale-checkouts` | Return expired two-hour check-outs to Draft now; the `cm-release-stale-checkouts` job does it every 15 minutes |
| GET/POST/DELETE | `/api/cm/documents/:id/relations` | Associated documents — link/unlink, relation types |
| GET/PUT | `/api/cm/documents/:id/alert-config` | Per-document version alert config (alert_days JSON, alert_email_account_id) |
| POST/DELETE | `/api/cm/documents/:id/alert-subs` | Per-document alert subscribers (users to notify) |
| GET/PUT | `/api/cm/settings` | Org-level CM default settings (upsert via ON DUPLICATE KEY) |
| CRUD | `/api/cm/faqs` | FAQs with lifecycle; `POST /api/cm/faqs/:id/revise` drafts the next version of a published FAQ, which is archived as superseded when the revision is published |
| POST | `/api/cm/modules/:id/revise` | Draft the next version of a published module; publishing it moves Module-type documents to the new module and archives the old one as superseded (no archive cascade). A published module cannot be set back to Draft. |
| CRUD | `/api/cm/templates` | Letter templates (Response, Acknowledgment, Correspondence, Email); a folder is required. Approve and publish need password and reason, and the author cannot approve. Publish = next major version; a wording change adds to the minor. A published template changes through `POST /:id/revise`. |
| GET | `/api/cm/merge-fields` | The merge-field catalogue (`services/mergeFields.js`), one list for the letter builder, the preview and generated letters; values escaped in a letter body |
| POST | `/api/cm/templates/:id/generate` | Make a letter for a case number from a published, in-date template; filed on the case as a PDF attachment (field `Letters`, `makeLetterPdf` in `services/pdfExportService.js`) and audited. Replaces Merge Reports (retired 2026-10-14; `cm_merge_reports` kept). |
| GET/PUT | `/api/cm/reviews` | Review tasks for content reviewers. A decision is Accepted, Accepted with Changes, Declined or Rejected (a reason for all but Accepted). A review nobody accepted returns the document to Pending; a rejection to Draft. `GET /reviews/all?mine=true` is Reviews I Started (progress, End, Transfer to someone who can author content). Reviews past their end date remind reviewers and owner daily (`cm-review-overdue`). |
| CRUD | `/api/cm/picklists` | CM document category values (mounted at `/api/cm`, paths are `/picklists` not `/cm/picklists`) |

### Reports
All under `/api/reports/module/`, behind the Reports module grant. Who may see a report or dashboard is its audience (`visibility_scope`: `shared` Everyone with Reports, `managers` Report managers, `admin_only` Administrators); outside it a report reads as not found. Data rules: `services/reportDatasetService.js` (day 0 = Date Received; closed = a state marked closed; MI answered = first sent letter; MI due from MI Response Settings; hand-off due and sent as on the Transmission screen).
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/definitions`, `/dashboards`, `/history`, `/favorites`, `/datasets`, `/filter-options` | What the user may see; filter choices (periods, case types, products, owners) |
| POST | `/definitions/:id/run`, `/dashboards/:id/run` | Run with the filter bar's filters (`period` or `date_from`/`date_to`, `case_type`, `product`, `owner_id`, `group_by`, `window_days`); a failed run is recorded |
| POST | `/definitions/:id/export` | CSV made on the server — needs Export Reports (`reports.export`); audited (`EXPORT`, `report_definition`); readable headers, no `__` columns, formula-safe cells (`services/reportCsv.js`) |
| POST/PUT/DELETE | `/definitions[/:id]`, `/dashboards[/:id]`, `…/duplicate`, `/config`, `/datasets/:key/preview` | Custom reports, dashboards and Settings — need Manage Reports (`reports.manage`); changes audited (`report_definition`, `report_dashboard`) |
| GET/POST/PUT/DELETE | `/schedules[/:id]`, `…/pause`, `…/resume`, `/recipients` | Schedules — need Schedule reports (`reports.schedule`). Daily, weekly or monthly (the 1st); a period each send covers on the schedule's own calendar; recipients must be people in the organisation who can see the target (`services/reportRecipients.js`), checked on save and on every send; the run is made as the person who set it up |
Removed 2026-10-14: `/summary`, certify/publish/versions, templates, shares, role defaults, anomalies, recommendations, usage analytics, delivery rules, config validation; `/api/reports/*` (legacy) and `/api/presets`; `/api/admin/exports/scheduled`; the Reports Access routes (`/api/admin/reports-access`, `/api/admin/platform/reports`, `/api/admin/reports/access`).

### Regression Testing Suite
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/regression/run` | Run full test suite (rate-limited: 5 min per user) |
| GET | `/api/admin/regression/history` | Last 50 run summaries |
| GET | `/api/admin/regression/history/:id` | Single run full results with module grouping |
| GET | `/api/admin/regression/db-health` | Live DB table health (row counts, column names) |
| GET | `/api/admin/regression/api-catalog` | All registered Express routes |
| GET | `/api/admin/regression/coverage` | Uncovered routes vs tests |

### Admin (additional)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/mi-categories` | MI categories (org-scoped; platform admin needs `?org_id=`) |
| GET | `/api/admin/audit-logs` | Audit log entries (plural — NOT `/audit-log`) |
| GET | `/api/admin/email-accounts` | Email accounts for SMTP dropdown |
| GET | `/api/admin/products-full` | Full products list |
| GET | `/api/admin/security-groups` | Security groups |
| GET | `/api/admin/field-setup` | Field setup |

### Misc
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Backend health check |
| GET | `/api/users` | Active users list (for case owner dropdown) |

---

## Admin Console Sections

All under `/admin-console/*` (requires `admin_console` module).

| Section Key | URL Slug | What It Manages |
|-------------|----------|----------------|
| picklists | picklists | Dropdown values for case form fields |
| field-setup | field-setup | Case form field types, required, hidden flags |
| Case Form Fields | sys-setup-case-fields | **The one screen for the case form (2026-10-13)** — label, required, shown, order, step, section on/off, add field, Used in cases, E2B badge |
| user-security-groups | user-security-groups | RBAC security groups + privilege matrix |
| case-contacts | case-contacts | Case contacts / HCP / patient directory |
| company-reps | company-reps | Company representative directory |
| sites | sites | Site config — email, response templates, data retention, alerts |
| case-numbering | case-numbering | Auto-number format per org per case type |
| case-form-def | case-form-def | Section + field visibility per org per case type |
| audit-admin | audit-admin | Case field-level audit trail (F-09) |
| audit-login | audit-login | Login audit trail (21 CFR Part 11) |
| service-log | service-log | Platform-wide service event log |
| system-activity | system-activity | Email import log |
| orgs | orgs | Organisation management |
| products | products | Product families + drug names |
| workflow-setup | workflow-setup | Workflow state definitions |
| source-types | source-types | How inquiries arrive (email, phone, etc.) |
| email-accounts | email-accounts | IMAP/SMTP mailbox connectors |

**Important distinction:**
- `Admin Console -> Email Accounts` = org-specific MIMS mailboxes for app operations
- `Platform Admin -> 2FA Configuration` = platform SMTP for user 2FA email delivery + org-level 2FA controls

**Case form screens (2026-10-13).** Customize Forms (`sys-setup-customize-forms`) and Validation Rules (`sys-setup-validation`) are retired and their files and server endpoints removed; Setup › Medical Information holds **MI Response Settings** (`sys-setup-mi-response`) and **Transmission Setup** (`sys-setup-int-transmission`, the safety and quality hand-off targets — it was an empty page); an old link opens Case Form Fields (`RETIRED_SYSTEM_ITEMS` in `configItems.js`). A show-only-when rule appears under its field on Case Form Fields, read-only. Smart Field Rules, Grid Section Templates and Case Actions are hidden from the menu unless the **Advanced form tools** switch on Case Form Fields is on (a per-browser preference, not a permission).

### Platform Admin Console Pages

Accessible at `/mims-admin?standalone=1` with legacy `/admin/platform` alias compatibility. Sidebar-based nav — no URL routing between pages.

| Page Key | Sidebar Label | What It Shows |
|----------|--------------|---------------|
| `dashboard` | Dashboard | Platform KPIs, failed logins, unread notifications, recent audit + login activity |
| `organizations` | Organizations | Org cards with site lists, active/inactive toggles, session timeout editor, add site form |
| `2fa-config` | 2FA Configuration | Platform SMTP config + test/send buttons; per-org 2FA enable/methods/remember-days table |
| `users` | Users | User list with 2FA status, org assignments, Reset 2FA button; create user form; org assignment panel (Org / Site / Role tabs) |
| `module-access` | Module Access | No screen any more; a person's screens are set on MIMS Admin › Add / Edit Users › Screens (2026-10-14) |
| `alerts` | Alerts | Alert rule setup, enable/disable, thresholds, recipients, recent alert event history |
| `notifications` | Notifications | In-app notification inbox for platform-admin alerts with read/unread state |
| `audit` | Audit Trail | Paginated general audit log — entity changes across platform |
| `login-audit` | Login Audit | Paginated login/logout event log with status filter |


## Database Tables Reference

### User & Access
| Table | Purpose |
|-------|---------|
| `users` | System users — email, role, password hash, active, password_reset_required |
| `sessions` | Active login session tracking |
| `login_audit` | Login/logout + auth event records for 21 CFR Part 11 |
| `notifications` | In-app notifications. Sprint 9. Platform-admin alert-triggered, read/unread state. Platform-admin inbox reads this table. |
| `user_org_access` | Multi-org: maps user → org → site → role → permission (Sprint 7) |
| `user_module_permissions` | Per-user module access — overrides default role permissions |
| `user_password_history` | Previous password hashes. Blocks reuse of current + last 5. |
| `user_2fa_settings` | Per-user, per-org 2FA enrollment, method, TOTP secret, fail count, lock state |
| `user_2fa_backup_codes` | Hashed one-time backup codes per user/org |
| `user_2fa_trusted_devices` | Remembered devices with expiry per user/org |
| `user_2fa_challenges` | Active email OTP + TOTP setup challenges with expiry |
| `security_groups` | RBAC groups with privilege matrix |
| `security_group_users` | User → security group mappings |
| `role_permissions` | Default access per role per module |

### Organisation & Sites
| Table | Purpose |
|-------|---------|
| `organisations` | Pharma client orgs — name, is_active, `session_timeout_minutes` (default 30), `two_factor_enabled`, `two_factor_methods`, `two_factor_remember_days` |
| `sites` | Locations per org — country, primary flag, is_finalized, abbreviation. **UNIQUE constraint on (org_id, name)** — duplicate site names within org blocked at DB + API. |
| `system_config` | Key-value global platform config. Uses: `platform_admin_session_timeout_minutes`, platform SMTP settings |
| `site_config` | Extended site config — GDPR, retry, alert settings |
| `site_email_accounts` | Email accounts linked to site |
| `site_email_purpose` | Site → purpose (response / transmissions / correspondence / fax) → email_account |
| `site_response_templates` | Auto-acknowledgement templates per site |
| `site_data_retention` | GDPR right-to-forget rules per site |
| `site_alerts` | Threshold-based alert rules per site |

### Cases
| Table | Purpose |
|-------|---------|
| `cases` | Core case record — case_number, type (MI/AE/PC), org, site, status, owner, priority |
| `case_contacts` | Contact/requestor entries per case with DNUMD support |
| `case_mi` | MI tabs — category, product, question, response |
| `case_ae_versions` | AE version control — locking on new version |
| `case_ae_general` | AE general tab (one per version) |
| `case_ae_events` | AE events — 7 ICH E2B R3 seriousness boolean columns |
| `case_ae_patient_info` | AE patient demographics |
| `case_ae_lab_results` | AE lab results (multi-row per version) |
| `case_ae_lab_notes` | AE lab notes |
| `case_ae_medical_history` | AE medical history (multi-row) |
| `case_ae_medical_notes` | AE medical notes |
| `case_ae_product_info` | AE product information (multi-row) |
| `case_mi_responses` | MI response records — `response_status` ENUM: DRAFT/READY/APPROVED/SENT/VOIDED. `DEFAULT 'DRAFT'` enforced. SENT = immutable. VOIDED = terminal discard. Each status transition records e-sign password + reason. 21 CFR Part 11 compliant. |
| `case_mi_response_transitions` | Immutable audit log of each MI response status change — who, when, target_status, e-sign reason |
| `case_pc_versions` | PC version control — copy-forward on new version |
| `case_pc_general` | PC general tab |
| `case_pc_patient_info` | PC patient information |
| `case_pc_product_info` | PC product information |
| `case_pc_return_retrieval` | PC return/retrieval tab |
| `case_pc_replacement` | PC replacement tab |
| `case_pc_refund_credit` | PC refund/credit tab |

### Configuration
| Table | Purpose |
|-------|---------|
| `workflow_states` | Case status definitions |
| `workflow_rules` | Transitions between states — password / checklist / comment requirements |
| `workflow_activities` | Named case activities triggering rules (F-12) |
| `workflow_activity_triggers` | If-activity-then-action rules |
| `source_types` | How inquiries arrive (email, phone, web form, etc.) |
| `field_setup` | Case form field config per section per org — type, required, hidden, picklist, help_text, max_length, default_value. **Sprint 10:** unique key changed from `uq_field_section_name (section_name, field_name)` to `uq_field_section_org (section_name, field_name, org_id)` — required for per-org seeding via INSERT IGNORE. Seeds via `seedService.js` on org creation. |
| `picklists` | Dropdown values per category per org |
| `case_number_config` | Auto-number format per org per case type |
| `case_form_definition` | Section + field visibility per org per case type. Seeded for new orgs via `seedService.js`. |
| `products` | Drug/trade names per org |
| `product_families` | Product groupings with ingredients |
| `product_approvals` | Regulatory approvals per product (F-07) |
| `product_country_authorizations` | Country-level authorizations per product (F-07) |
| `contacts` | Case contacts directory — HCP, Patient, Other |
| `company_reps` | Company representative directory |

**Case form clean-up (2026-10-13, migrations 170–175).** A cut field is a `field_setup` row with `is_hidden = 1` — its values and history kept (the one deletion is migration 170: 23 contact settings the screen never showed, removed only where no case stored a value); a cut section is `case_form_definition.is_visible = 0`. Each organisation's outcome is an `audit_logs` row, action `case_form_cleanup`. `case_form_rules` required and validation rules and the Validation Rules phase list (`field_phase_required`) no longer refuse a save, and their admin endpoints are gone; the tables are kept. `case_form_rules` visibility rules are still seeded and applied. New columns: `cases.latest_information_date`; `case_ae_events.verbatim_reaction`, `hospitalization_start_date`, `hospitalization_end_date`; `case_ae_product_info.product_role`; `case_ae_patient_info.pregnancy_trimester`; `icsr_reactions.reaction_verbatim`.

### Email & Inbox
| Table | Purpose |
|-------|---------|
| `email_accounts` | IMAP/SMTP mailbox connectors per org — polling settings |
| `inquiries` | Email-derived inquiries — status, lock state, color, attachments |
| `inquiry_notes` | Internal notes per inquiry |
| `inquiry_attachments` | Email attachment metadata |
| `reply_templates` | Global email reply templates |
| `email_retry_log` | Retry attempts for failed notification emails |

### Content Management
| Table | Purpose |
|-------|---------|
| `cm_folders` | Top-level content folders |
| `cm_documents` | Documents — Draft → CheckedOut → Pending → Under Review → Approved → Published → Archived. **Phase 4 columns:** `owner_user_id`, `review_cycle_days`, `regulatory_ref`, `custom_attributes` (JSON), `version_notes`, `alert_days` (JSON), `alert_email_account_id` |
| `cm_document_relations` | Associated document links — `doc_id`, `related_doc_id`, `relation_type`, `created_by` |
| `cm_document_alert_subs` | Per-document alert subscribers — `document_id`, `user_id`, `created_by` |
| `cm_org_settings` | Org-level CM default settings — key/value JSON store. Keys: `default_alert_days`, `default_alert_email_account_id`, `default_alert_roles` |
| `cm_faqs` | FAQs with lifecycle |
| `cm_templates` | Email/response/acknowledgment templates |
| `cm_merge_reports` | Retired 2026-10-14 — kept, no screen or route reads it |
| `cm_reviews` | Review sessions |
| `cm_reviewers` | Individual reviewer assignments per review session |
| `cm_version_history` | Version tracking per document/FAQ/merge-report |

### Regression & Monitoring
| Table | Purpose |
|-------|---------|
| `regression_runs` | Regression test run history — `run_by`, `started_at`, `completed_at`, `total_tests`, `passed`, `failed`, `skipped`, `health_score`, `results` (LONGTEXT — full JSON report) |

### Audit & Monitoring
| Table | Purpose |
|-------|---------|
| `audit_logs` | General audit — case operations + entity changes |
| `platform_admin_alert_rules` | Sprint 9. Alert rule master data — event type, severity, delivery channels (email/in-app), recipients, threshold, time window, cooldown, active/inactive |
| `platform_admin_alert_events` | Sprint 9. Each fired alert event — per-channel delivery status (email delivered/failed, in-app created/failed) |
| `case_audit_trail` | Immutable field-level change log per case (F-09) |
| `transmission_audit_trail` | Immutable outbound transmission log per case (F-10) |
| `service_logs` | Platform-wide service events |

---

## Services and Scripts Reference

### `mims/backend/services/regressionRunner.js` (NEW — Sprint 15)

Full regression test engine. Auto-discovers `*.tests.js` files from `mims/backend/regression-tests/`, runs them sequentially (50ms gaps), stores full JSON report in `regression_runs` table.

Key functions:
- `runRegressionSuite({ runByUserId, app })` — runs all discovered tests, returns structured report
- `getToken()` — reads `REGRESSION_EMAIL`/`REGRESSION_PASSWORD` from `process.env` (set in `backend/.env`). Handles 2FA orgs via challengeToken→skip-setup flow. Dev-mode fallback to `vanaja_admin@reviewco.com` if env vars missing. Falls back to `REGRESSION_FALLBACK_EMAIL` if primary fails.
- `ensureRegressionUserOrgAccess()` — directly INSERTs `user_org_access` row for regression user using first active org. Called automatically on `noOrgAccess` during test run.
- `getDbHealth()` — SHOW TABLES + DESCRIBE per table + row counts
- `getApiCatalog(app)` — traverses `app._router.stack` recursively to list all registered routes
- `discoverTests()` — fs.readdirSync scans `regression-tests/` for `*.tests.js` files. New test files auto-detected without config changes.

**Regression credentials:** Set in `mims/backend/.env` (NOT the top-level `mims/.env`). Server CWD is `backend/` so `--env-file=.env` loads `backend/.env`. Missing credentials = token null = 170 tests fail with 401. Current: `REGRESSION_EMAIL=vanaja_admin@reviewco.com` / `REGRESSION_PASSWORD=Test@1234`.

**Test files location:** `mims/backend/regression-tests/*.tests.js`

**Rate limit:** 5 minutes per user (in-memory, resets on backend restart).

### `mims/backend/services/cmExpiryAlertService.js` (NEW — Sprint 15)

Daily cron at 07:00 UTC. Checks `cm_documents` for expiring documents. Per-doc config (`alert_days` JSON + `alert_email_account_id`) with org-level default fallback from `cm_org_settings`. Sends via nodemailer using stored SMTP account. Always fires on day 1 of expiry.

### `mims/backend/routes/admin/impactPreview.js` (NEW — Sprint 17)

POST `/api/admin/impact-preview` with 5-min in-memory TTL cache (Map-based).

Supports 3 `change_type` values:
- `workflow_rule` — affected cases by workflow state + case type
- `field_definition` — affected case versions with field changes
- `taxonomy` — affected cases referencing a picklist value

Returns: `{ affected_cases, risk_level (LOW/MEDIUM/HIGH), breakdown_by_case_type[], warnings[], ... }`. Used by AdminWorkflowSection.jsx and AdminPicklistsSection.jsx to show blast-radius before admin changes.

### `mims/backend/services/seedService.js` (NEW — Sprint 10)

Master org seed service. Called when new org created.

```js
const { seedNewOrg } = require('./services/seedService');
await seedNewOrg(orgId, userId);  // runs in a single transaction
```

Seeds 3 things in order:
1. **Field Setup** — 113 fields across 19 sections (General, MI, AE, PC) including: Prefix, Reporter Type, Source, Consent Status, Product Type, Product Category, Reported Causality, PC Classification, Frequency, Administration Route
2. **Picklists** — 33 default picklist groups
3. **Case Form Definition** — section visibility defaults for MI (5 sections), AE (10 sections), PC (8 sections)

All 3 run in single MySQL transaction — any failure rolls back all.

**Since 2026-10-13** the seed builds the target form only: fields and sections on the cut list are left out, except panel fields, which are seeded hidden (a panel field with no row would show); Latest Information Date and Role are seeded; no Customize Forms placeholders.

**Wired into:** `mims/backend/routes/admin/orgs.js` POST `/` handler — called after INSERT INTO organisations, before SELECT created_at.

### Case form clean-up files (NEW — 2026-10-13)

| File | What it does |
|------|--------------|
| `mims/backend/catalogs/caseFormCutList.js` | The cut list — fields hidden, sections off, fields added, the MI follow-up rule. One list read by migration 174, the seed and the Case Form Fields screen. A `decided` row is hidden whatever it holds; any other row only where its store is empty. |
| `mims/backend/services/requiredFields.js` | The one required engine. The Required tick on Case Form Fields, checked by the server on every save path — case fields, contacts, AE events and rows. |
| `mims/backend/services/fieldUsageService.js` | The **Used in cases** count — each field counts its own store only, columns taken from the panel catalog. |
| `mims/backend/catalogs/panelCoreFields.js` | Core key → stored column for every field a panel draws itself. |
| `mims/backend/catalogs/e2bFieldTags.js` | Which fields reach the E2B file MIMS writes (the E2B badge). |
| `mims/backend/services/miSendCheck.js` | What an MI needs before its response is sent: who asked, the question, the AE/PC screening answer and, on Yes, a converted or linked AE/PC case (product a warning). Read by the MI card and the SENT transition. |
| `mims/backend/services/miResponseSettings.js` | An organisation's MI response settings (migration 178) with defaults; `defaultResponseDue` fills Response Required By on a new MI. The off-label and closing statements are added by `miResponseService.buildResponsePackage`. |
| `mims/backend/services/transmissionTargets.js` | The safety (AE) and quality (PC) hand-off targets as `org_integrations` rows; the outbound key encrypted in `config.outbound_key_enc`, never in `api_key`; working days to hand off. |
| `mims/backend/utils/workingDays.js` | Working days (Mon–Fri, no holidays) for due dates: MI answer-by, Field Alert Report, hand-off. |
| `mims/backend/services/pcHandoffCheck.js` | What a complaint needs before Route to Quality: product, description, and a linked AE case for an injury (lot a warning); shows the counterfeit flag and the Field Alert Report due date. Read by the PC card and the hand-off route. |

### `mims/backend/scripts/backfill-existing-orgs.js` (NEW — Sprint 10)

One-time script to seed defaults for orgs created before Sprint 10.

```bash
node mims/backend/scripts/backfill-existing-orgs.js
```

Queries all active orgs, calls `seedNewOrg(org.id, 4)` for each, continues on error, prints summary. Run once. Already run for org 1 (Novartis) + org 26 (Vanaja Review Co.).

## In-app help articles (was MIMS Help Memory File)
*Sprint 21 — In-App Help System*
*Created: 2026-04-24 | Owner: Bala (PMO/AI) | Last updated by: Varun (CTO)*

---

### Purpose

This file is the **canonical index of all help articles** in MIMS. When new articles need to be added in future sprints, consult this file to:
1. Find the correct `feature_key` and `feature_group` to use
2. Follow the established 4-block article structure
3. Ensure audience targeting is consistent with existing articles
4. Run the bulk-import endpoint to upsert new content

---

### Article Structure (4-Block Standard)

Every help article MUST follow this HTML structure:

```html
<h4>What is this?</h4>
<p>Brief explanation of what the feature/section is.</p>

<h4>When to use it</h4>
<p>Context — when the user would encounter or need this feature.</p>

<h4>How to do it</h4>
<ol>
  <li>Step one</li>
  <li>Step two</li>
</ol>

<h4>What happens next?</h4>
<p>Outcome — what the system does after the user takes the action.</p>
```

---

### Audience Values

| Value | Who it targets |
|-------|----------------|
| `all` | Every logged-in user (use for orientation articles) |
| `agent` | Case processing agents only |
| `cm_admin` | Content Management admins |
| `admin` | Org admins |
| `platform_admin` | Platform admins only |

Multiple values can be combined: `["agent", "cm_admin"]`

---

### Feature Key Convention

Pattern: `{module}.{sub-feature}` (dot-separated, lowercase, underscores for spaces)

| feature_key | feature_group | Description |
|-------------|---------------|-------------|
| `general` | *(null)* | Platform orientation, navigation, general |
| `cases` | `cases` | Cases module overview, statuses |
| `cases.create` | `cases` | New case creation form |
| `cases.detail` | `cases` | Case detail page |
| `cases.contacts` | `cases` | Case contacts tab |
| `cases.mi` | `cases` | Medical information tab |
| `cases.ae` | `cases` | Adverse events tab |
| `cases.pc` | `cases` | Product complaints tab |
| `cases.workflow` | `cases` | Assignments, escalation, closure |
| `cm.folders` | `cm` | Content Management folders |
| `cm.documents` | `cm` | Documents — upload, versioning, bulk actions |
| `cm.modules` | `cm` | Reusable content modules |
| `cm.templates` | `cm` | Letter templates (Response, Acknowledgment, Correspondence, Email); Make letter for a case |
| `cm.merge_reports` | `cm` | Retired 2026-10-14 — letters for a case are made from Templates |
| `cm.faqs` | `cm` | FAQs — create, approve, expire |
| `cm.reviews` | `cm` | Periodic content review cycles |
| `browse` | `browse` | Browse Content module — agents viewing approved content |
| `reports` | `reports` | Reports & analytics |
| `inbox` | `inbox` | Notification inbox |
| `admin.picklists` | `admin` | Dropdown values configuration |
| `admin.field_setup` | `admin` | Custom fields on case forms |
| `admin.workflow` | `admin` | Workflow stages and transition rules |
| `admin.product_dictionary` | `admin` | Product and brand list |
| `admin.security_groups` | `admin` | Role-based access control |
| `admin.case_numbering` | `admin` | Auto case number format |
| `admin.organisations` | `admin` | Organisation and site management |
| `admin.content_intelligence` | `admin` | AI content analysis tools |
| `admin.policy_graph` | `admin` | Policy relationship visualisation |

---

### Current Article Index (Sprint 21 Seed — v1)

| # | Title | feature_key | Audience | Sort |
|---|-------|-------------|----------|------|
| 1 | Welcome to MIMS | `general` | all | 1 |
| 2 | Navigating the Platform | `general` | all | 2 |
| 3 | Cases Overview | `cases` | agent, cm_admin, admin, platform_admin | 10 |
| 4 | Case Statuses Explained | `cases` | agent, cm_admin, admin | 11 |
| 5 | Creating a New Case | `cases.create` | agent, admin | 12 |
| 6 | Case Detail Page Guide | `cases.detail` | agent, cm_admin, admin | 13 |
| 7 | Managing Case Contacts | `cases.contacts` | agent, admin | 14 |
| 8 | Medical Information (MI) Section | `cases.mi` | agent, admin | 15 |
| 9 | Adverse Event (AE) Reporting | `cases.ae` | agent, admin | 16 |
| 10 | Product Complaint (PC) Reporting | `cases.pc` | agent, admin | 17 |
| 11 | Case Workflow & Assignments | `cases.workflow` | agent, admin | 18 |
| 12 | Content Folders | `cm.folders` | cm_admin, admin, platform_admin | 20 |
| 13 | Managing Documents | `cm.documents` | cm_admin, admin, platform_admin | 21 |
| 14 | Document Versioning & Checkout | `cm.documents` | cm_admin, admin | 22 |
| 15 | Bulk Document Actions | `cm.documents` | cm_admin, admin | 23 |
| 16 | Content Modules | `cm.modules` | cm_admin, admin | 30 |
| 17 | Response Templates | `cm.templates` | cm_admin, admin | 40 |
| 18 | Template Merge Fields Reference | `cm.templates` | cm_admin, admin | 41 |
| 19 | Merge Reports (retired 2026-10-14 — see Templates, Make letter) | `cm.merge_reports` | cm_admin, admin, agent | 50 |
| 20 | FAQs Management | `cm.faqs` | cm_admin, admin | 60 |
| 21 | FAQ Approval Workflow | `cm.faqs` | cm_admin, admin | 61 |
| 22 | Content Reviews | `cm.reviews` | cm_admin, admin | 70 |
| 23 | Browse Content | `browse` | agent, cm_admin, admin | 80 |
| 24 | Previewing Documents & Modules | `browse` | agent, cm_admin, admin | 81 |
| 25 | Reports & Analytics | `reports` | agent, cm_admin, admin, platform_admin | 90 |
| 26 | Inbox & Notifications | `inbox` | all | 95 |
| 27 | Managing Picklists | `admin.picklists` | admin, platform_admin | 100 |
| 28 | Field Setup & Custom Fields | `admin.field_setup` | admin, platform_admin | 101 |
| 29 | Workflow Activities | `admin.workflow` | admin, platform_admin | 102 |
| 30 | Product Dictionary | `admin.product_dictionary` | admin, platform_admin | 103 |
| 31 | Security Groups & Permissions | `admin.security_groups` | admin, platform_admin | 104 |
| 32 | Case Numbering Configuration | `admin.case_numbering` | admin, platform_admin | 105 |
| 33 | Organisation Management | `admin.organisations` | platform_admin | 110 |
| 34 | Content Intelligence — Overview | `admin.content_intelligence` | admin, platform_admin | 120 |
| 35 | Evidence Chain Analysis | `admin.content_intelligence` | admin, platform_admin | 121 |
| 36 | Policy Graph | `admin.policy_graph` | admin, platform_admin | 130 |

---

### How to Import Articles

Send the seed file to the bulk-import endpoint:

```bash
curl -X POST https://<host>/api/admin/help/bulk-import \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d @help-seed/help_articles_seed.json
```

Expected response:
```json
{ "message": "Bulk import complete.", "inserted": 36, "updated": 0, "skipped": 0, "errors": [] }
```

---

### How to Add New Articles (Future Sprints)

1. **Identify the feature_key** from the table above, or define a new one following the naming convention.
2. **Write the article** using the 4-block HTML structure.
3. **Set audience** — be specific; don't use `all` unless genuinely applicable to every role.
4. **Choose sort_order** — higher numbers appear lower in the list; use gaps of 10 between related articles.
5. **Add to seed JSON** or POST directly to `/api/admin/help`.
6. **Update this file** — add the article to the index table and, if a new feature_key, to the feature key table.
7. **Mark reviewed** — after Bhavya QA verifies the article against live UI, call `PATCH /api/admin/help/:id/reviewed`.

---

### Stale Article Policy

Articles are flagged as stale when `last_reviewed_at` is NULL or older than **90 days**.

- View stale articles: **Platform Admin → Help Content → Needs Attention** tab
- Or via API: `GET /api/admin/help/stale`
- Each article should be reviewed and marked via `PATCH /api/admin/help/:id/reviewed` at least quarterly.

---

### Technical Notes

- **Cache**: Public help endpoints cache for 10 minutes (in-memory Map). Cache busts automatically on any admin write.
- **Search**: MySQL FULLTEXT index on `(title, content_html, summary)` — searches use BOOLEAN MODE.
- **Fallback chain**: Contextual fetch tries exact key → parent key → feature_group → `general`.
- **view_count**: Incremented fire-and-forget on every `GET /api/help` hit — used to track article popularity.
- **Org-specific articles**: Set `org_id` on an article to show it only to that organisation's users (takes priority over global articles with the same key).

---

*Next update: after Sprint 22 features are added. Assign to Bhavya for QA verification of all articles.*

---

# Going live (when a cloud is chosen)

## CP Portal to MIMS bridge — go-live runbook

> **Status, 10 October 2026: local only.** Both apps run on one developer machine, and no hosting has been chosen (RULES.md › Getting a change to main). This page is what has to be true the day the bridge runs anywhere else. Until then, follow it on a fresh local install to prove it still works.

The bridge sends reports from CP Portal into MIMS. **The portal always starts the exchange; MIMS never calls the portal.** So MIMS needs to be reachable from the portal, and nothing needs to reach the portal from MIMS.

### Before you start

- Both apps on the same version of `main`.
- A backup of both databases, taken and restored once to prove it works (see the backup runbook).
- The portal's public address and MIMS's address decided, both on HTTPS.
- A person in MIMS with MIMS Admin rights, and a portal administrator.

### Settings

Set these on each server, outside the repository. Never commit a filled-in settings file.

**MIMS**

| Setting | Value | Why |
| --- | --- | --- |
| `ENABLE_API_PLATFORM` | `bridge` | Turns on only what the portal uses: the sign-in token, the cases routes and the API connections screen. `true` would turn on the whole public interface, including parts parked over security findings. Leave it unset and the bridge is off. |
| `MIMS_FRONTEND_BASE_URL`, `MIMS_BACKEND_BASE_URL` | MIMS's real addresses | Links in MIMS emails and alerts. |

**CP Portal**

| Setting | Value | Why |
| --- | --- | --- |
| `CP_FRONTEND_BASE_URL` | The portal's real address, for example `https://portal.example.com` | Every link the portal sends: "Open in portal" on a MIMS case, the visitor's private link in the confirmation email, alert emails. **If it is not set, all of these point at `http://localhost:5174`.** |
| `CP_SECRET_ENCRYPTION_KEY` | 64 hex characters, generated once and kept | Encrypts the MIMS client secret, the cached MIMS token and visitors' private links. In production without it, the portal cannot save a MIMS secret, and visitors' reports are kept but their confirmation email carries no private link. **Changing it later makes every stored secret and every visitor link unreadable**: the MIMS secret must be entered again, and visitors' question emails stop carrying their link (the links themselves still open). |
| `CP_INTERNAL_INTEGRATION_HOSTS` | MIMS's host name, only if MIMS is on a private network | The portal refuses to call private addresses unless the exact host is named here. |
| `CP_SCHEDULER` | Leave unset, or `external` | Unset: the portal runs its own timers (send retries every minute, MIMS changes every 5 minutes, comparison every hour). `external`: a scheduler must call the four `/api/internal/cron/…` addresses instead. |
| `CP_CRON_SECRET` | A long random value, only with `CP_SCHEDULER=external` | The scheduler sends it with each call. |
| `MIMS_CLOSE_SYNC_INTERVAL_MS`, `MIMS_RETRY_INTERVAL_MS`, `MIMS_RECONCILE_INTERVAL_MS` | Leave at the defaults | How often the portal reads MIMS's changes, retries failed sends, and compares lists. |

### Secrets

1. In MIMS: **MIMS Admin → API connections → New connection.** Name it after the portal. Give it `cases:read` and `cases:write`, nothing else. Copy the client ID and secret; the secret is shown once.
2. In the portal: **Admin → client → Integration.** Auth type OAuth, API base URL = MIMS's backend address, client ID and secret from step 1, MIMS case URL base = MIMS's case address ending `/mims/cases/`. Save.
3. The secret never goes in email, chat, a ticket or the repository. It is stored encrypted on the portal.

**Changing the secret.** In MIMS, **New secret** on the connection. The old secret keeps working for 7 days, so enter the new one in the portal's Integration page within that week, then run Test Connection. After 7 days the old secret gets 401.

### Migrations, in this order

Both apps run their own migrations when they start, and each is safe to run twice. Start **MIMS first**, then the portal: the portal's first contact checks MIMS's bridge version.

| Order | App | Migration | What it adds |
| --- | --- | --- | --- |
| 1 | MIMS | 164 | The fingerprint of each report received (receipt) |
| 2 | MIMS | 165 | The previous secret, for the 7-day changeover |
| 3 | MIMS | 166 | Where a case came from, whether the reporter can answer, duplicate flag, questions to the reporter |
| 4 | CP Portal | 0044 | MIMS's receipt on each request |
| 5 | CP Portal | 0045 | Comparison runs with MIMS |
| 6 | CP Portal | 0046 | Serious flag, due date, taken-on time, questions from MIMS |
| 7 | CP Portal | 0048 | Visitors' private links |

After starting, check each app's log says the migrations applied, and nothing failed. On the portal, `cp_schema_migrations` lists them; on MIMS, `schema_migrations`.

### First-start checks

Do these in order. Stop at the first one that fails.

1. **Test Connection** on the portal's Integration page. Expect: sign-in works, MIMS reports bridge version 2 or later, and one trial report per form is accepted and thrown away. Any question listed as "arrives only in the case comment" is a mapping to look at, not a failure.
2. **One real report, end to end.** As a visitor, send an enquiry on the portal with your own work email. Expect: the confirmation email arrives with a private link; the request shows "✓ Receipt" on the portal's requests list; the case appears in MIMS with "From <portal>: CP-…" and "Open in portal" opens that request.
3. **A question.** On that MIMS case, ask the reporter a question. Within 5 minutes, expect an email with the same private link; open it, answer, and see the answer arrive as a comment on the case.
4. **A side effect marked serious.** Expect the critical alert in MIMS with its due date, and "Serious · due to authorities" on the portal's list. Close the test cases afterwards.
5. **Sync Health** on the portal. Expect a comparison run listed within the hour, with nothing missing.
6. **One path that should fail.** Change one character of the private link and open it. Expect "This link is not valid or has expired."

Write down what you saw for each, with the date, in the release record.

### Watching it

- **Sync Health** on the portal: the last comparisons, failures and the monthly CSV.
- **Alerts** on the portal go to the integration team when a report keeps failing, MIMS deletes a case, a question cannot be shown, or more than 20 reports are missing at once (nothing is re-sent then; a person decides).
- In MIMS, serious side effects raise a critical alert that must be acknowledged.

### Rolling back

- **Stop the bridge, keep both apps.** In the portal, switch the integration off on the Integration page. Reports stay on the portal, marked as not sent; when it is switched back on, the retry job sends them. Nothing is lost.
- **Stop MIMS accepting.** Unset `ENABLE_API_PLATFORM` and restart MIMS. The portal retries with growing gaps, then alerts. Same recovery as above.
- **Undo a release.** Put back the previous version of the code. The migrations above only add columns and tables, so the older code runs on the newer database; do not drop them. Restoring a database backup instead loses every report since the backup: run a comparison (Sync Health) afterwards, which finds and re-sends what MIMS lost, unless more than 20 are missing, in which case it alerts and a person decides.
- **A leaked secret.** In MIMS, press **New secret** twice. Only one old secret is kept, so the second press ends the leaked one at once. Enter the second new secret on the portal straight away and run Test Connection.

---

**References**

- Bridge-only mode: `apps/mims/backend/server.js` (the `ENABLE_API_PLATFORM` block); setting described in `apps/mims/.env.example`
- Portal timers and cron addresses: `apps/cp-portal/backend/server.js` (`/api/internal/cron/…`, the `CP_SCHEDULER` block)
- Private-address guard: `apps/cp-portal/backend/utils/networkGuard.js` (`CP_INTERNAL_INTEGRATION_HOSTS`)
- Encryption key: `apps/cp-portal/backend/utils/secretCrypto.js`
- Links built from `CP_FRONTEND_BASE_URL`: `apps/cp-portal/backend/routes/portal/submit.js`, `apps/cp-portal/backend/services/visitorLink.js`
- Migrations: `apps/mims/backend/database/migrations/164_*` to `166_*`, `apps/mims/backend/database/migrations/MIGRATION_BLOCKS.md`; `apps/cp-portal/backend/database/migrations/0044_*`, `0045_*`, `0046_*`, `0048_*`
- What each feature does and how it was proved: `docs/validation/CP_MIMS_BRIDGE_VALIDATION.md`
- Local-only status: RULES.md › Getting a change to main
