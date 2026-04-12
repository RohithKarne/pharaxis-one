# IEG Sprint 1 + Sprint 2 Detailed Handover Status

Date: 2026-04-11
Prepared for: Rohith and Delivery Review Team
Prepared by: Bala / Engineering Implementation
Application: IEG (Investigator Engagement & Grants)

## 1) Executive Status

| Sprint | Planned Scope | Completed | Pending | Overall |
|---|---:|---:|---:|---|
| Sprint 1 | 35 features | 35 | 0 | Complete |
| Sprint 2 | 13 features (#36-#48) | 13 | 0 | Complete |

Current non-feature follow-up:
- Live production credentials for Veeva / SharePoint / OpenAI / ERP are still to be provided by business/IT owners.
- Integration screens and shared backend storage are already implemented, so credentials can be entered as soon as available.

---

## 2) Final Technical Stack

### Backend
- Node.js + Express
- Authentication: JWT
- Password hashing: bcrypt
- File upload: multer
- Database driver: mysql2

### Frontend
- React 18
- Vite

### Database
- MySQL (database: `pharaxis_ieg_dev`)
- Schema files:
  - `backend/database/schema.mysql.sql` (Sprint 1 foundation + Grants + IIT)
  - `backend/database/schema.mysql.sprint2.sql` (Sprint 2 additive tables)

---

## 3) Major Technical Changes Implemented

## 3.1 Platform and Runtime
- Standardized IEG backend runtime on MySQL.
- Implemented SQL compatibility layer in `backend/database/db.js` for previously PG-styled queries (placeholder/cast/upsert handling).
- Server bootstraps both base schema and Sprint 2 additive schema via migration/init.
- Added default superadmin seed and base matrix/rules seed on first boot.

## 3.2 Sprint 1 Foundation (Shared Infrastructure)
- Auth and RBAC (internal/external distinction).
- Module assignment and module switch flow.
- Shared task queue.
- Workflow state machine + warning/acknowledgement enforcement.
- Immutable audit logging.
- Native DMS upload/version/sign/download-token flow.
- Notifications (in-app + email stub/provider abstraction).
- Compliance rules engine and approval matrix.
- Disbursement model and evidence taxonomy.

## 3.3 Sprint 1 Module Implementations
- Grants full lifecycle.
- IIT full lifecycle.
- External portal submissions for Grants + IIT.

## 3.4 Sprint 2 Module and Feature Implementations
- EAP module full lifecycle, including:
  - intake review
  - regulatory pathway selection
  - emergency fast-track SLA event
  - supply events
  - safety event + safety report
- External portal submission extended to include EAP.
- Cross-module conversion IIT -> Grant.
- AI summary + scoring endpoints with fallback logic and live-model support path.
- Compliance overlay engine.
- Portfolio analytics snapshot.
- Configurable policy engine and event evaluation.
- Integrations: DMS sync jobs, ClinicalTrials linkage, ERP export.

## 3.5 Integration Readiness (Production-Friendly)
- Added credential-driven adapter services:
  - `backend/services/integrations/dmsProviderService.js`
  - `backend/services/integrations/clinicalTrialsService.js`
  - `backend/services/integrations/erpDeliveryService.js`
  - `backend/services/aiLlmService.js`
  - `backend/services/integrations/httpClient.js`
- Added shared integration setup persistence:
  - API: `GET/PUT /api/integrations/setup`
  - Table: `ieg_integration_settings`
  - Secrets encrypted at rest via AES-256-GCM in `integrationSetupService.js`
- Added dedicated frontend Integration Setup screen with shared save/load, masked secret indicators, env preview, import JSON.

## 3.6 UI and UX Improvements
- Expanded to a full command-center style interface with rich operations panels.
- Added Integration Setup workspace tab.
- Added full-width desktop fit (removed constrained half-width container behavior).

---

## 4) API Coverage (Implemented Endpoints)

## 4.1 Foundation and Core
- `/api/auth` (internal login, external register/login, me)
- `/api/users`
- `/api/modules`
- `/api/tasks`
- `/api/workflows`
- `/api/audit`
- `/api/notifications`
- `/api/documents`
- `/api/approvals`
- `/api/compliance`
- `/api/disbursements`
- `/api/taxonomy`

## 4.2 Grants
- Program setup
- Applications listing
- Completeness check
- Compliance screen + warning ack
- Review
- Decision
- Contract + milestones
- Disbursement linkage
- Audit trail

## 4.3 IIT
- Proposals listing
- Triage
- FMV review + FMV reference
- Warning ack
- Committee vote + summary
- Approve (conditional/full)
- Milestones
- Publications
- Audit trail

## 4.4 EAP
- Request list
- Intake review
- Regulatory pathway
- Emergency activation
- Supply event
- Safety event
- Safety report
- Timeline
- Audit

## 4.5 External Portal
- Grant submit
- IIT submit
- EAP submit
- My submissions aggregation

## 4.6 Integrations
- Shared setup load/save
- DMS sync jobs create/list/complete
- ClinicalTrials link/read/snapshot
- ERP exports create/list

## 4.7 Platform Enhancements
- IIT -> Grant conversion
- AI summary
- AI recommendation score
- Compliance overlay rules/evaluate
- Analytics portfolio/snapshot
- Policy rules/evaluate

---

## 5) Database Objects (Implemented)

## 5.1 Sprint 1 Core Tables (selected)
- `ieg_users`, `ieg_external_users`, `ieg_user_modules`
- `ieg_workflows`, `ieg_workflow_events`
- `ieg_tasks`
- `ieg_audit_log`
- `ieg_documents`, `ieg_document_versions`
- `ieg_notifications`
- `ieg_approval_matrix`
- `ieg_compliance_rules`
- `ieg_warning_acknowledgements`
- `ieg_disbursements`
- `ieg_evidence_taxonomy`
- `ieg_grant_programs`, `ieg_grant_applications`, `ieg_grant_reviews`, `ieg_grant_decisions`, `ieg_grant_milestones`
- `ieg_iit_proposals`, `ieg_iit_reviews`, `ieg_iit_committee_votes`, `ieg_iit_contracts`, `ieg_iit_milestones`, `ieg_iit_publications`

## 5.2 Sprint 2 Additive Tables (selected)
- EAP: `ieg_eap_requests`, `ieg_eap_reviews`, `ieg_eap_supply_events`, `ieg_eap_sla_events`, `ieg_eap_safety_events`, `ieg_eap_safety_reports`
- Integrations: `ieg_dms_sync_jobs`, `ieg_dms_sync_log`, `ieg_iit_registry_links`, `ieg_iit_registry_snapshots`, `ieg_erp_export_jobs`, `ieg_erp_export_logs`
- Platform: `ieg_request_conversions`, `ieg_ai_requests`, `ieg_ai_summaries`, `ieg_ai_scores`, `ieg_compliance_overlay_rules`, `ieg_kpi_definitions`, `ieg_analytics_snapshots`, `ieg_policy_rules`, `ieg_policy_actions`, `ieg_policy_events`
- Shared integration setup: `ieg_integration_settings`

---

## 6) Security and Controls Implemented

- Internal vs external auth boundary is enforced at API middleware level.
- Role checks and module access checks implemented on protected routes.
- Warning acknowledgement gating blocks unsafe progress.
- Audit logging is append-only by design in app behavior.
- Integration secrets in shared setup are encrypted at rest.
- API rejects invalid/unauthorized tokens with proper error responses.

---

## 7) Frontend Scope Delivered

Primary file: `frontend/src/App.jsx`

Delivered UI areas:
- Unified login/register screen.
- Internal command center with:
  - stats
  - module switch
  - operations studio
  - task queue and module snapshots
  - notifications
- External portal with Grants/IIT/EAP submit flows and submission tracking.
- Integration Setup tab (internal) with shared backend persistence, secret indicators, env preview, JSON import.

Styling:
- `frontend/src/styles.css` updated for production-like dashboard styling and full-width layout.

---

## 8) Scripts and Runbook

From `package.json`:
- `npm run dev` (backend)
- `npm run dev:all` (backend + frontend)
- `npm run db:migrate`
- `npm run test:smoke:sprint1`
- `npm run test:gate:sprint1`
- `npm run test:smoke:sprint2`

Frontend:
- `cd frontend && npm run dev`
- `cd frontend && npm run build`

---

## 9) Verification Evidence (Completed)

Validated successfully:
- Sprint 1 smoke suite passed.
- Sprint 1 full gate suite passed.
- Sprint 2 smoke suite passed.
- Frontend production build passed.
- Health endpoint confirms Sprint 2 runtime.

---

## 10) File-Level Implementation Inventory (Major)

## 10.1 Backend routes
- `backend/routes/auth.js`
- `backend/routes/users.js`
- `backend/routes/modules.js`
- `backend/routes/tasks.js`
- `backend/routes/workflows.js`
- `backend/routes/documents.js`
- `backend/routes/notifications.js`
- `backend/routes/approvals.js`
- `backend/routes/compliance.js`
- `backend/routes/disbursements.js`
- `backend/routes/taxonomy.js`
- `backend/routes/grants.js`
- `backend/routes/iit.js`
- `backend/routes/eap.js`
- `backend/routes/externalPortal.js`
- `backend/routes/integrations.js`
- `backend/routes/platform.js`
- `backend/routes/audit.js`

## 10.2 Backend services
- Core: `auditService.js`, `workflowService.js`, `taskService.js`, `documentService.js`, `notificationService.js`, `complianceService.js`, `approvalService.js`
- Integration services:
  - `integrationSetupService.js`
  - `integrations/httpClient.js`
  - `integrations/dmsProviderService.js`
  - `integrations/clinicalTrialsService.js`
  - `integrations/erpDeliveryService.js`
  - `aiLlmService.js`

## 10.3 Database and server
- `backend/database/db.js`
- `backend/database/migrate.js`
- `backend/database/schema.mysql.sql`
- `backend/database/schema.mysql.sprint2.sql`
- `backend/server.js`

## 10.4 Frontend
- `frontend/src/App.jsx`
- `frontend/src/api.js`
- `frontend/src/styles.css`

## 10.5 Test suites
- `backend/tests/smoke-sprint1.js`
- `backend/tests/gate-sprint1-checkpoints.js`
- `backend/tests/smoke-sprint2.js`

## 10.6 Handover and governance docs
- `IEG_SPRINT1_IMPLEMENTATION_STATUS.md`
- `IEG_SPRINT2_IMPLEMENTATION_STATUS.md`
- `INTEGRATION_CREDENTIAL_HANDOFF_TEMPLATE.md`
- `UAT_CLIENT_SIGNOFF_TEMPLATE.md`
- `README.md`

---

## 11) Team Review Checklist

1. Verify scope closure against Sprint 1 and Sprint 2 scope files.
2. Run migration and all three backend test suites in local/UAT.
3. Verify integration setup shared save/load from UI as superadmin.
4. Verify role/module access negative paths (403) for restricted users.
5. Validate audit trail entries for key lifecycle operations.
6. Execute UI sanity pass on full-width layout and integration tab.
7. Confirm credential handoff sheet completion before enabling live providers.

---

## 12) Release Readiness Statement

- Sprint 1 and Sprint 2 feature scope are implemented and technically validated.
- Application is review-ready for internal team handover.
- Production connector activation is operationally ready and awaits only final credentials and endpoint approvals.

