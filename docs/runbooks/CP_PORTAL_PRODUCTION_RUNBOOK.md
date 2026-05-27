# CP Portal Production Runbook

> Status: Remote production hosting is currently inactive. Pharaxis apps are local-only as of 2026-05-27 because the AWS/EC2 host was deleted.

## Product Summary

| Item | Value |
| --- | --- |
| Product | CP Portal |
| App path | `apps/cp-portal` |
| Deploy workflow | `.github/workflows/deploy-cp-portal.yml` manual disabled notice |
| Release workflow | `.github/workflows/release-cp-portal.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | Retired remote process name: `cp-portal` |
| Frontend path | `/cp-portal/` |
| Health endpoint | `/cp-portal/api/health` |

## Local Verification

1. Confirm `CP Portal CI` passed.
2. Run backend and frontend locally.
3. Confirm admin/public portal behavior is understood for the release.

## Deploy

No active remote deploy exists. GitHub deploy workflows are manual-only disabled notices that fail intentionally and must not SSH, SCP, publish to `/var/www`, or restart PM2 until a new hosting target is approved.

## Local Runtime Verification

- `GET /cp-portal/api/health`
- frontend shell at `/cp-portal/`
- protected barrier behavior
- admin login or auth me route
- public portal landing path

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local MySQL only if needed for data or migration fault.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Upload persistence should be treated as production data

## Observability Focus

- admin auth failures
- public portal errors
- scheduler behavior after restart
- upload/storage health
