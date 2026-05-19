# CP Portal Production Runbook

## Product Summary

| Item | Value |
| --- | --- |
| Product | CP Portal |
| App path | `apps/cp-portal` |
| Deploy workflow | `.github/workflows/deploy-cp-portal.yml` |
| Release workflow | `.github/workflows/release-cp-portal.yml` |
| GitHub environment | `cp-portal-prod` |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | `cp-portal` |
| Frontend path | `/cp-portal/` |
| Health endpoint | `/cp-portal/api/health` |

## Predeploy

1. Confirm `CP Portal CI` passed.
2. Confirm MySQL backup exists.
3. Confirm admin/public portal behavior is understood for the release.

## Deploy

1. Merge to `main`.
2. GitHub runs `.github/workflows/deploy-cp-portal.yml`.
3. Approve `cp-portal-prod` if configured.

## Postdeploy Verification

- `GET /cp-portal/api/health`
- frontend shell at `/cp-portal/`
- protected barrier behavior
- admin login or auth me route
- public portal landing path

## Rollback

1. Revert or redeploy last good commit.
2. Restore MySQL only if needed for data or migration fault.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Upload persistence should be treated as production data

## Observability Focus

- admin auth failures
- public portal errors
- scheduler behavior after restart
- upload/storage health
