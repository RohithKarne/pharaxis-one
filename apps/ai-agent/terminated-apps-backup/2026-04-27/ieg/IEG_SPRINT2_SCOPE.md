# IEG Application — Sprint 2 Scope
> Pharaxis One | IEG (Investigator Engagement & Grants)
> Prepared by: Vanaja (Director of Product Management) + Vinay (Product Owner)
> Approved by: Rohith (CPO)
> Date: 2026-04-11
> Handover: External Development Team

---

## Prerequisites — Sprint 2 Does Not Start Until All of These Are Met

| Prerequisite | Owner | Status |
|-------------|-------|--------|
| Sprint 1 fully signed off by Rohith — zero open defects | Rohith | Required before Sprint 2 day one |
| Integration interface contracts documented for Veeva Vault and SharePoint | Rajeev + Bhavya | Must be designed in Sprint 1, built in Sprint 2 |
| EAP regulatory workflow fully mapped by Vanaja and Vinay | Vanaja + Vinay | User stories written and Gate 1 approved before Sprint 2 dev starts |
| AI summarisation API selected and credentials available | Rajeev | Required for feature #43 |
| ClinicalTrials.gov API access confirmed and credentials available | Rajeev | Required for feature #41 |
| First pilot client identified | Rohith | Their specific ERP export format known before disbursement export is built |

---

## Sprint 2 Context

Sprint 2 builds on a fully proven Sprint 1 foundation. The three focus areas are:

1. **EAP Module** — Full lifecycle including emergency pathway and pharmacovigilance
2. **External Integrations** — Veeva Vault, SharePoint, ClinicalTrials.gov, ERP export adapters
3. **Platform Enhancements** — AI features, cross-module conversion, advanced analytics, global compliance overlay, configurable policies

---

## SPRINT 2 FEATURE SCOPE

| # | Feature Area | User Story | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|-------------|-----------|-------------------|--------|----------------|--------------|-------|
| 36 | EAP Module — Full Lifecycle | As a treating physician I can submit an EAP request and track it through medical review, regulatory pathway, supply coordination, and treatment | EAP intake form, eligibility assessment workflow, regulatory pathway selector (individual / intermediate / treatment IND), supply tracking, case management | XL | Full stack, Regulatory domain knowledge (21 CFR 312 Subpart I) | Sprint 1 shared foundation fully complete | Software + managed-service support model. Most regulatory complexity of all three modules. |
| 37 | EAP Emergency Pathway | As a physician with an urgent patient case I can trigger an emergency EAP pathway with accelerated SLA and escalation triggers | Emergency flag on intake, fast-track state machine (distinct from standard EAP flow), 4–6 hour SLA monitoring, escalation trigger on SLA breach | L | Backend, Frontend | #36 | Distinct flow from standard EAP. Do not merge these two paths. |
| 38 | EAP Safety & PV Integration | As a pharmacovigilance officer I can log and track adverse events linked to an EAP case within IEG | SAE/SUSAR capture form, PV workflow linkage, safety report generation, audit linkage | L | Backend, Safety/PV domain knowledge | #36 | EAP-specific feature. Not applicable to Grants or IIT. |
| 39 | Veeva Vault DMS Integration | As a user I can connect IEG documents to Veeva Vault for clients who use it as their primary DMS | Veeva Vault API integration, document sync, metadata mapping, bidirectional status updates | L | Backend, Veeva API, Integration architecture | Sprint 1 DMS (#8) — integration interface designed in Sprint 1 | Integration hooks are designed in Sprint 1. Sprint 2 builds the actual integration using those hooks. |
| 40 | SharePoint DMS Integration | As a user I can connect IEG documents to SharePoint for clients who use it | SharePoint Graph API integration, document sync, folder mapping, metadata alignment | M | Backend, Microsoft Graph API | Sprint 1 DMS (#8) | Same integration interface pattern as Veeva. Design once, configure per client. |
| 41 | ClinicalTrials.gov Registry Linkage | As a medical affairs manager I can link an IIT study to its ClinicalTrials.gov registration and track registry status within IEG | ClinicalTrials.gov API integration, registry ID linkage to IIT record, status sync, update notifications | M | Backend, API integration | Sprint 1 IIT (#32, #34) | Deferred from Sprint 1 deliberately. Sprint 1 tracks publication milestones only. Sprint 2 adds registry linkage. |
| 42 | Cross-Module Request Conversion | As a medical affairs manager I can convert a rejected IIT proposal into a Grant application with full traceability — original record, rejection reason, conversion decision, and new grant lifecycle all linked | Conversion workflow, source record linkage, audit chain continuity across modules, new module lifecycle initiation from conversion | L | Backend, Frontend | Sprint 1 complete — both Grants and IIT modules done | Architecture supports this from Sprint 1. UI and conversion workflow built in Sprint 2. Full audit trail must follow the request through conversion. |
| 43 | AI Summaries | As a reviewer I can view an AI-generated summary of a submitted application to accelerate my review | LLM API integration, summarisation prompt design, summary display UI, human override always visible and available | M | Backend, LLM API integration, Prompt engineering | Sprint 1 complete | Summaries only — no decision making. Always labelled as AI-generated. Human reviewer always in control. |
| 44 | AI Recommendation Scoring | As a committee member I can see an AI-generated merit score with reasoning as a decision support input | Scoring model integration, confidence score display, reasoning explanation panel, mandatory human override — decision always human | L | Backend, LLM/ML, Frontend | #43 | Clearly labelled as decision support only. AI does not approve or reject. Human decision is always required and recorded separately. |
| 45 | ERP Disbursement Export | As a finance user I can export approved disbursement records in a format compatible with the client's ERP system | Export adapter framework, configurable field mapping per client ERP, file format options (CSV / XML / JSON) | M | Backend, Integration | Sprint 1 disbursement model (#15) | Built when first pilot client identifies their specific ERP format requirement. Adapter pattern — one framework, multiple ERP configs. |
| 46 | Global Compliance Overlay | As a superadmin I can activate country-specific compliance rules for EU and other jurisdictions overlaid on the US base ruleset | Additional jurisdiction rulesets (EU transparency, GDPR implications, local PhRMA equivalents), country parameter configuration, overlay execution on top of US base rules | XL | Backend, Compliance domain knowledge (EU, APAC regulations) | Sprint 1 compliance layer (#11) — jurisdiction-parameterised engine is the prerequisite | US ruleset proven with pilot client before global expansion. Do not build global overlay until US v1 is validated. |
| 47 | Advanced Analytics Dashboard | As a Medical Affairs director I can view portfolio-level KPIs across Grants and IIT — cycle time, approval rate, budget variance, compliance exceptions, outcome impact | Analytics data model, KPI computation engine, portfolio dashboard UI, date range filters, export to CSV/PDF | L | Backend, Data/Analytics, Frontend | Sprint 1 complete | Basic per-record analytics visible in Sprint 1. Portfolio-level aggregation and KPI dashboard built in Sprint 2. |
| 48 | Configurable Termination & Escalation Policies | As a superadmin I can configure termination and escalation rules per company SOP with system defaults as baseline | Policy configuration UI, default policy model (hardcoded baseline), override capability, trigger engine linked to workflow state machine | M | Backend, Frontend | Sprint 1 workflow state machine (#6), approval matrix (#14) | Hardcoded defaults ship in Sprint 1. Sprint 2 makes them configurable per client company SOP. |

---

## IN-BETWEEN FEATURE RULES — Sprint 2
> Same rules as Sprint 1 apply. No exceptions for Sprint 2 features.

| Rule | What It Means |
|------|--------------|
| No feature ships without audit log coverage | Every Sprint 2 action logged. EAP case actions, AI summary generation, conversion decisions — all audited. |
| No feature ships without role enforcement tested | Every new Sprint 2 endpoint tested with wrong-role user. Must get 403. |
| No feature ships without negative path tested | EAP emergency pathway — test non-emergency submitted as emergency. AI scoring — test with incomplete application. |
| EAP external portal enforces same boundary as Grants/IIT | Treating physicians (EAP) never see internal workflow stages. Same enforcement pattern as Sprint 1. |
| AI features must never appear to make autonomous decisions | Every AI output has a visible 'AI-generated' label. Every decision record captures human decision separately from AI input. |
| Integration features must fail gracefully | Veeva, SharePoint, ClinicalTrials.gov integrations must handle API downtime without breaking core IEG workflow. Fallback to native DMS always available. |
| Cross-module conversion must maintain full audit chain | The audit trail for a converted request must be one continuous chain — not two disconnected records. |

---

## EAP Module — Additional Context for External Team

EAP is the most regulated and time-sensitive module. The external team must understand the following before building it:

### Regulatory Pathway Types (21 CFR 312 Subpart I)
| Pathway | When Used | Key Characteristic |
|---------|----------|-------------------|
| Individual Patient IND | Single patient, non-emergency | Standard review cycle — 30 days FDA review unless waived |
| Emergency IND | Single patient, life-threatening emergency | FDA verbal/phone authorization possible within hours |
| Intermediate-size population | Multiple patients, pre-commercial drug | Requires IND submission, IRB oversight |
| Treatment IND/Protocol | Large population, drug awaiting approval | Most structured pathway — closest to a trial |

### EAP Patient Data Stance — Minimal PHI
IEG EAP captures only what is necessary to process the request:
- Case reference number
- Condition category (not diagnosis text)
- Urgency flag
- Treating physician identity
- Drug requested

IEG does **not** store patient name, date of birth, medical history, or diagnosis detail. The treating physician retains that in their clinical system. This keeps IEG out of full HIPAA scope at v1.

---

## SKILL SUMMARY — SPRINT 2

| Skill | Usage Level | Notes |
|-------|------------|-------|
| Backend (Node.js) | Critical | All features |
| Frontend (React) | Critical | All UI features |
| Regulatory Domain Knowledge (EAP) | Critical | 21 CFR 312 Subpart I — EAP pathways, emergency handling |
| Safety/PV Domain Knowledge | Required | EAP adverse event capture and reporting |
| LLM / Prompt Engineering | Required | AI summaries and recommendation scoring |
| API Integration | High | Veeva Vault, SharePoint, ClinicalTrials.gov, ERP adapters |
| Compliance Domain Knowledge (Global) | Required | EU transparency laws, GDPR implications for global overlay |
| Data / Analytics | Required | Portfolio KPI dashboard |
| Microsoft Graph API | Required | SharePoint integration |
| Veeva API | Required | Veeva Vault integration |

---

## Handover Notes

These two files (IEG_SPRINT1_SCOPE.md and IEG_SPRINT2_SCOPE.md) are the complete handover package for the external development team.

Before the external team begins Sprint 1:
1. Read both files in full
2. Complete all pre-development checklist items in IEG_SPRINT1_SCOPE.md
3. Submit all 10 data model designs for Rajeev/Bhavya review
4. Get architecture decisions confirmed with Rajeev and Varun
5. Do not write any application code until data models are signed off

Questions during development go to:
- Architecture decisions → Rajeev (CTO)
- Engineering direction and task assignment → Varun (Senior Director of Software Systems)
- Product and feature scope → Vanaja (Director of Product Management)
- User stories and acceptance criteria → Vinay (Product Owner)
- Project tracking and gate approvals → Bala (Director of Project Management)
- Final approval → Rohith (CPO)
