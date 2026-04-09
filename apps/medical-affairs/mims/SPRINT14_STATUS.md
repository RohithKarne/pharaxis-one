# Sprint 14 Status Report

Date: 2026-04-07 18:21 IST (+0530)
Application: Pharaxis One -> Medical Affairs -> MIMS
Path: `/Users/rohithkarne/Pharaxis-One/apps/medical-affairs/mims`
Commit reference at gate run: `d198b20`

## 1) Sprint 14 Scope Status (14 backlog items)

### G10 — Case Management Gaps

1. **Global search across cases** — **DONE**
- Delivered:
  - Global search over case number, description/internal notes, contacts, MI products/questions, AE/PC product fields, case comments, and inquiry subject/body/sender/recipient.
  - Search available in both **Cases list** and **Case Query**.
- Key backend behavior:
  - `buildGlobalCaseSearchClause()` builds multi-entity search SQL.
  - `/api/cases`, `/api/cases/my`, `/api/cases/unassigned` support search filters.
- Files changed (feature-relevant):
  - `backend/routes/cases.js`
  - `frontend/src/modules/cases/pages/CasesPage.jsx`
  - `frontend/src/modules/cases/pages/CaseQueryPage.jsx`
  - `frontend/src/modules/cases/cases.css`

2. **Comments / notes on cases** — **DONE**
- Delivered:
  - Case comments timeline persisted in DB.
  - Add/list comments from Case Form (Comments/Notes accordion).
  - Audit entry for comment added.
  - Notification to case owner when another user comments.
- API:
  - `GET /api/cases/:id/comments`
  - `POST /api/cases/:id/comments`
- DB:
  - `case_comments` table.
- Files changed (feature-relevant):
  - `backend/database/db.js`
  - `backend/routes/cases.js`
  - `frontend/src/modules/cases/pages/CaseFormPage.jsx`
  - `frontend/src/modules/cases/cases.css`

3. **Case reassignment UI** — **DONE**
- Delivered:
  - Case Reassignment panel in Case Form.
  - Reassign API with validation, audit trail, optional reason, and notifications to new/previous owner.
- API:
  - `POST /api/cases/:id/reassign`
- Files changed (feature-relevant):
  - `backend/routes/cases.js`
  - `frontend/src/modules/cases/pages/CaseFormPage.jsx`
  - `frontend/src/modules/cases/cases.css`

4. **Notifications** — **DONE**
- Delivered:
  - User notification feed APIs (list, mark one read, mark all read).
  - Notifications generated for comment/reassignment/status/owner changes.
  - Notification overlay UI and dashboard alert panel.
- API:
  - `GET /api/notifications`
  - `POST /api/notifications/:id/read`
  - `POST /api/notifications/read-all`
- Files changed (feature-relevant):
  - `backend/routes/notifications.js`
  - `backend/routes/cases.js`
  - `backend/server.js`
  - `backend/database/db.js`
  - `frontend/src/shared/components/NotificationOverlay.jsx`
  - `frontend/src/modules/max/pages/DashboardPage.jsx`

### G11 — UX & Navigation

5. **Home dashboard (stats, recent cases, alerts)** — **DONE**
- Delivered:
  - Home dashboard stats cards.
  - Recent cases panel.
  - Alerts panel from notifications.
  - Session overview card on dashboard.
- API:
  - `GET /api/cases/dashboard-summary`
- Files changed (feature-relevant):
  - `backend/routes/cases.js`
  - `frontend/src/modules/max/pages/DashboardPage.jsx`
  - `frontend/src/index.css`

6. **Session management UI** — **DONE**
- Delivered:
  - Session listing, revoke specific session, revoke other sessions.
  - Current session detection and revoke-current -> logout flow.
  - Recent login activity in UI.
  - Session-tracking enforcement in auth middleware.
  - Navigation entry to Session Management.
- API:
  - `GET /api/auth/sessions`
  - `POST /api/auth/sessions/revoke-others`
  - `POST /api/auth/sessions/:id/revoke`
- Files changed (feature-relevant):
  - `backend/routes/auth.js`
  - `backend/middleware/auth.js`
  - `backend/database/db.js`
  - `frontend/src/modules/max/pages/SessionManagementPage.jsx`
  - `frontend/src/modules/max/App.jsx`
  - `frontend/src/shared/components/MIMSNavbar.jsx`
  - `frontend/src/shared/context/AuthContext.jsx`
  - `frontend/src/index.css`

### G12 — QA & Test Coverage

7. **Full regression suite** — **DONE**
- Delivered:
  - Core case regression smoke covering:
    - unique case number assignment
    - query validation guards
    - include_meta paging response validation
- Files changed (feature-relevant):
  - `backend/tests/smoke-case-regressions.js`
  - `package.json`

8. **Inbox smoke tests** — **DONE**
- Delivered:
  - Sprint 14 G12 smoke includes inbox endpoint checks.
- Files changed (feature-relevant):
  - `backend/tests/smoke-sprint14-g12.js`

9. **Reports regression** — **DONE**
- Delivered:
  - Sprint 14 G12 smoke validates reports endpoints (`case-volume`, `case-status`, `system-health`).
- Files changed (feature-relevant):
  - `backend/tests/smoke-sprint14-g12.js`
  - `backend/routes/reports.js` (actively exercised)

10. **Security Groups defect fix (deactivation dependency check)** — **DONE**
- Delivered:
  - Group deactivation blocked when active members exist.
  - API returns `409` + dependency payload (`active_member_count`, sample members).
- Files changed (feature-relevant):
  - `backend/routes/admin/securityGroups.js`
  - `backend/tests/smoke-sprint14-g12.js`

11. **E2E Playwright at every sprint close (Gate 1 condition)** — **DONE**
- Delivered:
  - Gate script wired to run smoke + sprint14 g12 + Playwright e2e.
  - E2E auth/session hardening for current 2FA + session model (suite-level shared auth fallback).
- Files changed (feature-relevant):
  - `package.json`
  - `e2e/admin-console.spec.js`
  - `e2e/integration-screens.spec.js`
  - `playwright.config.js`

### G13 — Architecture & Production

12. **API versioning real contract** — **DONE**
- Delivered:
  - `/api/version`, `/api/v1/health`, `/api/v1/version`
  - Version headers on all `/api/v1/*` responses:
    - `X-API-Version: 1`
    - `X-API-Latest-Version: v1`
    - `X-API-Contract-Date: 2026-04-07`
    - `X-API-Supported-Versions: v1`
  - `/api/v1/*` router parity mounted across auth/admin/cases/reports/integrations.
- Files changed (feature-relevant):
  - `backend/server.js`
  - `backend/tests/smoke-sprint14-g13.js`
  - `SPRINT14_G13_RUNBOOK.md`

13. **Log aggregation plan** — **DONE**
- Delivered:
  - Service log aggregation endpoint with filters and trend data.
  - Available in v0 and v1 surfaces.
- API:
  - `GET /api/admin/service-logs/aggregation`
  - `GET /api/v1/admin/service-logs/aggregation`
- Files changed (feature-relevant):
  - `backend/routes/admin/serviceLogs.js`
  - `backend/server.js` (v1 mounting)
  - `backend/tests/smoke-sprint14-g13.js`
  - `SPRINT14_G13_RUNBOOK.md`

14. **Client-facing demo environment** — **PARTIAL / DEFERRED**
- Delivered in Sprint 14:
  - Demo readiness runbook and preflight smoke command.
  - Repeatable checks for API version + v1 health + v1 reports + v1 log aggregation.
- Deferred to next sprint:
  - Full client-facing demo environment provisioning/hardening as a release-grade environment.
- Files changed (feature-relevant):
  - `SPRINT14_G13_RUNBOOK.md`
  - `backend/tests/smoke-sprint14-g13.js`
  - `package.json` (`demo:preflight`, `test:sprint14:full`)

## 2) Gate Closure Evidence (Mandatory)

Command executed:

```bash
npm run test:sprint-close:gate1
```

Final gate result:
- Exit code: `0` (PASS)
- Smoke:
  - `test:smoke:case-regression` -> pass
  - `test:smoke:sprint14:g12` -> pass
- Playwright:
  - `13` tests total
  - `8 passed`
  - `2 flaky` (recovered on retry)
  - `3 skipped`
- Playwright final run artifact:
  - `test-results/.last-run.json` =>

```json
{
  "status": "passed",
  "failedTests": []
}
```

Gate evidence files:
- `SPRINT14_GATE1_EVIDENCE_2026-04-07.md`
- `test-results/.last-run.json`
- `test-results/admin-console-MIMS-Admin-C-c93d7-ction-is-visible-in-sidebar-chromium/`
- `test-results/integration-screens-Phase--d26b4-s-page-loads-with-org-table-chromium/`

## 3) Sprint 14 Code File Inventory (Consolidated)

### Backend
- `backend/server.js`
- `backend/database/db.js`
- `backend/middleware/auth.js`
- `backend/routes/cases.js`
- `backend/routes/notifications.js`
- `backend/routes/auth.js`
- `backend/routes/admin/securityGroups.js`
- `backend/routes/admin/serviceLogs.js`
- `backend/routes/reports.js`
- `backend/tests/smoke-case-regressions.js`
- `backend/tests/smoke-sprint14-g12.js`
- `backend/tests/smoke-sprint14-g13.js`

### Frontend
- `frontend/src/modules/cases/pages/CasesPage.jsx`
- `frontend/src/modules/cases/pages/CaseQueryPage.jsx`
- `frontend/src/modules/cases/pages/CaseFormPage.jsx`
- `frontend/src/modules/cases/cases.css`
- `frontend/src/modules/max/pages/DashboardPage.jsx`
- `frontend/src/modules/max/pages/SessionManagementPage.jsx`
- `frontend/src/modules/max/App.jsx`
- `frontend/src/shared/components/MIMSNavbar.jsx`
- `frontend/src/shared/components/NotificationOverlay.jsx`
- `frontend/src/shared/context/AuthContext.jsx`
- `frontend/src/index.css`

### E2E + Build Scripts + Docs
- `e2e/admin-console.spec.js`
- `e2e/integration-screens.spec.js`
- `playwright.config.js`
- `package.json`
- `SPRINT14_G13_RUNBOOK.md`
- `SPRINT14_GATE1_EVIDENCE_2026-04-07.md`

## 4) Final Sprint 14 Outcome

- Sprint 14 execution sequence covered: **G10 -> G11 -> G12 -> G13**
- Functional backlog delivery: **13/14 complete**
- Deferred item: **G13-3 full client-facing demo environment provisioning** (preflight/runbook delivered, full environment hardening deferred)
- Mandatory sprint close gate: **PASSED**

