# IEG Sprint 1 Implementation Status

Date: 2026-04-11
Owner: Bala/Codex implementation pass

## Checkpoint 1 (Shared Foundation)

- Superadmin login + user/module-access management: Implemented and gate-tested (`/api/auth`, `/api/users`, `/api/modules`)
- Module switcher + task queue landing: Implemented and gate-tested (`/api/modules/switch/:moduleKey`, `/api/tasks`)
- Immutable audit log: Implemented and gate-tested (append-only table + DB triggers + `/api/audit`)
- Native DMS upload/version/retrieve metadata + signed token download: Implemented and gate-tested (`/api/documents/upload`, `/api/documents`, `/api/documents/:id/versions`, `/api/documents/download-token`, `/api/documents/download/:token`)
- Workflow state machine with warning nodes: Implemented and gate-tested (`/api/workflows/transition`)
- Soft warning acknowledgement + strict proceed-blocking enforcement: Implemented and gate-tested (`/api/workflows/ack-warning`, module-specific ack routes)
- Approval matrix config + execution resolution by geography/value: Implemented and gate-tested (`/api/approvals`, `/api/approvals/resolve`)
- In-app notifications on state transitions + external email triggers: Implemented and gate-tested (`/api/notifications`, workflow/module transition triggers)
- Compliance rule engine (US baseline + param model): Implemented and gate-tested (`/api/compliance/rules`, compliance service)
- Negative path and role enforcement checks: Implemented and gate-tested (403/400 suite in gate test)

## Checkpoint 2 (Grants)

- External applicant grant submission with required documents + email confirmation: Implemented and gate-tested (`/api/external/grants/submit`)
- Internal completeness check + return-for-correction with email notification: Implemented and gate-tested (`/api/grants/applications/:id/completeness-check`)
- COI/compliance screening with soft warning + mandatory acknowledgement before review: Implemented and gate-tested (`/api/grants/applications/:id/compliance-screen`, `/api/grants/applications/:id/ack-warning`)
- Scientific review capture: Implemented and gate-tested (`/api/grants/applications/:id/review`)
- Committee decision including approve/reject/partial + signature state: Implemented and gate-tested (`/api/grants/applications/:id/decision`)
- Award contract + milestones + deliverables: Implemented and gate-tested (`/api/grants/applications/:id/contract`)
- Disbursement tracking: Implemented and gate-tested (`/api/grants/applications/:id/disbursement`, `/api/disbursements`)
- Open Payments export (JSON + CSV + XML): Implemented and gate-tested (`/api/disbursements/open-payments-export`)
- Grants audit trail query: Implemented and gate-tested (`/api/grants/applications/:id/audit`)

## Checkpoint 3 (IIT)

- External investigator IIT submission with required PI CV/protocol/budget payload: Implemented and gate-tested (`/api/external/iit/submit`)
- Scientific/strategic triage with approval matrix linkage: Implemented and gate-tested (`/api/iit/proposals/:id/triage`)
- FMV review with reference metadata + warning block: Implemented and gate-tested (`/api/iit/proposals/:id/fmv-review`, `/api/iit/proposals/:id/fmv-reference`)
- Warning acknowledgement before committee vote: Implemented and gate-tested (`/api/iit/proposals/:id/ack-warning`)
- Cross-functional committee voting (parallel role inputs) + consolidated summary: Implemented and gate-tested (`/api/iit/proposals/:id/committee-vote`, `/api/iit/proposals/:id/committee-summary`)
- Conditional vs full approval state distinction + contract rights fields: Implemented and gate-tested (`/api/iit/proposals/:id/approve`)
- Milestone/execution monitoring with progress/deviation/budget fields: Implemented and gate-tested (`/api/iit/proposals/:id/milestones`)
- Publication tracking: Implemented and gate-tested (`/api/iit/proposals/:id/publications`)
- IIT audit trail query: Implemented and gate-tested (`/api/iit/proposals/:id/audit`)
- Module switch context across Grants and IIT: Implemented and gate-tested (`/api/modules/switch/:moduleKey`)

## Verification Suite

- Baseline smoke: `npm run test:smoke:sprint1`
- Full checkpoint gate suite: `npm run test:gate:sprint1`

## Notes

- Sprint 2 items are intentionally not implemented.
- External integrations (FMV service, email provider, DMS providers) remain interface-ready stubs by Sprint 1 design.
