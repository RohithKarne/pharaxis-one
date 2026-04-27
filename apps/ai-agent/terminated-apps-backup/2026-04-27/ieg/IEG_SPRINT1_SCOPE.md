# IEG Application — Sprint 1 Scope
> Pharaxis One | IEG (Investigator Engagement & Grants)
> Prepared by: Vanaja (Director of Product Management) + Vinay (Product Owner)
> Approved by: Rohith (CPO)
> Date: 2026-04-11
> Handover: External Development Team

---

## Application Overview

IEG is a standalone multi-module application for pharma Medical Affairs teams. It manages the full lifecycle of three program types:
- **Grants** — Medical education and research grants to HCPs, institutions, and CME providers
- **IIT** — Investigator Initiated Trials — proposals from external investigators to run independent studies
- **EAP** — Expanded Access Program (Compassionate Use) — Sprint 2

**Sprint 1 builds:** Shared Foundation + Grants Module + IIT Module
**Sprint 2 builds:** EAP Module + External Integrations + AI features

### Key Architecture Decisions
- Single Superadmin across all 3 modules
- Same login page for all modules — module access controlled by permissions
- Multi-module users get a module switcher dropdown — direct module landing on switch (task queue default)
- Loosely coupled modules — shared auth, shared infrastructure, module-scoped workflows and intake forms
- US-first pilot customers — global rules engine architecture from day one, US ruleset at v1
- Native Document Management System at v1 — no DocuSign, no external DMS at Sprint 1
- External payment system integration in Sprint 2 — IEG owns disbursement record only
- Soft warnings on compliance — pause + acknowledge + log. Never auto-continue.
- In-app notifications for internal users. Email notifications for external users (investigators, HCPs).

---

## PRE-DEVELOPMENT CHECKLIST
### Must Be Completed Before Writing Any Code

### 1. Architecture Decisions to Lock First

Confirm with Rajeev (CTO) and Varun (Senior Director of Software Systems) before Sprint 1 day one:

| Decision | Recommended | Must Be Confirmed By |
|----------|------------|---------------------|
| Backend framework | Node.js | Rajeev + Varun |
| Frontend framework | React | Rajeev + Varun |
| Database | PostgreSQL (relational — approval chains, audit logs, workflow states) | Rajeev |
| File storage | AWS S3 or equivalent | Rajeev |
| Repo structure | Monorepo with clear module boundaries | Rajeev |
| API design standard | RESTful — consistent across all modules, no mixed patterns | Rajeev + Varun |
| Auth strategy | JWT with refresh tokens — expiry, refresh logic, session invalidation designed upfront | Rajeev |
| DB naming convention | Follow Pharaxis DB naming standards established across the suite | Rajeev |
| Branching strategy | Feature branches, PR review, merge rules — agreed before day one | Varun |
| Environment setup | Dev + Staging + Production — all three exist before development starts | Varun |

### 2. Data Model Sign-Off — Mandatory Before Any Application Code

The external team must design and submit all 10 data models below. Rajeev and Bhavya review and approve every model before module code starts. No exceptions.

| # | Data Model | Why It Must Be Reviewed First |
|---|-----------|-------------------------------|
| 1 | User + Role + Module Access | Every feature depends on this. Wrong model breaks auth everywhere |
| 2 | Workflow State Machine | All three modules depend on this. States, transitions, warning nodes, acknowledgement states |
| 3 | Approval Matrix | Cross-module, most complex. Configurable by geography, value, request type |
| 4 | Audit Log | Immutable, append-only. Cannot be retrofitted after features are built |
| 5 | Document (DMS) | Version chain, metadata, status, access control — underpins e-signature and all document workflows |
| 6 | Task Queue | Module-scoped, role-filtered, action-typed — shared across all modules |
| 7 | Notification | Triggers, templates, channels (in-app vs email), delivery status |
| 8 | Disbursement | IEG-native fields — designed with future export in mind. SAP/Oracle referenced only, not mapped |
| 9 | Evidence Taxonomy | Shared IIT + Grants — designed once, used by both modules |
| 10 | Compliance Rules | Jurisdiction-parameterised from day one — US ruleset is first parameter set |

**Gate condition: Rajeev signs off on all 10 data models before any module development begins.**

### 3. Environment & Access Requirements

Before development starts, external team needs:
- Access to Pharaxis GitHub repository (branch permissions, PR rules confirmed)
- Dev environment credentials — DB, file storage, email service
- Email service account set up — SendGrid or AWS SES (mandatory for external user notifications)
- FMV external tool API credentials — read-only feed for IIT budget review
- Design system reference — follow existing Pharaxis component library. If none exists, propose one and get Rohith approval before UI work starts
- Staging environment mirroring production — mandatory before any QA begins

### 4. External vs Internal User — Critical Distinction

There are two distinct user types. This boundary must be enforced at the API layer, not just the UI:

| User Type | Who They Are | Access | Auth Model |
|-----------|-------------|--------|-----------|
| Internal users | Pharma Medical Affairs staff, reviewers, approvers, superadmin | Main IEG application | Full auth with module access control |
| External users | Investigators (IIT), HCPs/institutions (Grants), Physicians (EAP - Sprint 2) | External applicant portal | Separate auth — register, verify email, limited scope |

External users **never** see internal workflow stages. They see only their own submission and its current status. Enforce at API layer.

### 5. Compliance Domain Knowledge — Required Before Building Compliance Layer

The external team must understand these concepts. They directly shape workflow logic — not optional background reading:

| Concept | What It Means for the Build |
|---------|----------------------------|
| **AKS (Anti-Kickback Statute)** | US federal law. Any transfer of value to an HCP must have documented legitimate purpose and FMV justification. Soft warning engine exists because of this. |
| **PhRMA Code 2021** | Medical education grants must be independent of commercial/marketing influence. Compliance screening step in Grants enforces this separation. |
| **Open Payments (CMS)** | Annual US transparency reporting. Every grant or payment to HCP/HCO must be reportable. Transparency export feature (#25) is the direct output. |
| **COI (Conflict of Interest)** | Reviewers and applicants declare conflicts. COI declarations captured, stored, auditable. Reviewer with declared COI flagged via soft warning. |
| **FMV (Fair Market Value)** | Budget amounts validated against FMV benchmarks from external tool. IEG receives the benchmark and applies comparison logic. Out-of-range triggers soft warning. |

### 6. Security Requirements — Non-Negotiable

| Requirement | Detail |
|------------|--------|
| Data in transit | HTTPS/TLS mandatory — no exceptions |
| Data at rest | Encrypted storage mandatory |
| Document storage | Private — never publicly accessible URLs. Signed URLs with expiry for downloads |
| External portal | Rate limiting on all submission endpoints |
| Audit log | Write-only for application. No update, no delete. Ever. |
| Role enforcement | Every API endpoint validates role AND module access. UI-only enforcement not acceptable. |
| PII handling | Applicant data treated as sensitive. No PII in application logs. |

---

## SPRINT 1 FEATURE SCOPE

### Section A: Shared Foundation
> Critical path. All module development blocked until Checkpoint 1 gate is passed.

| # | Feature Area | User Story | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|-------------|-----------|-------------------|--------|----------------|--------------|-------|
| 1 | Superadmin & Auth | As a superadmin I can create and manage users with module-level access | Auth system, RBAC, JWT session management | L | Node.js, DB schema design | None — build first | Single superadmin across all 3 modules |
| 2 | Module Access Control | As a user I see only the modules I have been granted access to | Permission matrix, module-scoped access flags | M | Backend, DB | #1 | Access defined per user per module |
| 3 | Login Page | As any user I log in through a single login page regardless of module | Unified login UI, session routing | S | Frontend (React), Auth integration | #1 | Same login page for all 3 modules |
| 4 | Module Switcher | As a multi-module user I can switch modules via dropdown and land on my task queue | Module context switching, session state management, routing | M | Frontend, Backend routing | #2, #3 | Direct module landing — task queue is default screen |
| 5 | Task Queue | As a user I see my pending actions filtered by module, role, and action type | Task/action data model, query engine, real-time updates | L | Backend, DB design, Frontend | #2, #4 | Shared across all modules — first-class infrastructure |
| 6 | Workflow State Machine | As the system I move requests through defined lifecycle stages including warning-acknowledgement states | Workflow engine, state transition model, warning state nodes, acknowledgement capture | XL | Backend architecture, State machine design | #5 | Warning-acknowledgement is an explicit state — not a flag. Bhavya owns this design. |
| 7 | Audit Log | As a compliance officer I can view an immutable log of every action on any record | Append-only audit log, event capture, timestamp, actor, action type | L | Backend, DB (append-only pattern) | #1 | First-class infrastructure — append only, no update, no delete |
| 8 | Native Document Management System | As a user I can upload, version, tag, and track documents linked to any request | DMS — file storage, metadata model, version chain, document status workflow, role-scoped access control | XL | Backend, File storage (S3), Frontend | #1, #7 | Native at v1. Sprint 2 adds Veeva/SharePoint integration hooks. Design integration interface now even though not built. |
| 9 | E-Signature (Native) | As an approver I can sign documents natively within IEG | Native e-signature flow, signature capture, document status update, audit linkage | L | Frontend, Backend, DMS integration | #8 | No DocuSign at v1. Native implementation only. |
| 10 | Notification System | As an internal user I receive in-app notifications. As an external user I receive email notifications. | In-app notification engine, email service (SendGrid/AWS SES), notification templates, trigger rules per state transition | L | Backend, Email service integration, Frontend | #6 | In-app for internal. Email for external users (investigators, HCPs). Both mandatory. |
| 11 | Compliance Layer | As the system I apply US-based compliance rules with a jurisdiction-parameterised engine | Rules engine, jurisdiction parameter model, US ruleset configuration | XL | Backend architecture, Compliance domain knowledge | #6 | US ruleset at v1. Engine must accept jurisdiction parameters for global overlay in Sprint 2. Bhavya owns. |
| 12 | Soft Warning Engine | As a reviewer I am warned when compliance thresholds are breached and must acknowledge before proceeding | Warning detection, acknowledgement state node, acknowledgement capture, audit log entry, UI warning modal | M | Backend, Frontend | #6, #11 | Warning = pause + human acknowledgement + log. No bypass. No auto-continue. Ever. |
| 13 | Evidence Taxonomy | As a medical reviewer I can tag requests by therapeutic area, indication, and study objective | Shared taxonomy data model, tag management UI, admin configuration | M | Backend, Frontend | #1 | Shared across IIT and Grants only. Not EAP. |
| 14 | Configurable Approval Matrix | As a superadmin I can configure approval chains by module, geography, value threshold, and request type | Approval matrix schema, rules configuration UI, matrix execution engine | XL | Backend architecture, DB schema, Frontend | #6 | Cross-module. Most complex shared component. Bhavya owns design. Must be right before any module workflow is built. |
| 15 | Disbursement Data Model | As a finance user I can view approved disbursement records with all IEG-native required fields | IEG-native disbursement schema, milestone linkage, approval chain reference | M | Backend, DB design | #14 | IEG-native fields. SAP/Oracle referenced as field-design input only — not mapped. External export adapters in Sprint 2. |

---

### CHECKPOINT 1 — Gate Before Module Development Starts
> Rajeev and Varun must review and sign off on all 10 items below.
> Grants and IIT development does NOT start until this gate is passed.

- [ ] Superadmin can log in and create a user with specific module access
- [ ] Created user logs in and sees only their permitted module
- [ ] Multi-module user sees module switcher and lands on task queue after switch
- [ ] Audit log captures every action from the above flow — immutable, queryable
- [ ] Document can be uploaded, versioned, and retrieved with correct metadata
- [ ] Workflow state machine transitions a dummy record through states including a warning-acknowledgement state
- [ ] Soft warning fires, pauses workflow, captures acknowledgement, and logs it
- [ ] Approval matrix configured for a simple geography + value rule executes correctly
- [ ] In-app notification fires on a state transition
- [ ] Email notification fires for an external user trigger

---

### Section B: Grants Module
> Builds on shared foundation. Can start after Checkpoint 1 gate is passed.

| # | Feature Area | User Story | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|-------------|-----------|-------------------|--------|----------------|--------------|-------|
| 16 | Grant Program Setup | As a superadmin I can configure grant categories, cycles, therapeutic scope, and required documents | Program configuration UI, grant category model, cycle management | M | Frontend, Backend | #1, #14 | Admin/internal function only |
| 17 | External Applicant Portal | As an HCP or institution I can access a portal to submit a grant application | External user portal, registration/login, application form, document upload, status tracking | XL | Frontend, Backend, Auth (external users), DMS | #8, #10 | External users — email notification mandatory on every status change |
| 18 | Grant Application Intake Form | As an external applicant I can complete and submit a grant application with all required fields | Module-native intake form schema, field validation, document attachment, draft save | L | Frontend, Backend, Form engine | #17 | Separate module-native form — not shared with IIT |
| 19 | Administrative Completeness Check | As an intake coordinator I can review submissions for completeness and return incomplete applications with comments | Completeness checklist engine, return-for-correction workflow, notification trigger | M | Backend, Frontend | #18, #10 | First internal stage after submission |
| 20 | COI / Compliance Screening | As a compliance officer I can run COI and compliance checks on an application with soft warning flags | COI declaration capture, compliance rule execution, warning trigger, acknowledgement flow | M | Backend, Compliance layer integration | #11, #12 | Uses shared compliance + warning engine |
| 21 | Scientific / Merit Review | As a medical reviewer I can score and comment on an application | Reviewer assignment, scoring rubric, comment capture, review status tracking | L | Backend, Frontend | #14, #6 | Configurable reviewer assignment via approval matrix |
| 22 | Committee Funding Decision | As a committee member I can approve, reject, or partially fund an application with documented rationale and e-signature | Decision workflow, partial funding model, rationale capture, e-signature on decision | L | Backend, Frontend, DMS | #9, #21 | Decision is audited and e-signed. Partial funding is a distinct state. |
| 23 | Award Contracting & Milestone Setup | As a grants manager I can generate an award contract, set milestones, and define deliverables | Native contract document generation, milestone model, deliverable tracking, e-signature | L | Backend, DMS, Frontend | #9, #22 | Native contract generation — no external DMS at v1 |
| 24 | Disbursement Tracking | As a finance user I can track disbursements against milestones and mark payments processed | Disbursement record management, milestone linkage, payment status tracking | M | Backend, Frontend | #15, #23 | IEG tracks the approval record and status. External system executes actual payment. |
| 25 | Transparency Export | As a compliance officer I can export grant data in Open Payments format | Open Payments schema mapping, export engine, file generation (CSV/XML) | M | Backend, Compliance domain knowledge | #22 | US Open Payments format at v1 only |
| 26 | Grants Audit Trail | As an auditor I can view a complete immutable history of every action on a grant application | Audit log query, grants-scoped filter, export capability | S | Backend, Frontend | #7 | Uses shared audit log — grants-scoped filter only |

---

### CHECKPOINT 2 — Gate Before IIT Module Starts
> Vanaja does full product walkthrough. Karthik and Shivani execute test cases. Gate 2 raised to Rohith.

- [ ] External applicant registers on portal, submits grant application with documents, receives email confirmation
- [ ] Internal intake coordinator sees submission in their task queue
- [ ] Completeness check can return an application to applicant with comments — applicant receives email notification
- [ ] COI screening fires a soft warning correctly and requires acknowledgement before proceeding
- [ ] Reviewer can score and comment on an application
- [ ] Committee can approve, partially fund, or reject with rationale and e-signature
- [ ] Award contract generated natively with milestones and deliverables
- [ ] Disbursement record created against milestones
- [ ] Transparency export generates correctly formatted Open Payments file
- [ ] Full audit trail queryable for a complete grant lifecycle

---

### Section C: IIT Module
> Can run in parallel with Grants after Checkpoint 1 — but only if team capacity allows. Shared foundation must be stable first.

| # | Feature Area | User Story | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|-------------|-----------|-------------------|--------|----------------|--------------|-------|
| 27 | Investigator Intake Portal | As an investigator or institution I can submit an IIT proposal through an external portal | External portal (shared infrastructure with Grants portal), IIT-specific registration, proposal form, document upload | L | Frontend, Backend, Auth (external), DMS | #8, #17 | Shared portal infrastructure — separate IIT form schema |
| 28 | IIT Proposal Intake Form | As an investigator I can submit a concept note or full proposal with PI CV, protocol synopsis, budget, and support type selector | IIT module-native intake form schema, support type selector (funding / drug supply / both), draft save | L | Frontend, Backend, Form engine | #27 | Separate form schema from Grants. Support type is IIT-specific field. |
| 29 | Scientific & Strategic Triage | As a medical affairs reviewer I can assess scientific merit, feasibility, and strategic alignment and proceed, defer, or reject | Triage workflow stage, scoring model, proceed/defer/reject decision capture, internal notes | M | Backend, Frontend | #6, #14 | First internal stage after IIT submission |
| 30 | FMV / Budget Review | As a compliance reviewer I can review the proposed budget against FMV benchmarks with soft warning on out-of-range values | Budget review screen, FMV reference data input from external tool (read-only), soft warning trigger | M | Backend, Frontend, Compliance layer | #11, #12 | FMV benchmarking from external tool — IEG receives benchmark and applies comparison only |
| 31 | Cross-functional Committee Review | As a committee member (medical, legal, compliance, safety, finance) I can review and vote on an IIT proposal | Multi-role review workflow, parallel review support, vote capture, consolidated view | L | Backend, Frontend | #14, #6 | Approval matrix drives committee composition. Parallel review must be supported. |
| 32 | IIT Approval & Contracting | As a medical affairs manager I can issue an approval (full or conditional), generate a contract with milestones, data rights, and publication rights | Approval decision model, conditional approval state (pending IRB docs), contract generation, e-signature | L | Backend, DMS, Frontend | #9, #31 | Conditional approval (pending IRB) is a distinct state — not the same as full approval |
| 33 | Milestone & Execution Monitoring | As a study operations manager I can track study milestones, budget utilisation, protocol deviations, and progress reports | Milestone tracking model, progress report upload, deviation logging, budget burn tracking | L | Backend, Frontend, DMS | #32 | IIT-specific milestone fields — adapted pattern from Grants milestone model |
| 34 | Publication Tracking | As a medical affairs manager I can track publication milestones linked to an IIT study | Publication milestone model, status tracking (submitted / accepted / published), linkage to study record | M | Backend, Frontend | #32 | Basic milestone tracking at v1. ClinicalTrials.gov registry linkage in Sprint 2. |
| 35 | IIT Audit Trail | As an auditor I can view a complete immutable history of every action on an IIT proposal | Audit log query, IIT-scoped filter, export | S | Backend, Frontend | #7 | Uses shared audit log — IIT-scoped filter only |

---

### CHECKPOINT 3 — Sprint 1 Complete Gate
> Full browser verification by Varun's team. Vanaja product walkthrough. Karthik/Shivani QA sign-off. Rohith final sign-off.

- [ ] Investigator submits IIT proposal through external portal with PI CV, protocol synopsis, budget, support type — receives email confirmation
- [ ] Scientific triage workflow routes correctly based on approval matrix configuration
- [ ] FMV budget review screen displays external tool reference data and fires soft warning on out-of-range values
- [ ] Cross-functional committee review captures multi-role parallel review and consolidated vote
- [ ] Conditional approval state (pending IRB documents) is distinct from full approval in system state and UI
- [ ] Contract generated with publication rights and data rights fields
- [ ] Milestone and execution monitoring tracks progress reports and deviations correctly
- [ ] Publication tracking records milestone status correctly
- [ ] Full audit trail queryable for complete IIT lifecycle
- [ ] Module switcher correctly moves between Grants and IIT with task queue context preserved per module

---

## IN-BETWEEN FEATURE RULES
> Apply to every single feature — not just checkpoints.

| Rule | What It Means |
|------|--------------|
| No feature ships without audit log coverage | Every state change, document action, decision — logged. If not in audit log, it didn't happen. |
| No feature ships without role enforcement tested | Every API endpoint tested with a user who should NOT have access. Must get 403, not data. |
| No feature ships without negative path tested | Every form has an invalid submission test. Every workflow has a rejection path test. |
| No UI feature ships without task queue integration | If an action creates a pending item for another user, it appears in their task queue. No orphaned actions. |
| No notification trigger is optional | Every state transition affecting another user fires the correct notification. In-app always. Email when external user is affected. |
| No document action without DMS linkage | Every document uploaded, versioned, or signed is linked to its parent record and captured in audit log. |
| Soft warnings are never skippable | No way to bypass a soft warning without acknowledgement. Test this explicitly for every warning trigger. |

---

## SKILL SUMMARY — SPRINT 1

| Skill | Usage Level | Notes |
|-------|------------|-------|
| Backend (Node.js) | Critical | Every component |
| Frontend (React) | Critical | Every UI component |
| Database Design | Critical | Shared foundation schema — get right first time |
| Workflow / State Machine Architecture | Critical | Bhavya owns — most complex component |
| File Storage (S3/equivalent) | Required | Native DMS |
| Email Service (SendGrid/AWS SES) | Required | External user notifications |
| Compliance Domain Knowledge | Required | Rules engine, Open Payments export |
| Security / Auth | Critical | Foundation layer — JWT, RBAC, signed URLs |
| Regulatory Domain Knowledge (IIT) | Moderate | IIT workflow logic — triage, committee, contracting |
| API Integration | Moderate | FMV external tool read-only feed |

---
