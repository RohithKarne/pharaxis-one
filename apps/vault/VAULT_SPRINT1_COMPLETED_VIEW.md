# VAULT Sprint 1 Completed View

Date: 2026-04-09  
Prepared for: Vault Team Handover (Pharaxis)

## 1) Sprint Completion Status

| Scope | Status |
|---|---|
| Sprint 1 Features (1-20) | Completed |
| Features 9-20 (Next Phase) | Completed |
| QA + Gate validation | Completed |

## 2) Feature Status (1-20)

| Feature | Description | Status |
|---|---|---|
| 1 | Auth + Tenant base | Done |
| 2 | User Management | Done |
| 3 | Taxonomy Management | Done |
| 4 | Folder Structure | Done |
| 5 | Upload + Numbering | Done |
| 6 | Versioning | Done |
| 7 | Checkout / Checkin | Done |
| 8 | Content List + Detail | Done |
| 9 | Content Lifecycle | Done |
| 10 | Metadata Panel | Done |
| 11 | Inline Viewer | Done |
| 12 | Search | Done |
| 13 | Audit Trail | Done |
| 14 | Admin Console | Done |
| 15 | SuperAdmin Module | Done |
| 16 | Watermarking | Done |
| 17 | Content Slots | Done |
| 18 | Dossiers | Done |
| 19 | Expiry Dashboard + Alerts | Done |
| 20 | QA (Smoke + E2E + Gate) | Done |

## 3) QA / Gate Evidence

| Check | Result |
|---|---|
| Backend smoke (`backend/tests/smoke-sprint1.js`) | Passed |
| Playwright E2E (`e2e/vault-auth.spec.js`) | Passed (4/4) |
| Gate command (`npm run test:sprint-close:gate1`) | Passed (Exit code 0) |

Execution note: Gate was validated on isolated local ports for reliability (`backend:5102`, `frontend:5173`) with `BASE_URL` and `PLAYWRIGHT_BASE_URL` overrides.

## 4) Technical Additions Delivered

### Backend
- Added and wired new APIs:
  - `/api/lifecycle`
  - `/api/search`
  - `/api/audit`
  - `/api/admin`
  - `/api/slots`
  - `/api/dossiers`
- Extended `/api/content` for:
  - metadata read/update
  - lifecycle transition
  - expiry dashboard
  - document view endpoints (current + version)
- Added services:
  - lifecycle rule engine
  - watermark service (PDF)
  - expiry alert cron service
  - audit logging service
  - storage and numbering support
- Registered expiry alert cron during server startup.

### Frontend
- Added full route coverage for Admin, Vault, and SuperAdmin modules.
- Implemented pages/components for:
  - lifecycle rules, retention, channels, audit, admin console
  - search, viewer, metadata, slots, dossiers, expiry dashboard
  - superadmin org listing, org detail users, dashboard
- Added auth and role guards for protected routing.
- Added visual lifecycle badges and expanded responsive styles.

### QA / Tooling
- Added backend smoke test suite.
- Added Playwright E2E suite + Playwright config.
- Added Gate script to package scripts.
- Added configurable frontend proxy target using `VITE_API_TARGET`.

## 5) File Inventory (Sprint 1)

### A) Created Files

#### Documentation
- `apps/vault/VAULT_SPRINT1_STATUS.md`
- `apps/vault/VAULT_SPRINT1_COMPLETED_VIEW.md`

#### Backend Routes
- `apps/vault/backend/routes/admin.js`
- `apps/vault/backend/routes/audit.js`
- `apps/vault/backend/routes/content.js`
- `apps/vault/backend/routes/dossiers.js`
- `apps/vault/backend/routes/folders.js`
- `apps/vault/backend/routes/lifecycle.js`
- `apps/vault/backend/routes/search.js`
- `apps/vault/backend/routes/slots.js`
- `apps/vault/backend/routes/taxonomy.js`
- `apps/vault/backend/routes/upload.js`
- `apps/vault/backend/routes/users.js`

#### Backend Services
- `apps/vault/backend/services/auditService.js`
- `apps/vault/backend/services/expiryAlertService.js`
- `apps/vault/backend/services/lifecycleService.js`
- `apps/vault/backend/services/numberingService.js`
- `apps/vault/backend/services/storageService.js`
- `apps/vault/backend/services/watermarkService.js`

#### Tests
- `apps/vault/backend/tests/smoke-sprint1.js`
- `apps/vault/e2e/vault-auth.spec.js`
- `apps/vault/playwright.config.js`

#### Frontend (Admin)
- `apps/vault/frontend/src/modules/admin/components/AdminTabs.jsx`
- `apps/vault/frontend/src/modules/admin/pages/AdminConsolePage.jsx`
- `apps/vault/frontend/src/modules/admin/pages/AuditPage.jsx`
- `apps/vault/frontend/src/modules/admin/pages/ContentChannelsPage.jsx`
- `apps/vault/frontend/src/modules/admin/pages/LifecycleRulesPage.jsx`
- `apps/vault/frontend/src/modules/admin/pages/RetentionPoliciesPage.jsx`
- `apps/vault/frontend/src/modules/admin/pages/TaxonomyPage.jsx`
- `apps/vault/frontend/src/modules/admin/pages/UsersPage.jsx`

#### Frontend (Common)
- `apps/vault/frontend/src/modules/common/components/RouteGuards.jsx`
- `apps/vault/frontend/src/modules/common/utils/session.js`

#### Frontend (SuperAdmin)
- `apps/vault/frontend/src/modules/superadmin/components/SuperadminTabs.jsx`
- `apps/vault/frontend/src/modules/superadmin/pages/SuperadminDashboardPage.jsx`
- `apps/vault/frontend/src/modules/superadmin/pages/SuperadminOrgDetailPage.jsx`
- `apps/vault/frontend/src/modules/superadmin/pages/SuperadminOrgsPage.jsx`

#### Frontend (Vault)
- `apps/vault/frontend/src/modules/vault/components/FolderTree.jsx`
- `apps/vault/frontend/src/modules/vault/components/MetadataPanel.jsx`
- `apps/vault/frontend/src/modules/vault/components/VersionHistoryPanel.jsx`
- `apps/vault/frontend/src/modules/vault/pages/ContentDetailPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/ContentSlotsPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/DocumentViewerPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/DossiersPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/ExpiryDashboardPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/SearchPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/UploadPage.jsx`
- `apps/vault/frontend/src/modules/vault/pages/VaultHomePage.jsx`
- `apps/vault/frontend/src/styles/global.css`

### B) Updated Existing Files
- `apps/vault/.env.example`
- `apps/vault/README.md`
- `apps/vault/backend/database/db.js`
- `apps/vault/backend/routes/superadminAuth.js`
- `apps/vault/backend/server.js`
- `apps/vault/frontend/package.json`
- `apps/vault/frontend/package-lock.json`
- `apps/vault/frontend/src/App.jsx`
- `apps/vault/frontend/src/main.jsx`
- `apps/vault/frontend/src/modules/auth/pages/LoginPage.jsx`
- `apps/vault/frontend/src/modules/superadmin/pages/SuperadminLoginPage.jsx`
- `apps/vault/frontend/vite.config.js`
- `apps/vault/package.json`
- `apps/vault/package-lock.json`

## 6) Operational Credentials (Current Seed)
- Org Admin: `admin@novartis.local` / `Admin@123` (orgSlug: `novartis`)
- Author: `author@novartis.local` / `Author@123` (orgSlug: `novartis`)
- SuperAdmin: `superadmin@pharaxis.local` / `Super@123`

## 7) Handover Note
Sprint 1 is fully closed from implementation and QA standpoint. This document can be shared as the single sprint completion reference for cross-team updates.
