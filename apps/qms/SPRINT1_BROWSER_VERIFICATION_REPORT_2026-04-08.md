# SPRINT1 Browser Verification Report (2026-04-08)

- Generated: 2026-04-09T09:34:07.970Z
- Backend Base URL: `http://127.0.0.1:3145/api`
- Frontend URL: `http://127.0.0.1:3146`
- Total checks: 20
- Passed: 20
- Failed: 0

| Check | Description | Result | Notes |
|---|---|---|---|
| 1 | POST /api/auth/login and store token | PASS | token received; currentUserId=13c79e6c-1827-4f01-857a-ec9f2e3fd11d; attempts=first:200 |
| 2 | GET /api/health | PASS | status=200 |
| 3 | GET /api/document-control/documents and store docId/versionId | PASS | documents=6; docId=b9f1af18-4dbb-49cb-aaab-d4090c2bb4e6; versionId=a0e002a5-e68f-4344-b5cf-1fc119c9f43d |
| 4 | GET /api/document-control/documents/:docId/versions/:versionId/controlled-preview | PASS | policy present with required fields=true |
| 5 | Controlled preview enforcement check | PASS | watermarkNonEmpty=true; booleansStructured=true |
| 6 | GET /api/capa | PASS | status=200 |
| 7 | POST /api/capa and store capaId | PASS | status=201; capaId=d48bd4a6-8edb-40fb-8790-dfbbae7515ff |
| 8 | GET /api/capa and verify created CAPA appears in list | PASS | recordExists=true; total=85 |
| 9 | GET /api/deviations | PASS | status=200 |
| 10 | POST /api/deviations and store deviationId | PASS | status=201; deviationId=8f3ba355-2c69-41dd-b7ad-d0a865bc4145 |
| 11 | GET /api/audits | PASS | status=200 |
| 12 | POST /api/audits and store auditId | PASS | status=201; auditId=a07d38aa-2635-4e92-8a4c-6af68b56bb61 |
| 13 | POST /api/audits/binder/generate and print time | PASS | status=201; timeMs=26 |
| 14 | GET /api/validation/systems | PASS | status=200 |
| 15 | POST /api/validation/systems and store systemId | PASS | status=201; systemId=56b7a626-9ca0-4c16-b0e6-3e9236a5e0b0 |
| 16 | GET /api/validation/systems (re-verify systems list) | PASS | status=200 |
| 17 | GET /api/platform/notifications | PASS | status=200 |
| 18 | POST /api/platform/events/outbox | PASS | status=201 |
| 19 | GET /api/superadmin/orgs | PASS | status=200 |
| 20 | GET /api/superadmin/users | PASS | status=200 |