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

## Rules

1. Before opening a migration file, check this table.
2. After committing a migration, update its row's `Status` and `Notes`.
3. If you discover you need a number outside your block, **post in #pv-eng-sync first**.
4. Never edit a migration that another team owns — open a follow-up in your own block.

Last updated: 2026-05-16 by Varun (CTO).
