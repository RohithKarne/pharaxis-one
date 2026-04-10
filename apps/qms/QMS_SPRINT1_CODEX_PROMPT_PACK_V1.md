# Pharaxis QMS Sprint 1 — Codex Prompt Pack v1
> Date: 2026-04-09
> Owner: Bhavya
> Status: Gate 1 preparation artifact (prompts ready, not executed)

---

## 1. Usage Rule

- These prompts are prepared for Vivek to run using `codex exec` after explicit Gate 1 approval from Rohith.
- No prompt in this file has been executed yet.
- Paths are exact and relative to repo root.

Base working directory:
- `/Users/rohithkarne/Pharaxis-One`

Target app root:
- `apps/qms`

---

## 2. Prompt P01 — Bootstrap QMS App Skeleton

**Objective:** Create baseline backend/frontend structure for QMS.

**Files to create/edit:**
- `apps/qms/backend/package.json`
- `apps/qms/backend/server.js`
- `apps/qms/backend/src/app.js`
- `apps/qms/backend/src/config/env.js`
- `apps/qms/frontend/package.json`
- `apps/qms/frontend/index.html`
- `apps/qms/frontend/src/main.js`
- `apps/qms/frontend/src/App.vue`
- `apps/qms/frontend/tailwind.config.js`
- `apps/qms/frontend/postcss.config.js`
- `apps/qms/frontend/src/styles/tailwind.css`

**Functions/components expected:**
- `createAppServer()`
- `GET /api/health`
- Vue root component `App.vue`

**Codex prompt text:**
```text
Create initial QMS app scaffold under apps/qms with Node.js + Express backend and Vue frontend.
Implement backend health route GET /api/health returning { ok: true, app: "qms" }.
Use ESM syntax. Add npm scripts for dev/start.
Configure Tailwind in frontend and mount a minimal App.vue with a branded placeholder.
Do not add business module logic yet.
```

---

## 3. Prompt P02 — PostgreSQL Connectivity and Request-Scoped RLS Context

**Objective:** Add DB pool and middleware to set `app.current_org_id`.

**Files to create/edit:**
- `apps/qms/backend/src/db/pool.js`
- `apps/qms/backend/src/middleware/authContext.js`
- `apps/qms/backend/src/middleware/rlsContext.js`
- `apps/qms/backend/src/app.js`

**Functions expected:**
- `getDbPool()`
- `resolveAuthContext(req, res, next)`
- `withRlsContext(req, res, next)`

**Codex prompt text:**
```text
Implement PostgreSQL connection pooling and request middleware for tenant RLS context.
Create pool in src/db/pool.js using DATABASE_URL.
Add authContext middleware that resolves org_id from authenticated principal and stores req.auth.orgId.
Add rlsContext middleware that sets SET LOCAL app.current_org_id = <org uuid> for each DB transaction scope.
Wire middleware in app.js for all protected routes.
Fail requests safely when org_id is missing.
```

---

## 4. Prompt P03 — Core Schema Migration (Org, User, Role, Auth, Audit)

**Objective:** Create migration SQL for platform core entities.

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0001_core_platform.sql`
- `apps/qms/backend/src/db/migrate.js`

**Tables expected in migration:**
- `qms_orgs`, `qms_users`, `qms_roles`, `qms_user_roles`
- `qms_permissions`, `qms_role_permissions`, `qms_auth_accounts`
- `qms_e_signatures`, `qms_audit_events`

**Codex prompt text:**
```text
Create first SQL migration for core QMS platform entities.
Include UUID PKs, org_id tenancy columns, UTC timestamps, and foreign keys.
Create qms_audit_events with prev_hash and curr_hash for hash-chain audit.
Add migration runner script in src/db/migrate.js to execute *.sql files in order.
Do not include module-specific tables in this migration.
```

---

## 5. Prompt P04 — Enforce PostgreSQL RLS Policies

**Objective:** Enable RLS and policies on tenant tables.

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0002_rls_policies.sql`

**Policy pattern required:**
- `USING (org_id = current_setting('app.current_org_id', true)::uuid)`
- `WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid)`

**Codex prompt text:**
```text
Create migration 0002_rls_policies.sql.
Enable RLS on all tenant-scoped tables from migration 0001.
Create USING and WITH CHECK policies based on app.current_org_id.
Ensure superadmin-only global tables are excluded from tenant RLS.
```

---

## 6. Prompt P05 — Dual Auth (JWT + Keycloak)

**Objective:** Support both JWT and Keycloak in Sprint 1.

**Files to create/edit:**
- `apps/qms/backend/src/middleware/jwtAuth.js`
- `apps/qms/backend/src/middleware/keycloakAuth.js`
- `apps/qms/backend/src/middleware/authSelector.js`
- `apps/qms/backend/src/routes/auth.js`
- `apps/qms/backend/src/app.js`

**Functions expected:**
- `verifyJwtToken()`
- `verifyKeycloakToken()`
- `resolveAuthProvider()`
- `router.post("/login")`

**Codex prompt text:**
```text
Implement Sprint 1 dual-auth strategy: JWT custom login and Keycloak bearer-token validation.
Create middleware authSelector that supports both providers and normalizes principal payload.
Add /api/auth/login for JWT path and protect selected routes with authSelector.
On successful auth, principal must include userId, orgId, roles, authProvider.
```

---

## 7. Prompt P06 — Hash-Chain Audit Append Service

**Objective:** Central append-only audit service with per-org chain continuity.

**Files to create/edit:**
- `apps/qms/backend/src/services/auditTrailService.js`
- `apps/qms/backend/src/db/migrations/0003_audit_function.sql`
- `apps/qms/backend/src/utils/hash.js`

**Functions expected:**
- `appendAuditEvent(dbClient, event)`
- `verifyAuditChain(dbClient, orgId)`

**Codex prompt text:**
```text
Implement auditTrailService with append-only hash-chain behavior.
Add SQL function migration to insert audit event while locking per org stream and computing curr_hash from prev_hash + payload.
Expose service methods appendAuditEvent and verifyAuditChain.
Do not allow update or delete operations on qms_audit_events.
```

---

## 8. Prompt P07 — E-Signature Service and API

**Objective:** Reusable CFR Part 11 signature capture service.

**Files to create/edit:**
- `apps/qms/backend/src/services/eSignatureService.js`
- `apps/qms/backend/src/routes/eSignatures.js`
- `apps/qms/backend/src/validators/eSignatureValidator.js`
- `apps/qms/backend/src/app.js`

**Functions expected:**
- `captureESignature()`
- `validateSignatureIntent()`
- `router.post("/api/esignatures/capture")`

**Codex prompt text:**
```text
Create e-signature service for review/approve/acknowledge actions.
Capture user identity, UTC timestamp, meaning, entity_table, entity_id, and signed payload checksum.
Validate required fields and return signature id.
Write audit event after successful signature capture.
```

---

## 9. Prompt P08 — Superadmin APIs (Org, User, Billing Control, Reports)

**Objective:** Build Sprint 1 superadmin control layer (no payment collection).

**Files to create/edit:**
- `apps/qms/backend/src/routes/superadmin/orgs.js`
- `apps/qms/backend/src/routes/superadmin/users.js`
- `apps/qms/backend/src/routes/superadmin/billing.js`
- `apps/qms/backend/src/routes/superadmin/reports.js`
- `apps/qms/backend/src/middleware/superadminAuth.js`
- `apps/qms/backend/src/app.js`

**Functions expected:**
- `createOrg()`, `updateOrgStatus()`
- `createUser()`, `updateUserRole()`, `disableUser()`
- `updateBillingControl()`, `getBillingSnapshot()`

**Codex prompt text:**
```text
Implement superadmin APIs for org control, user control, billing control, and reporting only.
Do not implement payment collection endpoints.
Protect all routes with superadminAuth middleware.
Ensure actions are audit logged and tenant-safe.
```

---

## 10. Prompt P09 — Document Control Backend (P1 Core)

**Objective:** Implement DC-01 to DC-15 backend APIs and models.

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0010_document_control.sql`
- `apps/qms/backend/src/routes/documentControl.js`
- `apps/qms/backend/src/services/documentWorkflowService.js`
- `apps/qms/backend/src/services/documentAccessService.js`
- `apps/qms/backend/src/services/documentSearchService.js`

**Functions expected:**
- `createDocument()`
- `transitionDocumentState()`
- `createDocumentVersion()`
- `acknowledgeDocumentRead()`
- `searchDocuments()`

**Codex prompt text:**
```text
Implement Document Control module P1 backend:
metadata create, lifecycle state machine, review/approval with e-sign dependency, version history, supersession,
periodic review alerts, role-based access, audit trail hooks, and audit-binder eligibility marking.
Enforce controlled preview rules via metadata flags to support watermark + no download/print in frontend.
```

---

## 11. Prompt P10 — CAPA Backend (P1 Core)

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0011_capa.sql`
- `apps/qms/backend/src/routes/capa.js`
- `apps/qms/backend/src/services/capaService.js`
- `apps/qms/backend/src/services/rootCauseService.js`

**Functions expected:**
- `initiateCapa()`
- `saveFiveWhyAnalysis()`
- `saveFishboneAnalysis()`
- `approveCapaPlan()`
- `verifyEffectiveness()`
- `closeCapa()`

**Codex prompt text:**
```text
Implement CAPA P1 backend with source linkage, classification, 5-Why, fishbone, action plans,
escalation for overdue actions, effectiveness verification, closure signatures, and binder eligibility.
All writes must emit audit events.
```

---

## 12. Prompt P11 — Deviation Backend (P1 Core)

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0012_deviation.sql`
- `apps/qms/backend/src/routes/deviations.js`
- `apps/qms/backend/src/services/deviationService.js`

**Functions expected:**
- `createDeviation()`
- `assignInvestigation()`
- `recordRootCause()`
- `linkDeviationToCapa()`
- `closeDeviation()`

**Codex prompt text:**
```text
Implement Deviation P1 backend with mandatory classification,
containment actions, investigation flow, root cause capture, CAPA linkage,
regulatory reportability assessment, e-sign closure, and audit/binder hooks.
```

---

## 13. Prompt P12 — Audit Management and One-Click Binder

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0013_audit_management.sql`
- `apps/qms/backend/src/routes/audits.js`
- `apps/qms/backend/src/services/auditManagementService.js`
- `apps/qms/backend/src/services/binderService.js`
- `apps/qms/backend/src/workers/binderWorker.js`

**Functions expected:**
- `createAudit()`
- `captureFinding()`
- `linkFindingToCapa()`
- `generateAuditReportPdf()`
- `startBinderJob()`
- `compileInspectionBinder()`

**Codex prompt text:**
```text
Implement Audit Management P1 backend and one-click inspection binder.
Binder must compile DC+CA+DV+AU+VS records into a single paginated PDF with table of contents.
Target performance for Sprint 1: 50 records <= 60 seconds.
Persist binder job metrics and status for monitoring.
```

---

## 14. Prompt P13 — Validation Services Backend (P1 Core)

**Files to create/edit:**
- `apps/qms/backend/src/db/migrations/0014_validation_services.sql`
- `apps/qms/backend/src/routes/validation.js`
- `apps/qms/backend/src/services/validationService.js`
- `apps/qms/backend/src/services/protocolExecutionService.js`

**Functions expected:**
- `registerSystemInventory()`
- `createValidationPlan()`
- `executeProtocolStep()`
- `captureValidationDeviation()`
- `generateValidationSummaryReport()`
- `setRevalidationFlag()`

**Codex prompt text:**
```text
Implement Validation Services P1 backend:
system inventory, GAMP category, CSA risk-level model, plan/protocol workflow,
step execution with evidence, inline deviation capture, VSR generation, approvals,
re-validation flag, periodic review alerts, and binder eligibility.
```

---

## 15. Prompt P14 — Frontend Foundation and Visual System

**Objective:** Build stylish base UI system per Rohith direction.

**Files to create/edit:**
- `apps/qms/frontend/src/styles/theme.css`
- `apps/qms/frontend/src/layouts/AppShell.vue`
- `apps/qms/frontend/src/router/index.js`
- `apps/qms/frontend/src/views/LoginView.vue`
- `apps/qms/frontend/src/views/SuperadminDashboardView.vue`
- `apps/qms/frontend/src/components/ui/*`

**Components expected:**
- `AppShell`
- `BrandHero`
- `MetricCard`
- `ModuleGrid`
- `RoleGuard`

**Codex prompt text:**
```text
Create QMS frontend visual system with non-generic professional design:
clear brand theme tokens, strong typography, layered background treatment, and responsive layouts.
Implement login screen, superadmin dashboard shell, and module navigation shell.
Use Vue + Tailwind + shadcn-compatible Vue primitives.
Avoid plain boilerplate UI and ensure mobile + desktop readiness.
```

---

## 16. Prompt P15 — Document Controlled Preview UX Rules

**Files to create/edit:**
- `apps/qms/frontend/src/views/documents/DocumentPreviewView.vue`
- `apps/qms/frontend/src/components/documents/ControlledWatermarkOverlay.vue`
- `apps/qms/frontend/src/components/documents/PreviewActions.vue`

**Functions/components expected:**
- `canDownloadControlledCopy()`
- `canPrintControlledCopy()`
- `ControlledWatermarkOverlay`

**Codex prompt text:**
```text
Implement controlled-document preview behavior:
allow in-app preview with visible "CONTROLLED COPY" watermark,
block download action,
block print action.
Show clear compliance messaging and write audit events for blocked actions.
```

---

## 17. Prompt P16 — Test Baseline (Unit + API + Smoke)

**Files to create/edit:**
- `apps/qms/backend/tests/auth.test.js`
- `apps/qms/backend/tests/rls-isolation.test.js`
- `apps/qms/backend/tests/audit-hashchain.test.js`
- `apps/qms/backend/tests/document-control.test.js`
- `apps/qms/frontend/tests/login.spec.js`
- `apps/qms/frontend/tests/document-preview.spec.js`

**Codex prompt text:**
```text
Create baseline automated tests for Sprint 1 foundations:
JWT and Keycloak auth paths, tenant RLS isolation, hash-chain integrity,
document controlled-preview rules, and smoke health checks.
Output pass/fail summaries suitable for Gate 2 readiness tracking.
```

---

## 18. Prompt P17 — Seed Data for Internal UAT

**Files to create/edit:**
- `apps/qms/backend/src/db/seeds/seed_internal_uat.sql`
- `apps/qms/backend/scripts/run-seed.js`

**Codex prompt text:**
```text
Create internal UAT seed data script for Sprint 1 modules.
Include at least two orgs, role matrix, controlled documents, CAPA, deviations, audits, and validation records.
Ensure seeded data supports negative-path QA cases and 50-record binder performance scenario.
```

---

## 19. Prompt Execution Checklist (Post Gate 1)

1. Execute prompts in sequence P01 -> P17 unless Varun reprioritizes.
2. After each prompt execution:
   - verify changed files
   - run scoped tests
   - post live implementation summary in chat
3. Do not merge prompt outputs without Bhavya review and Varun sign-off.

