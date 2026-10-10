# Migration Block Reservations

Two teams are working on the case-form roadmap in parallel.
**Do not reuse numbers in another team's block** — coordinate via the daily standup.

| Range   | Owner                       | Status        | Notes |
|---------|-----------------------------|---------------|-------|
| 001–029 | Original platform           | Stable        | Pharaxis-One foundation. |
| 030–036 | Wave 0 prep work            | Stable        | See Wave 0 doc. |
| 037–047 | Waves 0–5 themes            | Stable        | Feature flags, audit, presence, etc. |
| 048–049 | Bucket 1 bug fixes          | Stable        | Field routing + dedup. |
| 050–059 | **Bucket 2 Sprint 1**       | **DONE**      | Awareness date, MedDRA, causality, ACK1/2/3, validity, seriousness, drug roles, MI→AE convert, PII redaction, ICSR lifecycle. |
| 060–069 | **Bucket 3 Tier-1**         | In flight     | Feature flag % rollout, completeness drill-down, Cmd+K custom, history diff/restore, mentions email digest, presence badge, doc search facets, reason library, macro builder, grid Excel export. **DO NOT TOUCH.** |
| 070–084 | **Bucket 2 Sprint 2**       | **In flight (this team)** | Doc taxonomy, attachment tagging, PC complaint codes, lot master, field action, CAPA, PC trending, follow-up SLA, off-label, two-signer MI, SRL approval, translation, dedup, partner reconciliation, workflow SLA. |
| 085–099 | **Bucket 2 Sprint 3**       | Queued        | PSUR aggregate, signal detection, bulk transmission, compare-diff, case timeline. |
| 100+    | Reserved                    | Future        | eMDR combination products + future themes. |
| 151–160 | **MIMS end-to-end walk (MIPM-131)** | **DONE** | Within the 100+ block. Closed-version locks, session fingerprint and last use, reviewer content access, template evidence status, contact fields step, MI categories seed, content-usage backfill, AE product links, orphan logo removal. |
| 161–162 | **MIMS walk — Rohith's decisions of 2026-10-04 (MIPM-131)** | **DONE** | Within the 100+ block. Organisation support-access grants (161); review mode and reviewer order for sequential review, MIPM-204 (162). |
| 164–165 | **CP Portal to MIMS bridge plan (Rohith's decisions of 2026-10-10)** | **DONE** | Within the 100+ block. 163 is the MIMS screen review's (MIPM-222). Fingerprint of the report a bridge case came from, P5 (164); a connection's previous secret while a new one beds in, P7 (165). |

## Rules

1. Before opening a migration file, check this table.
2. After committing a migration, update its row's `Status` and `Notes`.
3. If you discover you need a number outside your block, **post in #pv-eng-sync first**.
4. Never edit a migration that another team owns — open a follow-up in your own block.

Last updated: 2026-05-16 by Varun (CTO); 151–160 and 161–162 rows added 2026-10-04 (MIPM-131 follow-up). Rows for 100–150 were never recorded here.
