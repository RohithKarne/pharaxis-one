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

## Open — carried over (checked against merged pull requests, 2026-11-22)

Finished blocks were removed on Rohith's word, 2026-11-22. Their summaries are in PROGRESS.md and their detail in git history. These are the steps still open from them.

| # | Step | Who | From |
|---|---|---|---|
| 1 | Walk the rest of #817 on screen: inspector export, E2B, document diff, reconciliation, credential check | Kiranmai | Toolchain upgrade, 2026-11-12 |
| 2 | Decide: CP Portal counts a reporter with only a name; MIMS needs email or phone | John | S1, 2026-11-12 |
| 3 | See the platform admin's view of Sign-in & Security on screen | Kiranmai | One MIMS sign-in, 2026-11-13 |
| 4 | One walk of everything from the access review on the shared dev copy, then Rohith's sign-off | Kiranmai, Rohith | Access review, 2026-11-13 |
| 5 | Site controls retired: verify onboarding, case intake, content folders and API connections against the live database | Kiranmai | #828, 2026-11-17 |
| 6 | One organisation selector: verify the switch, a cancelled or refused switch, and settings isolation in the running app | Kiranmai | #828, 2026-11-17 |
| 7 | Primary Reporter details: verify display, editing and reopening the saved case | Rohith | #828, 2026-11-17 |
| 8 | New Case owner: create a case and confirm the saved owner on the case header | Rohith | #828, 2026-11-17 |
| 9 | New Case Reporter Country: verify save and reopen with a local test agent | Kiranmai | #828, 2026-11-17 |
| 10 | New Case Reporter Country: review the code and full workflow evidence | Varun | #828, 2026-11-17 |
| 11 | Reporter erasure and stale edits: verify live erasure, stale-tab save and reopen | Rohith | #828, 2026-11-17 |
| 12 | Create Katrina's test user in Calder Therapeutics on the local copy of each app | Kiranmai | Team, 2026-11-18 |
| 13 | Three switched-off routines (The Job, MIMS-PM, CP-PM) and any cloud routine still name the old SOP | Rohith | Six documents, 2026-11-10 |

## Waiting on a decision

| Item | Waiting for |
|---|---|
| Which cloud, and when | Rohith — unlocks a demo environment, deploys and real backups |

## Now — team with heads and members (no Jira; locked by Rohith 2026-11-22)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | RULES.md › Who does what: four heads, 13 members, all simulated, no GitHub accounts; Varun CTO, John CMO; Katrina under John, acceptance straight to Rohith | Saad | ✅ |
| 2 | RULES.md: workflow, overview views, owner per step, merge gate (Kiranmai's screen evidence + Swaroop's QA sign-off), session-opening prompt | Saad | ✅ |
| 3 | CLAUDE.md; 12 new commands, 5 updated | Saad | ✅ |
| 4 | Compliance-owner lines in the three routine documents move to Swaroop | Swaroop | ✅ |
| 5 | Check every link, heading reference, table and leftover name in the changed files | Kiranmai | ✅ |
| 5b | Session-opening prompt shortened (1,632 → 1,016 words, same rules) on Rohith's word | Saad | ✅ |
| 6 | Push and open the pull request | Varun | ✅ #829, merged |
| 7 | Open a fresh session and try the new commands | Rohith | ⏳ |
| 8 | Decide: CP-PM panel and audit-routine persona titles for Bhavya, Anirudh, Kiranmai | Rohith | ⏳ |

## Now — remove finished work and evidence (no Jira; locked by Rohith 2026-11-22)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Delete local evidence folders: 14 `*_evidence`, browser evidence, Playwright leftovers, test results, seed backups (not in git) | Radhika | ✅ |
| 2 | Remove old copies: nested Pharaxis-One folder, the 2026-11-18 team worktree, 4 clean agent worktrees, 12 dead worktree entries. Branches kept | Radhika | ✅ |
| 3 | Remove one-off walk, verify and audit scripts (9) and the tracked `docs/tasks/` notes (7); ignore `docs/tasks/` | Bhavya | ✅ |
| 4 | TASKS.md: finished blocks removed, open steps carried over | Vanaja | ✅ |
| 5 | PROGRESS.md: each Done entry one line; old version and sprint histories and closed gaps removed | Saad | ✅ |
| 6 | RULES, ARCHITECTURE, PRD: dated history notes removed; features kept. Found: ARCHITECTURE's "forced reset before two-step" gap was already fixed in the code — note corrected | Saad | ✅ |
| 7 | Check links and leftovers | Kiranmai | ✅ |
| 8 | Push and open the pull request | Varun | ✅ #830 |
| 9 | Agent worktree `fix/mims-case-comments-and-bulk-update` has 7 uncommitted files from 2026-09-27: keep or discard | Rohith | ⏳ |
