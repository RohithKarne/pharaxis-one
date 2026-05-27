# Pharaxis-One Production Readiness Checklist

Effective date: 2026-04-30
Owner: Engineering + PMO
Purpose: define minimum release bar for active Pharaxis-One apps before calling any environment production ready.

## Current Hosting Status

Pharaxis apps are local-only as of 2026-05-27. The previous AWS/EC2 host has been deleted, and GitHub remote deployment is disabled. This checklist is retained as a future production-readiness bar, not as evidence that a production environment currently exists.

## Release Rule

No app is production ready until all gates below are green:

- `Build`: frontend production build passes and backend syntax/startup checks pass in CI
- `Security`: secrets are externalized, CORS is restricted, auth routes are rate-limited, and security headers are enabled
- `Deploy`: zero-downtime process reload is in place and change detection is reliable across multi-commit pushes
- `Runtime`: health endpoint, readiness check, graceful shutdown, and restart-safe cron behavior are verified
- `Data`: backup, restore drill, migration rollback, and seed strategy are documented and tested
- `Observability`: request tracing, structured logs, alerts, and postdeploy smoke checks exist
- `Verification`: QA evidence exists for happy path, negative path, regression path, and deployment smoke

## Shared Checklist

### CI/CD

- [ ] Frontend build runs in CI for `vault`, `qms`, `cp-portal`, `mims`, `ai-agent`
- [ ] Backend syntax/startup gate runs in CI for all active apps
- [ ] Security scan runs per app
- [ ] New hosting target is approved before deploy workflows are re-enabled
- [ ] Each app has its own deploy workflow and production environment after hosting is restored
- [ ] PM2 or replacement process manager deploy path uses reload/startOrReload, not delete-all restart
- [ ] Postdeploy smoke step exists per app after hosting is restored
- [ ] App-specific release tag and release workflow are defined

### Security

- [ ] `NODE_ENV=production`
- [ ] No dev passwords, seed passwords, or raw secrets in deployed env files
- [ ] Frontend API targets use production domain/TLS, not bare server IP long-term
- [ ] CORS allowlist is explicit per environment
- [ ] `CORS_ALLOW_ALL` stays off in production
- [ ] Security headers enabled
- [ ] Rate limits exist for auth and API surfaces
- [ ] Body size and parameter limits are defined

### Runtime Ops

- [ ] Health endpoint responds
- [ ] Readiness check covers DB connectivity
- [ ] Cron/scheduler registration is known and restart-safe
- [ ] Graceful shutdown handles `SIGTERM`
- [ ] PM2 ecosystem config is current
- [ ] Nginx/static publish directories are documented

### Data + Recovery

- [ ] Backup schedule documented
- [ ] Restore drill executed and timed
- [ ] Migration rollback plan documented
- [ ] Environment-specific DB names and users confirmed
- [ ] Product-specific runbook exists

### Observability

- [ ] Request IDs available in logs or response headers
- [ ] Structured error logging enabled
- [ ] Alerting exists for process crash, DB outage, and deploy failure
- [ ] Smoke verification artifacts are stored after release
- [ ] Monitoring owner is defined per product

## App Table

| App | Current state | Must be true before prod sign-off |
| --- | --- | --- |
| Vault | Frontend build passing. Backend syntax passing. | Restrict backend CORS, keep request tracing, verify S3/SMTP credentials via readiness, add deploy smoke, complete backup/restore proof. |
| QMS | Frontend build passing. Backend syntax passing. | Keep RBAC smoke in release path, confirm PostgreSQL readiness probe, verify RLS/auth flows after deploy, externalize production origins and JWT secrets. |
| CP Portal | Frontend build passing. Backend syntax passing. | Keep admin/public route separation, restrict production origins, verify scheduler behavior on restart, add postdeploy smoke for admin login and portal load. |
| MIMS | Frontend build passing. Backend syntax passing. Existing logging/security strongest in repo. | Restrict production CORS, keep regression and health reporting green, prove backup/restore, and gate release on regression smoke. |
| AI Agent | Frontend build passing. Backend syntax passing. | Add API rate limiting, explicit CORS, graceful shutdown, provider-key readiness checks, and secret rotation controls before prod use. |

## Evidence Required Per Release

- CI run URL with all expected jobs green
- Deploy run URL with changed-app detection output after hosting is restored
- Postdeploy smoke output after hosting is restored
- Local runtime verification notes while apps are local-only
- QA report with happy path, negative path, regression path
- Rollback plan and on-call owner

## This Turn Summary

Changes introduced in this repo now cover:

- repo-level production checklist
- per-app CI, disabled deploy, and release workflows
- product-specific operating docs and runbooks
