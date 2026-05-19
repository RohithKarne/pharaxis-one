# Vault Production Runbook

## Product Summary

| Item | Value |
| --- | --- |
| Product | Vault |
| App path | `apps/vault` |
| Deploy workflow | `.github/workflows/deploy-vault.yml` |
| Release workflow | `.github/workflows/release-vault.yml` |
| GitHub environment | `vault-prod` |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | `vault` |
| Frontend path | `/vault/` |
| Health endpoint | `/vault/api/health` |

## Predeploy

1. Confirm `Vault CI` passed.
2. Confirm MySQL backup exists.
3. Confirm object-storage and SMTP credentials are valid if touched.

## Deploy

1. Merge to `main`.
2. GitHub runs `.github/workflows/deploy-vault.yml`.
3. Approve `vault-prod` if configured.

## Postdeploy Verification

- `GET /vault/api/health`
- frontend shell at `/vault/`
- protected barrier behavior
- login and document access path

## Rollback

1. Revert or redeploy last good commit.
2. Restore MySQL only when required by data or migration fault.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- External storage paths should also be included in ops planning

## Observability Focus

- auth failures
- upload/storage failures
- SMTP or notification failures
- DB availability
