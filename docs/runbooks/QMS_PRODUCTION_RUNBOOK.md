# QMS Production Runbook

## Product Summary

| Item | Value |
| --- | --- |
| Product | QMS |
| App path | `apps/qms` |
| Deploy workflow | `.github/workflows/deploy-qms.yml` |
| Release workflow | `.github/workflows/release-qms.yml` |
| GitHub environment | `qms-prod` |
| Runtime | Node/Express + PostgreSQL + Vue/Vite |
| PM2 app | `qms` |
| Frontend path | `/qms/` |
| Health endpoint | `/qms/api/health` |

## Predeploy

1. Confirm `QMS CI` passed.
2. Confirm PostgreSQL backup exists.
3. Confirm auth and RBAC-related changes have smoke coverage if touched.

## Deploy

1. Merge to `main`.
2. GitHub runs `.github/workflows/deploy-qms.yml`.
3. Approve `qms-prod` if configured.

## Postdeploy Verification

- `GET /qms/api/health`
- `GET /qms/api/auth/orgs`
- protected route with auth
- frontend login route
- RBAC-sensitive flow if impacted

## Rollback

1. Revert or redeploy last good commit.
2. Re-run deploy workflow.
3. Restore PostgreSQL only when data or migration fault exists.

## Data Recovery

- DB type: PostgreSQL
- Backup requirement: daily + predeploy
- Restore proof required with app boot against restored target

## Observability Focus

- auth failures
- RLS or permission regressions
- audit or workflow notification failures
- DB readiness failures
