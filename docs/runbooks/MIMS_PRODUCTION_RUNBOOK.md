# MIMS Production Runbook

## Product Summary

| Item | Value |
| --- | --- |
| Product | MIMS |
| App path | `apps/mims` |
| Deploy workflow | `.github/workflows/deploy-mims.yml` |
| Release workflow | `.github/workflows/release-mims.yml` |
| GitHub environment | `mims-prod` |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | `mims` |
| Frontend path | `/mims/` |
| Health endpoint | `/mims/api/health` |

## Predeploy

1. Confirm `MIMS CI` passed.
2. Confirm required reviewer approval.
3. Take MySQL backup for the target environment.
4. If migrations or auth changes are included, confirm rollback path.

## Deploy

1. Merge to `main` with MIMS-only or intended MIMS changes.
2. GitHub runs `.github/workflows/deploy-mims.yml`.
3. Approve `mims-prod` if environment approval is enabled.
4. Verify workflow reached deploy completion.

## Postdeploy Verification

- `GET /mims/api/health`
- frontend shell loads at `/mims/`
- protected barrier behaves as expected
- admin login critical path
- inbox or dashboard basic path

## Rollback

1. Revert bad commit or redeploy last known good commit.
2. Re-run deploy workflow.
3. Restore DB only if migration or data corruption is involved.
4. Re-run smoke validation.

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
