# Publications App — Sprint 1 Scope
> Pharaxis One | Publications — Pharma Publication Lifecycle Management
> Prepared by: Vanaja (Director of Product Management) + Vinay (Product Owner)
> Reviewed by: Rajeev (CTO) + Varun (Senior Director of Software Systems)
> Approved by: Rohith (CPO)
> Date: 2026-04-11
> Handover: External Development Team

---

## What Is This App?

The Publications app is a multi-tenant, pharma-grade publication lifecycle management system for medical affairs teams inside pharmaceutical companies. It manages the complete lifecycle of scientific publications — from initial concept through internal review, journal submission, and final publication.

This is **not** a document storage system. It is a structured workflow and data management platform where documents are one component of a rich, relational publication record.

The reference products in this market are **Anju PubSTRAX** and **SciMax Pubs**. Our system covers the same core lifecycle and then integrates with the broader Pharaxis suite in Sprint 2.

---

## Why This Exists — The Business Problem

Pharmaceutical companies generate a large volume of scientific publications — journal articles, congress abstracts, posters, and oral presentations — tied to their drug programs. Without a dedicated system, publications teams manage this in spreadsheets, email threads, and shared drives. The consequences are:

- Missed journal submission deadlines
- Author disclosures not tracked or confirmed
- GPP compliance steps missed until late in the process — or not at all
- No visibility for leadership on publication pipeline status
- No audit trail when regulators or legal ask what happened

This app eliminates all of those problems by giving publications teams a structured, auditable, role-controlled system for managing every publication from concept to final print.

---

## Scope Summary

| Sprint | What Gets Built |
|--------|----------------|
| **Sprint 1** | Full foundation: multi-tenancy, RBAC, publication records, author management, lifecycle workflow, document upload with versioning, GPP checklist, internal review, dashboard, audit log, email notifications |
| **Sprint 2** | Automation, full disclosure management, journal/congress submission tracking, Gantt plan view, advanced reporting, MIMS integration, Safety integration, real-time notifications, GPP enforcement at workflow transitions, bulk import |

---

## Application Users

Two distinct user types exist in this system. This boundary must be enforced at the API layer — not just in the UI.

| User Type | Who They Are | Access | Auth Model |
|-----------|-------------|--------|-----------|
| **Super Admin** | Pharaxis platform administrator | Cross-tenant management. Creates orgs, assigns org admins, manages tenant configuration | Full platform access |
| **Org Admin** | IT or operations admin inside a pharma client company | User management within their org — invite users, assign roles, deactivate | Org-scoped access |
| **Publications Manager** | Internal pharma staff — oversees publication plan, assigns authors, tracks milestones, raises review | Full publication record management within their org | Org-scoped, role-controlled |
| **Medical Writer** | Internal pharma staff — creates and edits publication content, uploads documents | Create and edit records assigned to them; upload documents | Org-scoped, role-controlled |
| **Reviewer / Approver** | Internal pharma staff — provides structured review and sign-off at internal review stage | Review assigned publications, add comments, approve or return | Org-scoped, review-only access on assigned records |

---

## PRE-DEVELOPMENT CHECKLIST
### Must Be Completed Before Writing Any Code

### 1. Architecture Decisions to Lock First

Confirm with Rajeev (CTO) and Varun (Senior Director of Software Systems) before Sprint 1 day one:

| Decision | Recommended | Must Be Confirmed By |
|----------|------------|---------------------|
| Backend framework | Node.js + Express | Rajeev + Varun |
| Frontend framework | React + TypeScript | Rajeev + Varun |
| ORM | Prisma | Rajeev + Varun |
| Database | MySQL 8+ — relational model with strict tenant-scoped access controls | Rajeev |
| Multi-tenancy strategy | `tenant_id` on every table + mandatory tenant filters in service/repository layer + API middleware enforcement | Rajeev |
| File storage | AWS S3 (local storage for dev environment only) | Rajeev |
| API design standard | RESTful — consistent across all endpoints, no mixed patterns | Rajeev + Varun |
| Auth strategy | JWT with refresh tokens — expiry, refresh, session invalidation designed upfront | Rajeev |
| UI component library | Tailwind CSS + ShadCN — consistent with Pharaxis suite | Varun |
| DB naming convention | Follow Pharaxis DB naming standards established across the suite | Rajeev |
| Branching strategy | Feature branches, PR review, merge rules — agreed before day one | Varun |
| Environment setup | Dev + Staging + Production — all three confirmed before development starts | Varun |

### 2. Multi-Tenancy Architecture — CRITICAL — Read Before Writing Any Code

This is the single most important architectural requirement in this system. Getting this wrong means a complete data model rewrite.

**The requirement:** Multiple pharma companies (tenants) use the same deployed instance of the Publications app. Their data must be completely isolated. One pharma company must never see another's publication records, author data, documents, or audit logs.

**How to implement:**
- Every table in the database has a `tenant_id` column
- Every data query path must apply tenant filters in the repository/service layer
- Authentication middleware sets tenant context on every request
- Super Admin cross-tenant access must be explicit, role-checked, and audit logged
- Add tenant-scoped unique indexes and foreign keys to prevent accidental cross-tenant joins

**What NOT to do:**
- Do not rely on UI-only filtering — API and DB query paths must enforce tenant scope
- Do not build single-tenant first with a plan to "add multi-tenancy later"
- Do not share document storage paths across tenants — S3 keys must be namespaced by tenant_id

### 3. Data Model Sign-Off — Mandatory Before Any Application Code

The external team must design and submit all data models below. Rajeev and Varun review and approve every model before application code starts. No exceptions.

| # | Data Model | Why It Must Be Reviewed First |
|---|-----------|-------------------------------|
| 1 | User + Role + Tenant Access | Foundation of everything. Wrong model breaks auth and access control everywhere |
| 2 | Tenant / Organisation | Multi-tenancy root. Every table foreign-keys back to this |
| 3 | Publication Record | Core data model — type, status, drug reference, therapeutic area, timeline. Most fields on this one |
| 4 | Publication Workflow State Machine | Seven-stage lifecycle. States, allowed transitions, timestamp, changed_by — must be designed before workflow features start |
| 5 | Author + Publication_Author join | Authors linked to publications with role, ICMJE category, disclosure flag, order rank |
| 6 | Milestone | Per-publication milestones with due dates, completion status, overdue flag logic |
| 7 | Document (version chain) | File metadata, version number, uploaded_by, timestamp, S3 key, linked publication_id — version chain must be explicitly modelled |
| 8 | Review | Reviewer assignment, review status, comments, approval/return decision, timestamp |
| 9 | GPP Checklist Item | Checklist items per publication — item text, checked boolean, checked_by, checked_at |
| 10 | Audit Log | Append-only. Action type, actor, timestamp, record_type, record_id, before/after snapshot. Cannot be retrofitted after features are built |
| 11 | Notification | Trigger type, recipient, channel (email), template, delivery status, sent_at |

**Gate condition: Rajeev and Varun sign off on all 11 data models before any feature development begins.**

### 4. Environment & Access Requirements

Before development starts, the external team needs:

- Access to Pharaxis GitHub repository — branch permissions, PR rules confirmed with Varun
- Dev environment credentials — MySQL, AWS S3 (or local storage config), email service
- Email service configured — Nodemailer with SMTP or SendGrid (mandatory for notification features)
- Design system reference — follow Pharaxis component library (Tailwind CSS + ShadCN). Do not introduce new UI libraries without Rohith approval
- Staging environment mirroring production — mandatory before any QA begins

### 5. Domain Knowledge — Required Before Building

The external team must understand these concepts. They directly shape feature logic — not optional background reading.

| Concept | What It Means for the Build |
|---------|----------------------------|
| **GPP — Good Publication Practice** | The industry standard for ethical and transparent pharmaceutical publication. ISMPP and ICMJE both publish GPP guidelines. Our checklist feature is built around these. Every publication must be GPP-compliant before submission. Missing a GPP step has regulatory and reputational consequences. |
| **ICMJE Authorship Criteria** | The International Committee of Medical Journal Editors defines four criteria for authorship. We capture which ICMJE category each author contributes to. This is not optional metadata — it is a publication ethics requirement. |
| **Author Disclosure** | Authors on pharma-sponsored publications must declare financial relationships with the sponsoring company. Our disclosure flag tracks whether each author has declared. Incomplete disclosures can get a paper retracted. |
| **Publication Types** | Not all publications are the same. A journal article has a peer review cycle. A congress abstract has a submission deadline tied to a conference. A poster is presented at a conference in physical format. An oral presentation is a talk. Each type has slightly different fields and workflow considerations. |
| **Internal Review** | Before a manuscript is submitted to a journal, it goes through one or more rounds of internal review by the pharma company's medical, legal, and regulatory teams. Our review feature tracks this. |

### 6. Security Requirements — Non-Negotiable

| Requirement | Detail |
|------------|--------|
| Data in transit | HTTPS/TLS mandatory — no exceptions |
| Data at rest | Encrypted storage mandatory |
| Document storage | Private — never publicly accessible S3 URLs. Pre-signed URLs with expiry for all downloads |
| Multi-tenant isolation | Tenant-scoped data access at API/query layer + DB constraints. Verified by attempting cross-tenant data access with a test user — must get zero results or 404 |
| Audit log | Append-only. No UPDATE, no DELETE, ever. Application has no route to modify an existing audit log entry |
| Role enforcement | Every API endpoint validates role AND tenant context. UI-only enforcement is not acceptable and will not pass QA |
| PII handling | Author email addresses and personal details treated as sensitive. No PII in application logs |
| Password reset | Secure token-based reset only. Tokens expire. No plain-text passwords stored or transmitted |

---

## SPRINT 1 FEATURE SCOPE

### Sprint 1 Goal

Deliver a fully functional, multi-tenant publication lifecycle management system that a pharma publications team can use from day one to manage their complete publication pipeline — from creating a concept through internal review and submission tracking.

Sprint 1 must be browser-verified as a working product end-to-end before it is considered complete.

---

### Section A: Foundation — Super Admin, Auth, and Multi-Tenancy

> Critical path. All other development is blocked until this section is complete and signed off.

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 1 | **Super Admin — Org & Tenant Setup** | As a super admin I can create a new pharma client organisation, assign an org admin, activate or deactivate the tenant | Org created with name, slug, status. Org admin invited by email. Tenant activated/deactivated. Data isolation verified post-creation. | Tenant model, Super Admin UI, RBAC wiring, tenant-scope guards per API/data layer | 4 days | Full-stack, MySQL, Multi-tenancy | None — build first | Super admin is the Pharaxis platform admin — not a client user. Single super admin account at v1 |
| 2 | **Authentication + RBAC** | As a user I can log in securely and access only the features and data my role permits within my organisation | Login works for all roles. JWT issued with tenant_id and role claims. Expired token refreshes correctly. Wrong-role user gets 403 on protected endpoints. Password reset flow works end to end. | JWT auth, refresh token, bcrypt password hashing, RBAC middleware, role permission matrix, password reset token flow | 4 days | Auth, JWT, Backend, Frontend | #1 | Five roles: Super Admin, Org Admin, Publications Manager, Medical Writer, Reviewer. Roles are org-scoped — a user's role is within their tenant, not platform-wide |
| 3 | **Org Admin — User Management** | As an org admin I can invite users to my organisation, assign roles, deactivate users, and reset passwords | User invited by email receives onboarding link. Role assigned at invite. Deactivated user cannot log in. Password reset email delivered. All actions logged in audit trail. | User invite flow, email delivery, role assignment, deactivation logic, admin UI | 3 days | Full-stack, Nodemailer | #1, #2 | Org admin manages users within their tenant only. Cannot see or affect other tenants |

---

### CHECKPOINT 1 — Gate Before Feature Development Starts

> Rajeev and Varun must sign off on all items below before any publication feature is built.

- [ ] Super admin logs in and creates a new pharma org with an assigned org admin
- [ ] Org admin receives invite email, sets password, logs in, lands on correct dashboard
- [ ] Org admin invites a Medical Writer — Medical Writer logs in and sees correct role-gated views
- [ ] Medical Writer cannot access Org Admin screens — gets 403 at API level, not just UI redirect
- [ ] Cross-tenant test: User in Org A cannot retrieve any data belonging to Org B — zero results, not error
- [ ] Deactivated user cannot log in
- [ ] All above actions appear correctly in audit log

---

### Section B: Core Publication Records

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 4 | **Publication Record — Create & Manage** | As a publications manager I can create a new publication record, set its type, link it to a drug or therapeutic area, and set target journal or conference | Publication created with all required fields. Type selector works (Journal Article, Congress Abstract, Poster, Oral Presentation). Drug/compound name and therapeutic area captured as text fields at v1. Target journal or conference name captured. Record visible in publication list immediately after save. | Publication data model, create/edit UI, type selector, field validation | 5 days | Full-stack, Prisma, React | #1, #2 | Drug reference is free-text at v1. Sprint 2 links to MIMS drug records via API |
| 5 | **Publication Lifecycle — Workflow Status** | As a publications manager I can move a publication through its lifecycle stages and see who changed the status and when | Status can be manually advanced to next stage. Backward transitions blocked unless user has correct role. Every status change recorded with actor and timestamp. Status change visible in audit log. | Workflow state machine, status transition rules, status_history table, UI status control | 4 days | Full-stack, State machine design | #4 | Seven stages: Concept → Planning → Writing → Internal Review → Journal Submission → Accepted → Published. Manual progression in Sprint 1. Automated transitions in Sprint 2. |
| 6 | **Author Management** | As a medical writer I can add authors to a publication, set their ICMJE contribution category, and flag whether their disclosure is complete | Authors added by name, email, affiliation, ICMJE category. Multiple authors per publication. Author order/rank is editable. Disclosure flag (complete / incomplete) per author. At least one author required before publication moves past Planning stage. | Author model, publication_author join table, author management UI, ICMJE category dropdown | 4 days | Full-stack | #4 | ICMJE categories: Conception/Design, Data Acquisition, Data Analysis, Drafting, Critical Revision, Final Approval, Accountability. Multi-select per author. |
| 7 | **Milestone & Timeline Tracking** | As a publications manager I can set milestones for a publication and see which ones are overdue | Milestones created with name, due date, owner. Overdue milestones flagged visually (red) when past due date. Milestone completion can be marked manually. Upcoming milestones visible on dashboard. | Milestone data model, date comparison logic, milestone UI, overdue query | 4 days | Full-stack, date-fns | #4 | Standard milestones per publication type: First Draft Due, Internal Review Deadline, Submission Date, Acceptance Target. Custom milestones also allowed. |
| 8 | **Publication List View & Search** | As a publications manager I can see all publications in my organisation, filter by status, type, or therapeutic area, and search by title | Paginated list loads correctly. Filters work independently and in combination. Search returns results matching title or drug name. List respects tenant isolation — only org's publications shown. | List query with filters, search index, pagination, filter UI | 3 days | Full-stack, MySQL query design | #4 | Default sort: most recently updated first. Filters: status, publication type, therapeutic area, assigned author. Search: title, drug/compound name |

---

### Section C: Document Management

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 9 | **Document Upload & Version Control** | As a medical writer I can upload a document against a publication, and each upload creates a new version while keeping previous versions accessible | PDF and Word (.docx) accepted. File size limit enforced (configurable — recommend 50MB max at v1). Each upload creates version n+1. Previous versions listed and downloadable. Documents served via pre-signed S3 URLs — never direct public URLs. Uploaded_by and uploaded_at recorded per version. | File upload endpoint, Multer middleware, S3 storage, document version chain model, pre-signed URL generation | 5 days | Full-stack, AWS S3, File handling | #4, #2 | Version 1 is the first upload. Version 2 is the next upload. No upper limit on versions at v1. Document linked to publication_id and tenant_id. |

---

### Section D: Internal Review Workflow

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 10 | **Internal Review Workflow** | As a publications manager I can assign a reviewer to a publication in Internal Review stage. As a reviewer I can approve it or return it with comments | Reviewer can only be assigned when publication is in Internal Review stage. Assigned reviewer receives email notification. Reviewer can approve (moves to Journal Submission stage) or return with mandatory comment (moves back to Writing stage). Return comment is captured and visible to the medical writer. All review actions logged in audit log. | Reviewer assignment model, review status flow, comment capture, email trigger on assignment, status transition logic | 5 days | Full-stack, Nodemailer | #5, #2 | Multiple reviewers can be assigned. All must approve before status advances. If any reviewer returns, the publication goes back to Writing regardless of other reviewers' status. |

---

### Section E: GPP Compliance Checklist

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 11 | **GPP Compliance Checklist** | As a publications manager I can work through a GPP checklist attached to every publication and see my completion percentage | GPP checklist automatically attached to every new publication record. Checklist items are based on ISMPP/ICMJE GPP guidelines (list below). Each item has a checkbox, checked_by, and checked_at. Completion percentage visible on the publication record. Unchecked items do not block progression in Sprint 1 — they are tracked but not enforced. Enforcement added in Sprint 2. | GPP checklist data model, checklist item seeder, checklist UI component, completion % calculation | 3 days | Full-stack | #4 | Sprint 1: visible and trackable. Sprint 2: enforced at workflow transitions. Default GPP checklist items listed in Appendix A of this document. |

---

### Section F: Dashboard & Reporting

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 12 | **Dashboard — Publications Overview** | As a publications manager I can see an at-a-glance view of my organisation's publication pipeline and upcoming deadlines | Summary cards: total publications by status (all 7 stages). Total by publication type. Upcoming milestones in next 30 days — listed with publication name, milestone name, due date. My Publications panel — publications where current user is assigned author or reviewer. All data tenant-scoped. | Aggregation queries, dashboard UI, Recharts for status/type charts, milestone deadline query | 4 days | Full-stack, Recharts, Data aggregation | #4, #5, #7 | Dashboard is the landing page after login for Publications Manager and Medical Writer roles. Reviewer lands on their review queue. |

---

### Section G: Audit Log & Notifications

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 13 | **Audit Log** | As an org admin I can view an immutable record of all actions taken on every publication record in my organisation | Audit log captures: publication created, status changed, author added/removed, document uploaded, reviewer assigned, checklist item checked, review submitted. Each entry: action_type, actor, timestamp, publication_id, before/after snapshot where applicable. Log is read-only — no UI or API route to edit or delete entries. Queryable by publication, by actor, and by date range. | Append-only audit log table, log write on every tracked action, admin query UI | 3 days | Full-stack, MySQL | #1, #4, #5 | Audit log is write-only for the application. Read-only for admins. No UPDATE or DELETE route exists anywhere in the codebase for audit log entries. |
| 14 | **Email Notifications** | As a user I receive email notifications when actions relevant to me occur in the system | Emails sent on: reviewer assigned to a publication, publication status changed, milestone overdue (checked daily), document uploaded to a publication I am assigned to, review returned with comments. Emails include publication title, action details, and a link. User can opt out per notification type. | Email trigger system, Nodemailer, email templates (HTML), opt-out preference model, daily cron for overdue milestones | 2 days | Backend, Nodemailer, Email templates | #5, #7, #10 | Email is the only notification channel in Sprint 1. In-app notification centre added in Sprint 2. |
| 15 | **Multi-Tenancy Data Isolation — Verification** | As the system I ensure all data is correctly isolated per tenant and no cross-tenant access is possible | All publication records, authors, documents, milestones, review records, checklist items, and audit logs are tenant-scoped. Cross-tenant test with authenticated user returns zero results (not 403 — zero results is correct for list endpoints, 404 for direct record access). Super admin can query across tenants. Tenant guards, scoped queries, and DB constraints are in place and tested for all tables. | Tenant-scope query review across all tables, cross-tenant penetration test, super admin bypass verified | 3 days | MySQL multi-tenancy, Security testing | All above | This is a verification and hardening task — not a feature build. It runs after all data models and features are built. Required before Sprint 1 QA begins. |

---

### CHECKPOINT 2 — Sprint 1 Complete Gate

> Full browser verification by Varun's team. Vanaja product walkthrough. Karthik and Shivani QA sign-off. Rohith final sign-off.

- [ ] Super admin creates two separate pharma orgs. Org A user cannot see Org B data in any endpoint.
- [ ] Org admin invites Medical Writer and Reviewer. Both can log in and see correct role-gated views.
- [ ] Medical Writer creates a publication record with all fields, adds three authors with ICMJE categories and disclosure flags, sets milestones, uploads a document (PDF and Word tested separately).
- [ ] Publications Manager advances the publication through all seven stages manually.
- [ ] Internal review workflow: reviewer assigned → email received → reviewer returns with comment → publication moves back to Writing → comment visible to Medical Writer.
- [ ] Internal review workflow: reviewer approves → publication moves to Journal Submission.
- [ ] Second document upload creates version 2. Version 1 remains downloadable.
- [ ] GPP checklist attached to publication. Items can be checked. Completion percentage updates.
- [ ] Dashboard shows correct counts by status and type. Upcoming milestones section shows correct publications.
- [ ] Overdue milestone flagged red on publication record.
- [ ] All actions from the above flow appear in the audit log with correct actor, timestamp, and action type.
- [ ] Audit log entry cannot be edited or deleted — no such route exists.
- [ ] Email notification received on reviewer assignment and on status change.
- [ ] All above verified in the browser as a real user would experience it — not just API testing.

---

## IN-BETWEEN FEATURE RULES
> Apply to every single feature — no exceptions.

| Rule | What It Means |
|------|--------------|
| No feature ships without audit log coverage | Every state change, document action, author change, checklist update — logged. If it is not in the audit log, it did not happen. |
| No feature ships without role enforcement tested | Every API endpoint tested with a user who should NOT have access. Must get 403 — not data, not a redirect. |
| No feature ships without negative path tested | Every form must have an invalid submission test. Every workflow must have a rejection path test. Every file upload must have an unsupported format test. |
| No cross-tenant access permitted | Every data endpoint tested from a different tenant's user. Must return zero results or 404 — never another org's data. |
| Documents are never served via direct public URLs | All document downloads use pre-signed S3 URLs with expiry. Test that direct S3 URL is inaccessible. |
| Email notifications are not optional | Every trigger event must fire the email in the test environment. Silent failures not acceptable. |
| GPP checklist must auto-attach | Every new publication record must have a GPP checklist from creation — never manually added. |

---

## FULL FEATURE SUMMARY TABLE

| # | Feature | Section | Priority | Effort | Skills | Technology |
|---|---------|---------|----------|--------|--------|-----------|
| 1 | Super Admin — Org & Tenant Setup | Foundation | P0 | 4 days | Full-stack, RBAC, Multi-tenancy | React, Node.js, MySQL |
| 2 | Authentication + RBAC | Foundation | P0 | 4 days | Auth, JWT, Backend, Frontend | React, Node.js, JWT, bcrypt, MySQL |
| 3 | Org Admin — User Management | Foundation | P0 | 3 days | Full-stack, Nodemailer | React, Node.js, MySQL, Nodemailer |
| 4 | Publication Record — Create & Manage | Core Records | P0 | 5 days | Full-stack, mysql2, React | React, Node.js, MySQL, mysql2 |
| 5 | Publication Lifecycle — Workflow Status | Core Records | P0 | 4 days | Full-stack, State machine | React, Node.js, MySQL |
| 6 | Author Management | Core Records | P0 | 4 days | Full-stack | React, Node.js, MySQL |
| 7 | Milestone & Timeline Tracking | Core Records | P0 | 4 days | Full-stack, date-fns | React, Node.js, MySQL, date-fns |
| 8 | Publication List View & Search | Core Records | P0 | 3 days | Full-stack, MySQL query | React, Node.js, MySQL |
| 9 | Document Upload & Version Control | Documents | P0 | 5 days | Full-stack, AWS S3 | React, Node.js, AWS S3, Multer |
| 10 | Internal Review Workflow | Review | P0 | 5 days | Full-stack, Nodemailer | React, Node.js, MySQL, Nodemailer |
| 11 | GPP Compliance Checklist | Compliance | P1 | 3 days | Full-stack | React, Node.js, MySQL |
| 12 | Dashboard — Publications Overview | Reporting | P1 | 4 days | Full-stack, Recharts | React, Node.js, MySQL, Recharts |
| 13 | Audit Log | Governance | P1 | 3 days | Full-stack, MySQL | React, Node.js, MySQL |
| 14 | Email Notifications | Notifications | P1 | 2 days | Backend, Nodemailer | Node.js, Nodemailer |
| 15 | Multi-Tenancy Isolation Verification | Security | P0 | 3 days | Tenant isolation testing, Security | MySQL scoped access controls |

---

## EFFORT SUMMARY

| Category | Features | Effort |
|----------|----------|--------|
| P0 — Must have | 10 | 40 days |
| P1 — High value | 5 | 15 days |
| **Total Sprint 1** | **15** | **55 days** |

Effort estimates assume the full engineering team of three engineers (Senior Solution Architect + Principal Software Engineer + oversight from Senior Director) working in parallel across sections. Sections A through C are sequential — B and C cannot start until A is signed off at Checkpoint 1.

---

## TECHNOLOGY STACK

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + TypeScript | Consistent with Pharaxis suite |
| UI Components | Tailwind CSS + ShadCN | Consistent with Pharaxis suite — do not introduce new libraries without approval |
| Backend | Node.js + Express | Consistent with Pharaxis suite |
| ORM | Prisma | Type-safe DB access — consistent with suite |
| Database | MySQL | Relational model with strict tenant-scoped access controls |
| Auth | JWT + bcrypt | Stateless, role-compatible |
| File Storage | AWS S3 | Pre-signed URLs for all document access. Local storage for dev only. |
| Email | Nodemailer | Internal notification emails |
| Charts / Visualisation | Recharts | Dashboard status and type charts |
| Date Handling | date-fns | Milestone overdue logic, date formatting |

---

## SKILLS REQUIRED — SPRINT 1

| Skill Area | Required Level | Usage |
|------------|---------------|-------|
| React + TypeScript | Expert | All UI features |
| Node.js + Express | Expert | All backend features |
| MySQL + mysql2 | Expert | All data features |
| Tenant isolation query design | Expert | Multi-tenancy — critical |
| JWT Auth + RBAC | Expert | Foundation layer |
| AWS S3 + Multer | Proficient | Document upload and retrieval |
| Nodemailer / Email | Proficient | Notification system |
| State machine design | Proficient | Publication workflow — 7-stage lifecycle |
| Recharts | Proficient | Dashboard |
| Security testing | Proficient | Cross-tenant penetration test, role enforcement test |

---

## APPENDIX A — DEFAULT GPP CHECKLIST ITEMS

The following checklist items are seeded for every new publication record. Based on ISMPP Good Publication Practice (GPP3) and ICMJE guidelines.

| # | GPP Checklist Item | Applicable To |
|---|-------------------|--------------|
| 1 | All authors meet ICMJE authorship criteria | All publication types |
| 2 | Author contributions documented per ICMJE categories | All publication types |
| 3 | All authors have declared financial interests and disclosures | All publication types |
| 4 | Company involvement in publication is transparently acknowledged | All publication types |
| 5 | Medical writer (if applicable) is acknowledged in the publication | All publication types |
| 6 | Publication is not a duplicate submission to another journal | Journal Article |
| 7 | Data presented is consistent with the clinical study report or source data | All publication types |
| 8 | Statistical methods are accurately described | Journal Article, Congress Abstract |
| 9 | Adverse event data is accurately represented | All publication types |
| 10 | Publication has been reviewed by legal and regulatory before submission | All publication types |
| 11 | Abstract content is consistent with full manuscript (if applicable) | Congress Abstract |
| 12 | Embargo terms for congress presentation are understood and respected | Congress Abstract, Poster, Oral Presentation |
| 13 | All co-authors have reviewed and approved the final version | All publication types |
| 14 | Publication registration completed where required (e.g. ClinicalTrials.gov reference) | Journal Article |
| 15 | Final approved version archived in document management system | All publication types |

---

## CONTACTS FOR HANDOVER QUESTIONS

Questions during development go to:

| Topic | Contact | Role |
|-------|---------|------|
| Architecture decisions | Rajeev | CTO |
| Engineering direction and task assignment | Varun | Senior Director of Software Systems |
| Product and feature scope | Vanaja | Director of Product Management |
| User stories and acceptance criteria | Vinay | Product Owner |
| Project tracking and gate approvals | Bala | Director of Project Management |
| Final approval on all gates | Rohith | CPO |
