# Vault Production Runbook

> Status: Remote production hosting is currently inactive. Pharaxis apps are local-only as of 2026-05-27 because the AWS/EC2 host was deleted.

## Product Summary

| Item | Value |
| --- | --- |
| Product | Vault |
| App path | `apps/vault` |
| Deploy workflow | `.github/workflows/deploy-vault.yml` manual disabled notice |
| Release workflow | `.github/workflows/release-vault.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | Retired remote process name: `vault` |
| Frontend path | `/vault/` |
| Health endpoint | `/vault/api/health` |

## Local Verification

1. Confirm `Vault CI` passed.
2. Run backend and frontend locally.
3. Confirm object-storage and SMTP credentials are valid if touched.

## Deploy

No active remote deploy exists. GitHub deploy workflows are manual-only disabled notices that fail intentionally and must not SSH, SCP, publish to `/var/www`, or restart PM2 until a new hosting target is approved.

## Local Runtime Verification

- `GET /vault/api/health`
- frontend shell at `/vault/`
- protected barrier behavior
- login and document access path

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local MySQL only when required by data or migration fault.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- External storage paths should also be included in ops planning

## Observability Focus

- auth failures
- upload/storage failures
- SMTP or notification failures
- DB availability
