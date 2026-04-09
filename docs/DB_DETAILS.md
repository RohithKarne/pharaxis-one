# Database Details - Pharaxis-One

This document defines the current database setup used by Pharaxis-One services.

## Database Engine

- Engine: MySQL 8+
- Pattern: One logical database per service
- Connection method: `mysql2` pool in each backend

## Shared Environment Variables

All backend services use these variables:

- `MYSQL_HOST` (default usually `localhost`)
- `MYSQL_PORT` (default usually `3306`)
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE` (service-specific)

## Service Database Mapping

| Service | Database | Config Path |
|---|---|---|
| MIMS | `pharaxis_mims_dev` | `apps/medical-affairs/mims/backend/database/db.js` |
| CP Portal | `pharaxis_cp_portal_dev` | `apps/medical-affairs/cp-portal/backend/database/db.js` |
| AI-Agent | `pharaxis_ai_agent_dev` | `apps/ai-agent/backend/database/db.js` |
| Vault | `pharaxis_vault_dev` | `apps/vault/backend/database/db.js` |

## Initialization Behavior

- Each backend initializes core tables on startup (`CREATE TABLE IF NOT EXISTS`).
- This allows local environments to bootstrap quickly with a clean database.
- Schema ownership remains service-local.

## Seed / Bootstrap Accounts

- MIMS bootstrap account: `superadmin` (initial default password exists in code)
- CP Portal bootstrap account: `cpadmin` (initial default password exists in code)

Important:
- Treat defaults as local-dev only.
- Rotate/override credentials in shared or production environments.

## Local Setup Sequence

1. Start MySQL.
2. Create service databases:
   - `pharaxis_mims_dev`
   - `pharaxis_cp_portal_dev`
   - `pharaxis_ai_agent_dev`
   - `pharaxis_vault_dev`
3. Copy `.env.example` to `.env` for each service.
4. Set `MYSQL_*` values per environment.
5. Start service backends once to initialize tables.

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
