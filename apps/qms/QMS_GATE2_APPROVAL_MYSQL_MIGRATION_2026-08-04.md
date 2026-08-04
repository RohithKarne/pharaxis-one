# Gate 2 Approval — QMS PostgreSQL → MySQL Migration

> Date: 2026-08-04
> Gate: **2 — code-complete, reviewed and verified build, before QA release**
> Status: **APPROVED by Rohith Karne (Founder & CEO)**
> Raised by: Bala Kaviti (COO) + Varun Karne (Head of Development)
> Process reference: `docs/TEAM_OPERATING_SOP.md` §8, §9, §18

---

## 1. What was approved

Migration of the QMS application from PostgreSQL to MySQL 8.0.45. QMS was the
last Pharaxis app on PostgreSQL; MIMS, CP Portal, Vault and the AI Agent already
run `mysql2`. This was consolidation onto the house standard.

---

## 2. Sign-offs recorded before approval (SOP §18)

| Owner | Role | Confirmation |
|---|---|---|
| **Varun Karne** | Head of Development | Engineering verification complete. Browser verification run and passed. Each of the three controls that changed enforcement layer has a gate that fails the build on regression. Referential integrity preserved 268/268. |
| **Kiranmai Avuluri** | Director of QA | QA sign-off granted. 10/10 suites, 12/12 modules, 0 defects. Earlier concurrency exclusion **closed** — the negative control proved the org-row lock serialises. |
| **Vasu Ranabothu** | Chief Compliance Officer | Compliance review complete for Gate 2. Audit chain intact, immutability verified, source-of-record archived with verifying hash, CSV impact assessment filed. **Validation protocol remains a separate, outstanding gate.** |

---

## 3. Evidence at time of approval

| Check | Result |
|---|---|
| Regression corpus | **10/10** (release `2026.08-R1`) |
| API endpoints | **22/22** returning 200 |
| Browser verification | 14/14 modules; OTP login; CAPA create → submit → triage → effectiveness → close; deviation close |
| Audit chain | valid, 400 events, 141 digest-verified, 259 pre-cutover disclosed |
| Concurrency | 16 and 32 writers, no fork — harness proven able to fail |
| Schema parity | 92/92 tables, 923/923 columns, **268/268 foreign keys** |
| Data migration | 1,049 rows archived, SHA-256 verified |
| Corpus without PostgreSQL | **10/10** — no runtime or test dependency remains |

---

## 4. Known issues disclosed at approval (SOP §18)

Approval was given **with these open**, not in ignorance of them.

| # | Issue | Origin |
|---|---|---|
| 1 | 259 pre-cutover audit events are link-verified only. Deliberately **not** re-anchored — re-hashing existing audit records is what 21 CFR Part 11.10(e) forbids. Disclosed by the verify endpoint. | This migration |
| 2 | **Org users cannot log into QMS in the browser**; only superadmin can. `verifyUserOtp` stores the session only `if (response.accessToken)`, but the backend returns cookie-mode. | **Pre-existing** |
| 3 | 13 authorization defects, worst being a stubbed integration writing `status='Connected'` with a fabricated record count into a GxP audit trail. | **Pre-existing** |
| 4 | `vs_periodic_reviews UNIQUE(system_id)` blocks a second review completion. | **Pre-existing** (present in PostgreSQL too) |
| 5 | Tested at dev scale only. No production-volume performance testing. | This migration |
| 6 | **Validation (CSV) protocol not executed.** Separate gate, owned by Vasu. | This migration |

---

## 5. Correction recorded against the evidence

Logged because it affects the integrity of evidence presented earlier, not
because it changes the outcome.

Between the cutover (`876e563`) and the test decoupling (`9043b61`), the
`tenant-isolation` suite was **passing vacuously**. Its fixtures were created in
PostgreSQL while the API read MySQL, so the "foreign org" row did not exist in
the database under test. Tests 1 and 2 asserted that the API did not return a row
that was never there, and could not have failed. That result was cited during the
cutover as evidence no cross-tenant hole had opened; it was not evidence.

The Gate 2 evidence in §3 was gathered **after** decoupling, and the fixture was
independently confirmed visible to the application's database (2 deviation rows
on disk, `GET /deviations` returns 1, foreign row absent). The approval evidence
therefore stands — but it stands by timing, not because the gap was caught before
being relied on.

---

## 6. What this approval does and does not permit

**Permits:** progression to product review; decommissioning of the legacy
PostgreSQL database (no runtime or test dependency remains).

**Does not permit:** deployment to any client environment. That requires the CSV
validation protocol in `QMS_CSV_IMPACT_POSTGRES_TO_MYSQL_2026-08-04.md` §5–6,
which has not been executed.

---

## 7. Commits

`d70736a` (pre-cutover restore point, PostgreSQL fully working) through
`9043b61`. Ten local commits. **Not pushed** — Rohith pushes.

---

*Logged by Bala Kaviti on Rohith's approval, 2026-08-04.*
