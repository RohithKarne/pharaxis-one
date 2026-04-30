# QMS All-Phase Verification Report

- Date: 2026-04-28T12:42:41.788Z
- Scope: Phase 1 + Phase 2 + Phase 3 delivered modules
- Environment: local backend `127.0.0.1:3145`, frontend `127.0.0.1:3146/qms`

## Bootstrap

| Step | Result | Evidence |
|---|---|---|
| Health check | PASS | ok=true |
| Superadmin login | PASS | accessToken acquired |
| Protected profile | PASS | profile loaded |

## Phase 1

| Step | Result | Evidence |
|---|---|---|
| Event hub API | PASS | keys=7 |
| Frontend route /dashboard | PASS | HTTP 200 |
| Frontend route /event-hub | PASS | HTTP 200 |

## Shared

| Step | Result | Evidence |
|---|---|---|
| Create CAPA record for linkage | PASS | 5392e952-a713-410b-bd5c-710744fb7cd0 |

## Phase 2

| Step | Result | Evidence |
|---|---|---|
| Create complaint | PASS | 7b5e5a07-8693-4afd-9987-d8a7e0fc06a1 |
| Update complaint | PASS | updated |
| Link complaint to CAPA | PASS | linked |
| List complaints | PASS | count=2 |
| Create nonconformance | PASS | c97c7bf3-bfc5-4a90-8de0-e20262a0a6d9 |
| Update nonconformance | PASS | updated |
| Link nonconformance to CAPA | PASS | linked |
| List nonconformance | PASS | count=2 |
| Create supplier | PASS | e6758e62-e381-4889-a96e-7fd5525e6dcf |
| Create supplier audit | PASS | 2e9a49f9-360d-42fd-9107-a3eec3a224e7 |
| Create SCAR | PASS | 3fd6ad8c-00fb-4958-92c6-df242c099b4f |
| Update SCAR status | PASS | updated |
| Supplier quality snapshot | PASS | suppliers=2, scars=2 |
| Frontend route /complaints | PASS | HTTP 200 |
| Frontend route /nonconformance | PASS | HTTP 200 |
| Frontend route /supplier-quality | PASS | HTTP 200 |

## Phase 3

| Step | Result | Evidence |
|---|---|---|
| Create risk | PASS | 996a7d06-49d1-4ee0-b8f9-78411f02c570 |
| Update risk | PASS | updated |
| Add risk review | PASS | 844a2cd5-09ff-49c5-bc14-19fc00d0906a |
| Create training catalog item | PASS | TRN-161718 |
| Assign training by role | PASS | 8eec2ba0-dda5-4b88-b4f4-301978eb0c5d |
| Complete training assignment | PASS | completed |
| Read training catalog | PASS | count=3 |
| Create management review | PASS | f3c525fd-2179-4c17-b044-d4810bfb3cf4 |
| Update management review | PASS | updated |
| Create management action | PASS | 153c4caf-43f6-4b83-9e57-73e48cdc6bf3 |
| Close management action | PASS | closed |
| Generate quality insights | PASS | Highest complaint load is Critical severity (2). |
| Read cached insights | PASS | cached=1 |
| Configure PLM integration adapter | PASS | Connected |
| Trigger integration sync | PASS | Success |
| Read integrations snapshot | PASS | adapters=1, jobs=2 |
| Frontend route /risk-management | PASS | HTTP 200 |
| Frontend route /training-management | PASS | HTTP 200 |
| Frontend route /management-review | PASS | HTTP 200 |
| Frontend route /quality-insights | PASS | HTTP 200 |
| Frontend route /integrations | PASS | HTTP 200 |

## Summary

- Total checks: 44
- Passed: 44
- Failed: 0
- Overall: PASS
