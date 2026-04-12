# Database Details - Pharaxis-One

This document defines the current database setup used by Pharaxis-One services.

## Database Engines

- MySQL 8+ for MIMS, CP Portal, Publications, AI-Agent, Vault, and Safety
- PostgreSQL 14+ for QMS
- Pattern: one logical database per service

## Environment Contracts

MySQL services:

- `MYSQL_HOST` (default usually `localhost`)
- `MYSQL_PORT` (default usually `3306`)
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE` (service-specific)

PostgreSQL services:

- `DATABASE_URL` (QMS uses this directly via `pg` pool)

## Service Database Mapping

| Service | Engine | Database | Config Path |
|---|---|---|---|
| MIMS | MySQL | `pharaxis_mims_dev` | `apps/medical-affairs/mims/backend/database/db.js` |
| CP Portal | MySQL | `pharaxis_cp_portal_dev` | `apps/medical-affairs/cp-portal/backend/database/db.js` |
| Publications | MySQL | `pharaxis_publications_dev` | `apps/medical-affairs/publications/backend/database/db.js` |
| AI-Agent | MySQL | `pharaxis_ai_agent_dev` | `apps/ai-agent/backend/database/db.js` |
| Vault | MySQL | `pharaxis_vault_dev` | `apps/vault/backend/database/db.js` |
| Safety | MySQL | `pharaxis_safety_dev` | `apps/safety/backend/database/db.js` |
| QMS | PostgreSQL | `qms_dev` (local default via `DATABASE_URL`) | `apps/qms/backend/src/db/pool.js` |

## Initialization Behavior

- MySQL services initialize core tables at startup (`CREATE TABLE IF NOT EXISTS`).
- QMS schema is managed through SQL migration scripts (`apps/qms/backend/src/db/migrations/*.sql`) and `npm run db:migrate`.
- This allows local environments to bootstrap quickly with a clean database.
- Schema ownership remains service-local.

## Seed / Bootstrap Accounts

- MIMS bootstrap account: `superadmin` (initial default password exists in code)
- CP Portal bootstrap account: `cpadmin` (initial default password exists in code)
- Publications bootstrap account: `superadmin.publications@pharaxis.one` (default local password in app README/env example)
- Safety bootstrap account: `safety.superadmin@pharaxis.one` (default local password in app README/env example)
- QMS JWT-path local login: `admin@pharaxis.local` with org code `PHA_DEV` (see `apps/qms/README.md`)

Important:
- Treat defaults as local-dev only.
- Rotate/override credentials in shared or production environments.

## Local Setup Sequence

1. Start MySQL and PostgreSQL.
2. Create service databases:
   - `pharaxis_mims_dev`
   - `pharaxis_cp_portal_dev`
   - `pharaxis_publications_dev`
   - `pharaxis_ai_agent_dev`
   - `pharaxis_vault_dev`
   - `pharaxis_safety_dev`
   - `qms_dev` (or your configured PostgreSQL DB from `DATABASE_URL`)
3. Copy `.env.example` to `.env` for each service.
4. Set `MYSQL_*` values for MySQL services and `DATABASE_URL` for QMS.
5. Run `npm run db:migrate` in `apps/qms/backend`.
6. Start service backends once to initialize tables and seed local data.

## Security Rules

- Never commit `.env` files.
- Never commit local SQL backup dumps.
- Use different DB users/passwords per environment.
- Restrict DB user privileges to minimum required scope.

## Backup and Migration Notes

- Repository excludes local backup artifacts (`*_backup_*.sql`, `*.sql.gz`).
- Runtime artifacts are ignored and should be stored outside version control.
- Legacy CP Portal local database name `cp_portal_dev` is superseded by `pharaxis_cp_portal_dev`.

### Safe CP Portal DB Rename (Local)

If you already have data in `cp_portal_dev`, migrate it safely:

1. Export current CP Portal data.
2. Create new standardized DB.
3. Import into `pharaxis_cp_portal_dev`.
4. Update `MYSQL_DATABASE` in CP Portal backend `.env`.
5. Keep old DB for rollback until verification passes.

Example commands:

```bash
mysqldump -u devuser -pdevpass cp_portal_dev > /tmp/cp_portal_dev.sql
mysql -u devuser -pdevpass -e "CREATE DATABASE IF NOT EXISTS pharaxis_cp_portal_dev;"
mysql -u devuser -pdevpass pharaxis_cp_portal_dev < /tmp/cp_portal_dev.sql
```
