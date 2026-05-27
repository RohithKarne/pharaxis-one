# MIMS Production Runbook

> Status: Remote production hosting is currently inactive. Pharaxis apps are local-only as of 2026-05-27 because the AWS/EC2 host was deleted.

## Product Summary

| Item | Value |
| --- | --- |
| Product | MIMS |
| App path | `apps/mims` |
| Deploy workflow | `.github/workflows/deploy-mims.yml` manual disabled notice |
| Release workflow | `.github/workflows/release-mims.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | Retired remote process name: `mims` |
| Frontend path | `/mims/` |
| Health endpoint | `/mims/api/health` |

## Local Verification

1. Confirm `MIMS CI` passed.
2. Run backend and frontend locally.
3. Take MySQL backup for the local database before migration-heavy work.
4. If migrations or auth changes are included, confirm rollback path.

## Deploy

No active remote deploy exists. GitHub deploy workflows are manual-only disabled notices that fail intentionally and must not SSH, SCP, publish to `/var/www`, or restart PM2 until a new hosting target is approved.

## Local Runtime Verification

- `GET /mims/api/health`
- frontend shell loads at `/mims/`
- protected barrier behaves as expected
- admin login critical path
- inbox or dashboard basic path

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local DB only if migration or data corruption is involved.
3. Re-run smoke validation locally.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Restore proof required before production sign-off

## Observability Focus

- auth failures
- 401/403 spikes
- worker failures
- exception log growth
- PC signal/trending failures if feature enabled
