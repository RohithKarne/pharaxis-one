# QMS Structure Alignment Report

## Baseline

MIMS is the operational structure baseline: root scripts, backend layers, frontend modules/shared utilities, security gates, smoke tests, and runbooks.

## Current QMS State

| Area | Current State | Gap Against MIMS |
|---|---|---|
| Root scripts | Has dev/clean/stop commands | Missing root scan/test/gate commands |
| Backend | Strong `backend/src` layering with routes/services/middleware/db/tests | Needs root-wired static, smoke, and security gates |
| Frontend | Vue views/config/services/composables | Needs module/shared organization over time |
| Security | Has auth/RBAC/RLS direction and headers | Needs broad input security and segmented rate limit layer |
| Tests | Several backend/frontend smoke scripts exist | Needs consistent root commands and E2E entrypoint |
| Observability | Basic error handler | Needs request ID and service/error log pattern |

## Phase 1 Completed

| Improvement | Status |
|---|---|
| Root quality scripts | Added |
| Security scan script | Added |
| Backend syntax test | Added |
| Backend health smoke test | Added |
| Playwright config and smoke spec | Added |

## Next Phases

| Phase | Work |
|---|---|
| Phase 2 | Move frontend views into `modules/*` and shared utilities gradually |
| Phase 3 | Add input security middleware, request context, and segmented rate limits |
| Phase 4 | Add service/error log visibility and client telemetry |

## Phase 2 Completed

| Improvement | Status |
|---|---|
| Backend request context | Added |
| Backend input security middleware | Added |
| General API rate limiter | Added |
| `/api/v1` route mirror | Added |
| Error responses include request ID | Added |
| Frontend shared API utility scaffold | Added |
| Frontend shared session utility scaffold | Added |
| Frontend modules target folder | Added |
| Sprint-close gate includes build, scan, smoke, and E2E | Added |

## Phase 3 Alignment Completed

| Area | Completed Improvement | Current Result |
| --- | --- | --- |
| Frontend modules | Added module wrapper folders for auth, core, platform, quality, and superadmin pages. | Router now imports from module paths while preserving existing view implementations. |
| API versioning | Added `/api/v1` route mounting alongside legacy `/api` routes. | QMS can migrate consumers incrementally without breaking existing local URLs. |
| CI gates | Added QMS to app-specific CI via `.github/workflows/ci-qms.yml` backed by reusable workflow templates. | Static backend checks and secret scans are now enforced in CI. |
