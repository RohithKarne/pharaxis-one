# QMS Memory SOP
> **Purpose:** Single source of truth for the Pharaxis QMS application. Intended for any developer, QA engineer, or team member who needs to onboard or resume work without requiring verbal explanation.
> **Scope:** QMS app only. Other apps documented separately in their own SOP files.
> **Update Protocol:** This file is only updated when Rohith explicitly confirms. Rohith says "Bala, update the QMS Memory SOP — [what changed]" and Bala updates it. No one else modifies this file. Each update adds a version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-04-06 | Bala | Initial creation — skeleton. QMS not started. Placeholder for future development. |
| 2026-04-28 | Bala | Sprint 1 complete. Status updated from skeleton to active. Tech stack confirmed. Sprint history, local start command, ports, and DB details updated. |
| 2026-08-04 | Bala | **PostgreSQL → MySQL migration.** QMS was the last app on Postgres; it now runs on MySQL 8, matching MIMS, CP Portal, Vault and AI Agent. Tech stack, start commands, architecture, DB reference, known issues and technical rules all updated. Status is code-complete and engineer-verified — **not validated**. See §16. |
| 2026-08-04 | Bala | **Gate 2 approved by Rohith.** Section 16 status updated: QA complete, Gate 2 approved; CSV validation still outstanding. Gate 2 record filed at `apps/qms/QMS_GATE2_APPROVAL_MYSQL_MIGRATION_2026-08-04.md`. |

---

## 1. What Is QMS

**QMS — Quality Management System**
A Pharaxis One application for managing SOPs, validation documents, quality events, and compliance workflows across regulated industries.

**Status:** Sprint 1 complete — active in repo. Next sprint pending Rohith go-ahead.

**Industries:** Life sciences, pharma, healthcare.

**Relationship to other apps:** Will consume content from Pharaxis Vault via Content Channels API.

---

## 2. Full Tech Stack

### Backend
| Component | Technology | Detail |
|-----------|-----------|--------|
| Runtime | Node.js | v20+ |
| Framework | Express | Latest stable |
| Database | **MySQL 8.0.45** | via `mysql2` pool — migrated from PostgreSQL 2026-08-04 |
| Config | `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | `DATABASE_URL` is **no longer required to boot** — it is retained only for the migration tooling and the parity gates |
| Schema management | SQL migration scripts | `apps/qms/backend/src/db/mysql/migrations/*.sql` |
| Migration command | `npm run db:migrate:mysql` | Run once on a fresh DB |
| Password hashing | `bcrypt` (cost 10) | Was pgcrypto `crypt()` inside the DB — MySQL has none |
| Legacy Postgres | `src/db/migrations/*.sql`, `src/db/pool.js` | **Retained, read-only.** Source of record for migration verification. Do not delete. |

> **`.sql` files are gitignored** (`.gitignore:60`, added to block DB dumps). The
> migration files are tracked only because they were force-added with `git add -f`.
> A new migration file will NOT be committed unless you do the same.

### Frontend
| Component | Technology | Detail |
|-----------|-----------|--------|
| Framework | Vue | Latest stable |
| Build tool | Vite | Latest stable |
| Styling | Tailwind CSS | Latest stable |

---

## 3. How to Start the App

```bash
# Backend
cd apps/qms/backend
npm run dev          # node --watch server.js
# or: npm start      # node server.js

# Frontend
cd apps/qms/frontend
npm run dev
```

> Corrected 2026-08-04: this previously said `node --env-file=.env server.js`.
> `src/config/env.js` loads config with the `dotenv` package, so the flag is not
> required and the npm scripts do not use it. Verified against the running server.

**Local ports:**
- Backend: `3145`
- Frontend: `3146`

**DB bootstrap (MySQL):**
```bash
cd apps/qms/backend
npm run db:migrate:mysql   # build the schema
npm run db:seed:dev        # fixture org + 6 users
```

> `npm run db:seed:dev` **rewrites the dev users' passwords.** If `QMS_SEED_*_PASSWORD`
> is not set it generates a random one-time password and prints a warning — which
> silently locks you out of accounts you were using. Always pass them explicitly:
> `QMS_SEED_ADMIN_PASSWORD='...' npm run db:seed:dev`

**One-off data copy from the legacy PostgreSQL database:**
```bash
DRY_RUN=1 npm run db:copy:mysql   # inspect first
npm run db:copy:mysql             # copy + verify row counts per table
```

---

## 4. System Architecture

- MySQL 8 — single database `pharaxis_qms_dev` (via `MYSQL_DATABASE`)
- `org_id` on every table — multi-tenant, no schema-per-org
- SQL migration files manage schema (not auto-create at startup like the other MySQL apps)

**Tenant isolation is enforced in the application, not the database.**
PostgreSQL did it with Row Level Security — 92 tables, 101 policies — so the
database silently appended `org_id` to every tenant query. MySQL has no
equivalent. Every tenant-scoped query now carries its own `org_id` predicate.
**There is no database-level backstop:** a query that forgets it leaks across
orgs. `npm run test:tenant` fails the build if one does, and is the only thing
standing between a missing predicate and a cross-tenant read.

**Routes talk to MySQL through a pg-shaped adapter.** `src/db/mysql/pgCompat.js`
rewrites `$1` placeholders to `?`, returns `{ rows, rowCount }`, and JSON-encodes
objects bound to JSON columns. This is why ~440 call sites still read like
node-postgres code. Do not "clean this up" — it is what keeps the query layer
driver-agnostic.

**Request lifecycle:** `withMysqlTransaction` (`src/db/mysql/transactionContext.js`)
opens the transaction and rejects a tenant request with no org context. It
replaced `withRlsContext`, which existed to set the Postgres RLS session vars.

---

## 5. Team Structure

Full org chart in `docs/TEAM_OPERATING_SOP.md`. Restructured 2026-04-14 — 5-member team. See `memory/team.md` for full names and roles.

---

## 6. Frontend Route Map

> Defined in Sprint 1. Full route map in `apps/qms/QMS_SPRINT1_COMPLETED_VIEW.md`.

---

## 7. Backend API Map

> Defined in Sprint 1. Full API map in `apps/qms/QMS_SPRINT1_COMPLETED_VIEW.md`.

---

## 8. Admin Console Sections

> Defined in Sprint 1. Reference `apps/qms/QMS_SPRINT1_COMPLETED_VIEW.md`.

---

## 9. Database Tables Reference

| Detail | Value |
|--------|-------|
| Database name | `pharaxis_qms_dev` (via `MYSQL_DATABASE`); `pharaxis_qms_test` for tests |
| Engine | MySQL 8.0.45 |
| Multi-tenancy | `org_id` on every table — no exceptions, and now enforced only in the app |
| Schema source | `apps/qms/backend/src/db/mysql/migrations/*.sql` (18 files) |
| Scale | 92 tables, 923 columns, 268 foreign keys |
| Primary keys | `CHAR(36) DEFAULT (UUID())` — QMS keeps UUIDs; the other apps use `INT AUTO_INCREMENT` |
| Timestamps | `DATETIME(3)` UTC. The pool pins `timezone: 'Z'` and `SET time_zone = '+00:00'` per connection |
| Legacy | `qms_dev` on PostgreSQL — retained read-only |

---

## 10. Sprint History

| Sprint | Status | Key Deliverables |
|--------|--------|-----------------|
| Sprint 1 | ✅ COMPLETE (2026-04-09) | Auth/superadmin, document control, CAPA, deviations, audits, validation, platform shared services. 31/31 QA pass. Browser verified. Rohith signed off. |

---

## 11. Current Sprint

**Status: PAUSED — awaiting Rohith go-ahead for Sprint 2.**

Sprint 2 scope not yet defined. Build sequence priority: Pharaxis Vault first.

---

## 12. Known Issues and Technical Debt

**From the MySQL migration (2026-08-04):**

| Issue | Detail |
|---|---|
| **Audit chain: 259 events are link-verified only** | Events written before the cutover hashed the PostgreSQL text rendering of their timestamp and cannot be digest-recomputed. **Deliberately not re-anchored** — rewriting audit records is what 21 CFR Part 11.10(e) forbids. Disclosed by `/api/security/audit-chain/verify`. |
| **Zero load or concurrency testing** | The audit writer serialises appenders with `SELECT … FOR UPDATE` on the org row. That is exactly the code whose behaviour changes under real contention, and it is what stops the hash chain forking. |
| **12 of 14 modules are API-verified only** | Only CAPA and the superadmin console have been browser-verified on MySQL. |
| **Two `close` endpoints never exercised** | `POST /capa/:id/close` and `POST /deviations/:id/close` — the creator-cannot-close rule blocks the only available credentials. |
| **7 new tests not promoted to the regression corpus** | SOP §29 requires it. They live in `tests/`, not the Test Console. |

**Pre-existing, found during the migration (not caused by it):**

| Issue | Detail |
|---|---|
| `vs_periodic_reviews` has `UNIQUE (system_id)` | But the complete-review route inserts a second row for the same system, so a second completion always fails. Present in PostgreSQL too. |
| Org users cannot log in via the browser | `verifyUserOtp` only stores the session `if (response.accessToken)`, but the backend returns cookie-mode. Only superadmin works. Tracked separately. |
| 13 authorization defects | e.g. `POST /events/outbox/:id/publish` has no role check; five validation endpoints accept unverified parent IDs; a stubbed integration writes `status = 'Connected'` with a fabricated record count into a GxP audit trail. |

---

## 13. Critical Technical Rules (Must Know)

| Rule | Detail |
|------|--------|
| **org_id everywhere** | Every table must have `org_id`. No exceptions. |
| **Claude Code writes all code** | ALL code, edits and test scripts via Claude Code's own Edit/Write tools. |
| **No hard deletes** | Status flags only. |
| **Migrations only** | Schema changes via migration files — never manual ALTER TABLE on dev DB without a migration file. |
| **Gates must pass before "done"** | `test:tenant`, `test:dialect`, `test:schema:mysql`, `pgcompat-placeholders`, `audit-chain-digest`, `rbac-smoke`, `test:static`. |

### MySQL traps — every one of these shipped a bug during the migration

| Trap | What happens |
|---|---|
| **Inline `REFERENCES` creates NO foreign key** | InnoDB parses `col CHAR(36) REFERENCES t(id)` and silently discards it. Orphan rows are accepted. Use a table-level `FOREIGN KEY (col) REFERENCES t(id)` clause. This nearly cost all 268 FKs. |
| **No `RETURNING`** | Generate the id in the app with `crypto.randomUUID()` and read back with a `SELECT`. For an `ON DUPLICATE KEY` upsert, read back on the **natural key** — on the conflict branch the surviving row keeps its own id, so a generated id matches nothing. |
| **`DATETIME` rejects ISO-8601 strings** | `expiresAt.toISOString()` gives `ER_TRUNCATED_WRONG_VALUE` because of the trailing `Z`. Bind the `Date` itself and let mysql2 serialise it. This broke OTP login twice. |
| **`FOR UPDATE` must come AFTER `LIMIT`** | Postgres tolerates either order; MySQL raises a syntax error. Broke every CAPA state transition. |
| **A bare JS array binds as a comma-separated list** | It corrupts a JSON column or throws "Column count doesn't match". `JSON.stringify` it. |
| **`ON DUPLICATE KEY` fires on ANY unique key** | Not just the one the old `ON CONFLICT` named. Check the table's unique keys before converting. |
| **Never use `INSERT IGNORE`** | It downgrades FK, CHECK, NOT NULL and truncation errors to warnings, so a bad row vanishes silently. Use `ON DUPLICATE KEY UPDATE <col> = <col>`. Compliance determination, 2026-08-04. |
| **No `ILIKE`, `FILTER`, `ARRAY_AGG`, `split_part`, `to_char`, `date_trunc`, `interval 'n unit'`, `::` casts, `jsonb_build_*`, `date - date`** | See `tests/mysql-dialect-audit.mjs` — it names the replacement for each. |
| **MySQL DDL is not transactional** | A migration that fails halfway cannot be rolled back. `test:schema:mysql` builds from empty every run for this reason. |

---

## 14. Process Reference

Full gate flow and protocols in:
- `memory/protocols.md`
- `memory/feedback.md`
- `docs/TEAM_OPERATING_SOP.md`

---

## 15. How to Update This File

Only Bala updates this file, on Rohith's explicit instruction.

Format: Rohith says → "Bala, update the QMS Memory SOP — [what changed]"

---

## 16. PostgreSQL → MySQL Migration (2026-08-04)

**Status: QA complete. Gate 2 APPROVED by Rohith 2026-08-04. NOT validated — NOT approved for a client environment.**

Gate 2 record: `apps/qms/QMS_GATE2_APPROVAL_MYSQL_MIGRATION_2026-08-04.md`.
Gate 2 permits product review and decommissioning the legacy PostgreSQL database.
It does **not** permit deployment anywhere client-facing — that needs the CSV
validation protocol, which has not been executed.

Full CSV impact assessment: `apps/qms/QMS_CSV_IMPACT_POSTGRES_TO_MYSQL_2026-08-04.md`.

### Why
QMS was the only Pharaxis app still on PostgreSQL. MIMS, CP Portal, Vault and the
AI Agent all run `mysql2`. This was consolidation onto the house standard.

### Three controls moved from database-enforced to application-enforced
This is what makes it validation-impacting rather than a refactor.

| Control | Was | Now |
|---|---|---|
| Tenant isolation | RLS: 92 tables, 101 policies | `org_id` predicate in every query, gated by `test:tenant` |
| Password hashing | pgcrypto `crypt()` in the DB | `bcrypt` in the app. **Existing `$2a$` hashes verify unchanged — no user reset a password.** |
| Part 11 audit hash chain | plpgsql + `pg_advisory_xact_lock` | App-layer append + `SELECT … FOR UPDATE` on the org row. MySQL's `GET_LOCK()` is session-scoped, not transaction-scoped, so it is not a drop-in. |

Preserved unchanged: the `qms_audit_events` immutability triggers (UPDATE and
DELETE both raise), and all 268 foreign keys.

### Verified
7 gates green · 1,008 rows migrated with UUIDs, millisecond timestamps, JSON,
bcrypt hashes and the hash chain compared value-for-value · 20/20 endpoints 200 ·
browser: OTP login, CAPA list, CAPA detail, create → Submitted → Investigation.

### Not verified — these block validation
No independent QA execution · no Gate 2 · **no load or concurrency testing** ·
12 modules API-verified only · two `close` endpoints unexercised.

### Rollback
Commit `d70736a` is the last state with PostgreSQL fully working. The legacy
Postgres database is retained read-only and must not be decommissioned until QA
signs off — Vasu's determination, 2026-08-04.
