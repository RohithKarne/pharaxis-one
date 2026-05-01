# CP Portal Structure Alignment Report

## Baseline

MIMS is the structure baseline for app operations: root scripts, backend layers, shared frontend utilities, security gates, smoke tests, and documented runbooks.

## Current CP Portal State

| Area | Current State | Gap Against MIMS |
|---|---|---|
| Root scripts | Has `dev:all`, `dev:clean`, `stop:ports` | Missing scan/test/gate commands |
| Backend | Has `routes`, `middleware`, `database`, `scripts`, `utils` | Missing `services`, migrations history, tests |
| Frontend | Split into `admin` and `portal` | Missing shared API/UI/session/error layer |
| Security | Has CORS, headers, auth/submit rate limits | Missing broad input security and standardized upload validation |
| Tests | Browser verification script exists | Missing npm-wired static, smoke, and Playwright gates |
| Observability | Has process log capture | Missing request ID and shared service/error logging pattern |

## Phase 1 Completed

| Improvement | Status |
|---|---|
| Root test/security script plan | Added |
| Security scan script | Added |
| Backend syntax test | Added |
| Backend health smoke test | Added |
| Migration folder and runner scaffold | Added |
| Playwright config and smoke spec | Added |
| Base-path router alignment | Added |
| Email verification token query-string removal | Added |

## Next Phases

| Phase | Work |
|---|---|
| Phase 2 | Add `backend/services` and move reusable business logic out of large routes gradually |
| Phase 3 | Add `frontend/src/shared/api`, `shared/components`, `shared/context`, and `shared/utils` |
| Phase 4 | Add input security middleware, request context, and global error handler |
| Phase 5 | Add upload validation middleware and expand automated smoke coverage |

## Guardrails

| Rule | Reason |
|---|---|
| Do not move admin/portal pages in one batch | Avoid route/import regressions |
| Keep business functionality unchanged during structure work | This phase is architecture alignment only |
| Validate each batch with npm scripts | Prevent silent breakage |

## Phase 2 Completed

| Improvement | Status |
|---|---|
| Backend request context | Added |
| Backend input security middleware | Added |
| General API rate limiter | Added |
| Global error handler | Added |
| Process log capture moved into service layer | Added |
| Frontend shared API utility | Added |
| Frontend shared session utility | Added |
| Frontend error boundary | Added |
| Sprint-close gate includes build, scan, smoke, and E2E | Added |

## Phase 3 Alignment Completed

| Area | Completed Improvement | Current Result |
| --- | --- | --- |
| Backend services | Extracted client listing/detail read logic into `backend/services/clientService.js`. | Admin client routes are thinner and closer to the MIMS service/controller pattern. |
| Frontend API layer | Updated `ClientsPage.jsx` to call the shared `apiJson` client. | New CP screens have a reusable API path instead of repeated raw fetch handling. |
| CI gates | Added CP Portal to root app quality/security matrix in `.github/workflows/ci.yml`. | Static backend checks and secret scans are now enforced in CI. |
