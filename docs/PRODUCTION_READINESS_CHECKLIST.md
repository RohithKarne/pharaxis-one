# Pharaxis-One Production Readiness Checklist

Effective date: 2026-04-30
Owner: Engineering + PMO
Purpose: define minimum release bar for active Pharaxis-One apps before calling any environment production ready.

## Current Hosting Status

**Local only as of 2026-09-24.** Every deployment pipeline, container image and server template was removed, including the Google Cloud pipeline that had been live for CP Portal. A cloud will be chosen later and the path built for it then (`TEAM_OPERATING_SOP.md` §38.12). This checklist is the bar to meet **when** that happens — it is not evidence that any production environment exists.

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

- [ ] Frontend build runs in CI for `mims`, `cp-portal`
- [ ] Backend syntax/startup gate runs in CI for all active apps
- [ ] Security scan runs per app
- [ ] New hosting target is approved before deploy workflows are re-enabled
- [ ] Each app has its own deploy workflow and production environment after hosting is restored
- [ ] The chosen process manager reloads rather than stopping and restarting everything
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
- [ ] A process-manager config exists and is current (none today — removed 2026-09-24)
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
| CP Portal | Frontend build passing. Backend syntax passing. | Keep admin/public route separation, restrict production origins, verify scheduler behavior on restart, add postdeploy smoke for admin login and portal load. |
| MIMS | Frontend build passing. Backend syntax passing. Existing logging/security strongest in repo. | Restrict production CORS, keep regression and health reporting green, prove backup/restore, and gate release on regression smoke. |

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
