# Backup and Restore Runbook

Effective date: 2026-04-30
Owner: Engineering + Operations
Purpose: define minimum backup, restore, and rollback routine before production sign-off.

## Rule

No app is production ready without proof of restore.

Backup existing data is not enough. Team must prove restore works.

## Scope

Active data stores in this repo:

- `vault` -> MySQL
- `cp-portal` -> MySQL
- `mims` -> MySQL
- `ai-agent` -> MySQL
- `qms` -> PostgreSQL

## Backup Standard

Daily minimum:

- one full DB backup per app
- retention at least 7 daily, 4 weekly, 3 monthly
- backup location outside app server disk

Before deploy:

- predeploy backup for affected DB
- schema migration snapshot if migration included

## Restore Drill Standard

Run at least once per environment before production sign-off:

1. create restore target database
2. restore latest backup
3. run app health check against restored DB
4. run smoke test against restored DB
5. record elapsed restore time and result

## Example Commands

MySQL:

```bash
mysqldump --host=127.0.0.1 --port=3306 -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" > backup.sql
mysql --host=127.0.0.1 --port=3306 -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$RESTORE_DATABASE" < backup.sql
```

PostgreSQL:

```bash
pg_dump "$DATABASE_URL" > backup.sql
psql "$RESTORE_DATABASE_URL" < backup.sql
```

## App Verification After Restore

Minimum checks:

- `vault` -> `/api/health`, org login, notifications feed
- `qms` -> `/api/health`, `/api/auth/orgs`, protected route with auth
- `cp-portal` -> `/api/health`, admin login page, admin auth route
- `mims` -> `/api/health`, admin login, inbox endpoint
- `ai-agent` -> `/api/v1/agent/health`, admin barrier route

## Rollback Plan

If deploy fails:

1. stop traffic or remove broken release from Nginx/static path
2. reload last known-good PM2 process set
3. restore DB only if migration/data corruption occurred
4. rerun postdeploy smoke on rolled-back release

## Evidence Required

Record each drill:

- date
- environment
- app/database
- backup artifact id
- restore target
- smoke result
- restore duration
- owner

## Product Runbook References

- `docs/runbooks/MIMS_PRODUCTION_RUNBOOK.md`
- `docs/runbooks/QMS_PRODUCTION_RUNBOOK.md`
- `docs/runbooks/VAULT_PRODUCTION_RUNBOOK.md`
- `docs/runbooks/CP_PORTAL_PRODUCTION_RUNBOOK.md`
- `docs/runbooks/AI_AGENT_PRODUCTION_RUNBOOK.md`

## This Repo Next Step

Still needed after this document:

- actual scheduled backup job definition per product
- actual storage destination per product
- restore proof for MySQL-backed products on production-like hosts

## Recorded Drill Evidence

Date: 2026-04-30
Environment: local verification
App/database: `qms` / `qms_dev`
Backup artifact: `/tmp/qms_restore_drill_20260430.dump`
Restore target: `qms_restore_drill_20260430`
Owner: Varun
Result: PASS

Evidence:

- backup created with `pg_dump -Fc`
- restore completed with `pg_restore`
- restored public table count: `93`
- temporary QMS backend started on restored DB at port `4155`
- `GET /api/health` returned success payload
- `GET /api/auth/orgs` returned live org list payload

Follow-up still required:

- repeat same proof on production-like host
- add automated backup scheduling and off-host retention
