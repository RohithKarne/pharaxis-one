# QMS Sprint 1 Internal UAT Sign-off

Date: 2026-04-09  
Time: 14:09:21 IST (+0530)  
UAT ownership: Internal Pharaxis team (as defined in Sprint 1 scope)

## Execution Evidence

- Script: `apps/qms/backend/tests/sprint1_uat_signoff.js`
- Run ID: `1775723500569`
- Base URL: `http://127.0.0.1:3160/api`
- Decision: `GO`

## UAT Result Summary

| Check ID | Scenario | Result |
|---|---|---|
| UAT_01 | Login | Pass |
| UAT_02 | Document create | Pass |
| UAT_03 | Document transition (Draft -> Review) | Pass |
| UAT_04 | Perf seed for binder target | Pass |
| UAT_05 | Binder performance (`>=50` records and `<=60s`) | Pass |

## Performance Evidence

| Metric | Value |
|---|---|
| Records before seeding | 10 |
| CAPA records seeded for target | 40 |
| Binder total records at execution | 88 |
| Binder generation duration | 18 ms |
| Sprint target | 50 records in <= 60,000 ms |
| Target met | Yes |

## Defect Snapshot

| Severity | Count |
|---|---|
| Sev-1 | 0 |
| Sev-2 | 0 |
| Sev-3 | 0 |
| Sev-4 | 0 |

## Sign-off

Internal UAT execution criteria for Sprint 1 implementation baseline are met. Recommendation: **GO for Sprint 1 internal acceptance**.

Final business sign-off gate remains with Rohith per scope governance.
