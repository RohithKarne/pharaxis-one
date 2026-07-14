# Pharaxis Vault Product Roadmap and Discovery Plan

> Status: Draft for team discussion. This is planning work only; it does not authorize development.
>
> Requested by: Rohith Karne, CEO & Co-Founder
>
> Product owner: Saad Rahman, CPO
>
> Proposed discovery window: 15 working days (three weeks)
>
> Gate: No Vault feature development may start until the discovery outputs are reviewed and Rohith gives Gate 1 approval.

## 1. Decision and purpose

The team will pause daily Vault feature development and first agree a single product roadmap. The goal is to turn the current Vault foundation into an intentional, sequenced product plan, from the shared workspace header through every user workflow, administration area, and cross-application integration.

This avoids building screens or APIs before the team agrees on the problem, user, business rule, data ownership, validation requirement, and expected user-facing outcome.

## 2. Current baseline observed in the repository

This is an engineering inventory, not a product-readiness sign-off.

| Area | Existing foundation observed | Discovery question |
|---|---|---|
| Tenant and identity | Organisation login, roles, superadmin flows, MFA and SSO discovery foundations | Which roles, organisation model, and authentication policies are needed for the intended customers? |
| Workspace shell | Global header, navigation groups, search, create actions, notifications, user context | Does the information architecture match the primary work users need to do each day? |
| Controlled content | Folders, upload, metadata, numbering, versions, checkout/check-in, lifecycle, viewer, watermarking, search | Which document classes and control rules are required for the first target use case? |
| Work management | Workflow templates, tasks, delegation, reminders, notifications, sign-off | Which approval workflow is genuinely required, and who may act at each stage? |
| Governance | Audit trail, retention, expiry, training, content channels, reports | What compliance commitments apply and what evidence must Vault retain? |
| Administration | Users, taxonomy, lifecycle configuration, security, integrations, setup wizard | What must an organisation administrator configure before business users start? |
| Platform and integrations | Connector registry, webhooks, distribution, AI-facing endpoints, suite integration paths | Which integrations are valuable enough to be in the first release, and what is the source of truth for each data object? |

The April Sprint 1 status document records all original foundation features as complete, with four Playwright tests passing at that time. That is useful historical evidence, but it is not a current product or release approval. Any chosen roadmap item will need its own current functional and browser evidence.

## 3. Product framing to agree before feature design

### Proposed product outcome

Pharaxis Vault should be a trusted controlled-content workspace for life-sciences teams: users can create, govern, find, review, approve, distribute, and prove use of the right document version without losing tenant isolation or auditability.

### Initial user groups to validate

| User group | Primary job | Decisions needed |
|---|---|---|
| Content author | Create and update controlled content | Author permissions, mandatory metadata, check-in and version rules |
| Reviewer / approver | Review content and provide a governed decision | Workflow steps, e-signature expectations, delegation, overdue handling |
| Business reader | Find and use the current approved document | Search, view/download controls, read-and-understood requirements |
| Organisation administrator | Configure users, taxonomy, lifecycle, and policies | Setup sequence, policy boundaries, administration permissions |
| Pharaxis superadmin | Provision and support organisations | Tenant support model, visibility limits, audit obligations |
| Compliance / quality owner | Demonstrate control, traceability, and retention | Applicable controls, evidence, retention, audit exports |

### Product questions that must be answered

1. Which customer workflow is first: medical-information content, quality documents, regulatory dossiers, or another clearly defined use case?
2. Which document types, lifecycle states, metadata fields, and approval rules are mandatory for that workflow?
3. Which regulated requirements apply to the first release: GxP, 21 CFR Part 11, privacy, computer-system validation, or customer-specific controls?
4. What is the intended separation between Vault and MIMS, CP Portal, QMS, and AI-Agent?
5. Which integration is first, what data crosses the boundary, and which application owns that data?
6. What measurable outcome will prove the first release is useful: faster approval, fewer expired documents used, faster retrieval, reduced manual audit effort, or another outcome?

## 4. Discovery workstreams

### A. Workspace experience, from the header down

The current workspace shell gives us a concrete starting point. Discovery will decide each element's job, visibility, permissions, state, and acceptance criteria before design or implementation begins.

| Layer | Components to review | Required decision/output |
|---|---|---|
| Global header | App launcher, Vault identity, global search, search scope, create menu, notifications, user menu | What is universal, role-based, contextual, or unnecessary? Define search scope and notification behaviour. |
| Primary navigation | Home, Library, Document Actions, Lifecycle, Training, Reports, Administration | Confirm labels, hierarchy, default landing page, and role visibility. |
| Workspace home | Content list, folder tree, filters, recent activity, actionable work | Define the first-screen decision a user needs to make and the data that supports it. |
| Content creation | Upload, document numbering, metadata, folder selection, validation, duplicate handling | Specify fields, defaults, ownership, validation, and failure messages. |
| Content detail | Record header, metadata, version history, viewer, lifecycle tracker, audit information | Define the single source of truth, allowed actions by state, and visible evidence. |
| Find and use | Search, filters, saved searches, viewer, download/share controls | Define relevance, permissions, document state visibility, and empty/error states. |
| Govern work | Lifecycle, review tasks, sign-off, delegation, notifications, expiry | Define state machine, time limits, escalation, delegation, and e-signature rules. |
| Operational tools | Dossiers, slots, training, bulk operations, reports, intelligence | Rank by customer value; identify which are first-release essentials versus later capabilities. |
| Administration | Users, taxonomy, policies, channels, integrations, security, audit | Define onboarding order, tenant boundaries, administrative controls, and support model. |

### B. Core business workflows

Each selected workflow will be documented end-to-end, including normal, negative, permission, and recovery paths.

1. Organisation onboarding and first administrator setup.
2. Author creates a controlled document and supplies required metadata.
3. Reviewer receives, reviews, comments on, and approves or rejects content.
4. Approved document becomes the available version for readers.
5. Reader finds the document, verifies its status, and records acknowledgement when required.
6. Document approaches expiry, is updated, superseded, archived, or retained according to policy.
7. Administrator audits the complete history and produces evidence.
8. A selected external application consumes approved content and shows it to its own user.

### C. Data, security, compliance, and integration architecture

| Topic | Owner | Discovery output |
|---|---|---|
| Tenant isolation, roles, and access model | Varun + Anirudh | Role-permission matrix and organisation boundary rules |
| Content and metadata model | Bhavya + Saad | Canonical object model, mandatory fields, version rules, retention ownership |
| Compliance and validation | Vasu + Kiranmai | Applicable-control assessment, validation evidence expectations, audit and signature decisions |
| Workflow and notifications | Saad + Varun + Bhavya | State diagram, service-level rules, delegation and escalation decisions |
| Cross-application integration | Anirudh + Varun | Integration contract: source of truth, events/API, identity mapping, retries, audit events, error ownership |
| AI capability | Mark + Saad | Value proposition, permitted data, evaluation plan, human-review boundary; defer if not clearly justified |
| Clinical content impact | Sowmya | Clinical accuracy review where content affects medical-affairs or safety practice |

For every integration, discovery must identify both the sending flow and the receiving screen. The acceptance criteria must require proof that the data is visible and usable in the receiving application's user interface, not merely stored or returned by an API.

## 5. Three-week roadmap

This is a planning calendar, not a delivery promise for production features.

| Week | Focus | Planned sessions and outputs | Accountable owners |
|---|---|---|---|
| 1: Product and experience baseline | Establish the target customer workflow and review the current product from header to content detail | Product charter; persona and job map; screen inventory; navigation and header decisions; workflow map; prioritised list of existing capabilities to retain, revise, or defer | Saad leads; Rohith decides direction; Bhavya supplies current-state evidence; Varun and Anirudh flag feasibility |
| 2: Rules and system design | Make every selected workflow buildable and testable | User stories; acceptance criteria; field catalogue; lifecycle/workflow decisions; permissions matrix; compliance assessment; integration contracts; risks and dependencies | Saad, Varun, Bhavya, Anirudh, Vasu, Kiranmai; Mark and Sowmya where relevant |
| 3: Build readiness and approval | Convert agreed product decisions into a sequenced delivery plan | Release slices; backlog ordered by customer value and dependency; exact engineering task scopes; QA test plan; environment/data needs; Gate 1 pack; unresolved decisions list | Varun and Bhavya prepare technical scopes; Kiranmai and Krishnapriya prepare QA; Bala coordinates; Rohith approves or returns for revision |

### Suggested cadence

| Day | Session | Expected outcome |
|---|---|---|
| 1 | Kick-off and product vision | Confirm intended customer, primary workflow, success measure, and discovery boundaries |
| 2 | Header, navigation, and workspace review | Approve or revise the information architecture and core screen roles |
| 3 | Content creation and record-detail workshop | Agree metadata, versioning, lifecycle, and evidence requirements |
| 4 | Review, approval, notification, and expiry workshop | Agree state transitions, roles, exceptions, and escalation |
| 5 | Week 1 review | Confirm product baseline, key decisions, and open questions |
| 6 | Administration, tenant, and security workshop | Confirm provisioning, policy, access, and support model |
| 7 | Compliance and validation workshop | Identify required controls and required test/audit evidence |
| 8 | Integration architecture workshop | Select the first integration and approve its data ownership and verification plan |
| 9 | Operational modules workshop | Prioritise dossiers, slots, training, reporting, bulk operations, and intelligence |
| 10 | Week 2 design review | Freeze the proposed first release scope or record disputed decisions |
| 11 | Story and acceptance-criteria review | Ensure no selected item has undefined business rules or edge cases |
| 12 | Engineering task-scope review | Map each approved story to frontend, backend, API, database, and integration work |
| 13 | QA and validation planning | Draft happy, negative, boundary, regression, browser, and integration-receiving-UI cases |
| 14 | Roadmap and release-slice review | Sequence work by dependency and identify Gate 1 blockers |
| 15 | Gate 1 readiness review | Present the completed planning pack to Rohith; request approval only if every required input is ready |

## 6. Required artefacts before Gate 1 can be requested

1. Product charter, target customer, primary workflow, and success measures.
2. Approved information architecture and screen inventory, including header and navigation decisions.
3. Prioritised roadmap with explicit first-release scope, deferred work, and rationale.
4. User stories with acceptance criteria, business rules, and edge cases for every first-release item.
5. Permissions matrix and tenant-boundary rules.
6. Content model, metadata catalogue, lifecycle, workflow, and audit-evidence requirements.
7. Compliance-impact assessment and validation approach where applicable.
8. Integration contracts with source of truth, error handling, audit events, and receiving-screen verification criteria.
9. Detailed engineering task scopes with file/component/API/data impacts for every approved task.
10. QA test plan covering happy path, negative path, boundary conditions, regression, and browser evidence.
11. A decision log and a list of open blockers requiring Rohith or Varun's decision.

## 7. Release sequencing principle

The first delivery slice should prove one complete controlled-content journey for one customer workflow. It should not attempt to activate every module already present in the codebase.

Proposed sequencing criteria:

1. Safety and compliance necessity.
2. Direct customer value for the chosen workflow.
3. Dependency on identity, tenancy, content model, or workflow rules.
4. Ability to verify the experience end-to-end in the real user interface.
5. Cross-application impact and operational risk.

## 8. Decisions for the team discussion

| Decision | Options to consider | Decision owner |
|---|---|---|
| First customer workflow | Medical information, quality documents, regulatory dossier, another defined workflow | Rohith + Saad |
| First release boundary | One end-to-end controlled-content workflow, or a broader multi-module release | Rohith + Saad + Varun |
| First integration | No integration in first slice, MIMS, CP Portal, QMS, or AI-Agent | Rohith + Varun + Anirudh + Saad |
| Compliance baseline | Minimum internal controls, customer-specific controls, or a formal regulated baseline | Rohith + Vasu |
| AI scope | Defer, assist search/classification, or another constrained use case | Saad + Mark + Rohith |
| External client involvement | Internal planning only, or bring Katrina into a later product-review session | Rohith |

## 9. Approval statement

This document authorises only the three-week discovery, analysis, and planning activity described above. It does not authorise Vault feature implementation, database changes, integration activation, or release work.

Development may begin only after the team completes the Gate 1 package and Rohith explicitly approves it in the chat.
