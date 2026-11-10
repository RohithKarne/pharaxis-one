# Tasks — Pharaxis One

The work in hand, in small steps, one at a time. **Jira is the ticket list** (CPPM for CP Portal, MIPM for MIMS); this file holds only the steps for what is being built now.

## How to use it

```
Rohith asks ─► overview approved (lock) ─► steps written here ─► one step in progress
   ─► step done: tick it, same moment ─► all done: move the summary to PROGRESS.md, clear the list
```

- One step = one action a person can finish and check. Name who does it.
- Exactly one step is in progress.
- Tick a step when it is done, not in a batch at the end.
- A step that grows: split it.
- Something found on the way gets its own step (RULES.md › How work flows).
- When the work closes, write what was done, what was not checked, and what is still open in PROGRESS.md, then clear this list.
- Personal scratch notes can still go in `docs/tasks/` (untracked).

## Recurring work, with its own rules

| Routine | Rules |
|---|---|
| Product Intelligence | [PRODUCT_AUDIT.md](PRODUCT_AUDIT.md) |
| Client Intelligence | [DAILY_CLIENT_INTELLIGENCE.md](DAILY_CLIENT_INTELLIGENCE.md) |
| CP-PM and MIMS-PM | [CP_PM.md](CP_PM.md) |
| The Job — interview rehearsal | [THE_JOB.md](THE_JOB.md) |

---

## Now — six core documents (no Jira; locked by Rohith 2026-11-10)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Write RULES.md from the SOP, CLAUDE.md and the lessons | Varun | ✅ |
| 2 | Write PRD.md from the SOP app sections and the project overview | Saad | ✅ |
| 3 | Write ARCHITECTURE.md from the SOP app sections, database, backup, bridge and help documents | Kiranmai | ✅ |
| 4 | Write DESIGN.md from the apps' stylesheets and Branding themes | Kiranmai | ✅ |
| 5 | Write PROGRESS.md and this file | Kiranmai | ✅ |
| 6 | Move the routine rules into their four files | Kiranmai | ✅ |
| 7 | Delete the replaced and stale documents | Kiranmai | ✅ |
| 8 | Point every reference at the new files; cut CLAUDE.md to a pointer | Kiranmai | ✅ |
| 9 | Check every link resolves (36, none broken), tables and code blocks well formed | Kiranmai | ✅ |
| 9b | See the files rendered on GitHub — every table and diagram renders | Kiranmai | ✅ |
| 10 | Review the whole change | Varun | ✅ |
| 11 | Push and open the pull request — pushed on Rohith's word, PR #802 | Varun | ✅ |
| 12 | New session-opening prompt written into RULES.md in full (PR #804, merged 2026-11-10); Rohith checks any cloud routine that names the old SOP | Rohith | ⏳ |
| 13 | After the merge: point Claude's memory files at the six documents | Saad | ⏳ |

## Now — new team: Tim and Medical Affairs (no Jira; locked by Rohith 2026-11-10)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Write the new team into RULES.md › Who does what: Rohith Founder & CEO, Tim, Varun Head of Technology, Saad under Varun, John, Meera, Daniel; Rohith's role outside Pharaxis | Saad | ✅ |
| 2 | Add the Medical view to the overview; Tim first in "Who answers"; new session-opening prompt | Saad | ✅ |
| 3 | Update CLAUDE.md, README and `/varun`; add `/tim`, `/john`, `/meera`, `/daniel` | Kiranmai | ✅ |
| 4 | PROGRESS.md: clinical gap closed, new gap recorded | Saad | ✅ |
| 5 | Fix what was found while reading: a password in ARCHITECTURE.md, broken references in PROGRESS.md, removed people still named | Kiranmai | ✅ |
| 6 | Check every link (28), heading reference (34) and table in the changed files | Kiranmai | ✅ |
| 6b | Open a new session and try `/tim`, `/john`, `/meera`, `/daniel` — a running session does not see new commands. All four seen listed in the 2026-11-10 session that followed; not yet invoked | Rohith | ⏳ |
| 7 | Review the change | Varun | ✅ |
| 8 | Push and open the pull request — pushed on Rohith's word, PR #803, merged 2026-11-10 | Varun | ✅ |

## Now — actions from the first team meeting (no Jira; locked by Rohith 2026-11-10)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Push this TASKS.md change and open the pull request — PR #805 | Varun | ✅ |
| 2 | Review the five Dependabot pull requests (#797–#801): merged #798–#801 on Rohith's word; #797 closed (replaced by #801) | Varun | ✅ |
| 3 | One-page view on safety alerts; Rohith chose option (c): live at once, second check within 24 hours — built on `feat/meeting-decisions-1110` | Daniel, Saad | ✅ |
| 4 | Fresh screen walk of CP Portal — 33 admin screens, sign-up, reports, safety alerts, PDFs; 4 fixes on `fix/cp-portal-walk-1110` | Kiranmai | ✅ |
| 5 | Fresh screen walk of MIMS — 25 screens, 56 admin settings, email intake, portal cases; 1 fix on `fix/mims-walk-1110` | Kiranmai, Meera | ✅ |
| 6 | Medical walk: side-effect and question flows from CP Portal into MIMS, and the AI assistant on an off-label question. Findings given in chat 2026-11-10; decisions with Rohith | John | ✅ |
| 7 | Report: what was found, what was fixed, what was not checked — in chat 2026-11-10 | Tim | ✅ |

## Now — the meeting's decisions and open items (no Jira; locked by Rohith 2026-11-10)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Safety alerts: second check within 24 hours (migration 0063) | Kiranmai | ✅ |
| 2 | Side-effect form: optional patient initials and sex (migration 0062) | Kiranmai | ✅ |
| 3 | AI assistant: off-label questions go to Medical Information | Kiranmai, John | ✅ — live reply not seen: Calder's AI key is rejected (401) |
| 4 | Side-effect hint on questions answered "No" | Kiranmai, Meera | ✅ |
| 5 | "DHPC / Dear HCP letter" label | Kiranmai, Daniel | ✅ |
| 6 | Role confirmation audited | Varun | ✅ |
| 7 | Found: MIMS hid the portal's notes and the reporter's answers — shown in the bridge bar | Kiranmai | ✅ |
| 8 | Found: training list offered modules a reader cannot open | Kiranmai | ✅ |
| 9 | Push `feat/meeting-decisions-1110` and open the pull request | Varun | ⏳ Rohith's word |
| 10 | MIMS dev product list is real brand names and does not match Calder's portal products | Saad | ⏳ |
| 11 | Wording: PRD and RULES say "password and reason at each step"; MIMS asks at Approve and Send only | Saad | ⏳ Rohith confirms |
| 12 | Forced password reset happens before the two-step code in MIMS | Varun | ⏳ |
| 13 | Calder lets patients see CME training; Calder's AI key is invalid | John, Varun | ⏳ |
| 14 | Three switched-off routines (The Job, MIMS-PM, CP-PM) still name the old SOP | Rohith | ⏳ |

## Waiting on a decision

| Item | Waiting for |
|---|---|
| Which cloud, and when | Rohith — unlocks a demo environment, deploys and real backups |
| Inspector Export (MIMS-62) | The lock (PRD.md › Later) |
