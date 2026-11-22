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

## Now — MIMS webhook delivery visibility (locked by Rohith, 2026-11-22)

| Step | Owner | Status |
|---|---|---|
| Build the organisation-scoped delivery history endpoint | Bhavya | Complete |
| Add the read-only Outbound webhooks table to Integration Health Monitor | Vivek | Complete |
| Walk successful and failing paths on the running app | Kiranmai | Complete |
| Review the changes and verification evidence | Varun | Complete |
| Review the local QA evidence for sign-off | Swaroop | Complete |
| Open the pull request after Rohith approves the push | Varun | Waiting |
| Read CI on the pull request | Varun | Pending |
| Repeat the screen walk after merge | Kiranmai | Pending |

## Waiting on a decision

| Item | Waiting for |
|---|---|
| Which cloud, and when | Rohith — unlocks a demo environment, deploys and real backups |
