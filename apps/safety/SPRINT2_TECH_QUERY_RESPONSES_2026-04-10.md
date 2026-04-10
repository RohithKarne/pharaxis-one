# Pharaxis Safety — Sprint 2 Technical Query Responses
Date: 2026-04-10
Prepared by: Bala / Engineering

## Responses

| # | Raised By | Question | Response |
|---|---|---|---|
| 1 | Varun | Is tenant isolation enforced at DB query level in `rbac.js` and `tenantScopeService.js`, or only at middleware level? | Isolation is enforced in multiple layers: (a) middleware checks (`assertOrgAccess`, `canAccessClient`), (b) route SQL filters by `org_id`/`client_id`, and (c) DB trigger validation on `case_tenant_scope` for CRO/direct rules. So it is **not only middleware**, and not only those two files. |
| 2 | Varun | Is regulatory clock calculation happening at DB level as specified, or application-side arithmetic? | It is currently **application-side arithmetic** in `cases.js` (`computeDueAt`, pause/resume minute math), then persisted into `regulatory_due_at`. DB is used for storage/querying due dates, not for computing due dates. |
| 3 | Varun | How was listedness/expectedness implemented without RSI document management in place? | Implemented as a **rules-based interim method**: user submits `sourceLabel` and `knownReactions`; system compares normalized AE text with those reaction terms to derive listedness/expectedness. No RSI document repository/version lifecycle integration is present yet. |
| 4 | Rajeev | Is `tenantScopeService` wired into every route in `cases.js` without exception? | **No.** `resolveClientScope` is used in selected flows (duplicate precheck, draft save, create case), while many other routes use `assertCaseScope`/`canAccessClient` and scoped SQL filters instead. |
| 5 | Vanaja | Is narrative generation auto-generating from case field data, or is it a blank editor? | It **auto-generates** a narrative from case fields (case number, received date, reporter, patient reference, AE, product, triage, status). After generation, it is editable and can be approved. |
| 6 | Vanaja | Does duplicate precheck match on all four criteria — patient demographics, AE term, product, and date range? | **No.** Current logic uses patient reference + suspect product for candidate selection, then AE token overlap scoring. It does not currently use full demographics matching or a date-range condition. |
| 7 | Bala (Process) | Process flag on gate protocol | Acknowledged. Process baseline says Sprint 2 should start after Sprint 1 Gate 2. Gate protocol will be followed strictly from Sprint 3 onward: Gate 1 before dev start, Gate 2 before QA start, and explicit thread confirmation logged. |

## Evidence References

| Topic | Evidence |
|---|---|
| Middleware org/client checks | [rbac.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/middleware/rbac.js:13), [rbac.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/middleware/rbac.js:27) |
| Tenant scope resolver | [tenantScopeService.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/services/tenantScopeService.js:24) |
| DB trigger enforcement | [db.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/database/db.js:439), [db.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/database/db.js:453) |
| Regulatory clock app-side compute | [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:106), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:1786), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:1861) |
| Listedness interim logic | [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:2181), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:2192) |
| `tenantScopeService` usage points | [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:770), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:847), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:1266) |
| Total case route count context | [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:567), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:2176) |
| Narrative auto-generation | [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:2048), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:2063) |
| Duplicate precheck criteria | [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:401), [cases.js](/Users/rohithkarne/Pharaxis-One/apps/safety/backend/routes/cases.js:428) |
| Gate baseline in scope doc | [Safety Sprint 1 Scope.md](/Users/rohithkarne/Pharaxis-One/apps/safety/Safety%20Sprint%201%20Scope.md:44), [Safety Sprint 1 Scope.md](/Users/rohithkarne/Pharaxis-One/apps/safety/Safety%20Sprint%201%20Scope.md:316), [Safety Sprint 1 Scope.md](/Users/rohithkarne/Pharaxis-One/apps/safety/Safety%20Sprint%201%20Scope.md:317) |

