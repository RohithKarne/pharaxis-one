# Pharaxis QMS Scope Document (External Development Handover)

Version: 1.0  
Date: 2026-04-14  
Product: Pharaxis QMS  
Prepared for: External Development Team  
Prepared by: Product + Engineering Leadership

## 1. Objective
Build an enterprise-grade, inspection-ready QMS platform for large pharma customers with strong regulatory posture, multi-tenant governance, strict role separation, and audit-ready workflows.

## 2. Business And Market Direction
### 2.1 Target customers
- Large pharma (primary)
- Mid-size pharma and biologics companies
- CDMO/CMO organizations

### 2.2 Commercial model
- Land with core modules: Document Control + CAPA
- Expand with Deviation, Audit, Validation, Change Control
- Enterprise pricing model: platform fee + user bands + compliance add-on

### 2.3 Buyer outcomes
- Faster audit readiness
- Strong data integrity and traceability
- Lower compliance risk through enforced workflows

## 3. Compliance Model (Must-Have)
- 21 CFR Part 11 readiness (e-signature controls)
- EU Annex 11 aligned control expectations
- ALCOA+ data integrity principles
- Immutable audit trail across all critical actions
- Segregation of duties for approval-sensitive flows

## 4. Product Surfaces And Routing
### 4.1 Base URL
- App runs under base path: `/qms/`

### 4.2 Login URLs
- User app login: `http://localhost:3146/qms/login`
- Superadmin login: `http://localhost:3146/qms/superadmin/login`
- Compatibility alias: `http://localhost:3146/qms/login/superadmin`

### 4.3 Platform separation
- User surface and superadmin surface must remain separated
- Superadmin controls tenant governance and platform policies
- User app handles operational QMS modules

## 5. Current Confirmed UX Requirements
- User login must use `User ID` (not email label)
- User login org selector must be a dropdown by organization name
- Superadmin page must use left sidebar categories and dashboard-style main screen
- Avoid single long scroll page for superadmin controls

## 6. Security Groups And Access Model
Default org security groups:
- Admin
- Author
- QA Reviewer
- Approver
- Viewer

Rules:
- One user can hold multiple groups
- Creator cannot perform final approval on same controlled item
- Org admin can be allowed to reset 2FA (policy configurable)
- OTP method: email OTP

## 7. Scope Summary By Feature (With User Stories)

### 7.1 Platform Foundation
| ID | Feature | User Story | Technical Changes | Effort | Skills | Delivery State |
|---|---|---|---|---|---|---|
| P1 | Split auth surfaces | As superadmin, I need dedicated login surface so platform governance is isolated from user operations. | Auth routes, router guards, session handling | M | Backend auth, Vue routing, security design | Baseline implemented |
| P2 | Multi-tenant org governance | As platform admin, I need org create/activate/deactivate flows to manage customers. | Org tables/APIs, superadmin org UI | M | Multi-tenant backend, admin UX | Baseline implemented |
| P3 | Multi-group RBAC | As org admin, I need multi-group assignment to reflect real responsibilities. | Role mapping schema/APIs, user-group UI | L | RBAC modeling, API design | Baseline implemented |
| P4 | SoD enforcement | As compliance head, I need creator/final approver separation to reduce conflict risk. | Workflow transition guards + policy checks | M | Compliance logic, backend rules | Baseline implemented |
| P5 | Email OTP security model | As security admin, I need org-level OTP controls and reset policies. | OTP challenge tables, verify APIs, policy UI | M | Auth security, notification flow | Baseline implemented |
| P6 | Login audit reporting | As auditor, I need login event trail for traceability and investigations. | Audit tables + report APIs + UI | M | Audit design, reporting | Baseline implemented |
| P7 | Site hierarchy under org | As enterprise customer, I need site-level partitioning and controls. | Site schema, site filters, policy scoping | L | Data architecture, tenancy design | Planned |
| P8 | Part 11 e-sign framework | As approver, I need legally defensible sign-off with reason and signature meaning. | Signature records, workflow hooks, prompts | L | Part 11 design, crypto hash usage | Planned |
| P9 | SSO + SCIM | As enterprise IT, I need SSO and provisioning automation. | OIDC/SAML + SCIM + role mapping | XL | IAM integration, security engineering | Planned |

### 7.2 Core QMS Modules
| ID | Feature | User Story | Technical Changes | Effort | Skills | Delivery State |
|---|---|---|---|---|---|---|
| M1 | Document Control lifecycle | As document controller, I need versioned lifecycle and controlled distribution. | Version tables, status transitions, preview/export policy | L | Doc control domain, workflow engine | Baseline implemented |
| M2 | CAPA full lifecycle | As QA reviewer, I need end-to-end CAPA with RCA, actions, effectiveness checks. | CAPA entities, RCA entities, action engine, approvals | L | CAPA domain, QA process design | Baseline + blueprint ready |
| M3 | Deviation management | As investigator, I need deviation workflow linked to CAPA. | Deviation schema, investigation stages, linkage model | L | Deviation domain, workflow design | Baseline implemented |
| M4 | Change Control | As change owner, I need impact and approval workflow to control regulated changes. | Change entities, impact/approval/close APIs | L | Change domain, risk controls | Baseline implemented |
| M5 | Audit management | As auditor, I need planning, findings, responses, and closure evidence. | Audit entities, checklist/findings/response flows | L | Audit domain, evidence lifecycle | Baseline implemented |
| M6 | Validation management | As validation lead, I need URS-to-execution traceability. | Validation entities, test execution, trace matrix | XL | CSV/GAMP5, traceability engineering | Planned |
| M7 | Training linkage | As compliance manager, I need read-and-understand and role-based training assignment. | Training entities, completion tracking, gating checks | L | LMS-style workflow, compliance design | Planned |
| M8 | Periodic review automation | As QA manager, I need review reminders and escalations for aging records. | Scheduler jobs, SLA logic, reminders | M | Scheduling, notifications | Planned |
| M9 | Controlled file governance | As reviewer, I need extension/MIME/security policies for evidence files. | Upload policy engine, validation, scan hooks | M | File security, policy controls | In progress |
| M10 | Cross-module traceability | As inspector, I need complete relationship graph across quality records. | Link model + trace query/report layer | L | Data lineage, reporting | Planned |

### 7.3 Enterprise Readiness Features
| ID | Feature | User Story | Technical Changes | Effort | Skills | Delivery State |
|---|---|---|---|---|---|---|
| E1 | Inspection readiness dashboard | As QA head, I need compliance posture KPIs in one view. | KPI engine + dashboard widgets | M | BI queries, product analytics | Planned |
| E2 | One-click evidence pack | As compliance lead, I need exportable evidence bundle per audit scope. | Export orchestration + manifest + secure archive | L | Reporting, export pipeline | Planned |
| E3 | Supplier quality controls | As procurement QA, I need supplier qualification and agreement tracking. | Supplier entities, risk model, workflow | L | Supplier quality domain | Planned |
| E4 | Data migration toolkit | As implementation lead, I need controlled import from legacy QMS. | ETL import, mapping, reconciliation reports | L | Migration engineering, data quality | Planned |
| E5 | Integration APIs | As enterprise architect, I need secure integration with ERP/LIMS/DMS. | API contracts, event/webhook model, auth scopes | XL | API platform, integration architecture | Planned |

## 8. CAPA Blueprint (Detailed)

### 8.1 CAPA objective
Ensure all quality issues are captured, investigated, corrected, verified, and closed with complete evidence.

### 8.2 CAPA feature breakdown
| ID | Feature | User Story | Technical Changes | Effort | Skills | Priority |
|---|---|---|---|---|---|---|
| CAPA-01 | CAPA initiation wizard | As Author, I need guided CAPA creation so mandatory data is captured consistently. | Multi-step UI + stage-wise backend validation | M | Product UX, validation logic | P0 |
| CAPA-02 | Source linkage | As QA reviewer, I need CAPA linked to deviation/audit/complaint to maintain traceability. | Foreign references + linkage APIs | M | Relational modeling | P0 |
| CAPA-03 | Risk scoring | As QA, I need risk scoring (S/O/D) to prioritize remediation. | Risk fields + scoring service | M | Risk framework modeling | P0 |
| CAPA-04 | RCA toolkit | As Investigator, I need structured 5-Why and fishbone recording. | RCA child entities and APIs | M | RCA domain knowledge | P0 |
| CAPA-05 | Action plan builder | As Owner, I need corrective and preventive action items with owners and due dates. | Action item entities + status engine | M | Workflow/task design | P0 |
| CAPA-06 | Approval workflow | As Approver, I need stage approvals with e-sign intent. | Approval entities + workflow transitions | L | Part 11-aligned flow design | P0 |
| CAPA-07 | SoD controls | As Compliance lead, I need creator/final approver separation. | Transition guard policies | S | Authorization logic | P0 |
| CAPA-08 | Effectiveness checks | As QA reviewer, I need objective effectiveness evidence before closure. | Effectiveness entity + pass/fail logic | M | QA verification design | P0 |
| CAPA-09 | SLA escalation | As Admin, I need overdue escalation workflows. | Scheduler + escalation events/notifications | M | Scheduling, notifications | P1 |
| CAPA-10 | Controlled reopen | As QA manager, I need reasoned reopen flow for failed effectiveness. | Reopen API, reason codes, audit events | S | Governance workflow | P1 |
| CAPA-11 | Attachment governance | As reviewer, I need controlled evidence attachment handling. | File policy integration + metadata links | S | File policy/security | P1 |
| CAPA-12 | Immutable timeline | As auditor, I need complete event history for each CAPA. | Event ledger model + timeline UI | M | Audit design | P0 |
| CAPA-13 | CAPA analytics dashboard | As quality director, I need trend and aging analytics. | KPI queries + dashboard cards | M | Analytics design | P1 |
| CAPA-14 | Inspection export | As compliance lead, I need one-click inspection-ready CAPA pack. | Export bundle engine | L | Reporting + compliance packaging | P1 |

### 8.3 CAPA lifecycle states
- Draft
- Submitted
- Triage
- Investigation
- Action Plan Approved
- In Execution
- Effectiveness Review
- Closed
- Reopened

### 8.4 CAPA role permissions (target)
| Role | Create | Edit | Review | Approve | Close | Reopen |
|---|---|---|---|---|---|---|
| Admin | Yes | Yes | Yes | Yes | Yes | Yes |
| Author | Yes | Yes | No | No | No | No |
| QA Reviewer | Yes | Yes | Yes | Limited | Yes | Yes |
| Approver | No | No | Yes | Yes | Limited | Limited |
| Viewer | No | No | Read only | No | No | No |

SoD policy:
- Same user cannot create and final-approve same CAPA.

### 8.5 CAPA core data model
| Entity | Purpose | Key Fields |
|---|---|---|
| `ca_capa_records` | CAPA master | capa_no, title, source_type, source_ref_id, risk_score, status, owner_user_id, due_date |
| `ca_root_cause_5why` | 5-Why analysis | capa_id, why_no, statement, evidence_ref |
| `ca_root_cause_fishbone` | Fishbone causes | capa_id, category, cause_statement, evidence_ref |
| `ca_action_items` | Corrective/preventive actions | capa_id, action_type, owner_user_id, due_date, status, evidence |
| `ca_effectiveness_checks` | Effectiveness verification | capa_id, method, result, pass_fail, checked_by, checked_at |
| `ca_escalations` | Escalation trail | capa_id, escalation_level, reason, notified_to, triggered_at |
| `ca_approvals` (new) | Stage approvals | capa_id, stage, decision, comments, approved_by, approved_at |
| `ca_history_events` (new) | Immutable timeline | capa_id, action_key, actor_user_id, payload_json, occurred_at |

### 8.6 CAPA API scope
- `POST /api/capa`
- `GET /api/capa`
- `GET /api/capa/:id`
- `PATCH /api/capa/:id`
- `POST /api/capa/:id/submit`
- `POST /api/capa/:id/triage`
- `POST /api/capa/:id/rca/5why`
- `POST /api/capa/:id/rca/fishbone`
- `POST /api/capa/:id/actions`
- `PATCH /api/capa/:id/actions/:actionId`
- `POST /api/capa/:id/approve`
- `POST /api/capa/:id/effectiveness`
- `POST /api/capa/:id/close`
- `POST /api/capa/:id/reopen`
- `GET /api/capa/:id/export`

## 9. Superadmin Information Architecture (Required)
Left sidebar categories:
- Dashboard
- Organizations
- Users and Groups
- Security and 2FA
- Email Config
- Upload Policy
- Login Audit

Main area:
- Dashboard summary cards
- Section-specific forms and data grids
- Quick actions for common admin work

## 10. Authentication And Identity Requirements
- Login field label: `User ID` for both user and superadmin
- User login payload: `userId`, `password`, `orgCode`
- Superadmin login payload: `userId`, `password`
- Active org list endpoint for login dropdown: `GET /api/auth/orgs`

## 11. File And Document Security Requirements
Current supported extensions baseline:
- `pdf, doc, docx, xls, xlsx, ppt, pptx, csv, txt, png, jpg, jpeg, tiff, eml, msg`

Target upgrades:
- MIME validation in addition to extension checks
- Malware scan hook for uploads
- Policy by module and by org
- Watermarked download policy for controlled copies

## 12. Reporting Requirements
- Login audit report
- CAPA aging and effectiveness trends
- Overdue actions report
- Org/site quality scorecard
- Traceability report across Deviation-CAPA-Change-Audit-Validation

## 13. Non-Functional Requirements
- Strong tenant isolation
- Configurable org-level policies
- Full auditability for critical state changes
- Robust API error handling and validation
- Responsive UI for desktop and laptop usage
- Export performance suitable for inspection packets

## 14. Test And Validation Strategy
- Unit tests for workflow transition and policy guards
- API contract tests for all critical endpoints
- End-to-end smoke tests for each module
- Negative tests for role violations and SoD checks
- Validation evidence templates for enterprise audits

## 15. Delivery Waves
| Wave | Scope | Target Duration |
|---|---|---|
| Wave 1 | Platform foundation + Document Control + CAPA | 6-8 weeks |
| Wave 2 | Deviation + Change Control + Audit + dashboards | 6-8 weeks |
| Wave 3 | Validation management + integrations + enterprise hardening | 8-12 weeks |

## 16. Definition Of Done (External Team)
A feature is complete only when:
- Business workflow is implemented end-to-end
- Role and policy checks are enforced
- Audit trail entries are created for critical actions
- Tests are passing and evidence shared
- UI and API behavior is documented
- Demo-ready scenario is verified with real user flow

## 17. Immediate Next Design Tracks
1. Finalize Document Control detailed blueprint (same depth as CAPA)
2. Finalize Deviation blueprint with CAPA linkage rules
3. Finalize Audit blueprint with findings-to-CAPA closure model
4. Finalize Validation blueprint with URS/FS/DS/IQ/OQ/PQ traceability

## 18. Current Environment Note
Current local baseline after cleanup:
- Dummy transactional records removed
- Dummy master org/user data removed
- Superadmin retained for fresh setup and onboarding

This document is the active handover scope for external development. Any future change must be added through versioned scope updates.
