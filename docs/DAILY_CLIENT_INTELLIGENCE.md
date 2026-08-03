# Daily Client Intelligence — Operational Specification

> Established: 2026-08-01. Mandated by Rohith Karne.
> **Governance lives in `TEAM_OPERATING_SOP.md` §32.** This file holds only the operational detail — schedule, taxonomy, voice, and ticket format. Where a rule appears in both, **the SOP wins.**
> This file deliberately does not restate the rules, the ownership, or the constraints. Read §32 for those.

---

## 1. What it does

Each weekday morning a cloud agent reads `apps/mims` and `apps/cp-portal`, reads public external sources, and files what a client-side medical information lead would raise — in the **Katrina Mehra persona, simulated**.

The value is in the **join**: where an outside expectation meets something specific in our code. A ticket with only an external source is a news clipping. A ticket with only code is what Daily Product Intelligence (SOP §30) already produces.

Where no genuine external anchor exists, the ticket is filed on the internal anchor alone, states `External — none`, and carries the `no-external-source` label. That is honest. Inventing a source to fill the slot is a failure.

> **Currently code-only.** Outbound web access is blocked in the cloud environment — see §32 *Known constraints*.

---

## 2. Configuration

| Item | Value |
|------|-------|
| Routine | `trig_01P9T66LXNfW19ij5wdeg72N` |
| Runs | **Manual — fired by Rohith when he wants it. No schedule.** Set 2026-08-03. Held `enabled: false`; started with the `run` action. Previously 03:45 IST Mon–Fri. |
| Model | `claude-opus-5` |
| Jira site | `rohithkarne.atlassian.net` (cloudId `0a7f7971-6443-474b-9c5e-9aee486f5fa2`) |
| Jira project | `DCI` (id `10137`) — both apps land here |
| Assignee | Rohith (`712020:e0ca2980-ee7f-4136-883d-4c37712c9ec8`) |

### Epics — one dated epic per app, per run

| Summary | Labels |
|---|---|
| `MIMS Client Epic <date>` | `dci-daily`, `dci-epic`, `mims` |
| `CP Portal Client Epic <date>` | `dci-daily`, `dci-epic`, `cp-portal` |

Date form: `3rd Aug 2026` — ordinal suffix, no leading zero. Matches the §30 convention.

> Changed 2026-08-03 on Rohith's instruction. The routine originally used two permanent standing epics; DCI-1 and DCI-2 were renamed to dated epics and their 3 Aug children re-parented to DCI-15 and DCI-16 during that migration.

**The daily run log lives in the epic description**, under these headings: *Today's focus · Contents · Not raised today · Deduplication · Outbound access · Not verified*.

### Deduplication

Queries `DCI`, `MIMS` and `CP`, requesting only the `summary` field, **paginating to the end of each project**. Capped at 10 pages per project; hitting the cap must be reported, never silent. `MIMS` and `CP` are read-only to this routine (SOP §32 rule 9).

---

## 3. The voice — Katrina Mehra

Senior Director, Client Excellence. Defined in `live-communication-use-and-format.md` §3. **Simulated in this routine, always.**

She writes like an **operator**, not a product manager. She describes what her team could not do. She does not propose implementations, name files, or estimate effort. Two to five short paragraphs.

| She sounds like | She never sounds like |
|---|---|
| "A doctor asked us X on Tuesday and we could not answer it from the system." | "Please add a dropdown to the enquiry form." |
| "We do that part in Excel." | "Recommend implementing an export service." |
| "If an inspector asked me for that today, I would struggle." | "This violates 21 CFR Part 11 §11.10(e)." |
| "My team does not use that screen." | "Adoption metrics indicate low engagement." |

She may reference regulatory reality in **operational** terms — "we would have to produce that for an inspection" — never as a citation. Citations live in the Evidence section, not in her mouth.

---

## 4. The taxonomy

### Requests — one per app, per run

The agent picks the **one** type with the strongest anchor that day.

| # | Type | What it captures | Jira type |
|---|---|---|---|
| 1 | **Unmet Enquiry** | An HCP question the system could not help answer | `Story` |
| 2 | **Workaround** | Work done outside the product because it will not do it | `Story` |
| 3 | **Turnaround Pressure** | A step costing the team time against their response SLA | `Story` |
| 4 | **Content Gap** | Out-of-date, wrong-version, or missing response content | `Task` |
| 5 | **Inspection Exposure** | Something an inspector would ask for that is hard to produce | `Task` |
| 6 | **Integration Friction** | A broken handoff to CRM, safety system, or document store | `Story` |
| 7 | **Adoption Gap** | A capability that exists but is unused or misused | `Task` |
| 8 | **What's Working** | A capability that must not be changed without warning | `Task` |

**Type 8 is not filler.** Reading code tells you what looks improvable, never what is load-bearing for a user. Target roughly one per fortnight.

Summary format: `[Request · <Type Name>] <summary>`
Labels: `dci-simulated`, `persona-katrina`, `<app>`, `request`, `<type-slug>`

### Queries — two per app, per run

A Query is a question Katrina's **organisation** would put to a vendor — not a feature request. All file as `Task`. The two queries in one run must not come from the same class.

| # | Class | Typical question |
|---|---|---|
| 1 | **Audit & Inspection** | "Produce every record touched by this user in this date range." |
| 2 | **IT Security** | "What is checked on a file an outsider uploads?" |
| 3 | **Infrastructure** | "Where is it hosted? What is the uptime commitment?" |
| 4 | **Data** | "Retention period? Legal hold? Can we export everything if we leave?" |
| 5 | **Validation / CSV** | "Where is the IQ/OQ/PQ package? What is in validated scope?" |
| 6 | **Access & Identity** | "SSO? Can a contractor be scoped to one affiliate only?" |
| 7 | **Integration / API** | "Can this push to our CRM? Is there a documented API?" |
| 8 | **Change & Release Control** | "How are we notified of changes? Can a bad change be put back?" |
| 9 | **Business Continuity / DR** | "RTO and RPO? What survives if you are lost overnight?" |
| 10 | **Privacy / DPA** | "Data residency? Subprocessors? How is a data subject request tracked?" |

Summary format: `[Query · <Class Name>] <question or subject>`
Labels: `dci-simulated`, `persona-katrina`, `<app>`, `query`, `<class-slug>`

---

## 5. Description format — identical for Requests and Queries

```text
**Request** — <Type Name>        (or)        **Query** — <Class Name>

**Katrina:**

<her account, in her voice, 2–5 short paragraphs>

---

**Evidence**

**External** — <what the source says, in plain terms>
<URL>
> ⚠ caveat: <what was NOT read, and who must confirm>   ← every secondary source
(where there is none: **External** — **none.** plus one clause saying why,
 and add the no-external-source label)

**Internal** — <path/to/file.js:LINE-RANGE> — <what is actually there>
<where a search found nothing: "Absence of a located X is not proof of
 absence — Bhavya to confirm.">

**Not verified** — UI and functional behaviour were not exercised.
                   SOP §26 applies in full.

**Route to** — <owner>, for <what they must confirm>.

*Simulated — Katrina Mehra persona. Daily Client Intelligence, <date>.*
```

**No `PROVENANCE` block. No `Tier:` line.** Removed by Rohith 2026-08-01 — it read as odd against a ticket written in a human voice. The italic line and the two labels are the only simulation markers, and both are mandatory. See SOP §32 rule 4.

### Routing

Vasu (regulatory, validation, audit, privacy) · Sowmya (clinical, safety workflow, adverse events) · Mark (AI capability and governance) · Anirudh (cross-app architecture, auth, platform) · Kiranmai (test strategy and evidence) · Varun (technical direction) · Bhavya (implementation detail; confirming what does or does not exist in code) · Saad (product and scope).

Anything touching adverse events routes to **Sowmya**. The agent may flag a clinical question; it may never resolve one.

---

## 6. Everything else

| Need | Where |
|---|---|
| Rules, ownership, constraints, audit query | `TEAM_OPERATING_SOP.md` **§32** |
| The product-side routine | `TEAM_OPERATING_SOP.md` §30 |
| Why a filed ticket is not approved work | `TEAM_OPERATING_SOP.md` §26 |
| Functional verification standard | `TEAM_OPERATING_SOP.md` §26 |
