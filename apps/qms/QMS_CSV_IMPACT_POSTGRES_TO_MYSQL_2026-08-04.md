# CSV Impact Assessment — QMS PostgreSQL → MySQL Migration

> Date: 2026-08-04
> Raised by: Vasu Ranabothu (Chief Compliance Officer)
> Status: **Assessment only. This change is NOT validated and NOT approved for a client environment.**

---

## 1. Why this assessment exists

The migration is not a like-for-like database swap. **Two controls moved from
database-enforced to application-enforced.** That makes it a validation-impacting
change, not a refactor, and it cannot be closed on engineering verification alone.

---

## 2. Controls that changed enforcement layer

| Control | Was | Now | Impact |
|---|---|---|---|
| **Tenant isolation** | PostgreSQL Row Level Security — 92 tables, 101 policies. The database appended `org_id` to every tenant query. | Every query carries its own `org_id` predicate. | MySQL has no RLS. There is no database-level backstop; correctness now depends on each query. Mitigated by `tests/tenant-scope-audit.mjs`, which fails the build if any tenant query lacks the predicate (currently 0 unscoped of 371 statements, 12 declared cross-org exemptions). |
| **Password hashing** | pgcrypto `crypt(pw, gen_salt('bf'))`, executed inside the database. | `bcrypt` in the application. | MySQL has no pgcrypto. Existing `$2a$` hashes verify unchanged — **no user credential was reset or invalidated**. New hashes are written at cost 10 rather than pgcrypto's default 6, i.e. stronger. Plaintext passwords no longer travel to the database as query parameters. |
| **Audit hash chain (21 CFR Part 11)** | plpgsql `qms_append_audit_event()`, serialised by `pg_advisory_xact_lock`. | Application-layer append, serialised by `SELECT … FOR UPDATE` on the org row. | MySQL's `GET_LOCK()` is session-scoped, not transaction-scoped, so it does not release on rollback and is not a drop-in. The org row is locked rather than the newest audit event because the org row always exists — locking "the last event" locks nothing for an org's first event, which is exactly when two concurrent writers would both compute GENESIS and fork the chain. |

**Controls preserved unchanged:** the `qms_audit_events` immutability triggers
were ported and verified — `UPDATE` and `DELETE` both raise
`qms_audit_events is immutable`. Referential integrity was preserved in full:
268 foreign keys in PostgreSQL, 268 in MySQL.

---

## 3. Audit trail continuity — the documented cut point

The hash preimage previously ended with PostgreSQL's own text rendering of the
timestamp (`2026-08-04 09:18:00.123456+00`). That is a PostgreSQL implementation
detail and cannot be reproduced in MySQL, so ISO-8601 is now canonical.

**Consequence:** the **259 events written before the cutover** hashed their
timestamp the PostgreSQL way. Their digests cannot be recomputed by the current
code. They remain **link-verified** (each `prev_hash` matches the preceding
`curr_hash`) but not **digest-verified**.

**Determination: accept and document the cut point. Do NOT re-anchor.**

Re-anchoring would mean recomputing digests over existing audit records — that is
rewriting the audit trail. 21 CFR Part 11.10(e) requires the trail to be secure,
computer-generated and time-stamped, and to not obscure previously recorded
information. A bulk rehash obscures all of it. That the content would not change
is irrelevant: the control exists so that nobody can rewrite the ledger,
ourselves included.

`GET /api/security/audit-chain/verify` now reports the boundary explicitly:

```json
{ "valid": true, "totalEvents": 264,
  "digestVerifiedCount": 5, "digestUnverifiableCount": 259,
  "digestUnverifiableReason": "Written before the MySQL cutover; hashed with the
   PostgreSQL timestamp rendering. Chain linkage is verified; the digest cannot
   be recomputed." }
```

Pre-cutover events are auditable as a **disclosed migration boundary**, not as
corruption and not as a clean bill of health.

---

## 4. Defect found and closed during assessment

`INSERT IGNORE` was used as the MySQL equivalent of `ON CONFLICT … DO NOTHING`.
It is **broader**: it downgrades foreign-key, CHECK, NOT NULL and truncation
errors to warnings, not just duplicate keys.

A document access policy that silently failed to insert would leave a user's
permissions wrong with nothing in the system aware of it — an ALCOA+ *Complete*
and *Accurate* failure.

**Changed to `ON DUPLICATE KEY UPDATE <col> = <col>`** at all 8 runtime sites.
Verified against the live database:

```
duplicate insert x2  -> 1 row                    (tolerated, correct)
bad foreign key      -> ER_NO_REFERENCED_ROW_2   (raises, correct)
INSERT IGNORE (old)  -> accepted, warning 1452   (what was removed)
```

---

## 5. What is verified, and what is NOT

**Verified by engineering (Bhavya):**
- 7 automated gates green: dialect, tenant scope, schema parity, adapter, audit-chain digest, RBAC, syntax
- 1,008 rows migrated; UUIDs, millisecond timestamps, JSON payloads, bcrypt hashes and the hash chain compared value-for-value
- 20/20 API endpoints returning 200 against migrated data
- Browser: OTP login, CAPA list, CAPA detail, and a full create → Submitted → Investigation lifecycle, no console errors

**NOT verified — these block validation:**

| Gap | Owner |
|---|---|
| No independent QA execution or browser verification | Krishnapriya / Kiranmai |
| No Gate 2, no final sign-off (SOP §8) | Bala → Rohith |
| **Zero load or concurrency testing.** The org-row `FOR UPDATE` serialisation in the audit writer is precisely what behaves differently under contention. | Kiranmai |
| Browser verification covers CAPA and the superadmin console only; 12 other modules are API-verified but no one has looked at those screens | Krishnapriya |
| The 7 new automated tests are not promoted into the regression corpus (SOP §29) | Kiranmai |
| Two `close` endpoints never exercised — creator-cannot-close blocks the only available credentials | Krishnapriya |

---

## 6. Determinations

1. **Audit-chain boundary** — accept and document. Do not re-anchor. *(Closed.)*
2. **`INSERT IGNORE`** — replaced with the narrow form. *(Closed.)*
3. **PostgreSQL** — **retain, read-only. Do not decommission.** It is the
   source-of-record for migration verification until QA has signed off and this
   has run under representative load.
4. **Process** — this is **code-complete and engineer-verified, not Done.** No
   CSV protocol has been executed. It must not reach a client environment until
   sections 5 and 6 are closed.

---

*Assessment by Vasu Ranabothu. Engineering verification by Bhavya Bobba.
Not a validation certificate.*
