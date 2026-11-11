# Architecture & System Design — Pharaxis One

What the system is made of and why (Part A), then how each part works (Part B). One document for the whole repository.

> Changes only when Rohith confirms (RULES.md › Keeping these documents current). Renamed from `ARCHITECTURE.md` and split into two parts on 2026-11-11 (Rohith); every fact below was checked against `main` that day. Built 2026-11-10 from the old SOP's CP Portal and MIMS sections, the old architecture and database notes, the backup and bridge runbooks, the MIMS help index and the two app READMEs (all in git history).

**How to read it.** If a statement would stay true after the code was rewritten in another language, it belongs in Part A. If it names a table, route, job, setting or file, it belongs in Part B.

| Part | Answers | Sections |
|---|---|---|
| **A. Architecture** | What is it made of? Where does it run? Who may do what? What did we decide, and why? | A1 Context · A2 Building blocks · A3 Technology · A4 Where it runs · A5 Security model · A6 The bridge · A7 Key decisions · A8 Targets and limits |
| **B. System Design** | How does each flow, job, table, route and screen work? How do we run, back up and go live? | B1 Folders · B2 Key flows · B3 Background jobs · B4 CP Portal design · B5 MIMS design · B6 Running it · B7 Go-live runbook · Appendix: help articles |

---

# Part A — Architecture

## A1. Context

Two products, sold separately, joined by one bridge. Pharaxis One has no customers; a "client" or "organisation" below is a pharma company in the data.

```
        doctors, patients, visitors                    medical-information team
                    │                                            │
                    ▼                                            ▼
     ┌──────────────────────────────┐    reports, files   ┌──────────────────────────────┐
     │ CP Portal  (outside)          │ ──────────────────► │ MIMS  (inside)               │
     │ one branded portal per client │ ◄────────────────── │ one installation, many       │
     │ + admin panel for the client  │  portal asks: what  │ organisations, each separate │
     └──────────────────────────────┘  changed? (status,  └──────────────────────────────┘
                    │                   answers, questions)        │        │
                    ▼                                               ▼        ▼
              ClamAV, SMTP, AI                                IMAP/SMTP   AI, OCR, S3
```

- **CP Portal** faces the outside world: content, questions, side-effect and complaint reports, a reader's own requests.
- **MIMS** is the inside system of record: cases (MI, AE, PC), signed answer letters, content management, hand-offs to safety and quality, reports.
- **The portal always starts the exchange.** MIMS never calls the portal, so MIMS needs no route to the portal.

## A2. Building blocks

```
 CP Portal                                         MIMS
 ─────────────────────────────────────────         ─────────────────────────────────────────────
 Browser: React SPA (admin + portal)               Browser: React SPA (one app, screens by grant)
   │  /api, /uploads (same origin)                    │  /api (same origin), WebSocket
   ▼                                                  ▼
 Node/Express API (one process)                    Node/Express API (main process)
   ├─ in-process timers (or external cron)           ├─ child process: email poller (IMAP in)
   ├─ ClamAV over TCP (every upload)                 ├─ child process: scheduler (≈20 cron jobs,
   ├─ SMTP per client (outbox with retries)          │                  email worker)
   ├─ AI provider (assistant, per client)            ├─ Redis (optional: cache, presence, events)
   └─ MySQL database: CP Portal                      ├─ AI providers, OCR, file store (disk or S3)
                                                     └─ MySQL database: MIMS
```

| Block | CP Portal | MIMS |
|---|---|---|
| User interface | One React app with two halves: Admin Panel (`/admin`) and the client portals (`/portal/<code>`) | One React app; menu and routes follow the person's screens |
| Server | One Express process; timers run inside it unless `CP_SCHEDULER=external` | Express main process plus two forked workers (email poller, scheduler); WebSocket for presence and live updates |
| Data | One MySQL database; files on local disk | One MySQL database (many organisations, separated by `org_id`); files on disk or S3 |
| Cache and messaging | None | Redis when present; the app falls back to the database without it |
| Outside services | ClamAV, client SMTP, AI provider (OpenAI or Anthropic), free machine translation (opt-in, news and FAQs only) | Organisation mailboxes (IMAP/SMTP), platform SMTP, AI providers (OpenAI or Anthropic), OCR, S3 |
| Integration surface | Calls MIMS's public API (`/api/v1`) | Public API platform (`/api/v1`, OAuth client credentials, scopes, webhooks) |

## A3. Technology

Versions are those in each `package.json` on `main` (2026-11-11). CI builds on **Node 20**.

| Layer | CP Portal | MIMS |
|---|---|---|
| Server | Express 4.22, mysql2 3.24, jsonwebtoken 9, bcrypt 6, multer 2.4, nodemailer 10.3, pdfkit 0.20, express-rate-limit 8.7, @simplewebauthn/server 13, jose 6 | Express 4.18, mysql2 3.24, jsonwebtoken 9, bcrypt 6, multer 2.5, nodemailer 10.1, imapflow 1.6, mailparser 3.14, node-cron 4.2, ioredis 5.10, ws 8.22, express-rate-limit 7.5, @simplewebauthn/server 13, jose 6, joi 18.3 |
| AI | openai 6.29, @anthropic-ai/sdk 0.78 (portal assistant) | Provider abstraction for OpenAI and Anthropic (inbox classifier, response drafter, summariser) |
| Browser | React 18.3, Vite 7.3, react-router-dom 6.30, DOMPurify 3.4 | React 19.2, Vite 8.0, react-router-dom 7.18, TipTap 3.31, jsPDF 4.2, DOMPurify 3.4 |
| Database | MySQL 8.0 (native install, no Docker); numbered SQL migrations folded into `0000_baseline.sql` | MySQL 8.0; numbered JavaScript migrations, run at start-up |
| Tests (kept, run in CI) | Fresh-database checks, unit scripts | Jest, Supertest, Vitest, Testing Library; Playwright installed, not run in CI |

## A4. Where it runs

**Local only.** Both products run on one developer machine; no cloud, no deploy pipeline, no demo environment until Rohith picks a cloud (RULES.md › Getting a change to main).

| | CP Portal | MIMS |
|---|---|---|
| Browser app | `:5174` (Vite dev server) | `:5173` (Vite dev server) |
| API | `:4000` | `:3000` (bound to 127.0.0.1) |
| Database | `pharaxis_cp_portal_dev` | `pharaxis_mims_dev` |
| Shared services | MySQL 8 on `:3306` (one server, both databases); ClamAV on `:3310` | Same MySQL server; Redis on `:6379` when running |

- **Environments:** dev only. Tests use their own databases (`*_test`); screen walks use throwaway copies whose mail and outside links are first pointed at local stand-ins (RULES.md › Never do).
- **CI:** GitHub Actions per product, path-filtered, markdown ignored. Each runs Backend Syntax, Frontend Build, Quality Gate, Security Scan and Unit Tests (against a MySQL 8 service, Node 20). Not a required check: a person reads it and never merges red.
- **Releases:** not tagged (paused 2026-10-04). Every change goes into `docs/CHANGELOG.md` with a revalidation flag.

## A5. Security model

| Concern | CP Portal | MIMS |
|---|---|---|
| Sign-in | Admin: password + second step (email code, authenticator app, backup code or passkey). Portal: password, optional emailed code per client, or single sign-on | Email/username, organisation choice, password; two-step per organisation (email code or authenticator app) and for platform admins; Google or Microsoft single sign-on per organisation; passkeys |
| Session | JWT in an HttpOnly cookie (`cp_admin_token`, `cp_portal_token`); a `token_version` revokes old tokens; sessions recorded | JWT in an HttpOnly cookie (`mims_token`); sessions recorded and revocable; idle timeout per organisation (30 min default, 60 for platform admins) |
| Who sees what | Five admin roles, one write table (`middleware/adminWritePolicy.js`); a reader's role (HCP, patient…) gates content; the role is set by the portal team and only confirmed by the reader | Tenancy by `org_id` from the token; seven screens per person (role default + personal differences); 32 server-checked permissions; case access own/all; platform admin above all |
| Records | Audit trail of admin actions; reader confirmations of safety letters; consent records | Field-level case audit, transmission audit, login audit (kept 7 years), general audit; MI answers and content signed with password and reason (21 CFR Part 11) |
| Data at rest | Integration secrets, cached MIMS token and visitors' private links encrypted (`CP_SECRET_ENCRYPTION_KEY`) | Mailbox passwords AES-256-GCM; SSO provider secrets encrypted (`SSO_CONFIG_ENCRYPTION_KEY`); outbound keys encrypted |
| Inputs and outputs | Every upload virus-checked before download or forwarding; HTML sanitised; outbound calls refused to private addresses unless named (`CP_INTERNAL_INTEGRATION_HOSTS`); rate limits; `nosniff`, `SAMEORIGIN` headers | Rate limits on sign-in and account creation; security headers with a content-security policy (report-only by default); one mail gate: alert mail off unless `MIMS_ALERT_EMAIL` is on |
| Password rules | History blocks reuse; reset by emailed link | Current + last 5 blocked; forced reset on first sign-in (known gap: it is asked before the two-step code — Varun) |

## A6. The bridge

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
   ▼                  MIMS case appears with the portal's notes under its header
retry 1, 2, 4, 8, 16 min     │   (other answers, unmatched product, a possible side effect)
   │                         ▼
   ▼                  agent works the case; may leave a question for the doctor
Sync Health shows            │   (stored on the case — MIMS does not send it)
late / failed / not covered  ▼
                      every 5 min CP Portal asks MIMS "what changed?" ──► doctor sees
                      the question, the answer sent, closed or reopened
                             │
                             ▼
                      hourly (side effects) and nightly (all) CP Portal compares its list
                      with MIMS ──► a missing report is sent again; a different one alerts
```

- **Principles:** the portal starts every exchange; every send is idempotent; nothing the bridge carries may be lost unseen (heartbeat, delivery targets, comparisons, the monthly Zero-Loss Report).
- `other_inquiry` stays in CP Portal by design. Details: B2 and B4.

## A7. Key decisions

| Decision | What it means | Where recorded |
|---|---|---|
| Local only until a cloud is chosen | No deploy pipeline, no demo environment, no off-machine backup | Rohith; RULES.md › Getting a change to main (deploys removed 2026-09-24) |
| Two products, one repository, sold separately | CP Portal and MIMS can each stand alone | PRD.md |
| The portal always starts the bridge | MIMS needs no route to the portal | Go-live runbook (B7) |
| Sessions in HttpOnly cookies, not browser storage | Page scripts cannot read a session | Both apps' auth code |
| Safety alerts go live at once; a second person checks within 24 hours | A warning is never held back, and every alert is read twice | Rohith, 2026-10-10 and 2026-11-10 (PRD.md) |
| A clinical trial needs a second person to publish | Whoever sent it for review cannot publish it | Rohith, 2026-10-10 (PRD.md) |
| Outside machine translation off by default; never for safety alerts or documents | Regulated text does not leave for a free service | CP-65 (2026-07-31), CPPM-9 |
| MI answers always start as DRAFT; SENT is final; Approve and Send are signed | 21 CFR Part 11 records | RULES.md › MIMS critical technical rules |
| Case form fields with values are hidden, never deleted | Records keep their history | RULES.md › MIMS critical technical rules (2026-10-13) |
| No new automated tests; existing ones run in CI | Regressions are found on screen | Rohith, 2026-09-20 (RULES.md › Proving it works) |

## A8. Targets and limits

| What | Target or limit |
|---|---|
| Report reaches MIMS | 15 minutes; 5 for a serious side effect; alert at twice the target |
| Bridge job silent | Alert after three missed runs |
| Inquiry Ledger (MIMS) | Red when waiting for an owner 8 h, serious side effect 2 h, with an owner 5 days |
| Safety alert second check | 24 hours after it goes live |
| Sign-in | Idle timeout 30 min (min 30) per organisation, 60 for platform admins; two-step locks after 3 wrong codes |
| Content check-out (MIMS) | 2 hours, then released by a job |
| Help articles | Stale after 90 days without review |
| Login audit (MIMS) | Kept 7 years |
| Backups | By hand, newest 14 kept, same machine — not disaster recovery |

---

# Part B — System Design

## B1. Folders

| Path | Holds |
|---|---|
| `apps/cp-portal/backend` | Express server (`server.js`), `routes/admin` (33 files), `routes/portal` (18), `services` (20), `utils` (39), `middleware`, `database/migrations` (62, ending 0063) |
| `apps/cp-portal/frontend` | React app: `src/admin` (35 pages), `src/portal` (31 pages), `src/shared` |
| `apps/mims/backend` | Express server, `routes` (121 files), `services` (153), `middleware` (14), `workers`, `catalogs`, `controllers`, `database/migrations` (167, ending 190), `regression-tests` |
| `apps/mims/frontend` | React app; the entry is `index.html` → `src/modules/max/main.jsx` → `src/modules/max/App.jsx` |
| `docs/scripts` | Developer scripts (each climbs to the repository root from its own folder) |
| `.github/workflows` | CI per product (`ci-mims.yml`, `ci-cp-portal.yml`, shared `_app-ci.yml`); release workflows (never run); PR labeler and label sync from `.github/labels.yml` |
| `docs/scripts/github` | `bootstrap-product-ops.sh` (labels, environments), `apply-main-branch-protection.sh` |

## B2. Key flows

**A side-effect report, end to end**

```
Portal form ──► CP saves submission ──► sync: build payload (reporter split, patient,
(check your answers)                    other answers, side-effect hint on questions)
                                            │
                                            ▼
                         MIMS POST /api/v1/cases ──► case + contacts + AE version
                                            │        + bridge note (case comment)
                                            ▼
                         unassigned AE: supervisors told; serious: critical alert
                                            │
             CP receipt (fingerprint) ◄─────┘
```

**An MI answer**

```
MIMS agent: screening answered ──► Build MI Response (template + published content)
                                         │
                       DRAFT ──Submit for Review──► READY ──Approve (password + reason,
                                                            not the author)──► APPROVED
                                                                                  │
                                         SENT ◄──Send (password + reason)─────────┘
                                          │  email in try/catch, logged on failure
                                          ▼
                       CP close-sync (5 min) ──► doctor sees the answer, PDF copy
```

**A safety alert**

```
Admin or content manager saves ──► live to doctors at once (or at its time) ──► readers told
          │                                                                         │
          ▼                                                                         ▼
second_check_due_at = live + 24 h ──► To do today: "waiting for a second check"   high/critical:
          │                                (red once overdue)                     "I have read this"
          ▼
another admin presses Second check (writer refused, 403) ──► SECOND_CHECK in the audit trail
          │
a change to what doctors read ──► check needed again
```

## B3. Background jobs

**CP Portal** — in-process timers, or the same work through `/api/internal/cron/…` with `CP_SCHEDULER=external` and `CP_CRON_SECRET`. A MySQL advisory lock stops two runs overlapping.

| Timer | Every | Does |
|---|---|---|
| `scheduler-tick` | 1 min | Publishes scheduled news, documents and safety alerts and tells readers; weekly digest (Mon 08:00); email outbox retries; chat and consent clean-up past retention; rescans files held while ClamAV was down; alerts on waiting safety tasks, held files, late deliveries and waiting Other requests; safety-letter reminders |
| `mims-retry` | 1 min (`MIMS_RETRY_INTERVAL_MS`) | Re-sends failed reports (1, 2, 4, 8, 16 min, then alert) |
| `mims-close-sync` | 5 min (`MIMS_CLOSE_SYNC_INTERVAL_MS`) | Reads what changed in MIMS: answers, questions, closed, reopened |
| `mims-reconcile` | 1 h (`MIMS_RECONCILE_INTERVAL_MS`) | Compares lists: side effects hourly, all reports nightly |

**MIMS** — the scheduler child process runs these (`services/schedulerRegistry.js`); times are server time.

| Job | When | Does |
|---|---|---|
| `workflow-sla-timers` | every minute | Workflow timers |
| `webhook-delivery-dispatch` | every 2 min | Outbound webhook deliveries |
| `runtime-health-watch`, `emir-poller`, `inquiry-ledger-watch` | every 5 min | Health checks; EMIR mailbox; red cases on the Inquiry Ledger |
| `notification-delivery-retry` | every 10 min | Retries notifications |
| `cm-release-stale-checkouts`, `scheduled-exports`, `case-state-sla` | every 15 min | Returns 2-hour check-outs; scheduled report sends; case state limits |
| `case-transmission-sla`, `ae-handoff-deadlines`, `inbox-operational-sla`, `session-cleanup` | every 30 min | Hand-off and inbox limits; prunes expired sessions |
| `login-audit-archive`, `dppr-enforcement` | daily 02:00 | Deletes login audit past retention; data-privacy rules (off unless `ENABLE_SCHEDULED_DPPR=true`) |
| `pv-signal-detection` | daily 03:00 | Product-reaction signal detection |
| `cm-content-auto-archive`, `cm-module-lifecycle`, `cm-expiry-alerts`, `cm-pre-expiry-reminders`, `cm-review-overdue` | daily 05:00–07:05 | Content lifecycle, expiry alerts and reminders |
| `cm-review-reminders` | Mondays 08:00 | Review reminders |
| `email-worker` (standalone) | polls every 15 s | Sends queued MI answer emails |
| Email poller (child process) | every minute, per-mailbox intervals | IMAP intake; Email Case Import SLA every 15 min |

## B4. CP Portal design

### Code layout

```
cp-portal/
  backend/
    server.js              — Express app, all route registrations
    database/db.js         — MySQL pool + the original table definitions; the full schema is migrations/0000_baseline.sql plus numbered migrations
    middleware/auth.js     — JWT auth for admin + portal, requireClientAccess
    routes/admin/          — 33 admin API route files
    routes/portal/         — 18 portal API route files
    utils/
      audit.js             — audit(admin, clientId, action, entity, entityId, meta)
      mailer.js            — email sending via nodemailer
      notify.js            — portal notifications helper
      translator.js        — outside machine translation (MyMemory), opt-in per client
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

#### Authentication
- **First sign-in:** the reader confirms the role the portal team approved; the popup locks the other roles and the server refuses a different one (403). Each confirmation is audited (`ROLE_CONFIRMED`).
- **Admin:** a password, then a second step (emailed code, authenticator app, backup code or passkey). The session is an HttpOnly cookie, `cp_admin_token`, never readable by page scripts.
- **Portal:** a password — then, where the client turns it on, a code emailed to the doctor (from 2026-10-27) — or single sign-on. The session is an HttpOnly cookie, `cp_portal_token`. `portalFetch()` in `PortalContext` handles 401 → sign-out.
- **Portal session restore:** `GET /api/portal/auth/me` called on mount to verify token against DB.

#### Feature Flags
- Stored in `cp_features` table per client
- Read via `GET /api/portal/config/:clientCode` → returns `{ features: { key: bool } }`
- `isFeatureEnabled(key)` in PortalContext handles gate access matrix
- Portal pages are hidden/shown based on feature flags per client

#### Translation
- Readers see stored translations: `translations_json` on `cp_news_posts`, `cp_safety_alerts`, `cp_faq_items`, `cp_documents`, read by `applyTranslation(row, lang, fields)`, falling back to English.
- Outside machine translation (`utils/translator.js`, MyMemory, free, no key) is **off by default**; a client opts in with `"machine_translation": true` in its language config. Even then only news and FAQs are sent (`FREE_TRANSLATION_ALLOWLIST`); safety alerts and documents never leave (CP-65, CPPM-9). Otherwise the team types translations in.
- Languages: `en`, `fr`, `de`, `es`, `ja`, `zh` (`zh-CN` for MyMemory). The switcher shows when two or more are enabled.
- Backfill: Language page → "Retranslate All Content" (`POST /api/admin/language/:id/retranslate`), shown only while machine translation is on.

#### Audit Trail
- `audit(adminObj, clientId, action, entity, entityId, meta)` in `backend/utils/audit.js`
- Actions include `CREATE`, `UPDATE`, `DELETE`, `ENABLE`, `DISABLE`, `UPLOAD`, `EXPORT`, `SECOND_CHECK` (safety alerts) and, from the portal, `ROLE_CONFIRMED` and `ACCESS_REQUESTED`
- `ClientDetailPage` cockpit fetches `GET /api/admin/audit/:clientId?limit=5` for real recent activity

#### Notifications
- `notify.js` creates rows in `cp_notifications` per portal user
- Portal layout fetches on mount — bell icon shows unread count

#### Process Explorer — removed
No longer in the product: no screen, no route and no `cp_process_logs` table (checked 2026-10-27).

---

### Database tables (79 in the dev database on 2026-11-11; the core ones below)

#### Admin & Config
| Table | Purpose |
|-------|---------|
| `cp_admin_users` | Admin panel login accounts |
| `cp_clients` | One row per client — code, name, language_config_json |
| `cp_branding` | Colors, fonts, logos, portal name per client |
| `cp_features` | Feature flags per client (is_enabled) |
| `cp_form_config` | The questions on each form (question, side effect, complaint, other) per client |
| `cp_integration_config` | The MIMS connection per client (OAuth, addresses, change cursor) |
| `cp_field_mapping` | Form question → MIMS field; a full-name question keeps the reporter's first/last split |
| `cp_gate_config` | User type gate config per client |
| `cp_gate_user_types` | HCP / Patient / Other user type definitions |
| `cp_feature_access` | Per-feature access by user type |
| `cp_compliance_config` | GDPR/consent jurisdiction config per client |
| `cp_templates` | Email templates per client |
| `cp_email_config` | SMTP config per client |
| `cp_chatbox_config` | AI chatbox config per client |

#### Portal Users & Activity
| Table | Purpose |
|-------|---------|
| `cp_portal_users` | HCP/patient accounts per client portal |
| `cp_submissions` | Medical inquiry submissions |
| `cp_consent_records` | User consent audit records |
| `cp_saved_items` | Portal user bookmarks (news/documents) |
| `cp_notifications` | Portal user in-app notifications |
| `cp_feedback` | Portal user feedback submissions |
| `cp_msl_bookings` | MSL meeting requests |

#### Content
| Table | Purpose |
|-------|---------|
| `cp_therapeutic_areas` | TA content per client |
| `cp_drugs` | Drug information per client |
| `cp_events` | Events/webinars per client |
| `cp_resources` | Resource links per client |
| `cp_msls` | MSL directory per client |
| `cp_news_posts` | News/announcements — has `translations_json` |
| `cp_safety_alerts` | Safety alerts with severity — `translations_json`; `written_by`, `second_check_due_at`, `second_check_by`, `second_check_at` (migration 0063) |
| `cp_documents` | PDF/doc uploads — has `translations_json` |
| `cp_document_categories` | Document category groups |
| `cp_faq_items` | FAQ Q&A per client — has `translations_json` |

#### Analytics & Reporting
| Table | Purpose |
|-------|---------|
| `cp_audit_logs` | Every admin action logged (action, entity, admin_email) |

---

### Admin Panel pages (35 on 2026-11-11; the main ones below)

All admin routes under `/admin/clients/:clientId/` except Dashboard and the Clients list.

| Page | Route | What It Does |
|------|-------|-------------|
| DashboardPage | `/admin` | Stats, open submissions, recent activity across all clients |
| ClientsPage | `/admin/clients` | List all clients, create new client |
| ClientDetailPage | `/admin/clients/:id` | Overview — a "To do today" list of what is waiting (including live safety alerts waiting for a second check), alerts, recent activity, setup checklist |
| BrandingPage | `:id/branding` | Four ready themes with a live preview; single colours under Advanced; fonts, logo, portal name |
| FeaturesPage | `:id/features` | Feature switches grouped into Content, Asking and reporting, and Accounts |
| ContentPage | `:id/content` | TAs, drugs, events, resources tabs |
| NewsPage | `:id/news` | Create/edit news posts (rich text, auto-translated) |
| SafetyPage | `:id/safety` | Create/edit safety alerts (type "DHPC / Dear HCP letter" and others). Live when saved or at its time; then a second person checks within 24 hours — Waiting / Overdue / Checked by, writer locked out (Rohith, 2026-10-10 and 2026-11-10) |
| TrialsAdminPage | `:id/trials` | Clinical trials: Draft → Needs review → Live in portal. Whoever sent a trial for review cannot publish it; the server enforces this (Rohith, 2026-10-10) |
| DocumentsPage | `:id/documents` | Upload PDFs, manage document library |
| MSLPage | `:id/msls` | Add/edit MSL profiles |
| FAQPage | `:id/faq` | Create/edit FAQ items with categories |
| CompliancePage | `:id/compliance` | GDPR jurisdiction config |
| FormsPage | `:id/forms` | Medical inquiry form field builder |
| GatePage | `:id/gate` | User type gate setup + feature access matrix |
| ChatboxConfigPage | `:id/chatbox` | AI assistant: provider (OpenAI or Anthropic), model, key, prompt, welcome message. A built-in rule sends off-label questions to Medical Information |
| IntegrationPage | `:id/integration` | MIMS connection, field mappings, Test Connection |
| PortalUsersPage | `:id/users` | View/manage portal user accounts |
| SubmissionsPage | `:id/submissions` | Inbox: the case opens beside the list, side-effect reports are flagged, MIMS links open the case |
| AuditTrailPage | `:id/audit` | Full audit log with filters; times in UTC to the second |
| AnalyticsPage | `:id/analytics` | Page views, submissions, user metrics |
| FeedbackPage | `:id/feedback` | Portal user feedback responses |
| ReviewQueuePage | `:id/review-queue` | Content pending review (badge count in nav) |
| AdminUsersPage | `:id/admin-users` | Per-client admin user management |
| EmailSettingsPage | `:id/email-settings` | SMTP + template config |
| LanguagePage | `:id/language` | Enable languages; Retranslate All Content button when machine translation is on |

---

### Portal pages (31 on 2026-11-11; the main ones below)

All under `/portal/:clientCode/`. Features gated via `isFeatureEnabled()`.

| Page | Path | Feature Gate |
|------|------|-------------|
| PortalHomePage | `/` | None |
| LoginPage | `login` | None (public) |
| VerifyEmailPage | `verify-email` | None |
| SubmitPage | `submit` | `medical_inquiry`; the side-effect form asks optional Patient Initials and Patient Sex (migration 0062) |
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


### Integration with MIMS — LIVE since 2026-07-15

This section described the integration as a future plan long after it shipped. Corrected 2026-09-13.

- **CP Portal → MIMS:** MI/AE/PC submissions post to MIMS `POST /api/v1/cases`, idempotent on the CP reference, attachments forwarded
- **Back from MIMS (the portal asks; MIMS never calls):** every 5 minutes the portal reads what changed on its cases since its last check: closed, reopened, an answer sent, or a question for the reporter. It shows each on the request, and the reporter answers on the portal.
- **Comparing lists:** every hour for side effects and every night for all reports, the portal asks MIMS whether it still holds each one, unchanged. A missing report is sent again; a different version raises an alert for a person.
- **Retries:** a failed send is tried again after 1, 2, 4, 8 and 16 minutes (six tries in all), then a person is alerted
- **Auth:** OAuth client-credentials with auto-refresh, secrets encrypted at rest
- **What MIMS receives besides the fields:** every other answer under its question, a product it could not match, and, on a question answered "No" to the side-effect screen whose text mentions one, a line quoting those words. MIMS shows these under the case header.
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

## B5. MIMS design

### Code structure and rules

#### Entry Point (CRITICAL)
Real app entry point:
```
index.html → src/modules/max/main.jsx → src/modules/max/App.jsx
```
All routes are in `src/modules/max/App.jsx`. The old top-level `src/App.jsx` and `src/main.jsx` no longer exist.

**Processes.** `server.js` serves the API and, through `services/processManager.js`, forks two workers: `workers/pollerProcess.js` (email intake) and `workers/schedulerProcess.js` (jobs, B3). Presence, chat and live updates go over WebSocket and Redis pub/sub (`services/redisClient.js`); without Redis the app falls back to the database. Files go through `services/fileStorageService.js` (`STORAGE_PROVIDER` local or s3); OCR through `services/ocrService.js`; AI through `services/ai/providerAbstraction.js`.

#### Auth Flow
1. User POSTs `/api/auth/login` with email + password
2. Server verifies password (bcrypt), checks `user_org_access` for org assignment
3. Returns JWT: `{ userId, email, role, orgId, siteId }`
4. The JWT is set as an HttpOnly cookie, `mims_token`, which page scripts cannot read
5. The browser sends it on every same-origin call; `Authorization: Bearer cookie-session` is ignored
6. `requireAuth` middleware decodes JWT, attaches `req.user`
7. `requireOrg` blocks non-platform-admin users without `orgId` in JWT (403)

#### JWT Decode Pattern
```js
// ALWAYS use req.user.userId — NEVER req.user.id
req.user = decoded  // { userId, email, role, orgId, siteId }
```

#### Multi-Org Data Isolation Pattern
```js
// Applied on every data-scoped route since Sprint 7
if (req.user.role !== 'platform_admin') {
  query += ' AND org_id = ?'
  params.push(req.user.orgId)
}
// Platform Admin has orgId = null in JWT → bypasses all org filters
```

#### Module Access (screens)
- Screens: `mims_core` (Cases), `inbox`, `transmissions`, `browse_content`, `content_mgmt`, `reports`, `admin_console` (MIMS Admin). Nothing else (access review, 2026-10-14; migration 185 removed six keys with no screen).
- A person's screens are their role's defaults (`role_permissions`, shared by all organisations, changed only by a migration) plus their own differences (`user_module_permissions`, `can_access` 1 or 0), read by `utils/userModules.js` `getUserModules`.
- An administrator sets a person's screens on Add / Edit Users › Screens (`PUT /api/admin/users/:id/modules`); only differences from the role are stored (`setUserModules`). MIMS Admin is not set there: it needs the administrator role as well as the module, in the menu and at the address (`ModuleAccessGuard adminOnly`).
- The server enforces each screen: cases (`middleware/caseAccess.js`), Inbox (`routes/inbox.js`), content (`middleware/cmAccess.js` `cmReadAccess`), Reports and Transmissions (`requireModule`). The frontend hides what a person cannot open (`ModuleAccessGuard`, `MIMSNavbar`).
- Platform Admin bypasses all module checks
- The User Access Review report lists each person's screens as the server gives them and, under Differs from role, every screen added or taken away for them personally. It is where a screen given by mistake (e.g. Cases on a content manager) is found; it is removed on Edit User (2026-10-14).

#### Case access (access review, 2026-10-14)
- Every request about a case — the case, its AE / PC versions and rows, MI tabs, letters, comments, contacts, attachments, field history, rich text, emails filed on it — needs Cases and View cases for that case (own or all); a change needs Update case. Pinning, following and presence need only View. Route checks (close, assign, escalate, letters, transmissions) apply after it.
- Without Update case the case page opens read only: a Read only label instead of Save Case, no version, transmit, add or delete buttons, fields locked.
- Reports follow the same rule (2026-10-14): every case report and the operations summary count all cases, only those the viewer owns or created, or none without Cases. A schedule uses its owner's access. The scope is set on the server; a filter cannot widen it (`services/reportDatasetService.js` `caseScopeOf`).
- The path a check compares is decoded and lower-cased first (`utils/gatePath.js`), as the server routes it.

#### Permissions (Group Security)
- 32 permissions, each checked by the server (`access_activity_privileges`, migration 184 removed 46 that nothing checked). A group adds rights to its members' role and never removes them (MIPM-192): the role's rights show ticked and locked.
- Platform Admin hidden from User Management + Module Access screens — `WHERE role != 'platform_admin'` on both `/api/admin/platform/users` and `/api/admin/platform/all-users`

#### In-app regression suite
- Off unless the server sets `ENABLE_INAPP_REGRESSION=true`; run by an administrator from MIMS Admin or `POST /api/admin/regression/run`, signed in as `REGRESSION_EMAIL`. Run it on a local or test copy only: it creates and deletes records. Its access-configuration check puts the organisation's sign-in policy back after it runs (2026-10-14). On 14 Oct: 178 checks, 150 pass; the 28 that fail expect behaviour later rounds changed on purpose.

#### Session Timeout
- Per-org idle timeout set by platform admin. Stored as `session_timeout_minutes` in `organisations` table.
- Platform Admin global timeout in `system_config` (`key: platform_admin_session_timeout_minutes`).
- Defaults: **30 min** per org, **60 min** platform admin. Min enforced: **30 min**.
- Login + switch-org APIs return `sessionTimeout`.
- Frontend: `useIdleTimer.js` tracks mouse/keyboard/scroll. `SessionTimeoutModal.jsx` warns 2 min before logout. "Stay Logged In" resets timer.
- `sessionTimeout` stored in localStorage as `mims_session_timeout`. Wired into `App.jsx` via `AppRoutes`.

#### User 2FA Architecture
- Organisation users: 2FA per organisation, set by a platform admin on the `2FA Configuration` screen.
- Platform admins: their own two-step when the platform setting requires it (`platformTwoFactorRequired`), with its own trusted devices.
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

#### Password Reset Flow
1. A user with `password_reset_required = 1` signs in with email and password.
2. The server sets a 10-minute reset cookie and answers `{ passwordResetRequired: true }`; the screen opens `/reset-password`. (Known gap: this comes before the two-step code — Varun.)
3. The new password must not match the current or last five.
4. The flag clears; the person signs in again, now with the two-step code.

#### CSS Namespace Convention
| Prefix | Used For |
|--------|----------|
| `mims-` | Shared layout components |
| `ac-` | Admin Console pages |
| `cm-` | Content Management pages |
| `cf-` | Case Form pages |
| `tx-` | Transmissions page |
| `bc-` | Browse Content page |

---

### Frontend Route Map

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
| `/regression` | RegressionPage | ProtectedRoute only (admin/platform-admin) |
| `/admin-console/*` | AdminConsoleRouter | `admin_console` |
| `/content` | ContentPage | `content_mgmt` |
| `/analytics` | Redirect | → `/reports` |
| `/reports` | ReportsPage | `reports` |
| `/transmissions` | TransmissionsPage | `mims_core` |
| `/browse-content` | BrowseContentPage | `content_mgmt` |
| `/response-log` | ResponseLogPage | `mims_core` |
| `/inquiry-ledger` | InquiryLedgerPage (MIPM-223) | `mims_core` |
| `*` | Redirect | → `/dashboard` |

#### Navbar Structure (MIMSNavbar.jsx)
Left menu (`shared/components/MIMSNavbar.jsx`, Rohith 2026-10-14):

**New Case** (top; shown to people who may create cases) · **Work:** Overview · Inbox · Cases ▾ · Transmissions · **Knowledge:** Browse Content · Content Management · **Reporting:** Reports · **Administration:** MIMS Admin

- An item shows only to someone who can open its page — the same module rule as its route in `App.jsx`; a heading with nothing under it is not shown. Quick search (Ctrl-K, `CommandPalette.jsx`) and the Overview's Modules list use the same rules.
- **Cases** opens the case list; its arrow lists My Cases, Unassigned Cases, Correspondence (`/cases?view=correspondence`, the former Case Query), the Response Log and the Inquiry Ledger.
- **Inquiry Ledger** (MIPM-223, 2026-10-27): every open case from every channel, its stage and age, red past its limit (waiting for an owner 8 h, serious side effect 2 h, with an owner 5 days). The `inquiry-ledger-watch` job notifies the owner, or the case supervisors, once per red case; alert email only through `MIMS_ALERT_EMAIL`. A reader with own-cases access sees only their own.
- **Deleted Cases** is a tab in the case list for administrators only; the server refuses `GET /api/cases?deleted=true` to anyone else.
- Session Management is in the user menu; the logs and audit trails are in MIMS Admin.


### Backend API Map

Backend on port 3000. All routes under `/api/`.

#### Auth
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

#### Cases
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
| PATCH | `/api/cases/:id/mi-responses/:rid/status` | Move an MI response DRAFT→READY→APPROVED→SENT. Approve and Send need password and reason (e-signature); the approver is not the author. SENT queues the email and logs it in `transmission_audit_trail`. |
| PATCH | `/api/cases/:id/mi-responses/:rid/discard` | Void a DRAFT response (VOIDED terminal state) |
| POST | `/api/admin/impact-preview` | Blast-radius impact preview for workflow/field/taxonomy changes (5-min TTL cache) |

#### Inbox
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inbox` | List inquiries from DB (real emails only) |
| GET | `/api/inbox/users` | Users for assign dropdown |
| GET/POST/PATCH | `/api/inbox/templates/:tid` | Reply templates |

#### Admin Console
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

#### Platform Admin
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

#### Content Management
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

#### Reports
All under `/api/reports/module/`, behind the Reports module grant. Who may see a report or dashboard is its audience (`visibility_scope`: `shared` Everyone with Reports, `managers` Report managers, `admin_only` Administrators); outside it a report reads as not found. Data rules: `services/reportDatasetService.js` (day 0 = Date Received; closed = a state marked closed; MI answered = first sent letter; MI due from MI Response Settings; hand-off due and sent as on the Transmission screen).
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/definitions`, `/dashboards`, `/history`, `/favorites`, `/datasets`, `/filter-options` | What the user may see; filter choices (periods, case types, products, owners) |
| POST | `/definitions/:id/run`, `/dashboards/:id/run` | Run with the filter bar's filters (`period` or `date_from`/`date_to`, `case_type`, `product`, `owner_id`, `group_by`, `window_days`); a failed run is recorded |
| POST | `/definitions/:id/export` | CSV made on the server — needs Export Reports (`reports.export`); audited (`EXPORT`, `report_definition`); readable headers, no `__` columns, formula-safe cells (`services/reportCsv.js`) |
| POST/PUT/DELETE | `/definitions[/:id]`, `/dashboards[/:id]`, `…/duplicate`, `/config`, `/datasets/:key/preview` | Custom reports, dashboards and Settings — need Manage Reports (`reports.manage`); changes audited (`report_definition`, `report_dashboard`) |
| GET/POST/PUT/DELETE | `/schedules[/:id]`, `…/pause`, `…/resume`, `/recipients` | Schedules — need Schedule reports (`reports.schedule`). Daily, weekly or monthly (the 1st); a period each send covers on the schedule's own calendar; recipients must be people in the organisation who can see the target (`services/reportRecipients.js`), checked on save and on every send; the run is made as the person who set it up |
Removed 2026-10-14: `/summary`, certify/publish/versions, templates, shares, role defaults, anomalies, recommendations, usage analytics, delivery rules, config validation; `/api/reports/*` (legacy) and `/api/presets`; `/api/admin/exports/scheduled`; the Reports Access routes (`/api/admin/reports-access`, `/api/admin/platform/reports`, `/api/admin/reports/access`).

#### Regression Testing Suite
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/regression/run` | Run full test suite (rate-limited: 5 min per user) |
| GET | `/api/admin/regression/history` | Last 50 run summaries |
| GET | `/api/admin/regression/history/:id` | Single run full results with module grouping |
| GET | `/api/admin/regression/db-health` | Live DB table health (row counts, column names) |
| GET | `/api/admin/regression/api-catalog` | All registered Express routes |
| GET | `/api/admin/regression/coverage` | Uncovered routes vs tests |

#### Admin (additional)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/mi-categories` | MI categories (org-scoped; platform admin needs `?org_id=`) |
| GET | `/api/admin/audit-logs` | Audit log entries (plural — NOT `/audit-log`) |
| GET | `/api/admin/email-accounts` | Email accounts for SMTP dropdown |
| GET | `/api/admin/products-full` | Full products list |
| GET | `/api/admin/security-groups` | Security groups |
| GET | `/api/admin/field-setup` | Field setup |

#### Misc
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Backend health check |
| GET | `/api/cases/:id/bridge` | Where a portal case came from, questions to the reporter with their answers, and the portal's notes (shown under the case header) |
| GET | `/api/users` | Active users list (for case owner dropdown) |

---

### Admin Console Sections

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

#### Platform Admin Console Pages

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


### Database tables (287 in the dev database on 2026-11-11, before migration 189 drops 20 unused ones)

#### User & Access
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

#### Organisation & Sites
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

#### Cases
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
| `case_mi_responses` | MI response records — `response_status` ENUM: DRAFT/READY/APPROVED/SENT/VOIDED. `DEFAULT 'DRAFT'` enforced. SENT = immutable. VOIDED = terminal discard. Approve and Send record e-sign password + reason. 21 CFR Part 11. |
| `case_mi_response_transitions` | Immutable audit log of each MI response status change — who, when, target_status, e-sign reason |
| `case_pc_versions` | PC version control — copy-forward on new version |
| `case_pc_general` | PC general tab |
| `case_pc_patient_info` | PC patient information |
| `case_pc_product_info` | PC product information |
| `case_pc_return_retrieval` | PC return/retrieval tab |
| `case_pc_replacement` | PC replacement tab |
| `case_pc_refund_credit` | PC refund/credit tab |

#### Configuration
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

#### Email & Inbox
| Table | Purpose |
|-------|---------|
| `email_accounts` | IMAP/SMTP mailbox connectors per org — polling settings |
| `inquiries` | Email-derived inquiries — status, lock state, color, attachments |
| `inquiry_notes` | Internal notes per inquiry |
| `inquiry_attachments` | Email attachment metadata |
| `reply_templates` | Global email reply templates |

#### Content Management
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

#### Regression & Monitoring
| Table | Purpose |
|-------|---------|
| `regression_runs` | Regression test run history — `run_by`, `started_at`, `completed_at`, `total_tests`, `passed`, `failed`, `skipped`, `health_score`, `results` (LONGTEXT — full JSON report) |

#### Audit & Monitoring
| Table | Purpose |
|-------|---------|
| `audit_logs` | General audit — case operations + entity changes |
| `platform_admin_alert_rules` | Sprint 9. Alert rule master data — event type, severity, delivery channels (email/in-app), recipients, threshold, time window, cooldown, active/inactive |
| `platform_admin_alert_events` | Sprint 9. Each fired alert event — per-channel delivery status (email delivered/failed, in-app created/failed) |
| `case_audit_trail` | Immutable field-level change log per case (F-09) |
| `transmission_audit_trail` | Immutable outbound transmission log per case (F-10) |
| `service_logs` | Platform-wide service events |

---

### Services and Scripts Reference

#### `mims/backend/services/regressionRunner.js`

Full regression test engine. Auto-discovers `*.tests.js` files from `mims/backend/regression-tests/`, runs them sequentially (50ms gaps), stores full JSON report in `regression_runs` table.

Key functions:
- `runRegressionSuite({ runByUserId, app })` — runs all discovered tests, returns structured report
- `getToken()` — reads `REGRESSION_EMAIL`/`REGRESSION_PASSWORD` from `process.env` (set in `backend/.env`). Handles 2FA orgs via challengeToken→skip-setup flow. Dev-mode fallback to `vanaja_admin@reviewco.com` if env vars missing. Falls back to `REGRESSION_FALLBACK_EMAIL` if primary fails.
- `ensureRegressionUserOrgAccess()` — directly INSERTs `user_org_access` row for regression user using first active org. Called automatically on `noOrgAccess` during test run.
- `getDbHealth()` — SHOW TABLES + DESCRIBE per table + row counts
- `getApiCatalog(app)` — traverses `app._router.stack` recursively to list all registered routes
- `discoverTests()` — fs.readdirSync scans `regression-tests/` for `*.tests.js` files. New test files auto-detected without config changes.

**Regression credentials:** Set in `mims/backend/.env` (NOT the top-level `mims/.env`). Server CWD is `backend/` so `--env-file=.env` loads `backend/.env`. Missing credentials = token null = 170 tests fail with 401. The values live only in `backend/.env`; never write a password in a document.

**Test files location:** `mims/backend/regression-tests/*.tests.js`

**Rate limit:** 5 minutes per user (in-memory, resets on backend restart).

#### `mims/backend/services/cmExpiryAlertService.js`

Daily cron at 07:00 UTC. Checks `cm_documents` for expiring documents. Per-doc config (`alert_days` JSON + `alert_email_account_id`) with org-level default fallback from `cm_org_settings`. Sends via nodemailer using stored SMTP account. Always fires on day 1 of expiry.

#### `mims/backend/routes/admin/impactPreview.js`

POST `/api/admin/impact-preview` with 5-min in-memory TTL cache (Map-based).

Supports 3 `change_type` values:
- `workflow_rule` — affected cases by workflow state + case type
- `field_definition` — affected case versions with field changes
- `taxonomy` — affected cases referencing a picklist value

Returns: `{ affected_cases, risk_level (LOW/MEDIUM/HIGH), breakdown_by_case_type[], warnings[], ... }`. Used by AdminWorkflowSection.jsx and AdminPicklistsSection.jsx to show blast-radius before admin changes.

#### `mims/backend/services/seedService.js`

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

#### Case form clean-up files

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

#### `mims/backend/scripts/backfill-existing-orgs.js`

One-time script to seed defaults for orgs created before Sprint 10.

```bash
node mims/backend/scripts/backfill-existing-orgs.js
```

Queries all active orgs, calls `seedNewOrg(org.id, 4)` for each, continues on error, prints summary. Run once. Already run for orgs 1 and 26 in the dev data.


---

## B6. Running it

### Run it locally

**Prerequisites:** Node 20, MySQL 8 at `/usr/local/mysql` on port 3306, ClamAV for CP Portal, Redis for MIMS (optional).

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
- `brew install clamav`, then `freshclam` once. The updater runs only while the CP Portal server runs; the Admin Panel warns when the virus list is over 7 days old.
- `npm run dev` and `npm start` run `scripts/start-scanner.sh`, which starts `clamd` and `freshclam` in daemon mode.
- `clamd.conf` needs `TCPSocket 3310`, `TCPAddr 127.0.0.1` and the same `DatabaseDirectory` as `freshclam.conf`. If `freshclam` fails with "NULL X509 store", add `CVDCertsDirectory /opt/homebrew/etc/clamav/certs` to both.
- Settings: `CLAMAV_HOST` (127.0.0.1), `CLAMAV_PORT` (3310), `CLAMAV_TIMEOUT_MS` (30000). Held files are rescanned every minute.

**MIMS single sign-on and Microsoft 365.** Google and Microsoft sign-in are set per organisation in Admin Console › Access Configurations › Auth Policy (local only, SSO only, or both). Users pick their organisation first. Microsoft 365 authoring stores the edit link on the CM document; approvals stay in MIMS. Needs `MIMS_FRONTEND_BASE_URL`, `MIMS_BACKEND_BASE_URL`, `MIMS_ALLOWED_FRONTEND_ORIGINS`, `SSO_CONFIG_ENCRYPTION_KEY`. Provider secrets are stored encrypted; the screen shows only Configured or Missing.

**MIMS tests.** `MYSQL_DATABASE=pharaxis_mims_test npm run test` and `npm run test:e2e` in `apps/mims`. Never against the dev database.

### Databases

| App | Database | Schema |
|---|---|---|
| CP Portal | `pharaxis_cp_portal_dev` | `backend/database/migrations/0000_baseline.sql` plus numbered migrations |
| MIMS | `pharaxis_mims_dev` | `backend/database/migrations`, run at start-up |

- MySQL 8, native install (no Docker), one database per app, same server.
- Settings: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.
- Connect: `/usr/local/mysql/bin/mysql -u devuser -p <database>`; DBeaver on `localhost:3306` with allowPublicKeyRetrieval on and SSL off. Passwords live only in each app's `.env`.
- Bootstrap accounts exist in code for local use only (`cpadmin`, `platform_admin`); change them anywhere shared.
- Never commit `.env` files or SQL dumps.
- Every new migration is folded into the baseline.

### Backups

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

## B7. Go-live runbook — CP Portal to MIMS bridge

> **Status, 10 October 2026: local only.** Both apps run on one developer machine, and no hosting has been chosen (RULES.md › Getting a change to main). This page is what has to be true the day the bridge runs anywhere else. Until then, follow it on a fresh local install to prove it still works.

The bridge sends reports from CP Portal into MIMS. **The portal always starts the exchange; MIMS never calls the portal.** So MIMS needs to be reachable from the portal, and nothing needs to reach the portal from MIMS.

#### Before you start

- Both apps on the same version of `main`.
- A backup of both databases, taken and restored once to prove it works (see the backup runbook).
- The portal's public address and MIMS's address decided, both on HTTPS.
- A person in MIMS with MIMS Admin rights, and a portal administrator.

#### Settings

Set these on each server, outside the repository. Never commit a filled-in settings file.

**MIMS**

| Setting | Value | Why |
| --- | --- | --- |
| `ENABLE_API_PLATFORM` | `bridge` | (Local dev runs `true`, the whole interface; never in production.) Turns on only what the portal uses: the sign-in token, the cases routes and the API connections screen. `true` would turn on the whole public interface, including parts parked over security findings. Leave it unset and the bridge is off. |
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

#### Secrets

1. In MIMS: **MIMS Admin → API connections → New connection.** Name it after the portal. Give it `cases:read` and `cases:write`, nothing else. Copy the client ID and secret; the secret is shown once.
2. In the portal: **Admin → client → Integration.** Auth type OAuth, API base URL = MIMS's backend address, client ID and secret from step 1, MIMS case URL base = MIMS's case address ending `/mims/cases/`. Save.
3. The secret never goes in email, chat, a ticket or the repository. It is stored encrypted on the portal.

**Changing the secret.** In MIMS, **New secret** on the connection. The old secret keeps working for 7 days, so enter the new one in the portal's Integration page within that week, then run Test Connection. After 7 days the old secret gets 401.

#### Migrations, in this order

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

#### First-start checks

Do these in order. Stop at the first one that fails.

1. **Test Connection** on the portal's Integration page. Expect: sign-in works, MIMS reports bridge version 2 or later, and one trial report per form is accepted and thrown away. Any question listed as "arrives only in the case comment" is a mapping to look at, not a failure.
2. **One real report, end to end.** As a visitor, send an enquiry on the portal with your own work email. Expect: the confirmation email arrives with a private link; the request shows "✓ Receipt" on the portal's requests list; the case appears in MIMS with "From <portal>: CP-…" and "Open in portal" opens that request.
3. **A question.** On that MIMS case, ask the reporter a question. Within 5 minutes, expect an email with the same private link; open it, answer, and see the answer arrive as a comment on the case.
4. **A side effect marked serious.** Expect the critical alert in MIMS with its due date, and "Serious · due to authorities" on the portal's list. Close the test cases afterwards.
5. **Sync Health** on the portal. Expect a comparison run listed within the hour, with nothing missing.
6. **One path that should fail.** Change one character of the private link and open it. Expect "This link is not valid or has expired."

Write down what you saw for each, with the date, in the release record.

#### Watching it

- **Sync Health** on the portal: the last comparisons, failures and the monthly CSV.
- **Alerts** on the portal go to the integration team when a report keeps failing, MIMS deletes a case, a question cannot be shown, or more than 20 reports are missing at once (nothing is re-sent then; a person decides).
- In MIMS, serious side effects raise a critical alert that must be acknowledged.

#### Rolling back

- **Stop the bridge, keep both apps.** In the portal, switch the integration off on the Integration page. Reports stay on the portal, marked as not sent; when it is switched back on, the retry job sends them. Nothing is lost.
- **Stop MIMS accepting.** Unset `ENABLE_API_PLATFORM` and restart MIMS. The portal retries with growing gaps, then alerts. Same recovery as above.
- **Undo a release.** Put back the previous version of the code. The migrations above only add columns and tables, so the older code runs on the newer database; do not drop them. Restoring a database backup instead loses every report since the backup: run a comparison (Sync Health) afterwards, which finds and re-sends what MIMS lost, unless more than 20 are missing, in which case it alerts and a person decides.
- **A leaked secret.** In MIMS, press **New secret** twice. Only one old secret is kept, so the second press ends the leaked one at once. Enter the second new secret on the portal straight away and run Test Connection.


---

## Appendix — In-app help articles (MIMS)

- **Where:** articles live in `help_articles`; the seed is `apps/mims/help-seed/help_articles_seed.json`, imported through `POST /api/admin/help/bulk-import`. The full index is in the seed file, not here.
- **Standard:** every article has four blocks — *What is this? · When to use it · How to do it · What happens next?* — a `feature_key` (`{module}.{sub-feature}`, e.g. `cases.mi`, `cm.templates`, `admin.workflow`), a `feature_group` and an audience (`all`, `agent`, `cm_admin`, `admin`, `platform_admin`).
- **Coverage:** the required topics are `REQUIRED_HELP_KEYS` in `services/orgBootstrapService.js`; MIMS Admin home shows how many an organisation has. Topics for removed screens (Policy Graph, Content Intelligence) are switched off (migration 190).
- **Review:** an article is stale after 90 days without review (`GET /api/admin/help/stale`); Kiranmai checks it against the live screen, then `PATCH /api/admin/help/:id/reviewed`.
- **Technical:** public reads cached 10 minutes (cleared on any admin write); FULLTEXT search on title, content and summary; contextual fetch falls back key → parent key → group → `general`; an article with `org_id` overrides the global one for that organisation.

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
