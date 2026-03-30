# Sprint 10 Plan — Inbox + Correspondence + Case Query

## Scope Confirmed by Rohith
1. Append/Create flow supports all case types (MI/AE/PC).
2. Correspondence acts as complete case communication timeline (inbox/replies/forwards/sends/transmissions tracking).
3. Case Query export requirements are mandatory (including CDR).
4. Delivery expectation: one big scope.
5. UI/UX must match provided prototypes.

## Delivery Model (Single Scope, Multi-Lane Execution)
1. Lane A: Inbox enhancement + create/append-to-case flow.
2. Lane B: Case Correspondence module + communication tracking model.
3. Lane C: Case Query engine + mandatory exports (Excel + CDR).

## UX Fidelity Process (Mandatory)
1. Save prototype screenshots in `prototype-screens/`.
2. Capture current MIMS UI screenshots in `current-ui/`.
3. Record each gap and expected behavior in `delta-notes/`.
4. Convert approved behavior into implementation-ready specs in `ux-spec/`.
5. Store browser evidence in `qa-evidence/`.

## Gate-wise Execution
1. Gate 1: Finalized requirements + acceptance criteria + edge cases + test cases.
2. Build pass 1: Data model + APIs.
3. Build pass 2: UI screens matching prototype structure.
4. Build pass 3: Integration and exports (Excel/CDR).
5. Gate 2: Engineering + browser verification complete.
6. QA: End-to-end evidence across all three lanes.

## Risk Controls
1. No UI implementation without prototype mapping entry.
2. No API completion without audit trail + org isolation validation.
3. No sign-off without export validation (including CDR format).

## Open Clarification
1. Priority decision pending: Routing/assignment automation first vs response-formatting first.
