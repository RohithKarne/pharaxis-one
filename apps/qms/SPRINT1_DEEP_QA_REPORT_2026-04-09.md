# QMS Sprint 1 Deep QA Report

Date: 2026-04-09  
Environment: local (`qms_dev` on `127.0.0.1:5432`)  
Executed by: Internal Engineering + QA automation

## Execution Evidence

- Script: `apps/qms/backend/tests/sprint1_deep_qa.js`
- Run ID: `1775723567236`
- Base URL: `http://127.0.0.1:3167/api`
- Result: `PASS`

## Summary

| Metric | Value |
|---|---|
| Total checks | 37 |
| Passed | 37 |
| Failed | 0 |

## Coverage Areas

- Auth: login happy/negative path
- Document Control: create, lifecycle guardrails, controlled preview policy
- CAPA: create, action tracking, effectiveness, closure constraints
- Deviation: capture, containment, investigation, CAPA linking, closure
- Audit: creation, findings, auditee response, binder generation
- Validation: inventory, plans/protocols/scripts, failed-step deviation, VSR
- Platform services: notifications, outbox publish, periodic alerts

## Conclusion

Deep QA exit criteria item is complete for Sprint 1 implementation baseline. No failed checks in this run.
