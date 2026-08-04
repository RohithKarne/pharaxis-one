# Product Audit — Operational Specification

> Established: 2026-08-03. Mandated by Rohith Karne.
> **Governance lives in `TEAM_OPERATING_SOP.md` §35.** This file holds only the operational detail — configuration, the team list, the question format, and routing. Where a rule appears in both, **the SOP wins.**
> This file deliberately does not restate the rules, the ownership, or the constraints. Read §35 for those.

---

## 1. What it does

A cloud agent puts **one question from each client-side team** to our own product, and answers it from our own code. Twenty-seven teams, twenty-seven questions, one verdict each:

```text
Can we answer this today?   YES · PARTIAL · NO
```

**The NOs are the output.** Everything else is context.

### The flow is inverted from §30 and §32 — this is the design

| Routine | Direction |
|---|---|
| §30 Daily Product Intelligence | read our code → find a gap → raise it |
| §32 Daily Client Intelligence | read our code → write what a client lead would say |
| **§35 Product Audit** | **establish what an outside team standardly asks a vendor → then read our code for whether we could answer** |

A question derived from our own repository is a question we can already see. The value here is the question we did not know existed — so the questions are sourced from regulation, standards and published vendor-assessment practice **first**, and only then answered against the code.

> Sarvanan's caution, and it is why the routine is built this way: *"If the routine only reflects our code back at us, it will make us feel prepared while covering the wrong ground."*

---

## 2. Configuration

| Item | Value |
|------|-------|
| Routine | **Product Audit**, `trig_015RUwGVkCepLQmmp8g6GYUS` |
| Runs | **Manual only.** Held `enabled: false`; fired with the `run` action. The stored cron `20 22 * * 0-4` is a placeholder and never fires |
| Model | `claude-opus-5` |
| Environment | `env_0182iSqocH9rPztdatAX1gtX` (Default) |
| Jira site | `rohithkarne.atlassian.net` (cloudId `0a7f7971-6443-474b-9c5e-9aee486f5fa2`) |
| Jira project | **`PAUD`** (id 10237) — the only project it writes to. Created 2026-08-03 |
| Assignee | Rohith (`712020:e0ca2980-ee7f-4136-883d-4c37712c9ec8`) |
| Scope | `apps/mims` and `apps/cp-portal`. Vault and QMS excluded, as in §30, §32 and §34 |
| Repo access | **Read-only.** No commits, no pull requests, no file changes |
| Console | https://claude.ai/code/routines/trig_015RUwGVkCepLQmmp8g6GYUS |

### Output shape — one epic, exactly three stories

| Issue | Summary | Labels |
|---|---|---|
| Epic | `Product Audit - 3rd Aug 2026` | `product-audit`, `product-audit-epic`, `simulated` |
| Story 1 | `[Product Audit - Tier A] Business & functional team queries - <date>` | `product-audit`, `simulated`, `tier-a` |
| Story 2 | `[Product Audit - Tier B] Governance & control team queries - <date>` | `product-audit`, `simulated`, `tier-b` |
| Story 3 | `[Product Audit - Tier C] System owner, audit, PMO & AI governance queries - <date>` | `product-audit`, `simulated`, `tier-c` |

Date form: `3rd Aug 2026` — ordinal suffix, no leading zero. Matches the §30, §32 and §34 convention.

**Never a fourth story.** Never fewer than three.

### Epic description — the run log

Six headings, in order: *Scoreboard · The NOs · Not covered · Deduplication · Outbound access · Not verified*.

**Scoreboard** is a table — Tier, teams asked, YES, PARTIAL, NO — closing with the total NO count. **The NOs** is one line per NO across all three tiers, and nothing else. That is the section Rohith reads first.

### Deduplication

Queries `PAUD`, `MIMS`, `CP`, `DCI` and `ASUP`, requesting only the `summary` field, **paginating to the end of each project**. Capped at 10 pages per project; hitting the cap must be reported, never silent.

**The team repeats by design; the question must not.** The same twenty-seven teams are asked every run. Where a prior `PAUD` question from a team covers the same subject, the agent asks a different question from that team's remit. A team is only skipped when it has genuinely no fresh question left — and then it is named under *Not covered* with that reason.

`MIMS`, `CP`, `DCI`, `ASUP` and `CEO` are read-only to this routine (SOP §35 rule 7).

**Deduplication is one-way, by decision.** The other four routines do not read `PAUD` — Rohith's call on 2026-08-03. They can therefore raise something Product Audit has already surfaced, and neither ticket will reference the other. Reversible by updating three routine prompts.

---

## 3. The teams

Tiers A and B came from **Saad Rahman** and **Vasu Ranabothu**. Tier C came from **Sarvanan**, our retained external auditor, plus AI Governance from **Mark Antony**.

### Tier A — the teams who would *use* the product (12)

| # | Team | Brings |
|---|---|---|
| 1 | Medical Information — First Line / Contact Centre | Volume, friction, repeated actions |
| 2 | Medical Information — Second Line / Medical Response | Response accuracy, escalation, label alignment |
| 3 | Medical Information — Content Owners | Standard response documents, versioning, retirement |
| 4 | Pharmacovigilance / Drug Safety | **MI/PV boundary only** — an enquiry that turns out to contain an adverse event |
| 5 | Medical Affairs / Field Medical (MSL) | Scientific exchange, insight capture |
| 6 | Medical Communications / Content | HCP-facing content, publishing, approval |
| 7 | Regulatory Affairs | Labelling, registrations, HA correspondence |
| 8 | Clinical Operations | Trial-adjacent needs |
| 9 | Quality Assurance — GxP operations | Deviations, CAPA, complaints |
| 10 | Training / Learning & Development | Competency, read-and-understood, records |
| 11 | Commercial / Market Access | Promotional review adjacency |
| 12 | **Outsourced Operations (CRO / BPO)** | First-line MI or content run on the client's behalf |

**Team 12 is not optional.** Many companies outsource first-line MI, so the person in the seat does not work for the company that signed the contract — which changes access control, audit-trail attribution and data segregation materially. Saad flagged it as the one people forget.

**Manufacturing / QC is deliberately excluded** — GMP-side, and none of our apps touch it today. Saad's call.

Pharmacovigilance appears at the MI/PV boundary only. Signal detection, ICSR processing and periodic reporting are out of scope as topics in their own right — the same boundary §32 holds.

### Tier B — the teams who *approve, validate and audit* (10)

| # | Team | Brings |
|---|---|---|
| 1 | CSV / CSA — Computer System Validation | Validation package, GAMP 5 category, qualification |
| 2 | QA — Supplier & Vendor Qualification | Supplier audit, quality agreement, our SDLC evidence |
| 3 | IT / Business Systems | Environments, integrations, upgrade impact |
| 4 | Information Security | Questionnaires, pen test, certification, access model |
| 5 | Data Privacy / DPO | DPA, sub-processors, transfer, retention, DSAR |
| 6 | Regulatory Compliance | 21 CFR Part 11 **and** EU Annex 11 |
| 7 | Legal / Contracts | Liability, IP, escrow, exit and data return |
| 8 | Procurement / Vendor Management | Pricing model, SLA, renewal, viability |
| 9 | Enterprise Architecture | Integration pattern, master data, interoperability |
| 10 | Data Management / Analytics | Extract, reporting, warehouse feed, data model |

**Part 11 and Annex 11 are not the same conversation.** A European sponsor asks Annex 11 questions a US one does not. Where a question differs by jurisdiction, the ticket says which. Vasu's rule.

**Quality can veto what IT has already approved.** These teams disagree with each other, not only with us — the routine is built knowing that.

### Tier C — the roles that decide outcomes but rarely appear on an org chart (5)

| # | Team | Brings |
|---|---|---|
| 1 | System Owner / Business Process Owner | Accountable for the validated state, personally exposed |
| 2 | Super User / System Administrator | Configuration, provisioning, permission-model fit |
| 3 | Internal Audit | Separate from QA, reports to the board, unannounced |
| 4 | Implementation PMO | Migration, cutover, legacy decommissioning |
| 5 | **AI Governance** | Standing committee across Quality, IT, Privacy and Legal |

---

## 4. The question format — short, and that is not negotiable

Rohith's instruction, 2026-08-03: **clear cut and short, not paragraphs.** Each team gets exactly seven lines:

```text
#### <n>. <Team Name>
**Q — <Team Name>:** <ONE sentence, in the team's own plain words. Max 25 words.>
**App:** <MIMS | CP Portal | Both>
**Can we answer today?** <YES | PARTIAL | NO>
**Why:** <ONE line. What exists, or what is missing. Max 30 words.>
**Evidence:** `<path/to/file.js:LINE-RANGE>` - <what is actually there, one clause>
**Route to:** <owner>
```

If a team needs more explanation than that, **the question was not sharp enough — rewrite the question.**

### The team name appears twice, by design

Set by Rohith on 2026-08-03. The team name is **the heading** of the block *and* **the first thing in the question line**, so a question can be attributed to its team at a glance without scrolling back up — which matters in a story carrying twelve of them.

The **exact** team-name string from the tier list is used in both places. Not abbreviated, not reworded, not stripped of its bracketed qualifier. `Medical Information — First Line / Contact Centre` stays that, both times. That consistency is what makes the tickets searchable by team.

Each story opens with one line — `<n> teams asked. <x> YES · <y> PARTIAL · <z> NO.` — and closes with the not-verified line and the italic simulation line.

### The voice

The question is in the **team's** voice — operational, plain, the way that function actually speaks. It never names a file, cites a regulation clause, or proposes an implementation. Those live in Evidence and in the routing.

The team-name prefix sits outside the voice — it is a label, not something the team says. Everything after the colon is theirs.

| Sounds right | Sounds wrong |
|---|---|
| "If a contractor leaves mid-week, can you show me everything they touched?" | "Please implement role-based audit trail export per 21 CFR 11.10(e)." |
| "Can we run this in a validated environment separate from where you test?" | "Adoption metrics indicate the audit module is underutilised." |
| "What happens to a response we sent from a document we have since retired?" | "Recommend implementing a document supersession service." |

### The verdict

| Verdict | Means |
|---|---|
| **YES** | It exists in code and the agent can point at it |
| **PARTIAL** | Something exists but does not fully answer the question — the ticket says exactly what is missing |
| **NO** | The agent searched and found nothing, or what exists contradicts the question |

**A verdict with no file path is not a verdict.** Where a search found nothing, the ticket names what was searched for and where, then states: *"Absence of a located X is not proof of absence — <owner> to confirm."*

**A round of all-YES answers means the questions were too easy, not that we are ready.**

---

## 5. Routing

Vasu (regulatory position, privacy, risk acceptance) · **Sarvanan** (CSV/CSA gap analysis, inspection readiness, evidence sufficiency) · Sowmya (clinical, safety, adverse events) · Mark (AI capability and governance) · Anirudh (cross-app architecture, auth, integration) · Kiranmai (test strategy and evidence) · Varun (technical direction) · Bhavya (implementation detail; what does or does not exist in code) · Saad (product and scope) · Bala (commercial, contractual, procurement, operating).

**Vasu and Sarvanan are not interchangeable.**

| Route to | When the question is |
|---|---|
| **Vasu** | what our position *is*, or what we will commit to in writing |
| **Sarvanan** | whether our *evidence* would survive an assessor |

Many compliance items warrant **both, in that order** — Sarvanan assesses the gap, Vasu decides what we do about it. Where a ticket routes to both, it says which part is whose.

Sarvanan is external and advisory. A ticket routed to him asks for an **assessment**, never a decision. His review is never described as independent assurance — he is retained by us and reports to Aditi, which makes it expert challenge.

Anything touching adverse events routes to **Sowmya**. The agent may flag a clinical question; it may never resolve one.

---

## 6. Everything else

| Need | Where |
|---|---|
| Rules, ownership, constraints, audit query, boundaries against §30/§32/§34 | `TEAM_OPERATING_SOP.md` **§35** |
| Why a filed ticket is not approved work | `TEAM_OPERATING_SOP.md` §26 |
| Functional verification standard | `TEAM_OPERATING_SOP.md` §26 |
| The client-voice routine | `TEAM_OPERATING_SOP.md` §32 and `docs/DAILY_CLIENT_INTELLIGENCE.md` |
| The end-user support routine | `TEAM_OPERATING_SOP.md` §34 |
