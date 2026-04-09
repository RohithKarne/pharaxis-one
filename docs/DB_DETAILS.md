# Database Details - Pharaxis-One

This document captures the current database setup used by the codebase.

## Shared MySQL Defaults

All services use MySQL via environment variables:

- `MYSQL_HOST` (default: `localhost`)
- `MYSQL_PORT` (default: `3306`)
- `MYSQL_USER` (default in code: `devuser`)
- `MYSQL_PASSWORD` (default in code: `devpass`)
- `MYSQL_DATABASE` (service-specific; see below)

## Service-Level Databases

| Service | Code Path | Default Database Name |
|---|---|---|
| MIMS | `apps/medical-affairs/mims/backend/database/db.js` | `pharaxis_mims_dev` |
| CP Portal | `apps/medical-affairs/cp-portal/backend/database/db.js` | `cp_portal_dev` |
| AI-Agent | `apps/ai-agent/backend/database/db.js` | `pharaxis_ai_agent_dev` |
| Vault | `apps/vault/backend/database/db.js` | `pharaxis_vault_dev` |

## Initialization Behavior

- Each backend initializes required tables automatically on startup (`CREATE TABLE IF NOT EXISTS` pattern).
- Seed/bootstrap users are created if missing:
  - MIMS: `superadmin` / `Manager@123`
  - CP Portal: `cpadmin` / `Admin@123`
- Change default credentials immediately in non-local environments.

## Recommended Local Setup

1. Start MySQL 8+.
2. Create databases:
   - `pharaxis_mims_dev`
   - `cp_portal_dev`
   - `pharaxis_ai_agent_dev`
   - `pharaxis_vault_dev`
3. Set environment variables (`MYSQL_*`) for each app.
4. Start each backend once to auto-create tables.

## Security Notes

- Do not commit `.env` files.
- Do not commit SQL backup dumps from local machines.
- Use separate credentials per environment (dev/stage/prod).
