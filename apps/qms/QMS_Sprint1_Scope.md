# Pharaxis QMS — Sprint 1 Scope Document
> Prepared by: Vanaja (Director of Product Management) + Bala (Director of Project Management)
> Approved by: Rohith (CPO)
> Date: 2026-04-08
> Status: PENDING ROHITH APPROVAL — Do not begin development without explicit sign-off

---

## 1. Product Overview

**Product Name:** Pharaxis QMS
**Part of:** Pharaxis One platform suite
**Positioning:** Mid-market Quality Management System for regulated pharma, CROs, and regulated service firms
**Primary differentiator:** End-to-end compliance — Document Control, CAPA, Audit, Deviation, and Validation Services (CSV/CSA) in one integrated product with one-click inspection-ready audit binder

---

## 2. Target Clients

| Client Type | Examples |
|-------------|---------|
| Direct pharma companies | Mid-size pharma — global and regional |
| Contract Research Organisations (CROs) | Eversana, PrimeVigilance |
| Regulated service firms | Freyr Solutions |

**Client migration model:** Clients will wait for the system to stabilise and migrate module by module at their own pace. No forced full migration.

---

## 3. Regulatory Scope — Sprint 1

| Regulation | In Scope |
|------------|----------|
| 21 CFR Part 11 (FDA) | Yes |
| Annex 11 (EMA / EU GMP) | Yes |
| ICH Q10 | Yes |
| MHRA, TGA, other agencies | Deferred — Sprint 2+ |

---

## 4. Sprint 1 Timeline

| Item | Value |
|------|-------|
| Target duration | 3 months from development start |
| Development start | Pending Rohith approval |
| First client-facing release | 3 months post approval |

---

## 5. Tech Stack — Confirmed

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js + Express.js |
| Frontend framework | Vue.js |
| CSS / UI component library | Tailwind CSS + Shadcn/UI |
| Database | PostgreSQL |
| Search | PostgreSQL Full-Text Search |
| File and document storage | Azure Blob Storage |
| PDF generation | Puppeteer (rich audit binders) + PDFKit (simple exports) |
| Messaging / events | RabbitMQ |
| Authentication | JWT (custom) + Keycloak (enterprise SSO) |
| Caching | Redis |
| Containers | Docker + Docker Compose (local dev) |
| Orchestration | Azure AKS or AWS EKS (production) |
| CI/CD | GitHub Actions |
| Monitoring | Grafana + Prometheus + Sentry |
| Infrastructure as code | Terraform |
| Secrets management | Azure Key Vault or AWS Secrets Manager |
| Encryption at rest | AES-256 |
| Encryption in transit | TLS 1.3 |
| Multi-tenancy model | Single database, org_id on every table |
| Single-tenant option | Dedicated cluster per client (for large enterprise clients) |

---

## 6. Sprint 1 — Module Scope

Five modules are in scope for Sprint 1. All other modules are deferred to Phase 2.

| # | Module | Priority |
|---|--------|----------|
| 1 | Document Control | Sprint 1 |
| 2 | CAPA Management | Sprint 1 |
| 3 | Deviation Management | Sprint 1 |
| 4 | Audit Management | Sprint 1 |
| 5 | Validation Services (CSV/CSA) | Sprint 1 |

**Deferred to Phase 2:**
- Change Control
- Training Management
- Supplier Quality Management
- Complaint Management
- Risk Management
- Management Review
- Regulatory Intelligence and Submissions Support

**Cross-app integration (MIMS, Vault, Safety):** Deferred — QMS ships as standalone in Sprint 1. Integrations in Sprint 2.

---

## 7. Anchor Feature — Sprint 1

> **One-click Inspection Readiness Audit Binder**
> This is the single most important client-facing feature in Sprint 1.
> When an audit or regulatory inspection is approaching, a user clicks one button.
> The system auto-compiles: controlled documents, CAPA records and evidence, deviation log, audit history, and validation binder — into a single formatted, paginated, inspection-ready PDF.
> No manual compilation. No missed records. Audit-ready in seconds.

All five modules must be designed with this feature as the north star. Every record type must be exportable into the audit binder.

---

## 8. Terminology — Industry Standard Names

No custom Pharaxis-branded terms. All modules and features use industry standard QMS terminology.

| Concept | Term Used |
|---------|-----------|
| Controlled document lifecycle | Controlled Documents |
| Corrective and preventive action | CAPA |
| Process or product deviation | Deviation |
| Quality audit | Audit |
| Computer system validation | CSV / CSA |
| Inspection readiness pack | Audit Binder |

---

## 9. Module 1 — Document Control

### Purpose
Manage the full lifecycle of controlled documents — SOPs, Work Instructions, Policies, Forms, Protocols — in a compliant, version-controlled, audit-ready system.

### Features — P1 (Sprint 1 mandatory)

| # | Feature | Acceptance Criteria |
|---|---------|-------------------|
| DC-01 | Document creation with metadata | User can create a document with: title, document type, department, owner, effective date, version number. All fields validated before save. |
| DC-02 | Document types | System supports: SOP, Work Instruction, Policy, Form, Protocol. Selectable on creation. |
| DC-03 | Document lifecycle — Draft → Review → Approved → Effective → Retired | Document moves through states in sequence. No state can be skipped. Each transition requires the correct role. |
| DC-04 | Multi-level review and approval workflow | Workflow is configurable per document type. Minimum: one reviewer, one approver. Each step records who acted and when. |
| DC-05 | 21 CFR Part 11 / Annex 11 electronic signature | Every review and approval step requires e-signature. Signature captures: user identity, timestamp (UTC), signature meaning (review / approve / acknowledge). Tamper-evident. |
| DC-06 | Version control | Every save creates a version record. Full version history visible. User can view any prior version. Cannot edit a prior version. |
| DC-07 | Document supersession | When a new version goes Effective, the previous version is auto-retired. No two versions of the same document can be Effective simultaneously. |
| DC-08 | Periodic review scheduling | Owner sets review interval (annual, biannual, custom). System calculates next review date. |
| DC-09 | Expiry alerts | Alerts sent at 90, 60, 30, and 7 days before periodic review due date. Alert sent to document owner and their manager. |
| DC-10 | Read and understood acknowledgement | Users assigned to a document must confirm they have read and understood it before accessing the controlled copy. Acknowledgement is recorded with timestamp. |
| DC-11 | Document search | Search by: title, document type, department, owner, status, version, keyword. Results returned in under 2 seconds. |
| DC-12 | PDF lock on effective documents | Once a document reaches Effective status, it is locked as PDF. No editing permitted. |
| DC-13 | Role-based document access control | Access configured per role and org. Users can only see documents they are authorised to view. |
| DC-14 | Document audit trail | Every action — create, edit, state change, view, download, signature — is logged with user, timestamp, and action. Tamper-evident. Cannot be modified or deleted. |
| DC-15 | Audit binder contribution | All effective controlled documents are includable in the one-click audit binder export. |

### Features — P2 (Phase 2)
- Document templates
- Controlled copy distribution tracking
- Watermarking (controlled vs. uncontrolled copy)
- Translation management
- Document linking (SOP to related WIs and forms)
- Integration with Pharaxis Vault

---

## 10. Module 2 — CAPA Management

### Purpose
Manage the full Corrective and Preventive Action lifecycle — from initiation through root cause analysis, action planning, implementation, effectiveness verification, and closure.

### Features — P1 (Sprint 1 mandatory)

| # | Feature | Acceptance Criteria |
|---|---------|-------------------|
| CA-01 | CAPA initiation | CAPA can be initiated from: Deviation record, Audit finding, or manual entry. Source is recorded on the CAPA record. |
| CA-02 | CAPA classification | CAPA classified as: Corrective, Preventive, or Both. Required field before CAPA proceeds. |
| CA-03 | Root cause analysis — 5-Why | Built-in 5-Why tool. User enters problem statement and answers up to 5 why levels. Output saved to CAPA record. |
| CA-04 | Root cause analysis — Fishbone | Built-in Fishbone diagram. User populates cause categories. Output saved to CAPA record. |
| CA-05 | Action plan | User defines actions with: description, assigned owner, due date. Minimum one action required before CAPA plan is submitted for approval. |
| CA-06 | CAPA plan approval workflow | CAPA plan must be approved before implementation begins. Approval requires e-signature. |
| CA-07 | Implementation tracking | Each action tracked: Not Started, In Progress, Complete. Owner updates status. Progress visible on CAPA record. |
| CA-08 | Effectiveness verification | After all actions complete, effectiveness criteria defined and assessed. Evidence attached. Pass or Fail recorded with e-signature. |
| CA-09 | CAPA closure | CAPA closed only after effectiveness verification passes. Closure requires e-signature from CAPA owner and approver. |
| CA-10 | CAPA escalation | Overdue actions (past due date) auto-escalate to the owner's manager. Escalation logged on CAPA record. |
| CA-11 | CAPA dashboard | Shows: open CAPAs, overdue CAPAs, CAPAs by status, CAPAs by department, on-time closure rate. |
| CA-12 | CAPA audit trail | Every action on every CAPA record — create, edit, status change, comment, signature — logged with user and UTC timestamp. Tamper-evident. |
| CA-13 | Audit binder contribution | All CAPA records with evidence are includable in the one-click audit binder export. |

### Features — P2 (Phase 2)
- CAPA trending (recurring root cause detection)
- CAPA linked to Change Control
- CAPA linked to Training assignment
- MIMS signal auto-initiating CAPA
- Regulatory export for FDA / EMA submission support

---

## 11. Module 3 — Deviation Management

### Purpose
Capture, investigate, and close product, process, and system deviations in a compliant, traceable workflow.

### Features — P1 (Sprint 1 mandatory)

| # | Feature | Acceptance Criteria |
|---|---------|-------------------|
| DV-01 | Deviation capture | User records deviation with: title, description, deviation type (product / process / system / environmental), date of occurrence, department, detected by. |
| DV-02 | Deviation classification | Classified as: Critical, Major, Minor. Required field. Classification drives review and approval routing. |
| DV-03 | Immediate containment actions | User records what was done immediately upon deviation discovery. Captured as a free-text field with timestamp. |
| DV-04 | Investigation workflow | Investigation assigned to a named investigator with due date. Investigator records findings and attaches evidence. |
| DV-05 | Root cause determination | Root cause recorded on investigation record. Links to CAPA if corrective action is required. |
| DV-06 | Deviation linked to CAPA | User can link deviation to an existing CAPA or initiate a new CAPA directly from the deviation record. Link is bidirectional — visible on both records. |
| DV-07 | Regulatory reportability assessment | User answers: is this deviation reportable to a regulatory authority? Yes / No / Under Review. Reason recorded. |
| DV-08 | Deviation closure | Deviation closed only after investigation complete and root cause recorded. Closure requires e-signature. |
| DV-09 | Deviation trending dashboard | Shows: deviations by type, by department, by frequency, recurring deviations flagged. |
| DV-10 | Deviation audit trail | Every action on every deviation record logged with user and UTC timestamp. Tamper-evident. |
| DV-11 | Audit binder contribution | All deviation records are includable in the one-click audit binder export. |

### Features — P2 (Phase 2)
- Batch / lot level traceability
- Recurring deviation auto-detection (3+ occurrences)
- Incident management (near-miss, safety, environmental)

---

## 12. Module 4 — Audit Management

### Purpose
Plan, execute, and close internal and external quality audits. Manage findings through to CAPA. Generate inspection-ready audit packs.

### Features — P1 (Sprint 1 mandatory)

| # | Feature | Acceptance Criteria |
|---|---------|-------------------|
| AU-01 | Audit creation | User creates audit with: audit title, type (internal / external / regulatory inspection), scope, planned date, lead auditor. |
| AU-02 | Audit schedule — calendar view | All planned and in-progress audits visible on a calendar. Filter by audit type, department, status. |
| AU-03 | Auditor assignment | Lead auditor and co-auditors assigned. Assignments recorded on audit record. |
| AU-04 | Pre-audit checklist | Configurable checklist per audit type. Auditor completes checklist before audit begins. Completion recorded. |
| AU-05 | Audit finding capture | Findings recorded with: description, finding type (Observation / Minor / Major / Critical), department, process area. Minimum one finding per closed audit (or explicit "no findings" confirmation). |
| AU-06 | Finding linked to CAPA | Each finding can be linked to a CAPA. User can initiate a new CAPA from the finding record directly. |
| AU-07 | Auditee response | Auditee records their response and proposed action for each finding. Response tracked separately from finding. |
| AU-08 | Audit report generation | System auto-generates audit report from: audit details, attendees, findings, auditee responses. Report formatted as PDF. |
| AU-09 | Audit closure | Audit closed by lead auditor after all findings are responded to and linked CAPAs are initiated. Closure requires e-signature. |
| AU-10 | Audit history | Full history of all audits — filterable by type, department, date range, outcome. |
| AU-11 | **Inspection readiness — one-click audit binder** | User clicks one button. System compiles into a single formatted PDF: all effective controlled documents, all open and closed CAPAs with evidence, full deviation log, full audit history, and validation binder. Binder is paginated with table of contents. Generated within 60 seconds. This is the anchor feature of Sprint 1. |
| AU-12 | Audit audit trail | Every action on every audit record logged with user and UTC timestamp. Tamper-evident. |

### Features — P2 (Phase 2)
- Audit trending (repeat findings detection)
- Mock inspection workflow
- Regulatory inspection tracker per agency (FDA, EMA, MHRA, TGA)
- Auditor qualification records
- Host site audit management

---

## 13. Module 5 — Validation Services (CSV/CSA)

### Purpose
Enable clients to manage the full lifecycle of computer system validation (CSV) and computer software assurance (CSA) for their own systems — independently, as a self-service product. Clients buy this module and use it to validate their own computerised systems.

### Features — P1 (Sprint 1 mandatory)

| # | Feature | Acceptance Criteria |
|---|---------|-------------------|
| VS-01 | System inventory | User registers each computerised system requiring validation: system name, vendor, version, system owner, GAMP 5 category, validation status. |
| VS-02 | GAMP 5 category classification | Each system classified as: Category 1 (infrastructure), Category 3 (non-configured), Category 4 (configured), Category 5 (custom). Classification recorded and visible on system record. |
| VS-03 | Risk-based validation approach | System supports CSA risk-based approach aligned to FDA 2022 guidance. Risk level (High / Medium / Low) assigned per system. Risk level drives required validation activities. |
| VS-04 | Validation planning — IQ, OQ, PQ | User creates validation plan for a system. Plan includes: scope, approach, responsibilities, protocol types required (IQ / OQ / PQ / UAT). Plan requires approval before execution. |
| VS-05 | Protocol templates | Pre-built templates for: Installation Qualification (IQ), Operational Qualification (OQ), Performance Qualification (PQ), User Acceptance Testing (UAT). User can customise template per system. |
| VS-06 | Test script execution | Each protocol contains test scripts with steps. User executes each step and records: Pass / Fail / N/A, actual result, evidence attached. Execution requires e-signature per step or per script (configurable). |
| VS-07 | Deviation capture during validation | If a test step fails, user captures a validation deviation inline. Deviation is linked to the test script and the validation record. |
| VS-08 | Validation summary report | After execution complete, system auto-generates Validation Summary Report (VSR) from: plan, protocols, execution records, deviations, and approvals. VSR formatted as PDF. No manual compilation. |
| VS-09 | Validation approval workflow | Protocol approved before execution begins. VSR approved after execution completes. Both require e-signature. |
| VS-10 | Change-triggered re-validation flag | When a system in the inventory has a change recorded, system flags whether re-validation is required based on change type and system risk level. |
| VS-11 | Periodic review of validated systems | Review interval set per system. Alerts at 90, 60, 30, and 7 days before periodic review due. |
| VS-12 | Validation dashboard | Shows: all systems by validation status (Planned / In Progress / Validated / Overdue Review / Retired), upcoming periodic reviews, open validation deviations. |
| VS-13 | Audit binder contribution | Full validation binder per system — plan, protocols, execution records, VSR — included in one-click audit binder export. |
| VS-14 | Validation audit trail | Every action on every validation record logged with user and UTC timestamp. Tamper-evident. |

### Features — P2 (Phase 2)
- Vendor assessment (SOC 2, DQ evidence management)
- System retirement — formal decommissioning process
- Self-validation of Pharaxis QMS platform itself

---

## 14. Platform-Level Services (Shared — Required for Sprint 1)

These must be built before any module development begins. They are shared services consumed by all five modules.

| Service | Description |
|---------|-------------|
| **Electronic signature service** | 21 CFR Part 11 compliant. Captures: user identity, UTC timestamp, signature meaning. Cryptographic. Tamper-evident. Built once at platform level — not per module. |
| **Audit trail service** | Immutable append-only log. Every create, update, state change, and signature across all modules logged here. Insert-only — no modifications permitted. |
| **Multi-tenant isolation** | Single PostgreSQL database. org_id on every table. Row-level security enforced at application layer. No cross-org data access possible. |
| **Role-based access control** | Configurable roles per module per org. Users can only access what their role permits. |
| **Notification service** | In-app + email notifications. Configurable per event type. Escalation routing to manager for overdue items. |
| **PDF generation service** | Puppeteer-based. Used by all modules for report and audit binder generation. |

---

## 15. Deferred Items — Not in Sprint 1

| Item | Reason |
|------|--------|
| Training Management | Deferred to Phase 2 — standalone training is lower priority than the five core compliance modules |
| Change Control | Phase 2 |
| Supplier Quality Management | Phase 2 |
| Complaint Management | Phase 2 |
| Risk Management | Phase 2 |
| Management Review | Phase 2 |
| Regulatory Intelligence | Phase 2 |
| Cross-app integration (MIMS, Vault, Safety) | Sprint 2 — QMS ships standalone in Sprint 1 |
| MHRA, TGA, other agency scope | Sprint 2+ |
| iOS / mobile | Deferred indefinitely until Rohith re-opens |
| Client onboarding model | To be confirmed by Rohith at sprint lock time |

---

## 16. Approval Gates

| Gate | Purpose | Condition |
|------|---------|-----------|
| Gate 1 | Requirement approved — development can begin | Rohith approval. Pre-condition: acceptance criteria finalised, ER model complete from Bhavya, Codex prompts prepared per task. |
| Gate 2 | Build complete — QA can begin | Rohith approval. Pre-condition: implementation complete, Varun code review done, engineering browser verification signed off. |
| Final sign-off | QMS Sprint 1 is done | Rohith approval after QA evidence reviewed. |

> **IMPORTANT: Development must not begin without Gate 1 approval from Rohith.**

---

## 17. Next Steps — Before Gate 1

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Acceptance criteria written per module | Vanaja + Vinay | In progress |
| 2 | Entity relationship (ER) model defined | Bhavya | Not started |
| 3 | Platform baseline confirmed (shared auth, audit trail, e-signature service) | Rajeev + Varun + Bhavya | In progress |
| 4 | Codex prompts prepared per task | Bhavya | Not started — after ER model |
| 5 | P1/P2/P3 feature prioritisation validated by Varun and Bhavya | Varun + Bhavya | Not started |
| 6 | Gate 1 approval | Rohith | Pending above |

---

*Document prepared by Vanaja + Bala — 2026-04-08*
*Awaiting Rohith approval before handover to development team*
