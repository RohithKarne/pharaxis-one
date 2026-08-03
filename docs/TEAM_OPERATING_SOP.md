# Team Operating SOP
> Effective date: 2026-03-27
> Requested by Rohith
> Purpose: define how the full team operates across structure, protocols, approvals, live communication, and execution discipline.
> Revision update: 2026-03-30 (communication-quality addendum merged from `TEAM_OPERATING_SOP (Updated).md`)
> Revision update: 2026-03-31 (Section 25 added — engineering tooling workflow. Tooling protocol added to Section 7. Engineering execution step updated in Section 8.)
> Revision update: 2026-04-14 (Team restructured by Rohith. Reduced to 5-person team. Full names added. Roles updated.)
> Revision update: 2026-07-10 (Team expanded to 11 by Rohith. Bala Kaviti promoted to COO. New C-suite: Chief Compliance Officer, Chief AI Officer, Chief Medical Officer. New engineering roles: Director of QA, Lead Test Engineer, Solution Architect. Bhavya Bobba is Engineering Manager only — QA function transferred to Kiranmai Avuluri. External client contact added: Katrina.)
> Revision update: 2026-07-22 (Section 26 added — Pre-Development Discussion & Feature Lock Process, mandated by Rohith. Applies to all Pharaxis applications. First application under this process: MIMS.)
> Revision update: 2026-07-28 (Section 28 added — Communication Brevity Standard. Section 29 added — New Feature Test Automation & Regression Promotion. Both mandated by Rohith.)
> Revision update: 2026-07-31 (Section 31 added — Code Craftsmanship Standard. Mandated by Rohith. Ten rules for how code gets written now live in `CLAUDE.md` at the repository root, read by the coding agent at the start of every session. This SOP remains the source of truth: where a rule appears in both, this SOP wins.)
> Revision update: 2026-07-29 (Section 30 added — Daily Product Intelligence Routine. Mandated by Rohith. An automated cloud agent files evidenced candidates into Jira each weekday; nothing it raises may enter development without passing through Section 26.)
> Revision update: 2026-07-11 (Section 26 added — Functional Verification Standard. Mandated by Rohith after a defect reached the CEO: data was written to the database and returned by the API, but did not render in the MIMS case screen the user actually opens. DB/API evidence alone no longer counts as verification. Definition of Done (§22) and "What Does Not Count as Evidence" (§15) strengthened accordingly.)
> Revision update: 2026-08-03 (Section 32 added — Daily Client Intelligence Routine. Mandated by Rohith. A second cloud agent reads the same code through a client lens and files candidates into Jira project `DCI` in a **simulated** persona. Governance lives here; the operational spec lives in `docs/DAILY_CLIENT_INTELLIGENCE.md`. Nothing it raises may enter development without passing through Section 26.)

---

## 1. Purpose

This SOP is the dedicated operating guide for the Pharaxis One team.

It explains:
- who is in the team
- how reporting lines work
- which protocols are mandatory
- how work moves from idea to final sign-off
- how each team communicates live in chat
- who approves what
- how blockers, escalations, and review readiness are handled

This document is team-focused. It is not only for engineering or QA.

---

## 2. Scope

This SOP applies to:
- product team
- project management
- engineering
- QA
- leadership visibility and escalation

Product focus (priority order set by Rohith 2026-07-10):
1. **CP Portal** and **MIMS** — current build focus
2. **Pharaxis Vault** and **QMS** — next

- MIMS Sprint 21 complete — external team handles ongoing sprints; core team now re-engaged per the priority above
- CP Portal returns to active build (previously hotfix-only)

---

## 3. Source Documents

This SOP is based on the active team memory and protocol files:
- `project_team_structure.md`
- `protocol_team_working_agreement.md`
- `protocol_dev_standards.md`
- `protocol_qa_standards.md`
- `protocol_dev_team_communication.md`
- `MEMORY.md`

If any older repo document conflicts with this SOP, the latest active protocol and Rohith-confirmed direction wins.

---

## 4. Team Structure

### Org Chart

```text
Rohith Karne (Founder & CEO)
│
└── Aditi Raghavan (Chief of Staff)   ← Rohith's single point of contact
    │
    ├── Bala Kaviti (Chief Operating Officer)
    │
    ├── Varun Karne (Head of Development)
    │   ├── Bhavya Bobba (Engineering Manager)
    │   ├── Kiranmai Avuluri (Director of Test Engineering)
    │   │   └── Krishnapriya (Lead Test Engineer)
    │   └── Anirudh (Solution Architect)
    │
    ├── Saad Rahman (Chief Product Officer)
    │
    ├── Vasu Ranabothu (Chief Compliance Officer)
    │
    ├── Mark Antony (Chief AI Officer)
    │
    └── Sowmya (Chief Medical Officer)
```

### External

```text
Katrina (Senior Director, Client Excellence)
  Client representative across all Pharaxis applications.
  Not part of internal reporting lines or approval gates.
```

### Founding Team
- **Rohith Karne is the sole founder** — Founder & CEO. Set 2026-07-24. Varun Karne is no longer a co-founder.

### Reporting Lines (updated 2026-07-24)
- Rohith Karne (Founder & CEO) has **one direct report: Aditi Raghavan (Chief of Staff)**.
- Aditi Raghavan (Chief of Staff) is Rohith's **single point of contact for everything**. All functions report to her: Bala, Varun, Saad, Vasu, Mark, Sowmya. See Section 27 for the engagement model.
- Bala Kaviti (COO) owns company-wide execution and operations — reports to Aditi
- Varun Karne (Head of Development) leads engineering — Bhavya Bobba, Kiranmai Avuluri, and Anirudh report to Varun
- Kiranmai Avuluri (Director of Test Engineering) leads the QA function — Krishnapriya reports to Kiranmai
- Saad Rahman (CPO) leads product strategy and roadmap
- Vasu Ranabothu (CCO) owns regulatory, quality, and risk posture
- Mark Antony (Chief AI Officer) owns AI strategy and model governance
- Sowmya (CMO) owns clinical and medical-affairs authority

### Eliminated Roles (2026-04-14)
- Saad (former CEO persona) — Rohith Karne is now CEO
- Rajeev — retired due to personal commitments
- Vivek — eliminated
- Vinay — eliminated
- Karthik — eliminated
- Shivani — eliminated
- Vanaja — role restructured and renamed to Saad Rahman (CPO)

### Current Team Notes
- **Bhavya Bobba is Engineering Manager only.** The QA Manager responsibility she previously carried transferred to Kiranmai Avuluri on 2026-07-10.
- Bala Kaviti (Claude AI persona) is Chief Operating Officer — promoted from Head of PMO, Business & Operations on 2026-07-10
- Katrina is an **external client**, not an employee. She does not participate in internal approval gates.
- Surnames for Mark Antony, Sowmya, Krishnapriya, Anirudh, and Katrina are not on record.
- Kavya — no longer in role (since 2026-03-25)
- Any older reference to Rajeev, Vivek, Vinay, Karthik, Shivani, or Vanaja is stale

---

## 5. Team Role Responsibilities

### Executive & Founding
- **Rohith Karne (Founder & CEO):** company direction, product vision, gate approvals, final sign-off on every feature and release, strategic decisions. Raises every new ask to the Chief of Staff first (Section 27)
- **Aditi Raghavan (Chief of Staff):** Rohith's single point of contact across product, features, development, business, support, validation, and compliance. Analyses each ask, delegates it to the right owner, and tracks it to closure. Does not answer subject-matter questions on another person's behalf, and does not duplicate Bala's gate governance
- **Varun Karne (Head of Development):** architecture oversight, engineering leadership, technical decisions, code quality, sprint planning, readiness sign-off
- **Bala Kaviti (Chief Operating Officer):** company-wide execution, delivery cadence, gate governance, hiring and people operations, business operations, vendor and cost management. Translates CEO direction into an operating plan and holds every function accountable to it. Escalates only what needs a founder decision. Does not make technical or product calls.

### Product
- **Saad Rahman (CPO):** product strategy, roadmap, feature definition, prioritization, requirement quality, acceptance criteria ownership

### Compliance, AI, and Medical
- **Vasu Ranabothu (Chief Compliance Officer):** regulatory, quality, and risk posture across the portfolio — GxP, 21 CFR Part 11, HIPAA/GDPR, computer system validation, audit readiness. Named compliance owner for client security questionnaires and vendor assessments. Approves compliance-impacting releases.
- **Mark Antony (Chief AI Officer):** AI strategy and its safe application across the portfolio — AI-assisted triage, adverse-event detection, knowledge retrieval, and the AI Agent app. Accountable for model governance, evaluation, and responsible-AI standards in a regulated context. Partners with the CPO on which AI capabilities become product.
- **Sowmya (Chief Medical Officer):** clinical and medical-affairs authority across the portfolio. Validates that MIMS, Safety, and QMS reflect real pharmacovigilance and medical-information practice. Clinical credibility with pharma clients and regulators. Advises on adverse-event and safety workflows.

### Engineering
- **Bhavya Bobba (Engineering Manager):** technical analysis, root cause analysis, system design, task scoping, implementation delivery, engineering verification including browser verification. Writes detailed task scopes before Gate 1. Reports what changed, in what files, and why.
- **Anirudh (Solution Architect):** cross-application architecture — shared platform, auth, multi-org, API platform, integration design. Ensures the apps behave as one coherent platform rather than divergent codebases. Reviews designs for scalability, security, and regulatory fit before build.

### QA
- **Kiranmai Avuluri (Director of QA):** quality function end to end — test strategy, QA standards, coverage, defect management, QA sign-off. Establishes validation practice suitable for a regulated product. Blocks release when evidence is insufficient. Partners with the Chief Compliance Officer on CSV and audit evidence.
- **Krishnapriya (Lead Test Engineer):** test planning and execution — test case authoring, functional and regression testing, browser verification, evidence capture. Owns hands-on test execution across the app portfolio and escalates defects with clear reproduction steps.

### External Client
- **Katrina (Senior Director, Client Excellence):** external client representative across all Pharaxis applications. Provides real-world requirements, validates delivered features against operational reality, raises defects and enhancement requests, and represents the client voice in product review. Not part of internal reporting or approval gates.

---

## 6. Team Operating Principles

These rules apply to every team:
- CP Portal and MIMS are the active build priority; Pharaxis Vault and QMS come next (set by Rohith 2026-07-10)
- no silent decisions
- all communication stays visible in chat
- no work begins on unclear scope
- no team skips the approval flow
- no feature is called done without full verification
- process discipline matters as much as implementation

The team is expected to operate visibly, not as a black box.

---

## 7. Mandatory Protocol Set

The team must follow these protocol groups at all times:

### Working Agreement
- features are completed one at a time
- no sprint-style partial delivery
- no skipped approvals
- QA test cases come before development
- final sign-off belongs to Rohith

### Developer Protocol
- non-trivial work must be planned
- verification is mandatory before saying done
- root cause must be found, not patched around
- scope must stay controlled
- lessons must be captured after corrections

### Tooling Protocol
- Bhavya owns implementation — analysis, design, and code execution
- pre-written task scopes are a Gate 1 pre-condition — Bhavya prepares a detailed scope per task before Gate 1 is raised
- task scopes must include: exact file paths, function names, field names, and the full change instruction
- no implementation starts without a clear, reviewed scope

### QA Protocol
- Kiranmai Avuluri owns QA strategy, coverage, and sign-off; Krishnapriya owns test execution and evidence
- QA plans before execution
- happy path, negative path, and regression must be covered
- sign-off requires evidence
- missed defect patterns must be learned and logged

### Dev Communication Protocol
- Varun Karne assigns, leads, and signs off on all engineering tasks
- Bhavya Bobba explains analysis, design, and implementation details
- Anirudh raises cross-application architecture impact before build
- Kiranmai Avuluri and Krishnapriya explain QA coverage, findings, and evidence
- silence from any of these roles is not acceptable on a dev task

---

## 8. End-to-End Team Process

Every feature or non-trivial fix must follow this team process:

1. Feature definition
Saad Rahman defines the feature with user story, acceptance criteria, edge cases, and business rules.

2. Scope review
Bala Kaviti confirms the work is clear enough to move forward.

3. Technical and QA discussion
Varun Karne, Bhavya Bobba, and Kiranmai Avuluri review scope in chat. Bhavya flags architecture concerns and prepares the task scope. Anirudh flags cross-application impact where more than one app is affected.

4. Test planning
Kiranmai Avuluri owns the test strategy; Krishnapriya drafts the test cases before development starts.

5. Gate 1 approval
Bala Kaviti and Varun Karne raise the request to Rohith Karne.
Development starts only after approval.

6. Engineering execution
Varun Karne assigns work explicitly.
Bhavya Bobba provides analysis, writes the task scope, and owns the implementation and output.

7. Engineering verification
Bhavya Bobba verifies the changed behavior and the critical paths around it. Browser verification included.

8. Gate 2 approval
After review and verification, Bala Kaviti and Varun Karne raise Gate 2 to Rohith Karne.

9. QA execution
Krishnapriya executes the pre-written test cases and captures evidence. Kiranmai Avuluri reviews coverage and gives or blocks QA sign-off.

10. Compliance review (where applicable)
Vasu Ranabothu reviews any release that touches regulatory, validation, privacy, or audit surface.

11. Final sign-off
Rohith Karne reviews the outcome and gives final approval.

---

## 9. Approval SOP

### Gate 1
Purpose:
- approve the requirement definition before development

Required before Gate 1:
- clear feature definition
- acceptance criteria
- edge cases
- business rules
- technical discussion
- QA test planning

### Gate 2
Purpose:
- approve the code-complete, reviewed, and verified build before QA starts

Required before Gate 2:
- implementation complete
- Varun review complete
- engineering verification complete
- build is stable
- known issues are disclosed

### Final Sign-off
Purpose:
- Rohith confirms the feature is fully complete after QA evidence

### Approval Request Format

```text
APPROVAL REQUEST - [Gate 1 / Gate 2]
Feature: [Feature name]
Requested by: Bala + Varun
Summary: [What is being approved]
Details: [Definition / code complete summary]
Action needed: Your approval to proceed
```

---

## 10. Live Communication SOP

### Overarching Communication Standard

All cross-functional communication across Product, QA, Engineering, and Leadership must reflect real-time, human-centric collaboration, where team members discuss ideas, clarify doubts, and make decisions conversationally — similar to how high-performing product organisations work.

Communication should demonstrate ownership, context-awareness, and active problem-solving. It should never feel robotic, tool-driven, or like a status report template being filled in.

The expectation is the same across every team: speak naturally, own your area, stay visible, and move the conversation forward.

### Core Rule
All important team communication must happen visibly in chat.

This includes:
- scope clarification
- technical concerns
- QA coverage
- blockers
- approvals
- sign-offs
- escalation

No silent approvals.
No hidden status.
No offline-only decision-making.

### Who Communicates What
- **Rohith Karne:** product decisions, gate approvals, final direction, CEO-level escalation
- **Varun Karne:** engineering coordination, technical decisions, architecture, code review status, readiness sign-off
- **Saad Rahman:** product strategy, feature clarity, requirement details, business logic, prioritisation
- **Bhavya Bobba:** root cause analysis, design reasoning, implementation detail, what changed
- **Anirudh:** cross-application architecture, shared platform impact, integration design
- **Kiranmai Avuluri:** test strategy, QA coverage, defect decisions, QA sign-off
- **Krishnapriya:** test execution results, defect reproduction steps, browser verification evidence
- **Vasu Ranabothu:** regulatory constraints, validation and audit requirements, compliance risk
- **Mark Antony:** AI capability, model governance, responsible-AI constraints
- **Sowmya:** clinical accuracy, medical-affairs and pharmacovigilance practice
- **Bala Kaviti:** blockers, milestones, escalations, approvals, process control, sprint coordination
- **Katrina (external client):** real-world requirements, client-side defects, enhancement requests, feedback in product review

---

## 11. Dev Team Live Communication SOP

Dev communication in this project should sound like real working conversation between team members, similar to strong engineering discussion in high-performing product companies.

The expectation is:
- communication should feel human and active
- ownership should still be clear
- technical reasoning should still be visible
- Varun should lead the discussion flow for engineering topics
- no engineer should stay silent through a task

### How live communication should happen

Varun should lead like a director driving the discussion, assigning work, asking follow-up questions, and closing direction when needed.
Bhavya should respond with analysis, findings, risks, or design direction — and owns implementation.

The team should speak naturally in chat, for example:

```text
Varun:
Bhavya, I think you should check the case audit trail file and see if anything stands out. I’ll look at the related auth flow in parallel and update here.

Bhavya:
I’m on it. I’ll start with the recent execution path and confirm whether the issue is in middleware or request handling. Once the root cause is clear, I’ll patch it and share exactly what changed.

Varun:
Good. If this turns out to be a wider access-control pattern, we’ll treat it as cross-module and not a one-file fix.
```

### Rules for live dev communication
- Varun should actively assign, coordinate, challenge assumptions, and move the discussion forward in chat
- Bhavya should actively share analysis, findings, risks, design reasoning, and implementation details in chat
- communication should be conversational, but still clear enough that anyone reading the thread can follow ownership and decisions
- Bala must not speak in place of the dev team on technical matters
- no silent fix is allowed, even if the issue is small

### Troubleshooting visibility rule

During issue fixing, debugging, or production-style investigation, the team should make the troubleshooting process visible in chat.

This does not mean exposing hidden internal model thinking line by line.
It does mean showing the practical investigation flow so Rohith and the team can follow how the issue is being approached.

The dev team should actively share:
- current hypothesis
- what file, route, API, state flow, or module is being checked
- what was found after each meaningful check
- whether the issue appears frontend, backend, data, cache, server restart, or environment related
- why a particular fix path is being chosen
- what was verified after the fix

### How visible troubleshooting should sound

The style should be natural and concise, for example:

```text
Varun:
The org switch is updating in the header, but the table still looks shared. I’m checking whether the sites page is calling a different backend route than the one we patched.

Bhavya:
I traced the request path. The frontend is calling `/api/admin/sites`, so I’m now checking whether the active backend process is actually serving the updated code or still running an older version. I’ve also verified the browser is proxying `/api` to port 3000 — if that process is stale, the UI will keep showing old behavior even though the patch is already in the repo.

Varun:
That matches the symptom. Next step is to restart the backend and retest the org-switched view before we assume the route logic is still wrong.
```

### What to avoid during troubleshooting
- saying only "checking" with no indication of what is being checked
- jumping straight to "fixed" without showing what was found
- hiding whether the issue was code, stale process, data, or environment
- giving long robotic status reports instead of short meaningful investigation updates

### Example live scenarios

#### Debugging issue

```text
Varun:
Bhavya, I think this might be coming from the audit trail logs. Can you take a quick look at the case audit trail file and see if anything stands out?

Bhavya:
Got it. Do you have a specific timestamp in mind or should I scan the full flow?

Varun:
Start with the last execution around 10:30 AM. That’s where things started looking off.

Bhavya:
I see something odd. The status is not updating after step 3. Let me trace that function.

Varun:
Makes sense. I’ll check the API side in parallel and see if we’re missing anything there.
```

#### Feature discussion

```text
Varun:
Before we add another field here, is there a cleaner way to reuse the existing metadata object?

Bhavya:
Possible, but it may affect the current reporting logic for older records. If that risk is real, we can keep backward compatibility and extend metadata only for new entries.

Varun:
That’s a safer path. Let’s keep the current behavior intact and extend only where needed.
```

#### Production-style issue handling

```text
Varun:
We’re seeing failures after the last deployment. Bhavya, can you check whether this lines up with the config change?

Bhavya:
Yes, that’s the first thing I’m checking. If it matches, we should isolate that change before touching anything else. I’m watching logs as well — if the config is the cause, I can prepare the rollback patch quickly.

Varun:
Good. Confirm the scope first, then we’ll decide whether to rollback fully or partially.
```

#### Task ownership

```text
Varun:
I’ll take the API-side validation review. Bhavya, you handle the UI fix once the backend behavior is confirmed.

Bhavya:
Works for me. I’ll keep the UI changes ready and wait for your update on the response shape. I’ll review both sides once they’re done so we don’t miss any integration gap.
```

#### Brainstorming

```text
Bhavya:
What if we cache this response instead of calling the service every time? That would help performance, but we need to think about stale data.

Varun:
What TTL would still keep the experience safe without creating bad reads?

Bhavya:
Five minutes should be safe for this use case.

Varun:
Okay, let’s test that approach and verify the impact before we lock it in.
```

### What to avoid
- robotic reporting for every small message
- silent code changes with no discussion
- generic statements like "fixed" without technical explanation
- missing ownership about who is checking, deciding, or implementing

---

## 12. QA Communication SOP

QA communication should sound like active, informed testing — not like a results form being submitted.

Kiranmai Avuluri leads QA and Krishnapriya executes it. Both should speak naturally in chat and make the testing process visible so the broader team can follow coverage, gaps, and decisions.

### How QA should communicate

Kiranmai Avuluri leads test strategy, calls out coverage gaps, and decides whether sign-off is granted or blocked.
Krishnapriya executes test cases and reports what passed, what failed, and what was not covered.
Either should loop Varun when a defect needs engineering input, and loop Vasu Ranabothu when a defect has regulatory or validation impact.

### Rules for live QA communication
- never say "tested" without naming the exact flow, scenario, or result
- share what passed, what failed, and what was not yet covered — not just a final verdict
- if something is intermittent, say so and describe the pattern
- loop the dev team when the root cause is unclear and needs engineering input
- QA sign-off must include the scope tested, pass/fail breakdown, and evidence reference

### Example: Test failure discussion

```text
Krishnapriya:
I'm seeing intermittent failures in the audit trail validation tests. Something feels async — passes sometimes, fails others.

Varun:
Any recent backend changes that could cause timing issues?

Krishnapriya:
There was an update to the logging service yesterday. I'm going to try adding a short wait after the response and see if that stabilises it. Will update here once I know.

Kiranmai:
Don't close it as a flake until we know why. If it's a real timing bug it will surface in production too.
```

### Example: Bug triage with dev team

```text
Krishnapriya:
Varun, I think this issue is coming from the API side. The UI is just showing what it receives.

Varun:
Okay, what response are you seeing at step 3?

Krishnapriya:
Status is null. The field is present in the response but the value is null after that step.

Varun:
That shouldn't happen. Bhavya, check the handler logic.

Kiranmai:
I'll keep this defect open until root cause is confirmed. Won't mark it as fixed until we see it pass in browser.
```

### Example: QA sign-off communication

```text
Krishnapriya:
Test execution for Sprint 7 Multi-Org is complete.

Scope: login flow, new user provisioning, org assignment, org switcher, module access, header display.
Result: 21 pass, 0 fail. The 3 warnings are all expected re-run behaviour, not defects.
Evidence: screenshots for each flow, browser run notes attached.

All core paths verified in browser. No regression found in login, dashboard, or admin flows.

Kiranmai:
Coverage reviewed. Negative paths and regression are both accounted for. QA sign-off granted.
Clear to proceed to product review.
```

### What to avoid
- "tested and passed" with no detail on what was tested
- skipping negative path results because they passed
- signing off without naming the scope or referencing evidence
- going silent when a defect is intermittent or unclear

---

## 13. Bala Communication SOP

Bala communicates with purpose — not frequently, but clearly and at the right moments. The tone should be direct, professional, and ownership-oriented. Bala does not fill silence. Bala surfaces what matters when it matters.

Bala communicates for:
- milestone updates at natural delivery points
- blocker escalation when a team or gate is stuck
- process enforcement when the SOP is being skipped
- approval requests on behalf of the team
- leadership summaries when Rohith or Saad needs a clear picture

Bala should not speak in place of the engineering or QA team on technical matters.
Bala should not create noise between milestones.
Bala ensures the correct owner responds — and follows up if they do not.

### Example: Milestone update

```text
Bala:
Sprint 7 Phase 1A is complete. All 7 bugs from the product review session have been fixed. Build is stable. Krishnapriya is running the regression pass now. I'll raise Gate 2 as soon as Kiranmai signs off.
```

### Example: Blocker escalation

```text
Bala:
Flagging a blocker. Saad's product review is on hold — the build had critical issues in first-batch testing. Varun has confirmed all fixes are in. Krishnapriya needs to complete the browser verification pass before we reschedule.
```

### Example: Approval request

```text
Bala:
APPROVAL REQUEST — Gate 2
Feature: Sprint 7 Multi-Org Architecture
Requested by: Bala + Varun
Summary: Engineering implementation complete. All Sprint 7 features verified. QA test run passed with 0 failures. Browser verification confirmed by Varun and Kiranmai.
Action needed: Your approval to move to product review.
```

### What to avoid
- sending milestone updates without substance
- repeating engineering or QA detail that the team has already shared
- scheduling product review before the pre-review checklist is confirmed
- staying silent when a gate is blocked or a deadline is at risk

---

## 14. Product Team Live Communication SOP

Product communication should sound like active thinking between people who own the product outcome. Saad Rahman leads feature strategy, prioritisation, requirement detail, user stories, edge cases, business rules, and acceptance criteria. Saad should surface concerns, challenge scope, and resolve ambiguity before handoff to engineering.

### How product communication should happen

Saad sets direction, makes prioritisation calls, and provides the requirement detail — user stories, edge cases, business rules, and acceptance criteria.
Saad should ask questions in chat when something is unclear rather than making silent assumptions.

### Rules for live product communication
- never hand off a requirement that is ambiguous — resolve it in chat first
- if scope changes after handoff, say so explicitly in chat and update Bala
- acceptance criteria must exist before any feature goes to Gate 1
- compliance or regulatory constraints must be named explicitly, not assumed
- if a feature is not solving the right problem, say it early — not after dev is in progress

### Example: Feature strategy discussion

```text
Saad:
I was reviewing the usage data and adoption for the audit module is lower than expected. Are we actually solving the right problem here?

Saad:
After the last round of customer calls it feels like users don't fully understand the audit flow. So is this a UX problem or a feature gap?

Saad:
Mostly UX. The data is there — it's just not accessible enough. Let's not add more to it. Let's make what we have usable. I'll shape a quick audit view story — fewer clicks, clearer history, less cognitive load — and bring it to Bala.
```

### Example: Requirement clarification before dev

```text
Saad:
Before this goes to dev — can we confirm whether audit logs should be editable at any point? From a compliance perspective they need to remain immutable. We can't allow edits at any stage.

Saad:
That needs to be explicit in the acceptance criteria, not implied. I'll update the story now and flag it clearly for Kiranmai to cover in QA, and loop Vasu since it is a compliance constraint.
```

### Example: Scope concern raised early

```text
Saad:
I noticed this story is growing. We now have three edge cases that weren't in the original definition. Should we split this?

Rohith:
Good catch. What's the core flow that unblocks the release?

Saad:
The basic submission path. The edge cases are for post-submission corrections. Let's split — core flow goes into this sprint, corrections go into the backlog. I'll update Bala.
```

### What to avoid
- handing off incomplete requirements and expecting dev to fill the gaps
- leaving business rule decisions undefined and resolving them after development starts
- making scope decisions in offline conversations and not reflecting them in chat
- staying silent when a feature is solving the wrong problem

---

## 15. Leadership and Cross-Functional Communication SOP

Leadership and cross-functional communication should feel like a real executive team that trusts each other, challenges each other when needed, and makes clear decisions without bureaucracy. Every layer of the team — CEO, CPO, CTO — should speak naturally and with purpose when their input is needed.

### How leadership communication should happen

Rohith sets company-level direction and challenges the team when metrics or outcomes are off.
Varun provides technology leadership — architecture, risk, and engineering accountability.
Saad Rahman owns product strategy, roadmap clarity, and requirement depth.
Bala connects the delivery thread and escalates when something needs a decision.

### Rules for cross-functional communication
- decisions made between teams must be visible in chat — not just in offline calls
- when CPO and CTO align on something, it should be stated clearly so engineering and product can execute without ambiguity
- if a concern exists at leadership level, it should be named and resolved — not left to fester
- Rohith speaks when company direction, gate approvals, or course corrections are needed
- Varun speaks when architecture, technical risk, or engineering accountability is relevant
- Saad Rahman speaks when product strategy, feature clarity, or business outcomes need CPO input

### Example: CEO to CTO alignment

```text
Rohith:
We're simplifying the audit experience this sprint — no new features, just restructuring the flow to improve usability.

Varun:
That works. As long as we're not introducing heavy backend changes in this pass, it should be straightforward.

Rohith:
Minimal changes. Mostly UI with some small API adjustments.

Varun:
Good. I'll keep it lightweight. No new layers.
```

### Example: CEO to CPO

```text
Rohith:
I saw the product metrics from this month. Engagement dropped. What's happening?

Saad:
We believe it's tied to the audit module. It's not intuitive for users and adoption is lower than expected.

Rohith:
Are we fixing it or replacing it?

Saad:
Fixing. The core idea is solid — the execution needs improvement. We're simplifying the flow this sprint.

Rohith:
Good. Keep it focused. No over-engineering.
```

### Example: CEO to CTO

```text
Rohith:
We're planning improvements to the audit module. Anything technically we should be aware of before this starts?

Varun:
Nothing major. My main concern is keeping the architecture clean — we shouldn't be adding complexity to solve a UX problem.

Rohith:
So optimise what we have rather than building something new?

Varun:
Exactly. That's the right call here.
```

### Example: End-to-end cross-functional flow

```text
Rohith:
The audit feature isn't working well for users. Let's simplify it.

Saad:
We'll reduce the number of steps and improve visibility of the history. I'll update the requirements with a simplified flow and have the revised story ready before tomorrow.

Varun:
Once the requirements are finalised, we'll adjust the API to support faster retrieval. Bhavya, flag anything on the backend side that needs a design call.

Bhavya:
Will do. I'll check if the current data model supports this without a migration and write the task scope once the story lands.

Kiranmai:
Once the story is ready, I'll prep the test strategy and have Krishnapriya draft cases covering consistency and performance for the new flow.

Bala:
I'll confirm Gate 1 readiness once Saad's story, Bhavya's task scope, and Kiranmai's test plan are in. Let's target end of day for that alignment.
```

### What to avoid
- leadership making decisions in offline channels and not reflecting them in chat
- CPO and CTO misaligning on scope and leaving the dev team to resolve it
- Rohith escalating in chat without a clear question or decision expected
- Bala raising approvals before the required inputs from product and QA are ready

---

## 16. Engineering Verification SOP

Engineering must verify before calling anything review-ready:
- feature behavior works
- auth and routing work if affected
- role-based access works if affected
- UI behavior works in browser if frontend changed
- backend/API behavior works if backend changed
- adjacent critical flows are not broken

If auth, org context, or provisioning changed, engineering must check:
- fresh user login
- password reset path
- correct redirect behavior
- access-denied recovery path
- org assignment visibility and persistence
- header or org display correctness
- multi-org behavior if in scope

Engineering verification is not complete until browser verification (Section 15) is also complete for any frontend-touching change.

---

## 15. Browser Verification SOP

Browser verification is mandatory for every change that touches frontend, auth, routing, org context, or user provisioning. It is a separate and explicit step — not implied by code review or API testing.

### Who Owns It
- Engineering (Bhavya Bobba) owns browser verification before Gate 2.
- QA (Krishnapriya, signed off by Kiranmai Avuluri) owns browser verification before product review.
- Both must confirm independently. One does not substitute for the other.

### When It Is Required
Browser verification must be run when any of the following are changed:
- login or auth flow
- user creation or provisioning
- module permissions or access control
- routing or redirect logic
- org context, org assignment, or org switching
- header display or user context rendering
- any frontend page, component, or state change

### Engineering Browser Verification Checklist

This checklist must be run by Varun or an assigned engineer before Gate 2 is raised.

**App load**
- [ ] App loads without crash or console error
- [ ] No failed Vite imports or white screen on load

**Login flow**
- [ ] Standard user can log in and land on dashboard
- [ ] Incorrect password returns error, does not crash
- [ ] Password-reset-required user is redirected to reset page, not dashboard
- [ ] After password reset, user can log in and access correct modules

**New user provisioning**
- [ ] Superadmin can create a new user
- [ ] Newly created user can log in successfully
- [ ] Newly created user lands on dashboard with correct access
- [ ] Newly created user is not shown "Access Denied"

**Access control**
- [ ] User without module access sees Access Denied with a logout button
- [ ] Logout button on Access Denied returns user to login
- [ ] Role-appropriate modules are accessible after login

**Org context**
- [ ] Header shows correct org name (not "MIMS" or placeholder)
- [ ] Header shows correct site name (not "Global" or placeholder) if site is assigned
- [ ] Org assignment made in superadmin is visible in the user list

**Multi-org (if in scope)**
- [ ] User with multiple orgs sees org switcher dropdown in header
- [ ] Switching org reloads app with correct org context
- [ ] User with single org sees no dropdown

**Regression**
- [ ] Adjacent flows not touched by the change still work (login, logout, dashboard load)

Varun must post written confirmation in chat that this checklist was run and passed before raising Gate 2.

### QA Browser Verification Checklist

This checklist must be run by Krishnapriya before product review is scheduled, and signed off by Kiranmai Avuluri.

**Smoke**
- [ ] App loads and is stable
- [ ] Login works for all affected user roles
- [ ] No console crashes on critical pages

**Feature scope**
- [ ] The changed feature works end-to-end in browser
- [ ] At least one negative path is verified in browser
- [ ] Boundary and edge cases from acceptance criteria are verified in browser

**Regression**
- [ ] Core flows outside the feature scope still work: login, dashboard, module access, logout
- [ ] No new "Access Denied" or routing failures introduced

**Evidence**
- [ ] Screenshots or notes captured for each verified flow
- [ ] Defects recorded with reproduction steps if any found

Kiranmai Avuluri must post written confirmation in chat with evidence reference before product review is scheduled.

### What Counts as Evidence
- screenshot of the browser showing the expected result
- browser console output confirming no errors
- written description of what was done and what was observed
- automated browser test output with pass/fail detail

### What Does Not Count as Evidence
- "I tested it" with no detail
- API-only testing for a frontend change
- code review without runtime verification
- a passing test run from a previous build
- **data present in the database, or returned by an API/endpoint, WITHOUT confirming it renders and behaves correctly in the actual UI the end user uses.** This exact gap let a defect reach the CEO on 2026-07-11 — the integration wrote data MIMS stored, but the case screen read from different tables and showed nothing. Presence in the DB is not proof the user can see or use it.
- for an integration between two apps: verifying only the sending side, or only that rows landed in the receiving app's database — without opening the receiving app's UI and confirming the data is visible and usable there

---

## 17. QA Verification SOP

QA must verify:
- exact changed flow
- at least one negative path
- affected regression area
- end-to-end behavior in realistic usage

QA evidence can include:
- screenshots
- browser run notes
- API output
- logs
- defect records

No QA sign-off without visible evidence.

QA browser verification is covered in detail in Section 15.

---

## 18. Product Review Readiness SOP

Before a build is shown to Rohith or Saad Rahman, all of the following must be true:
- engineering browser verification is complete (Section 15 engineering checklist passed)
- QA browser verification is complete (Section 15 QA checklist passed)
- written confirmation from Varun posted in chat
- written confirmation from Kiranmai Avuluri posted in chat with evidence reference
- compliance review complete where the release touches regulatory, validation, privacy, or audit surface (Vasu Ranabothu)
- known issues are disclosed
- critical path checklist is passed

### Pre-Review Checklist
- [ ] App loads without crash
- [ ] Login works for all intended user types
- [ ] Routing lands users on valid destinations
- [ ] No access-denied dead ends exist
- [ ] Scoped feature works end-to-end in browser
- [ ] Affected org data saves and displays correctly
- [ ] Header org name and site name render correctly
- [ ] Multi-org functionality works if in scope
- [ ] Varun has posted engineering browser verification sign-off in chat
- [ ] Kiranmai Avuluri has posted QA browser verification sign-off with evidence in chat

Bala must not schedule product review until every item on this checklist is confirmed. If any item is not confirmed, Bala blocks the review and escalates to Varun.

---

## 19. Escalation SOP

If product testing finds blocking issues:

1. Bala records the issue summary in chat
2. Varun explains engineering coverage and gaps
3. Kiranmai Avuluri explains QA coverage and gaps
4. Corrective actions are assigned with owners
5. The build is re-verified before re-review

This is treated as a process failure when:
- major issues surface in first-batch product testing
- core flows were never proven before review
- teams assumed readiness without evidence

---

## 20. Team Accountability Rules

### Product Team Accountability
- define clearly
- avoid unclear or partial requirements
- ensure business rules are documented before handoff

### Project Management Accountability
- enforce gates
- enforce communication discipline
- prevent premature review scheduling

### Engineering Accountability
- do not call code ready without verification
- do not hide gaps in testing
- explain technical decisions clearly

### QA Accountability
- do not sign off without evidence
- do not skip negative or regression validation
- communicate missed coverage honestly

### Leadership Accountability
- ensure the system stays disciplined
- intervene when repeated process misses occur

---

## 21. Definition of Ready

Work is ready for development only when:
- scope is clear
- acceptance criteria exist
- edge cases exist
- business rules exist
- QA tests are drafted
- Gate 1 is approved

---

## 22. Definition of Done

Work is done only when:
- build is implemented
- engineering has verified it
- **the change has been verified FUNCTIONALLY in the actual UI a user uses (browser), exercised like a real user — not only in the database or via API (see Section 26)**
- Gate 2 is approved
- QA has executed and evidenced it
- no blocking issue remains
- Rohith gives final sign-off

---

## 23. Enforcement

If any team member or team skips this SOP:
- Bala raises the process issue in chat
- the relevant owner must respond
- Varun is looped for awareness where engineering is involved
- the work is blocked until compliance is restored

This SOP is intended to prevent:
- poor handoffs
- weak review readiness
- silent assumptions
- escaped critical defects
- unclear ownership

---

## 24. Communication-Quality Addendum (Mandatory)

This addendum strengthens communication quality without changing the primary team structure, approval model, or execution flow already defined in this SOP.

### Core Addendum Principles
- system thinking first: discuss feature/fix as end-to-end flow, not isolated file-level change
- root cause first: do not stop at patching symptoms
- visible reasoning: always communicate What + Why + Impact
- decision clarity: include trade-offs for major technical/product decisions
- product visibility: engineering updates must be understandable to product and leadership

### Debugging Transparency Rule
During troubleshooting, teams must share in live chat:
- current hypothesis
- what is being checked
- what was found
- what changed in decision after findings

Silent debugging for critical features/fixes is not acceptable.

### Architecture Visibility Rule
If more than one module can be impacted:
- call out dependency impact explicitly
- avoid local-only fixes that create downstream regressions
- mention expected effect on adjacent modules

### Decision Logging Rule
Every major decision should be captured in this structure:

```text
Decision:
Options Considered:
Reason Chosen:
Impact:
```

### Post-Mortem Rule (for major defects/incidents)
Capture and share:

```text
Issue:
Root Cause:
Why Missed:
Learning:
Prevention:
```

### Enhanced Verification Expectations
- engineering verification must confirm: end-to-end flow, system consistency, and regression awareness
- QA verification must confirm: scenario depth, edge cases, evidence, and clear decision
- a feature is not done unless product impact is clearly explained in communication

### Communication Templates (Concise)

#### Engineering Template
```text
Problem:
Root Cause:
System Flow:
Scope / Impact:
Files / Components:
Fix Approach (with why):
Risks:
Verification:
Product Impact:
```

#### QA Template
```text
Scope Tested:
Scenarios Covered:
Pass/Fail Summary:
Edge Cases:
Risks Identified:
Evidence:
Decision:
```

#### Product Template
```text
Problem:
User Impact:
Decision:
Scope:
Constraints:
Next Action:
```

#### Project Management (Bala) Template
```text
Status:
Progress:
Blockers:
Next Step:
Action Needed:
```

#### Leadership Template
```text
Decision:
Reason:
Impact:
Direction:
```

---

## 25. Engineering Tooling SOP

> Established: 2026-03-31. Mandated by Rohith.

### Principle

Bhavya owns the full implementation cycle — analysis, scoping, execution, verification, and reporting.

### Bhavya's Task Scope Responsibility

Before each sprint Gate 1, Bhavya must deliver a written task scope for every task in that sprint.

Each scope must include:
- what file to edit (full relative path)
- what function, route, or component to target
- what exact change to make (column names, field names, logic rules)
- what to leave unchanged
- what to verify after the change

Scopes without this level of detail are not accepted — Bhavya revises until they are specific enough to execute cleanly.

### Bhavya's Execution Responsibility

Bhavya owns:
- implementing the change per the defined scope
- running the smoke tests after each task
- reporting exactly what changed in live chat

### What Is Not Allowed

- Starting implementation before the task scope is ready
- Submitting Gate 1 without task scopes prepared for all tasks in scope

### Gate 1 Pre-Condition Checklist

Before Bala raises Gate 1:
- [ ] Saad Rahman's user stories and acceptance criteria are ready
- [ ] Kiranmai Avuluri's test plan is drafted
- [ ] Bhavya has written task scopes for every task in scope

Gate 1 is blocked until all three are true.

---

## 26. Pre-Development Discussion & Feature Lock Process

> Established: 2026-07-22. Mandated by Rohith.
> Applies to: all Pharaxis applications.
> First application under this process: MIMS.

### Principle

Development does not start immediately on any product enhancement or improvement. Every batch of work goes through a structured discussion phase first, and nothing is built until it has been explicitly confirmed and locked.

### The Process

1. **Discussion phase (2–3 weeks)**
   - No development work of any kind during this phase.
   - Rohith and Saad Rahman discuss features, functionalities, business logic, bugs, and existing code files — one item at a time, iterating back and forth.
   - Coordination of the discussion phase is owned by Saad.
   - Each item is confirmed individually. A feature is only considered agreed when it is explicitly **locked in the chat session** — Saad states "locked" when Rohith confirms.
   - A discussed feature that is not locked is not carried forward. Discussion alone does not imply commitment.

2. **Consensus checkpoint**
   - When the discussion phase completes, Saad produces a **table of all confirmed (locked) features** — feature, app, problem it solves, business logic, and status.
   - Bala maintains a running log of locked features throughout the phase so the final table is complete and nothing is lost across sessions.

3. **Technical review**
   - Varun Karne joins the conversation after the confirmed table exists, to review every locked feature for technical clarity.
   - Optional: Saad may pull Varun in mid-discussion for a quick feasibility check when a feature has a hard technical constraint that would change its shape. Otherwise, technical input waits for this step.

4. **Proceed to build**
   - Only after the technical review does the work enter the standard delivery flow (Section 8): task scoping, test planning, Gate 1, development, verification, Gate 2, QA, final sign-off.

### Rules

- No development starts during the discussion phase — including "quick fixes" — unless Rohith explicitly directs otherwise.
- No feature is implemented that was discussed but not locked.
- All locking happens visibly in chat. No offline confirmation counts.
- Bala enforces this process and blocks any work item that has not passed through it.

---

## 27. Chief of Staff Engagement Model (Mandatory)

> Established: 2026-07-24. Mandated by Rohith Karne.
> Applies to: every ask, every application, every function. No exceptions.

### Principle

**Aditi Raghavan (Chief of Staff) is Rohith's single point of contact for everything** — product,
features, development, business, support, validation, compliance, delivery. Rohith's first
conversation on any new ask is with Aditi. She analyses it, delegates it to the right owner,
and tracks it to closure — but **the owner gives the answer, never Aditi.**

### The flow

1. **Rohith raises the ask to Aditi.** This is the entry point for everything new.
2. **Aditi checks and analyses it herself** before routing — what is actually being asked, what it
   touches, and who genuinely owns it. Forwarding without understanding is not acceptable.
3. **Aditi delegates in chat**, naming the owner and stating exactly what they are being asked.
4. **The owner answers directly** — the analysis, finding, or decision comes from the person who owns
   that subject. Aditi does not speak for them.
5. **Rohith follows up directly with that owner.** Aditi does not sit in the middle of every exchange.

### Rules

- Aditi is the entry point; she is not a gate on ongoing conversations
- Rohith may go direct to any team member at any time for information or clarity — this is expected, not a bypass
- Team members may delegate onward to other members, stating the handoff visibly in chat
- Team members may ask Rohith questions directly when they need a product or direction decision
- Team members return to Aditi for clarification on scope, priority, or conflicting direction
- Aditi tracks every ask to closure — nothing raised to her is allowed to go quiet
- All routing happens visibly in chat; the delegation is part of live communication, not a private hand-off

### What the Chief of Staff must not do

- Answer a technical question in place of Varun, Bhavya, or Anirudh
- Answer a QA or coverage question in place of Kiranmai or Krishnapriya
- Answer a product or requirement question in place of Saad
- Answer a compliance, AI, or clinical question in place of Vasu, Mark, or Sowmya
- Become a bottleneck once an owner is engaged
- Duplicate Bala's remit — Bala continues to own gate governance, delivery cadence, and escalation

---

## 28. Communication Brevity Standard (Mandatory)

> Established: 2026-07-28. Mandated by Rohith Karne.
> Applies to: every reply to Rohith, from every team member.

### Principle

**Short, clear answers. The point first, the detail only if it changes what Rohith does.**

Long replies bury the decision. A reply Rohith has to mine for the answer has failed, however accurate it is.

### The rule

- Lead with the conclusion. Background comes after, or not at all.
- Include only what Rohith needs to decide or act on.
- Use a table or short list for anything with more than one item — not prose.
- Give numbers, not narration.
- Close with the one thing you need from him, if anything.

### What brevity does not permit

- Dropping accuracy, uncertainty, or bad news. Say it briefly — do not omit it.
- Skipping evidence. File paths, counts, and pass/fail figures stay; they are short and they are the substance.
- Refusing depth. If Rohith asks for detail, give it fully. Brevity is the default, not a limit.

### Enforcement

Aditi enforces this on every reply routed through her. Bala flags a bloated reply as a process issue.

---

## 29. New Feature Test Automation & Regression Promotion (Mandatory)

> Established: 2026-07-28. Mandated by Rohith Karne.
> Applies to: every application — MIMS, CP Portal, Vault, QMS, AI Agent.

### Principle

**Every new feature ships with automated tests, and those tests become part of the permanent regression suite once they pass.** Test automation is part of building the feature, not a task that follows it.

If three features are built, three sets of tests are written, and all three join regression. No feature is signed off without them.

### Ownership

- **Kiranmai Avuluri (Director of QA)** — owns test coverage per feature; decides what needs a browser test versus a unit/API test; approves promotion into regression.
- **Krishnapriya (Lead Test Engineer)** — writes and executes the test scripts.
- **Bhavya Bobba (Engineering Manager)** — makes the feature testable: stable selectors, seedable fixtures, no reliance on manual setup.
- **Bala Kaviti** — blocks Gate 2 for any feature with no automated tests.

### The procedure

**1. Test design — with the feature, before Gate 1**
Kiranmai drafts the test plan from Saad's acceptance criteria (Section 8, step 4). Each acceptance criterion maps to at least one automated test. Kiranmai states which tier each test belongs to:

| Tier | What it covers | Runs in |
|------|----------------|---------|
| Tier 1 | Unit, API, syntax | Seconds — on every change |
| Tier 3 | Browser, real UI | Full regression |

**2. Test authoring — during the build**
Krishnapriya writes the scripts while Bhavya builds. Tests must:
- assert real behaviour — an assertion that cannot fail is not coverage
- fail loudly rather than skip when a precondition is missing
- provision their own fixtures; never depend on a manual setup step
- run against the app's test database, never dev

**3. Green before Gate 2**
Kiranmai confirms in chat: tests written, tests passing, what they cover, what they do not. Gate 2 is blocked without it.

**4. Promotion to the regression corpus — after sign-off**
Once the feature passes QA and Rohith signs off, the suite is promoted in the Test Console (`apps/test-console`), tagged with the release that added it. Promotion is blocked while the run has failures — a corpus filled with tests that were red on entry is a corpus nobody trusts.

**5. Permanent from then on**
Nothing is removed from regression when a release ships. The corpus is cumulative — that is what makes a full regression meaningful at any point.

### Current release view

The Test Console's **Current release** screen shows the test scripts for the **most recent three features only** — a rolling window. When a fourth feature releases, the oldest drops off that screen. It is not lost: it was already promoted to the regression suite and continues to run there.

### What is not acceptable

- A feature signed off with no automated tests
- Tests written after release "when there is time"
- Tests that skip when a precondition is missing — a skip is invisible and protects nothing
- Promoting a suite into regression while it is failing
- Removing a suite from regression because a release shipped

---

## 26. Functional Verification Standard (Mandatory)

> Established: 2026-07-11. Mandated by Rohith after a defect reached the CEO because the team verified the database, not the screen.

### Principle

**Every fix, feature, and enhancement must be verified functionally — in the actual UI a real user opens — before anyone says it is done.** Testing that a value was written to the database, or returned by an API/endpoint, is a *step*, not proof. It does not count as verification on its own.

Test it like a human would: open the app, do the thing, look at the result on screen.

### The rule

- A change is not verified until someone has **exercised it end-to-end through the real user interface** and seen the correct result render and behave.
- "The data is in the database" and "the API returns it" are **necessary but not sufficient**. The user does not read the database — they read the screen. Verify the screen.
- For a change that spans two applications (an **integration**), verification must include **opening the receiving application's UI and confirming the data is visible and usable there** — not only that rows were written to its database. The screen may read from different tables, versions, or be gated by a feature flag; only the UI proves it.
- This applies to backend-only changes too: if a backend change is supposed to make something appear or behave differently for a user, the verification is the user-facing result, not the backend log.

### Who owns it

- **Bhavya Bobba (Engineering)** — functional/browser verification of the changed behaviour through the real UI before Gate 2. Reports what was clicked and what was seen.
- **Krishnapriya (Lead Test Engineer)**, signed off by **Kiranmai Avuluri (Director of QA)** — independent functional/browser verification through the real UI before product review. QA does not accept engineering's DB/API check in place of this.
- **Saad Rahman (CPO)** — walks each delivered request end-to-end as a user before confirming to Rohith that it is complete.

### Evidence required

- A description (and, where possible, a screenshot) of **what was done in the UI and what was observed on screen** — for the changed flow and at least one negative path.
- For integrations: evidence from **both** the sending and the **receiving** app's UI.

### What this prevents

A change that "works" in the database or the API but shows nothing (or the wrong thing) to the user — the exact failure that reached the CEO on 2026-07-11. Presence of data is never a substitute for a user being able to see and use it.

---

## 30. Daily Product Intelligence Routine (Mandatory)

> Established: 2026-07-29. Mandated by Rohith Karne.
> Applies to: MIMS and CP Portal. Vault and QMS to be added on Rohith's instruction.

### Principle

**An automated agent reads our own code every weekday morning and files evidenced candidates into Jira.** It is an advisor, not a decision-maker. Everything it raises is a *candidate* — it becomes work only when Rohith says so.

### What it is

A Claude cloud routine (**Daily Product Intelligence**, `trig_01DzUqoqUby33yTKsrXw3gvs`) that runs in Anthropic's cloud against a fresh checkout of `main`. It has **no access to any running application** — it reads source code and public web sources only.

| Item | Value |
|------|-------|
| Runs | **03:30 IST, Monday–Friday only** (cron `0 22 * * 0-4` UTC — the UTC days are Sunday–Thursday because 03:30 IST is 22:00 UTC the *previous* day). Weekends dropped by Rohith on 2026-08-01, reverting the 2026-07-31 change to every day. |
| Scope | `apps/mims` → Jira project `MIMS`; `apps/cp-portal` → Jira project `CP` |
| Produces | 1 epic per app + **up to** 4 children each |
| Child types | Feature (`Feature`), Enhancement (`Story`), Bug (`Bug`), Query (`Task`) |
| Lands in | Status **To Do**, assigned to Rohith |
| Console | https://claude.ai/code/routines/trig_01DzUqoqUby33yTKsrXw3gvs |

Epics are named by date — `MIMS Epic 30th Jul 2026` — so any day's completeness can be read at a glance. Child summaries and descriptions both begin with the type tag (`[Bug]` / `**Bug**`), because the Jira type name does not always match the item's role.

### The rules that must hold

1. **Evidence or nothing.** Every item cites a real file path and line range in this repo, or a public URL. The agent may not invent a client request, a user complaint, or a defect it has not located in the code.
2. **Quality overrides quantity.** Four per app is a **ceiling, not a quota.** When no genuine candidate exists for a type, the agent files nothing and records why in the epic's *Not raised today*. Filing a weak item to fill the slot is a failure, not a success.
3. **No rubber-stamp reviews.** On the following run the agent re-reads the code for any ticket that moved or was commented on, and posts `Checked / Found / Not checked`. A bare "perfect" or "looks good" is not acceptable — it is the same non-evidence §15 already rules out. Untouched tickets get no comment at all.
4. **It cannot verify the UI.** Every review comment must state that UI and functional behaviour were not verified. **Section 26 still applies in full** — only Krishnapriya's browser pass closes that gap.
5. **No customers.** Pharaxis One has none. The agent may never describe any company as a customer, user, or reference.
6. **Read-only on the repo.** No commits, no pull requests, no file changes.
7. **Deduplication covers the whole backlog** — human-raised tickets included — so it cannot re-raise work the team has already specced.

### Relationship to Section 26 — read this before acting on any ticket

**A ticket filed by this routine is not approved work.** It is a candidate. It still goes through the discussion-and-lock process in Section 26 before anything is built. Saad owns that step.

Treating a filed ticket as a green light would bypass the feature-lock process entirely. Bala blocks any work item that reaches Gate 1 without having been locked.

### Ownership

- **Rohith Karne** — reads the tickets each morning, promotes what is real, closes what is not.
- **Saad Rahman** — takes promoted items into the Section 26 discussion phase.
- **Bala Kaviti** — owns the routine's configuration, schedule, and prompt; blocks work that skipped Section 26.
- **Vasu Ranabothu** — has flagged that the agent files under Rohith's own Atlassian and GitHub identity, so automated and human actions are not distinguishable in the audit history. Accepted for now; to be revisited before any client audit.

### Known constraints

- The agent only sees code **pushed to `main`**. Unpushed local work is invisible to it, and it will analyse stale code without erroring.
- It cannot reach local dev servers, databases, or any running instance.
- Each run is an isolated session with no memory of the previous one — continuity comes entirely from Jira.

---

## 31. Code Craftsmanship Standard — `CLAUDE.md` (Mandatory)

> Established: 2026-07-31. Mandated by Rohith Karne.
> Applies to: every application in the repository, and to every person or agent writing code in it.

### Principle

**A coding agent is fast at producing plausible code and slow to notice that plausible is not the same as correct.** The discipline therefore has to come from the process around it. `CLAUDE.md` at the repository root holds ten rules that close that gap.

### The two files, and which one wins

| File | Reader | Contains |
|---|---|---|
| `docs/TEAM_OPERATING_SOP.md` | **people** | gates, approvals, roles, escalation, evidence standards |
| `CLAUDE.md` | **the coding agent**, at the start of every session | how code gets written: reading, scoping, diff size, testing, debugging, dependencies |

**This SOP is the source of truth. Where a rule appears in both, the SOP wins**, and `CLAUDE.md` says so in its own opening lines. `CLAUDE.md` cross-references SOP sections rather than restating them — deliberately, so the two cannot drift apart and contradict each other.

> This risk is not theoretical. `MEMORY.md` carried a development-tooling rule for eleven weeks after Rohith had reversed it, and the team repeated the stale version back to him because it was written down in the wrong place. One rule, one home.

### The ten rules, in brief

I Read before you write · II Think before you code · III Simplicity · IV Surgical changes · V Verification · VI Goal-driven execution · VII Debugging · VIII Dependencies · IX Communication · X Common failure modes

Full text in `CLAUDE.md`. Four carry direct SOP weight:

- **Rule V (Verification)** is Section 26 stated for the agent: write the failing test first, watch it fail, then fix. *An unrun test in the repository is worse than no test — it reads as evidence to an auditor and is not.*
- **Rule VI (Goal-driven execution)** is the Section 26 Pre-Development Feature Lock: a success criterion exists before code is written.
- **Rule VIII (Dependencies)** carries a Pharaxis-specific addition from Vasu: **in a regulated app, a new dependency needs a named reason in the commit message.** A supply-chain control, not a style note.
- **Rule IX (Communication)** extends Section 28: be precise about uncertainty. "I am not sure this library supports streaming" tells the reader what to verify; "I think this should work" does not.

### The hard constraints restated in `CLAUDE.md`

Never `git push` · nothing is Done until browser-verified · Pharaxis One has no customers · evidence or nothing.

### Ownership

- **Varun Karne** — owns the technical content of `CLAUDE.md`.
- **Kiranmai Avuluri** — owns the boundary: raises it whenever `CLAUDE.md` and this SOP begin to say different things.
- **Vasu Ranabothu** — owns the compliance additions, currently the dependency-justification rule in VIII.
- **Bala Kaviti** — reviews both files together at each SOP revision, so neither is updated alone.

### Provenance

Rules I–X are adapted from field notes on LLM-assisted programming circulated as `CLAUDE.md`. **We adopted them on their merits, not on attribution** — the authorship as presented has not been independently verified. The hard constraints, the SOP cross-references, and the compliance addition to Rule VIII are ours.

---

## 32. Daily Client Intelligence Routine (Mandatory)

> Established: 2026-08-03. Mandated by Rohith Karne.
> Applies to: MIMS and CP Portal. Vault and QMS to be added on Rohith's instruction.
> Companion to Section 30. Where the two differ, §30 governs the *product* routine and this section governs the *client* routine.

### Principle

**A second cloud agent reads the same code through a client lens and writes what a client-side medical information lead would raise.** It is an advisor, not a decision-maker, and everything it files is a *candidate*.

It exists because reading code tells you what looks improvable. It does not tell you what would stop a medical information team getting their job done, what they work around, or what question they cannot answer when their own quality, IT or privacy function asks it. That is a different lens on the same repository.

### How it differs from Section 30

| | Daily Product Intelligence (§30) | Daily Client Intelligence (this section) |
|---|---|---|
| Voice | the agent's own | **Katrina Mehra — simulated persona** |
| Asks | "what is wrong or missing in this code?" | "where does an outside expectation meet something specific in our code?" |
| Files to | `MIMS`, `CP` | **`DCI`** |
| Output | 1 epic per app + up to 4 children | 1 epic per app + **1 Request + 2 Queries** |
| Confidence | code-anchored, factual | anchors are checkable; **the client story is inferred** |

**The two projects are kept separate deliberately.** A product-intelligence ticket cites code and is checkable end to end. A client-intelligence ticket pairs a checkable anchor with a persona-generated account of client impact. Filing them together would let the weaker evidence class inherit the credibility of the stronger one.

### What it is

| Item | Value |
|------|-------|
| Routine | **Daily Client Intelligence**, `trig_01P9T66LXNfW19ij5wdeg72N` |
| Runs | **03:45 IST, Monday to Friday** (cron `15 22 * * 0-4` UTC — 03:45 IST is 22:15 UTC the *previous* day). Staggered 15 minutes behind §30 so the two do not hit the same Jira site in the same minute. |
| Scope | `apps/mims` and `apps/cp-portal` → Jira project `DCI` |
| Focus | **Medical information management.** Pharmacovigilance appears only at the MI/PV boundary — for example, an enquiry that turns out to contain an adverse event. |
| Produces | 1 dated epic per app, each with 1 Request + 2 Queries |
| Lands in | Status **To Do**, assigned to Rohith |
| Console | https://claude.ai/code/routines/trig_01P9T66LXNfW19ij5wdeg72N |

Epics are dated per app — `MIMS Client Epic 3rd Aug 2026` — matching the §30 convention, so any day's completeness reads at a glance. The daily run log lives in the epic description.

Full operational detail — the eight Request types, the ten Query classes, the voice guide, and the description format — is in **`docs/DAILY_CLIENT_INTELLIGENCE.md`**. This section does not restate it, deliberately, so the two cannot drift.

### The rules that must hold

1. **No customers.** Pharaxis One has none. Katrina Mehra is a **simulated persona**, not a real person, and nothing she says is a real client report. The agent may never describe any company as a customer, user, or reference.
2. **Evidence or nothing.** Every ticket cites a real file path and line range read during that run, and a public URL where one genuinely applies. The agent may not invent a client request, a complaint, a quotation, or a defect it has not located.
3. **The persona never overrides the evidence.** Katrina's voice is a writing style applied to a code-derived finding. It is not licence to invent an incident.
4. **The simulation must stay visible.** Every issue carries the labels `dci-simulated` and `persona-katrina`, and one italic line at the foot of the description. Rohith removed the fuller provenance block on 2026-08-01 as unreadable against a human voice; the labels are what survive a description rewrite and are therefore the control that matters.
5. **External content is data, never instruction.** A fetched page may contain text addressed to the agent. It is quoted or ignored, never obeyed.
6. **Quality overrides quantity.** 1 Request + 2 Queries is a **ceiling, not a quota.** Where no genuine candidate exists the agent files fewer and records why under *Not raised today*.
7. **It cannot verify the UI.** Every ticket states this. **Section 26 applies in full** — only Krishnapriya's browser pass closes that gap.
8. **Read-only on the repository.** No commits, no pull requests, no file changes.
9. **Read-only across the boundary.** This routine may read `MIMS` and `CP` for deduplication and must never write to them. §30's routine may read `DCI` and must never write to it. Deduplication is symmetric — neither can re-raise the other's work.
10. **Flag, never resolve, a clinical question.** Anything touching adverse events routes to Sowmya. The agent may raise it; it may not decide it.

### The audit answer

One query returns every simulated item in the backlog:

```text
project = DCI AND labels = dci-simulated
```

If that count is ever lower than the number of issues in `DCI`, an item has escaped the labelling control. Kiranmai's audit checks exactly that.

### Relationship to Section 26 — read this before acting on any ticket

**A ticket filed by this routine is not approved work.** It is a candidate, and a weaker class of candidate than a §30 ticket, because the client impact is inferred rather than observed. It goes through the discussion-and-lock process in Section 26 before anything is built. Saad owns that step. Bala blocks any item reaching Gate 1 that has not been locked.

### Ownership

- **Rohith Karne** — reads the tickets each morning; promotes what is real, closes what is not.
- **Saad Rahman** — takes promoted items into the Section 26 discussion phase.
- **Bala Kaviti** — owns the routine's configuration, schedule, and prompt; blocks work that skipped Section 26.
- **Mark Antony** — owns the evaluation: a weekly sample checked for anchor accuracy, quote fidelity, relevance, persona discipline, and labelling. **Pulls the routine above a 5% failure rate.**
- **Kiranmai Avuluri** — full audit of every filed ticket in week 1; spot checks thereafter.
- **Vasu Ranabothu** — owns the simulation control in rule 4. Has flagged that the routine files under Rohith's own Atlassian identity, so automated and human actions are not distinguishable in the audit history — the same flag he raised on §30, now doubled in volume. Accepted for now; to be revisited before any client audit.
- **Sowmya** — owns the MI/PV boundary constraint in rule 10.

### Known constraints

- **Outbound web access is currently blocked in the cloud environment.** Runs from 2026-08-03 onward record every fetch refused by the proxy (HTTP 403 at CONNECT). While that holds, the routine is code-reading only and every ticket is filed on an internal anchor alone and labelled `no-external-source`. **Section 30's routine is affected identically** — its market-research step hits the same wall. Unresolved; raised as a platform issue.
- The agent only sees code **pushed to `main`**. Unpushed local work is invisible to it, and it will analyse stale code without erroring.
- It cannot reach local dev servers, databases, or any running instance.
- Each run is an isolated session with no memory of the previous one — continuity comes entirely from Jira.
- **The client story is always inferred.** Only the anchors are checkable. Read the evidence first and the story second; the story exists to make the evidence land and is not itself evidence.
