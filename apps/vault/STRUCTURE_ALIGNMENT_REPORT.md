# Vault Structure Alignment Report

## Baseline

MIMS is the operational structure baseline: root scripts, backend layers, frontend modules/shared utilities, security gates, smoke tests, and runbooks.

## Current Vault State

| Area | Current State | Gap Against MIMS |
|---|---|---|
| Root scripts | Has dev/clean/stop and several smoke commands | Missing security scan and standardized static/health gates |
| Backend | Has routes/services/middleware/database/tests | Missing migration history and scripts folder maturity |
| Frontend | Uses `modules/*` | Needs stronger shared API/session/error layer |
| Security | Has request context, headers, and API limiter | Needs input security and upload validation expansion |
| Tests | Has backend smoke and Playwright config | Needs root-wired static/security/health gates |
| Observability | Has request logging | Needs admin-visible service/error log pattern |

## Phase 1 Completed

| Improvement | Status |
|---|---|
| Root quality scripts | Added |
| Security scan script | Added |
| Backend syntax test | Added |
| Backend health smoke test | Added |
| Migration folder and runner scaffold | Added |
| Playwright smoke spec | Added |

## Next Phases

| Phase | Work |
|---|---|
| Phase 2 | Add input security middleware and centralized upload validation |
| Phase 3 | Expand frontend shared API/session/error utilities |
| Phase 4 | Add service/error log visibility and admin diagnostics |

## Phase 2 Completed

| Improvement | Status |
|---|---|
| Backend input security middleware | Added |
| Centralized upload validation middleware | Added |
| Upload routes use shared validation | Added |
| Shared frontend API utility | Added |
| Sprint-close gate includes build, scan, smoke, and E2E | Added |

## Phase 3 Alignment Completed

| Area | Completed Improvement | Current Result |
| --- | --- | --- |
| Upload security | Added centralized upload validation with blocked extensions, path checks, size checks, and magic-byte checks for PDF/PNG/JPEG. | Vault rejects obvious spoofed uploads before route business logic runs. |
| Frontend API layer | Added shared org/superadmin API helpers and moved taxonomy/folder screens to the shared org API helper. | Vault frontend has the same reusable API direction as MIMS-style screens. |
| CI gates | Added Vault to app-specific CI via `.github/workflows/ci-vault.yml` backed by reusable workflow templates. | Static backend checks and secret scans are now enforced in CI. |
