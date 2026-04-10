# Pharaxis Safety — Sprint 1 & Sprint 2 File Change Register
Date: 2026-04-10
Owner: Bala / Delivery Team

This file is the consolidated submission register for team review.
Coverage includes all implementation files under `apps/safety` (excluding `node_modules` and frontend `dist`).

## Legend

| Label | Meaning |
|---|---|
| Created | File introduced in that sprint |
| Updated | Existing file modified in that sprint |
| No Change | No sprint-specific modification recorded |

## File-Level Register

| File | Sprint 1 | Sprint 2 | Details |
|---|---|---|---|
| `apps/safety/.env.example` | Created | No Change | Env template for backend/frontend runtime. |
| `apps/safety/.gitkeep` | Created | No Change | Placeholder to preserve app directory. |
| `apps/safety/package.json` | Created | Updated | Safety app scripts; Sprint 2 smoke/UAT scripts added. |
| `apps/safety/package-lock.json` | Created | Updated | Dependency lock updated with Sprint 2 script/runtime additions. |
| `apps/safety/README.md` | Created | Updated | Sprint 1 setup docs plus Sprint 2 scope, smoke, and focused UAT commands. |
| `apps/safety/SAFETY_MEMORY_SOP.md` | Created | No Change | Safety project operating memory/SOP notes. |
| `apps/safety/Safety Sprint 1 Scope.md` | Created | No Change | Approved Sprint 1 scope baseline and Sprint 2 preview. |
| `apps/safety/SPRINT1_GATE2_COMPLETION_REPORT_2026-04-10.md` | Created | No Change | Sprint 1 Gate-2 completion evidence. |
| `apps/safety/SPRINT2_ONE_SHOT_STATUS_2026-04-10.md` | No Change | Created | Sprint 2 one-shot completion status and evidence. |
| `apps/safety/SPRINT2_FOCUSED_UAT_REPORT_2026-04-10.md` | No Change | Created | Sprint 2 focused UAT checklist execution report. |
| `apps/safety/SPRINT1_SPRINT2_FILE_CHANGE_REGISTER_2026-04-10.md` | No Change | Created | Consolidated file creation/update register for submission. |
| `apps/safety/backend/constants.js` | Created | Updated | Module/role constants; Sprint 2 added Case Management module visibility. |
| `apps/safety/backend/server.js` | Created | Updated | Express bootstrap and route wiring; includes case routes for Sprint 2. |
| `apps/safety/backend/database/db.js` | Created | Updated | Schema + seed; Sprint 2 added case tables/columns and compatibility-safe migrations. |
| `apps/safety/backend/middleware/auth.js` | Created | No Change | JWT/session auth middleware. |
| `apps/safety/backend/middleware/rbac.js` | Created | No Change | API RBAC and org/client access checks. |
| `apps/safety/backend/services/passwordService.js` | Created | No Change | Password policy/history helpers. |
| `apps/safety/backend/services/sessionService.js` | Created | No Change | Session revocation/concurrency/session-log helpers. |
| `apps/safety/backend/services/emailService.js` | Created | No Change | SMTP/test-email helper service. |
| `apps/safety/backend/services/auditService.js` | Created | No Change | Admin audit log writer helpers. |
| `apps/safety/backend/services/configService.js` | Created | No Change | System/org configuration retrieval helpers. |
| `apps/safety/backend/services/tenantScopeService.js` | Created | No Change | Multi-tenant org/client scope validation service. |
| `apps/safety/backend/routes/auth.js` | Created | No Change | Login/logout/reset/invite activation flows. |
| `apps/safety/backend/routes/orgs.js` | Created | No Change | Organisation CRUD/settings endpoints. |
| `apps/safety/backend/routes/clients.js` | Created | No Change | CRO client hierarchy endpoints. |
| `apps/safety/backend/routes/users.js` | Created | No Change | Invite/role/status management endpoints. |
| `apps/safety/backend/routes/products.js` | Created | No Change | Product/indication/study configuration endpoints. |
| `apps/safety/backend/routes/caseConfig.js` | Created | No Change | Case ID format + sequence generation endpoints. |
| `apps/safety/backend/routes/systemConfig.js` | Created | No Change | System config CRUD + test email endpoints. |
| `apps/safety/backend/routes/sessions.js` | Created | No Change | Active session view/revoke endpoints. |
| `apps/safety/backend/routes/audit.js` | Created | No Change | Sprint 1 admin audit listing endpoints. |
| `apps/safety/backend/routes/cases.js` | No Change | Created/Updated | Sprint 2 core case APIs: intake, drafts, triage, workflow, exception, regulatory, narrative, listedness, dashboard, audit/export. |
| `apps/safety/backend/tests/smoke-sprint1.js` | Created | Updated | Sprint 1 smoke; Sprint 2 updated with auto server harness compatibility. |
| `apps/safety/backend/tests/uat-sprint1-gate2.js` | Created | No Change | Sprint 1 Gate-2 UAT automation. |
| `apps/safety/backend/tests/smoke-sprint2-kickoff.js` | No Change | Created/Updated | Sprint 2 full smoke automation covering case lifecycle and deep endpoints. |
| `apps/safety/backend/tests/uat-sprint2-focused.js` | No Change | Created | Sprint 2 browser-facing focused UAT checklist automation. |
| `apps/safety/backend/tests/helpers/serverHarness.js` | No Change | Created | Shared test harness to auto-start/stop backend for smoke/UAT runs. |
| `apps/safety/frontend/index.html` | Created | No Change | Vite app shell HTML. |
| `apps/safety/frontend/vite.config.js` | Created | No Change | Frontend build/dev config. |
| `apps/safety/frontend/package.json` | Created | No Change | Frontend scripts/dependencies. |
| `apps/safety/frontend/package-lock.json` | Created | No Change | Frontend dependency lock. |
| `apps/safety/frontend/src/main.jsx` | Created | No Change | Frontend app entry bootstrap. |
| `apps/safety/frontend/src/App.jsx` | Created | Updated | Sprint 1 module UI + Sprint 2 Case Management full UI flows and actions. |
| `apps/safety/frontend/src/styles.css` | Created | Updated | Sprint 1 base theme + Sprint 2 case management styling expansion. |

## Sprint-Wise Summary

| Sprint | Created Files | Updated Files | Notes |
|---|---:|---:|---|
| Sprint 1 | 36 | 0 | Foundation build: auth, admin, config, RBAC, tenant guardrails, base UI, Sprint 1 smoke/UAT. |
| Sprint 2 | 7 | 8 | Core case management APIs/UI, regulatory and narrative modules, Sprint 2 smoke/UAT, status reports. |

## Review Attachments

| Artifact | Purpose |
|---|---|
| `apps/safety/SPRINT1_GATE2_COMPLETION_REPORT_2026-04-10.md` | Sprint 1 closure evidence |
| `apps/safety/SPRINT2_ONE_SHOT_STATUS_2026-04-10.md` | Sprint 2 completion status |
| `apps/safety/SPRINT2_FOCUSED_UAT_REPORT_2026-04-10.md` | Sprint 2 focused UAT pass evidence |

