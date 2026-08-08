# CP Portal Database Migrations

This folder is the forward migration home for CP Portal schema changes.

App startup runs SQL migrations first (`runMigrations()`), then the legacy bootstrap in `db.js` as a compatibility fallback for environments created before migration-first rollout. New structural/schema changes should be added here as numbered SQL migrations and applied with:

```bash
npm run db:migrate
```

## Provisioning a new environment

Point the app at an empty database and start it, or run `npm run db:migrate` and then start it. There is no manual ordering to remember.

That works because of `0000_baseline.sql`, which carries the complete schema. Before it existed, a fresh database could not be provisioned at all: the 42 `CREATE TABLE`s lived only in `db.js`, so the first FK-bearing migration (`0002` → `cp_clients`) failed with `ER_FK_CANNOT_OPEN_PARENT` and startup exited 1. Running the bootstrap first did not help either — `db.js` had absorbed several later changes, so a bootstrapped schema then collided with `0005` and `0009` on duplicate columns.

Because the baseline already contains everything `0002`–`0012` do, it records those filenames in `cp_schema_migrations` as it runs so they are skipped. `migrate.js` therefore checks the applied-set **per file** rather than snapshotting it before the loop — a snapshot cannot see rows a migration writes about itself.

`db.js` still owns the superadmin and default-form-field seeds, which cannot live here (bcrypt, an env var, and the no-seed-data rule below). Its bootstrap-state early-return is unchanged, so existing databases are unaffected: every baseline statement is `CREATE TABLE IF NOT EXISTS` and its bookkeeping insert is `INSERT IGNORE`.

Two checks cover this:

- `npm run test:provision` — fake pool, no database. Proves the ordering and bookkeeping. Does **not** prove the DDL is valid MySQL.
- `npm run test:provision:mysql` — provisions a throwaway database on a real server, asserts the resulting schema, and re-runs to prove idempotency. Skips when `MYSQL_HOST` is unset. Run it against a real server before trusting a schema change:

```bash
MYSQL_HOST=127.0.0.1 MYSQL_USER=devuser MYSQL_PASSWORD=devpass npm run test:provision:mysql
```

This is not wired into CI: the CP Portal CI job runs `npm ci` at the app root only, so `mysql2` is not installed for the backend there.

Rules:
- Use monotonic filenames like `0002_add_request_context.sql`.
- Keep migrations additive and reversible where possible.
- Do not place seed data or local credentials in migration files.
- Declare indexes inline as `KEY` clauses. MySQL has no `CREATE INDEX IF NOT EXISTS`, so a standalone `CREATE INDEX` fails with errno 1061 on any database that already has it.
- When a change also belongs in `db.js`, keep the two definitions identical. They have drifted before — see the SSO note in `0000_baseline.sql`.
