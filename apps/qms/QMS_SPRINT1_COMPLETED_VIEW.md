# Pharaxis QMS Sprint 1 Completed View

Date: 2026-04-09  
Owner: Pharaxis QMS Team  
Status: Sprint 1 implementation completed, QA+UAT completed, final business sign-off pending

## 1. Access URLs (Local Development)

| Purpose | URL |
|---|---|
| QMS App (UI) | `http://127.0.0.1:3146/` |
| Superadmin (UI) | `http://127.0.0.1:3146/superadmin` |
| Backend API base | `http://127.0.0.1:3145/api` |
| Superadmin API base | `http://127.0.0.1:3145/api/superadmin` |
| Health check | `http://127.0.0.1:3145/api/health` |

Note: URLs are reachable when frontend (`npm run dev`) and backend (`npm run dev`) are running.

## 2. What We Developed in Sprint 1

| Area | Completed Delivery |
|---|---|
| Platform foundation | Multi-tenant model (`org_id`), RBAC entities, immutable audit trail, e-signature model, event outbox, notifications, file object tracking |
| Security | PostgreSQL Row-Level Security policies, JWT auth flow, Keycloak-ready auth middleware path, protected API routes |
| Superadmin | Org control, user control, billing control (without payments), reporting endpoints |
| Document Control | Document creation, versioning, lifecycle transitions, workflow events, periodic review scaffolding, controlled preview policy |
| CAPA | CAPA create, actions, status tracking, effectiveness checks, closure controls, escalation records |
| Deviation | Deviation capture, containment actions, investigation, CAPA linking, closure path |
| Audit Management | Audit planning, finding capture, auditee responses, CAPA linkage, one-click binder job generation |
| Validation Services | System inventory, validation plans, protocols, scripts/steps, validation deviations, revalidation flags, VSR generation |
| Frontend | Vue workspace with routes for dashboard, module views, and superadmin page |

## 3. Technical Stack Implemented

| Layer | Implemented |
|---|---|
| Backend | Node.js + Express |
| Frontend | Vue + Vite + Tailwind |
| Database | PostgreSQL |
| Auth | JWT active + Keycloak integration foundation |
| PDF/Binder | PDFKit-based generation path implemented |
| Data security | RLS + role-aware API + tenant context propagation |

## 4. Database and Schema Completion

### Applied migrations

1. `0001_core_platform.sql`
2. `0002_rls_policies.sql`
3. `0003_audit_function.sql`
4. `0004_superadmin_controls.sql`
5. `0005_superadmin_rls_bypass.sql`
6. `0010_document_control.sql`
7. `0011_capa.sql`
8. `0012_deviation.sql`
9. `0013_audit_management.sql`
10. `0014_validation_services.sql`
11. `0015_platform_services.sql`

### Current table inventory snapshot

| Metric | Value |
|---|---|
| Total Sprint 1 tables | 50 |
| Module groups present | `qms_*`, `dc_*`, `ca_*`, `dv_*`, `au_*`, `vs_*` |

## 5. API Surface Delivered (Primary)

| Module | Key Routes |
|---|---|
| Auth | `/api/auth/providers`, `/api/auth/login` |
| Superadmin | `/api/superadmin/orgs`, `/api/superadmin/users`, `/api/superadmin/billing/:orgId`, `/api/superadmin/reports/billing-summary` |
| Document Control | `/api/document-control/documents`, `/api/document-control/documents/:documentId/revisions`, `/api/document-control/documents/:documentId/versions/:versionId/transition`, `/api/document-control/documents/:documentId/versions/:versionId/controlled-preview` |
| CAPA | `/api/capa`, `/api/capa/:capaId/actions`, `/api/capa/:capaId/actions/:actionId/status`, `/api/capa/:capaId/effectiveness`, `/api/capa/:capaId/close` |
| Deviation | `/api/deviations`, `/api/deviations/:deviationId/containment`, `/api/deviations/:deviationId/investigation`, `/api/deviations/:deviationId/link-capa`, `/api/deviations/:deviationId/close` |
| Audit | `/api/audits`, `/api/audits/:auditId/findings`, `/api/audits/:auditId/findings/:findingId/link-capa`, `/api/audits/:auditId/respond/:findingId`, `/api/audits/binder/generate`, `/api/audits/binder/jobs` |
| Validation | `/api/validation/systems`, `/api/validation/systems/:systemId/plans`, `/api/validation/plans/:planId/protocols`, `/api/validation/protocols/:protocolId/scripts`, `/api/validation/steps/:stepId/execute`, `/api/validation/reports/:systemId/generate-vsr` |
| Platform services | `/api/platform/notifications/in-app`, `/api/platform/notifications/email`, `/api/platform/events/outbox`, `/api/platform/events/outbox/:eventId/publish`, `/api/platform/alerts/run` |

## 6. Frontend Routes Delivered

| Route | Purpose |
|---|---|
| `/` | Dashboard |
| `/document-control` | Document Control module |
| `/capa` | CAPA module |
| `/deviations` | Deviation module |
| `/audits` | Audit module |
| `/validation` | Validation Services module |
| `/superadmin` | Superadmin controls |

## 7. QA and UAT Completion Evidence

| Evidence Item | Result |
|---|---|
| Deep QA suite (`sprint1_deep_qa.js`) | `37/37` checks passed |
| Internal UAT suite (`sprint1_uat_signoff.js`) | `GO` |
| Binder target validation | `88` records generated in `18 ms` (target: `>=50` in `<=60,000 ms`) |
| Sev-1 defects | `0` |
| Sev-2 defects | `0` |

Reference evidence files:
- `apps/qms/SPRINT1_DEEP_QA_REPORT_2026-04-09.md`
- `apps/qms/SPRINT1_INTERNAL_UAT_SIGNOFF_2026-04-09.md`
- `apps/qms/SPRINT1_STATUS_OVERVIEW_2026-04-09.md`

## 8. Scope Decision Status

| Decision | Status |
|---|---|
| Sprint 1 core modules | Completed |
| RLS at DB layer | Completed |
| Hash-chain evidence function baseline | Completed |
| Superadmin (org/user/billing controls) | Completed |
| Controlled preview watermark/non-download policy baseline | Completed in controlled preview policy |
| Payments inside app | Not included (explicitly out-of-scope) |
| Cross-app integrations (MIMS/Vault/Safety) | Deferred to Sprint 2 |

## 9. Final Sprint 1 Overall Status

| Gate | State |
|---|---|
| Gate 1 (start approval) | Approved |
| Gate 2 (build + QA readiness) | Ready |
| Final sign-off (business owner) | Pending Rohith approval |

