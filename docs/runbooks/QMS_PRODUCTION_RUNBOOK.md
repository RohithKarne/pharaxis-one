# QMS Production Runbook

> Status: Remote production hosting is currently inactive. Pharaxis apps are local-only as of 2026-05-27 because the AWS/EC2 host was deleted.

## Product Summary

| Item | Value |
| --- | --- |
| Product | QMS |
| App path | `apps/qms` |
| Deploy workflow | `.github/workflows/deploy-qms.yml` manual disabled notice |
| Release workflow | `.github/workflows/release-qms.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + PostgreSQL + Vue/Vite |
| PM2 app | Retired remote process name: `qms` |
| Frontend path | `/qms/` |
| Health endpoint | `/qms/api/health` |

## Local Verification

1. Confirm `QMS CI` passed.
2. Run backend and frontend locally.
3. Confirm auth and RBAC-related changes have smoke coverage if touched.

## Deploy

No active remote deploy exists. GitHub deploy workflows are manual-only disabled notices that fail intentionally and must not SSH, SCP, publish to `/var/www`, or restart PM2 until a new hosting target is approved.

## Local Runtime Verification

- `GET /qms/api/health`
- `GET /qms/api/auth/orgs`
- protected route with auth
- frontend login route
- RBAC-sensitive flow if impacted

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local PostgreSQL only when data or migration fault exists.

## Data Recovery

- DB type: PostgreSQL
- Backup requirement: daily + predeploy
- Restore proof required with app boot against restored target

## Observability Focus

- auth failures
- RLS or permission regressions
- audit or workflow notification failures
- DB readiness failures
