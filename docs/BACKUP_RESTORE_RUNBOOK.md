# Backup and Restore Runbook

Effective date: 2026-04-30
Owner: Engineering + Operations
Purpose: define minimum backup, restore, and rollback routine before production sign-off.

## Rule

No app is production ready without proof of restore.

Backup existing data is not enough. Team must prove restore works.

## Scope

Active data stores in this repo:

- `cp-portal` -> MySQL
- `mims` -> MySQL

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

- `cp-portal` -> `/api/health`, admin login page, admin auth route
- `mims` -> `/api/health`, admin login, inbox endpoint

## Rollback Plan

If deploy fails:

1. stop traffic or remove broken release from Nginx/static path
2. reload last known-good PM2 process set
3. restore DB only if migration/data corruption occurred
4. rerun postdeploy smoke on rolled-back release

## Uploaded Files

Added 2026-09-27. A database backup holds only where each uploaded file sits, not the file. Restore the database alone and every logo, document and attachment it points to is missing. Back up each app's upload folder with its database, and restore them together.

What each app keeps on disk:

- `mims` — organisation logos, content-management documents, case attachments, email attachments, and the original email behind each imported case. All under one storage folder.
- `cp-portal` — client logos, documents, safety-alert attachments and portal submission attachments. All under one uploads folder.

Settings that move them:

- `mims` — one setting can move case attachments to another folder; back that folder up too. Another sends case attachments to cloud storage instead; they are then protected by that bucket, not by this procedure. Everything else stays in the storage folder.
- `cp-portal` — none. Local disk is the only storage it has.

Backup, in the same window as each database backup:

1. take the database backup first, then the file archive — a file is saved before its record, so this order never leaves a record without its file
2. keep the archive off-host with the database backup, same retention
3. record the archive name next to the backup artifact id

Restore:

1. stop the app
2. restore the database as above
3. move the current upload folder aside, then unpack the archive in its place
4. make sure the app's user can read and write the restored folder
5. start the app, then open one logo and download one document or attachment named in the restored database — each must come back as the file itself; MIMS answers a missing logo with its home page, not an error, so check it is an image

Commands, run from the repository root on the app host:

```bash
# backup
tar -czf mims-files-$(date +%Y%m%d-%H%M).tar.gz -C apps/mims/backend storage
tar -czf cp-files-$(date +%Y%m%d-%H%M).tar.gz -C apps/cp-portal/backend uploads
# mims only, when STORAGE_LOCAL_ROOT points outside apps/mims/backend/storage
tar -czf mims-attachments-$(date +%Y%m%d-%H%M).tar.gz -C "$(dirname "$STORAGE_LOCAL_ROOT")" "$(basename "$STORAGE_LOCAL_ROOT")"

# restore (app stopped)
mv apps/mims/backend/storage apps/mims/backend/storage.pre-restore
tar -xzf mims-files-<stamp>.tar.gz -C apps/mims/backend
mv apps/cp-portal/backend/uploads apps/cp-portal/backend/uploads.pre-restore
tar -xzf cp-files-<stamp>.tar.gz -C apps/cp-portal/backend
```

Where these folders are set:

- `apps/mims/backend/routes/platformAdmin.js` — org logos, `storage/org_logos`
- `apps/mims/backend/routes/cm/documents.js`, `modules.js`, `mergeReports.js` — `storage/cm_documents`
- `apps/mims/backend/services/fileStorageService.js` — attachments, `storage/uploads`, or `STORAGE_LOCAL_ROOT`; `STORAGE_PROVIDER=s3` with `STORAGE_S3_BUCKET` for cloud
- `apps/mims/backend/services/emailPoller.js` — `storage/email_attachments`
- `apps/mims/backend/services/emailCaseImportService.js` — `storage/email_case_sources`
- `apps/cp-portal/backend/routes/admin/branding.js`, `admin/documents.js`, `admin/safety.js`, `portal/submit.js` — `uploads/logos`, `uploads/private/…`
- `apps/cp-portal/backend/utils/storage.js` — only `local` is implemented

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
- `docs/runbooks/CP_PORTAL_PRODUCTION_RUNBOOK.md`

The QMS and AI Agent runbooks were deleted with those products on 2026-09-09
(SOP §43–§45). The 2026-04-30 restore drill recorded further down ran against
QMS and is kept as the historical record of that drill.

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
