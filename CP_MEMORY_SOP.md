# CP Portal Memory SOP
> **Purpose:** Single source of truth for the CP Portal project. Intended for any developer, QA engineer, or team member who needs to onboard or resume work without requiring verbal explanation.
> **Scope:** CP Portal only. MIMS is documented separately in `MIMS_MEMORY_SOP.md`.
> **Current Status:** STABLE — hotfix support only. No active feature development unless explicitly directed by Rohith.
> **Update Protocol:** This file is only updated when Rohith explicitly confirms. Rohith says "Bala, update the CP Memory SOP — [what changed]" and Bala updates it. No one else modifies this file. Each update adds a version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-03-27 | Bala | Initial creation — full snapshot as of 2026-03-22 stable release |

---

## 1. What Is CP Portal

**CP Portal — Client Portal Platform**
A white-label medical information portal platform for pharmaceutical companies. Each client (pharma company) gets their own branded portal for healthcare professionals (HCPs) and patients.

CP Portal has two apps in one codebase:
- **Admin Panel** — internal tool used by pharma clients to configure and manage their portal (branding, content, features, compliance, users, analytics)
- **Portal** — the public-facing site that HCPs and patients visit (`/portal/:clientCode/`)

**Relationship to MIMS:**
CP Portal sends medical inquiry submissions to MIMS for processing. MIMS pushes outcomes and updates back to CP Portal. This integration is planned but not yet built. When ready, integration will use the CP Portal REST API (`/api/portal/` and `/api/admin/submissions`).

**Active status:**
CP Portal is in maintenance mode. MIMS is the active development priority. CP Portal receives hotfix support only when explicitly required by Rohith.

---

## 2. Full Tech Stack

### Backend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Runtime | Node.js | v18+ |
| Framework | Express | Latest stable |
| Authentication | JSON Web Token | JWT in localStorage |
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
| Database name | `cp_portal_dev` |
| User | `devuser` / `devpass` |
| Start | System Settings → MySQL → Start (or auto-starts on Mac boot via launchd) |
| CLI | `/usr/local/mysql/bin/mysql -u devuser -pdevpass cp_portal_dev` |
| GUI | DBeaver — host: `localhost`, port: `3306`, allowPublicKeyRetrieval: true, useSSL: false |
| Note | Migrated from SQLite → Docker MySQL (2026-03-24), then Docker removed — now same native MySQL instance as MIMS |

### Infrastructure
| Component | Detail |
|-----------|--------|
| Backend port | 4000 |
| Frontend port | 5174 (Vite dev server) |
| API proxy | Vite proxies `/api` and `/uploads` → `http://localhost:4000` |
| Git | Pushed to GitHub: `https://github.com/RohithKarne/MIMS-CP-Portal` |

---

### 3. How to Start the App

```bash
# 1. Start MySQL (if not already running)
# System Settings → MySQL → Start
# OR it auto-starts on Mac boot

# 2. Start backend
cd cp-portal/backend
node server.js

# 3. Start frontend (separate terminal)
cd cp-portal/frontend
npm run dev
```

Backend runs on port **4000**. Frontend dev server on port **5174**.

Both CP Portal and MIMS share the same native MySQL 8.0.45 instance — `cp_portal_dev` and `mims_dev` are separate databases on the same server.

---

## 4. System Architecture

```
cp-portal/
  backend/
    server.js              — Express app, all route registrations
    database/db.js         — MySQL pool + all 34 table definitions (idempotent CREATE TABLE IF NOT EXISTS)
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
        pages/                        — 28 admin pages
      portal/
        context/PortalContext.jsx     — portal config, user auth, language, t()
        components/PortalLayout.jsx   — header nav, language switcher, notifications
        pages/                        — 19 portal pages
        utils/translations.js         — UI string translations (en/fr/de/es/ja/zh)
```

### Authentication
- **Admin:** JWT stored in `localStorage` as `cp_admin_token`. `adminHeaders()` helper in `AdminAuthContext`.
- **Portal:** JWT stored in `localStorage` as `cp_portal_token`. `portalFetch()` in `PortalContext` auto-handles 401 → logout.
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

### Process Explorer
- 47 flows total: 28 admin flows + 19 portal flows
- 295+ live log captures. IST timezone corrected.
- Data in `cp_process_logs` table
- Read `project_process_explorer.md` memory before editing `ProcessExplorerPage.jsx`

---

## 5. Database Tables (34 total)

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
| `cp_custom_reports` | Saved report definitions |
| `cp_process_logs` | Process Explorer event logs |

---

## 6. Admin Panel Pages (28 pages)

All admin routes under `/admin/clients/:clientId/` except Dashboard, Clients list, and Process Explorer.

| Page | Route | What It Does |
|------|-------|-------------|
| DashboardPage | `/admin` | Stats, open submissions, recent activity across all clients |
| ClientsPage | `/admin/clients` | List all clients, create new client |
| ClientDetailPage | `/admin/clients/:id` | Cockpit — health score, KPIs, real audit activity |
| BrandingPage | `:id/branding` | Colors, fonts, logos, portal name, favicon |
| FeaturesPage | `:id/features` | Toggle feature flags on/off per client |
| ContentPage | `:id/content` | TAs, drugs, events, resources tabs |
| NewsPage | `:id/news` | Create/edit news posts (rich text, auto-translated) |
| SafetyPage | `:id/safety` | Create/edit safety alerts with severity |
| DocumentsPage | `:id/documents` | Upload PDFs, manage document library |
| MSLPage | `:id/msls` | Add/edit MSL profiles |
| FAQPage | `:id/faq` | Create/edit FAQ items with categories |
| CompliancePage | `:id/compliance` | GDPR jurisdiction config |
| FormsPage | `:id/forms` | Medical inquiry form field builder |
| GatePage | `:id/gate` | User type gate setup + feature access matrix |
| ChatboxConfigPage | `:id/chatbox` | AI chatbox welcome message, enable/disable |
| IntegrationPage | `:id/integration` | CRM field mappings |
| PortalUsersPage | `:id/users` | View/manage portal user accounts |
| SubmissionsPage | `:id/submissions` | View medical inquiry submissions |
| AuditTrailPage | `:id/audit` | Full audit log with filters |
| AnalyticsPage | `:id/analytics` | Page views, submissions, user metrics |
| FeedbackPage | `:id/feedback` | Portal user feedback responses |
| ReviewQueuePage | `:id/review-queue` | Content pending review (badge count in nav) |
| CustomReportsPage | `:id/reports` | Saved/scheduled report builder |
| AdminUsersPage | `:id/admin-users` | Per-client admin user management |
| EmailSettingsPage | `:id/email-settings` | SMTP + template config |
| LanguagePage | `:id/language` | Enable languages + Retranslate All Content button |
| ProcessExplorerPage | `/admin/process-explorer` | 47 flows, 295+ live captures, IST-corrected timestamps |

---

## 7. Portal Pages (19 pages)

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

---

## 8. Sprint History

| Sprint | Goal | Outcome | Key Delivered | Carryover |
|--------|------|---------|---------------|-----------|
| Sprint 1 | Foundation | Stable | Auth, dashboard, client management, basic portal, branding | Browser testing not yet enforced |
| Sprint 2 | Stability + Content | Stable | News, FAQs, Documents, Safety Alerts, MSL directory | None |
| Sprint 3 | Compliance + Integration | Stable | GDPR compliance, CRM field mapping, user type gate, consent records | None |
| Sprint 4 | Analytics + Process | Stable | Analytics module, Process Explorer (47 flows, 295+ captures), custom reports | None |
| Sprint 5 | Language + Translation | CLOSED (2026-03-21) | 6-language auto-translation (MyMemory), language switcher, Chinese support, review queue | npm audit fix (15 pre-existing vulns) |
| Sprint 6 | MySQL Migration + Stability | CLOSED (2026-03-24) | Full SQLite → MySQL migration, all 34 tables migrated. Initially Docker, later moved to native MySQL 8.0.45 (same instance as MIMS). Stable release pushed to GitHub. | `Unknown column 'client_code'` in cp_clients — low priority |

---

## 9. Current Status

**Status: STABLE — No active sprint**

CP Portal is in maintenance/hotfix mode. The last active sprint (Sprint 6) closed on 2026-03-24. No new features are being added unless Rohith explicitly directs.

**What is working:**
- Full admin panel (28 pages) — all features operational
- Full portal (19 pages) — all feature-gated pages operational
- 6-language auto-translation — content auto-translates on save
- Process Explorer — 47 flows, 295+ captures
- MySQL migration complete — Docker-based MySQL

**Last test result:** All core flows stable at Sprint 6 close (2026-03-24)

---

## 10. Known Issues and Technical Debt

| # | Item | Type | Priority |
|---|------|------|----------|
| 1 | `Unknown column 'client_code'` in `cp_clients` — appears in some edge queries | Low-severity bug | Low |
| 2 | 15 pre-existing npm vulnerabilities (14 high, 1 moderate) — need `npm audit fix` session | Security debt | Medium |
| 3 | Translation coverage — existing content before 2026-03-21 has empty `translations_json`. Admin must click "Retranslate All Content" once per client to backfill. | Data gap | Low |
| 4 | Bundle size — 1.1MB JS bundle (single chunk). Should split with `React.lazy()` per route when performance matters. | Performance debt | Low |
| 5 | Uploads not backed up — `cp-portal/backend/uploads/` is gitignored. Ensure this folder is persisted in any deployment (not ephemeral). | Deployment risk | Medium |
| 6 | MIMS → CP Portal integration not built | Future sprint | Deferred |

---

## 11. Future Integration with MIMS

When MIMS is ready, the integration plan:
- **CP Portal → MIMS:** CP Portal sends new medical inquiry submissions to MIMS via webhook or polling
- **MIMS → CP Portal:** MIMS pushes submission outcomes and status updates back to CP Portal via `POST /api/admin/submissions`
- **Auth:** Shared API key or service token between systems

CP Portal REST API is already structured to support this. No changes needed on the CP Portal side to receive updates from MIMS.

---

## 12. How to Update This File

- This file is only updated when Rohith explicitly confirms and asks Bala to update it
- Rohith says: *"Bala, update the CP Memory SOP — [summary of what changed]"*
- Bala updates the relevant sections and adds a row to the Version History table at the top
- No one else modifies this file
- If CP Portal re-enters active development, Section 9 (Current Status) is updated first along with a new sprint row in Section 8
