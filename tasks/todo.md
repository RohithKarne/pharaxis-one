# Sprint 14 — Gate 1 Prep Checklist

Date: 2026-04-06
Project: Pharaxis One / Medical Affairs / MIMS
Status: In Progress (Gate 1 prep)

## Objective
Prepare a complete Gate 1 packet for Sprint 14 so implementation can begin without scope ambiguity.

## Scope Sequence (Locked)
- G10 -> G11 -> G12 -> G13

## Owner Tasks

### Vinay (Product Owner) — Requirement Quality
- [ ] Finalize user stories for G10 and G11 with tightened acceptance criteria.
- [ ] Add explicit edge cases and business rules per story.
- [ ] Confirm exclusions/out-of-scope notes for each story.
- [ ] Publish story packet for engineering + QA review.

### Karthik + Shivani (QA) — Test Planning
- [ ] Prepare pre-dev test plan for G10 and G11 (happy, negative, regression).
- [ ] Add dedicated coverage for G12-2 (Inbox smoke) and G12-3 (Reports regression).
- [ ] Define evidence format for sign-off (screenshots/logs/run output).
- [ ] Confirm Playwright sprint-close execution as mandatory release gate (G12-5 / P3).

### Bhavya (Senior Solution Architect) — Codex Prompts
- [ ] Prepare one Codex prompt per Sprint 14 item (G10-1 to G13-3).
- [ ] Include exact file paths, function targets, field/column names, and logic change instructions.
- [ ] Include explicit "what not to change" constraints.
- [ ] Include verification steps for each prompt.

### Varun (Senior Director of Software Systems) — Engineering Plan
- [ ] Finalize technical decomposition and dependency order.
- [ ] Confirm ownership split across Bhavya/Vivek by item.
- [ ] Define review checkpoints before Gate 2.
- [ ] Confirm risk controls for search performance, notification duplication, and regression stability.

### Bala (Director of Project Management)
- [ ] Validate completion of Vinay, QA, Bhavya, and Varun deliverables.
- [ ] Consolidate Gate 1 packet summary.
- [ ] Raise formal Gate 1 request to Rohith in approved format.

## Process Notes (Locked for Sprint 14)
- P1: AC definitions must be tighter than Sprint 13.
- P2: Shivani co-authors test specs, not only execution.
- P3: Playwright e2e at sprint close is mandatory (release gate).
- P4: iOS remains deferred until Rohith re-opens.

## Gate 1 Readiness Criteria
- [ ] Story packet complete (Vinay)
- [ ] QA plan complete (Karthik + Shivani)
- [ ] Codex prompts complete (Bhavya)
- [ ] Engineering decomposition complete (Varun)
- [ ] Bala consolidated packet complete
