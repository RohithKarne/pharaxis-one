# QMS RBAC Release Readiness - 2026-04-28

## Scope Closed In This Batch

| Pending Item | Status | Evidence |
|---|---|---|
| Backend RBAC middleware migration for remaining core routes | Completed | All remaining routes now import `assertAnyRole` from shared middleware and no local `assertRole` helpers remain. |
| End-to-end role matrix test coverage | Completed | Added frontend and backend role matrix automation scripts and executed both successfully. |
| Superadmin UX/permission hardening | Completed | Added form/action precondition guards and disabled-state controls in Superadmin console for permission-sensitive actions. |
| Release readiness docs + UAT/regression checklist | Completed | This document and command evidence included below. |

## Role Permission Matrix (Module Level)

| Module | Read Roles | Write Roles |
|---|---|---|
| Dashboard | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, approver, admin, superadmin |
| Event Hub | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, approver, admin, superadmin |
| Document Control | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, approver, admin, superadmin |
| CAPA | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, approver, admin, superadmin |
| Deviations | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, approver, admin, superadmin |
| Complaints | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, admin, superadmin |
| Nonconformance | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, admin, superadmin |
| Audits | viewer, author, qa_reviewer, approver, admin, superadmin | author, qa_reviewer, approver, admin, superadmin |
| Validation | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, approver, admin, superadmin |
| Change Control | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, approver, admin, superadmin |
| Supplier Quality | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, admin, superadmin |
| Risk Management | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, admin, superadmin |
| Training Management | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, admin, superadmin |
| Management Review | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, admin, superadmin |
| Quality Insights | qa_reviewer, admin, superadmin | qa_reviewer, admin, superadmin |
| Integrations | viewer, author, qa_reviewer, approver, admin, superadmin | qa_reviewer, admin, superadmin |

## Backend Route Migration Completed

| Route File | Migration Result |
|---|---|
| `backend/src/routes/documentControl.js` | Migrated to shared `assertAnyRole` |
| `backend/src/routes/capa.js` | Migrated to shared `assertAnyRole` |
| `backend/src/routes/deviations.js` | Migrated to shared `assertAnyRole` |
| `backend/src/routes/audits.js` | Migrated to shared `assertAnyRole` |
| `backend/src/routes/validation.js` | Migrated to shared `assertAnyRole` |
| `backend/src/routes/changeControl.js` | Migrated to shared `assertAnyRole` |
| `backend/src/routes/platform.js` | Migrated to shared `assertAnyRole` |

## Superadmin Hardening Implemented

| Control | Implementation |
|---|---|
| Create org pre-validation | Prevents submit when org code/name are missing |
| Create user pre-validation | Requires org, name, email, password >= 8 chars, and at least one security group |
| Save user groups guard | Prevents empty security-group assignment |
| Save policy guards | Requires selected org before saving security/upload policies |
| Upload policy guard | Enforces extension list and upload limit range (1-500 MB) |
| Action safety UX | Disabled states added for loading and missing prerequisites across key actions |
| Error consistency | Centralized action error messaging helper used across console actions |

## Automated Verification Results

| Command | Result |
|---|---|
| `cd apps/qms/backend && npm run smoke:rbac` | Passed |
| `cd apps/qms/backend && npm run test:role-matrix` | Passed |
| `cd apps/qms/frontend && npm run smoke:rbac` | Passed |
| `cd apps/qms/frontend && npm run test:role-matrix` | Passed |
| `cd apps/qms/frontend && npm run build` | Passed |

## UAT Checklist (Ready To Execute)

| Area | Owner | Status |
|---|---|---|
| Viewer cannot perform write actions in all modules | QA | Ready |
| Author can write only allowed modules and is blocked where expected | QA | Ready |
| QA Reviewer workflow approvals and sensitive actions | QA Lead | Ready |
| Admin and Superadmin privileged actions | QA Lead + Platform Admin | Ready |
| Superadmin org/user/security/email/upload operations | Platform Admin | Ready |
| Full regression of module navigation and API operations | QA | Ready |

## Release Gate Recommendation

`GO for QA/UAT gate.`

All previously pending RBAC and superadmin hardening scope from this batch is now implemented and verified by automation.
