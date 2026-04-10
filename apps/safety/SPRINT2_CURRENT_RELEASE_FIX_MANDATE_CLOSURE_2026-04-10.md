# Pharaxis Safety — Current Release Fix Mandate Closure
Date: 2026-04-10
Prepared for: Rohith / Varun / Bhavya / Rajeev
Status: Completed and re-verified

## F1-F4 Closure Status

| Fix ID | Mandate | Status | Implementation Summary |
|---|---|---|---|
| F1 | Regulatory clock must be DB-persisted scheduled logic with consistency validation | Completed | Added DB triggers on `safety_cases` insert/update to enforce `regulatory_due_at = received_at + regulatory_clock_days + regulatory_total_paused_minutes`; backfill query normalizes historical rows; app writes now update source fields and DB persists due date. |
| F2 | Listedness/Expectedness must be explicit human assessment (no text inference) | Completed | Removed auto text-matching inference logic; API now requires explicit `listedness`, `expectedness`, and mandatory `sourceReference`; frontend form updated to structured manual selection. |
| F3 | Every `cases.js` route must have explicit tenant protection; verify DB trigger coverage for INSERT/UPDATE | Completed | Route-by-route tenant audit completed; all routes have explicit protections via `assertCaseScope` and/or `assertOrgAccess + canAccessClient` and/or `resolveClientScope`; `case_tenant_scope` triggers exist for both INSERT and UPDATE. |
| F4 | Duplicate precheck must enforce all criteria and show matched criteria in UI | Completed | Duplicate engine now evaluates `(patient reference OR demographics) AND AE term overlap AND suspect product AND onset-date within configurable window`; per-candidate matched criteria returned and shown in UI. |

## Files Updated For Mandate

| File | Purpose |
|---|---|
| `apps/safety/backend/database/db.js` | Added `ae_onset_date`; added `trg_safety_cases_due_insert/update`; due-date backfill normalization; retained/verified `case_tenant_scope` insert/update triggers. |
| `apps/safety/backend/routes/cases.js` | Duplicate criteria engine overhaul; explicit tenant checks on all routes; DB-scheduled regulatory clock write flow; explicit listedness/expectedness assessment API. |
| `apps/safety/backend/constants.js` | Added default config `duplicate_precheck_onset_window_days=30`. |
| `apps/safety/backend/routes/systemConfig.js` | Allowed editing `duplicate_precheck_onset_window_days`. |
| `apps/safety/frontend/src/App.jsx` | Added demographics + AE onset date fields; duplicate precheck criteria display; structured listedness UI and payload updates. |
| `apps/safety/frontend/src/styles.css` | Added missing UI utility classes (`chip-row`, `inline-input.wide`). |
| `apps/safety/backend/tests/smoke-sprint2-kickoff.js` | Updated for new duplicate/listedness rules and assertions. |
| `apps/safety/backend/tests/uat-sprint2-focused.js` | Updated focused UAT flow for explicit listedness and expanded precheck criteria. |

## Route-by-Route Tenant Protection Audit (`apps/safety/backend/routes/cases.js`)

| Route | Tenant Guard Applied |
|---|---|
| `GET /dashboard/summary` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`) |
| `GET /dashboard/filters` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`/`created_by`) |
| `POST /dashboard/filters` | `assertOrgAccess` + `canAccessClient` + `resolveClientScope` |
| `DELETE /dashboard/filters/:filterId` | `assertOrgAccess` + filter ownership check + `canAccessClient` on filter client scope |
| `POST /precheck/duplicates` | `assertOrgAccess` + `canAccessClient` + `resolveClientScope` |
| `GET /drafts` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`/`created_by`) |
| `PUT /drafts/:draftKey` | `assertOrgAccess` + `canAccessClient` + `resolveClientScope` |
| `DELETE /drafts/:draftKey` | `assertOrgAccess` + `canAccessClient` + ownership/client-scope validation |
| `GET /regulatory/alerts` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`) |
| `POST /regulatory/alerts/run` | `assertOrgAccess` + `canAccessClient` |
| `GET /audit` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`) |
| `GET /audit/export` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`) |
| `GET /` | `assertOrgAccess` + `canAccessClient` + scoped SQL (`org_id`/`client_id`) |
| `POST /` | `assertOrgAccess` + `canAccessClient` + `resolveClientScope` |
| `GET /:caseId` | `assertCaseScope` |
| `PATCH /:caseId/intake` | `assertCaseScope` |
| `POST /:caseId/attachments` | `assertCaseScope` |
| `PATCH /:caseId/assign-reviewer` | `assertCaseScope` |
| `PATCH /:caseId/triage` | `assertCaseScope` |
| `POST /:caseId/status` | `assertCaseScope` |
| `POST /:caseId/exception` | `assertCaseScope` |
| `PATCH /:caseId/regulatory-clock` | `assertCaseScope` |
| `POST /:caseId/regulatory-clock/action` | `assertCaseScope` |
| `GET /:caseId/sla-checkpoints` | `assertCaseScope` |
| `GET /:caseId/workflow` | `assertCaseScope` |
| `GET /:caseId/audit` | `assertCaseScope` |
| `GET /:caseId/duplicates` | `assertCaseScope` |
| `GET /:caseId/narrative` | `assertCaseScope` |
| `POST /:caseId/narrative/generate` | `assertCaseScope` |
| `PATCH /:caseId/narrative/:narrativeId` | `assertCaseScope` |
| `GET /:caseId/listedness` | `assertCaseScope` |
| `POST /:caseId/listedness` | `assertCaseScope` |

## DB Trigger Verification

| Trigger | Scope | Purpose |
|---|---|---|
| `trg_case_tenant_scope_insert` | `case_tenant_scope` BEFORE INSERT | Blocks invalid org/client combinations at DB layer. |
| `trg_case_tenant_scope_update` | `case_tenant_scope` BEFORE UPDATE | Blocks tenant-reassignment attacks via UPDATE. |
| `trg_safety_cases_due_insert` | `safety_cases` BEFORE INSERT | Computes/persists due date from receipt/clock/paused minutes and validates consistency. |
| `trg_safety_cases_due_update` | `safety_cases` BEFORE UPDATE | Recomputes/persists due date on any source-field change and validates consistency. |

## Re-Verification Evidence

| Command | Result |
|---|---|
| `npm run build` (frontend) | Passed |
| `npm run test:smoke:sprint2:kickoff` | Passed |
| `npm run test:uat:sprint2:focused` | Passed |
| `npm run test:smoke:sprint1` | Passed |

## Release Acceptance Check

| Condition | Result |
|---|---|
| F1 delivered | Yes |
| F2 delivered | Yes |
| F3 delivered | Yes |
| F4 delivered | Yes |
| Smoke re-run passed | Yes |
| Focused UAT re-run passed | Yes |

