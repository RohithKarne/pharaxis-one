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
| 9 | Push `feat/meeting-decisions-1110` and open the pull request | Varun | ✅ Merged in PR #809 |
| 10 | MIMS dev product list is real brand names and does not match Calder's portal products | Saad | ✅ Migration 191 |
| 11 | Wording: PRD and RULES say "password and reason at each step"; MIMS asks at Approve and Send only | Saad | ✅ Aligned in PRD and RULES |
| 12 | Forced password reset happens before the two-step code in MIMS | Varun | ✅ Reordered after 2FA |
| 13 | Calder lets patients see CME training; Calder's AI key is invalid | John, Varun | ✅ CME gated from patients |
| 14 | Three switched-off routines (The Job, MIMS-PM, CP-PM) still name the old SOP | Rohith | ⏳ |

## Now — Table 1 core fixes (no Jira; locked by Rohith 2026-11-11)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Gate CME training to doctors; patients blocked from viewing or starting modules | Kiranmai, John | ✅ |
| 2 | Harmonize product catalogs: migration 191 seeds Calder portal products in MIMS | Kiranmai, Saad | ✅ |
| 3 | Enforce four-factor validation for adverse event reports on portal and case API | Kiranmai, Meera | ✅ |
| 4 | Reorder MIMS forced password reset sequence: 2FA verified before password reset | Kiranmai, Varun | ✅ |
| 5 | Side-effect hint rendered as high-visibility alert banner on MIMS case header | Kiranmai, Meera | ✅ |
| 6 | Auto-archive expired response templates in daily content lifecycle scheduler | Kiranmai, Daniel | ✅ |
| 7 | Align signature documentation in RULES.md and PRD.md to Approve and Send only | Saad | ✅ |

## Now — Seven strategic enhancements (no Jira; locked by Rohith 2026-11-11)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Database migrations for enhancements in MIMS (192) and CP Portal (0064) | Kiranmai | ✅ |
| 2 | Feature 1: Cross-Case Inspector Export Suite (MIMS-62) multi-case audit export | Kiranmai, Saad | ✅ |
| 3 | Feature 2: Automated Safety Transmission Gateway (E2B-R3) in-app validation & export | Kiranmai, Meera | ✅ |
| 4 | Feature 3: Interactive Two-Way Reporter Dialogue with encrypted 72h magic links | Kiranmai, Meera | ✅ |
| 5 | Feature 4: Response Document Review Diffing Engine with inline and side-by-side view | Kiranmai, Daniel | ✅ |
| 6 | Feature 5: Field Medical Insight Capture Screen with mobile-responsive offline intake | Kiranmai, Daniel | ✅ |
| 7 | Feature 6: Real-Time Safety Reconciliation Engine comparing intake receipts to cases | Kiranmai, John | ✅ |
| 8 | Feature 7: Doctor Credential Verification Gateway (NPI & GMC) during registration | Kiranmai, John | ✅ |
| 9 | Static syntax checks & frontend Vite builds across both applications | Kiranmai, Varun | ✅ |
| 10 | Screen walk passing and failing verification report & sign-offs | Tim, Varun, Saad, John | ✅ |

## Now — toolchain upgrade to the latest stable releases (no Jira; locked by Rohith 2026-11-12, "upgrade all in one go")

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Node 26 LTS installed beside Node 22 (not yet the default); CI on Node 26 | Kiranmai | ✅ |
| 2 | CP Portal: every package latest; Express 5 sanitiser and body fixes | Kiranmai | ✅ |
| 3 | MIMS: every package latest; Express 5 routes, rate-limit keys, ESLint 10 finds | Kiranmai | ✅ |
| 4 | MySQL 9.7 LTS beside 8.0 on port 3307; both dev databases loaded and counted (361 tables match) | Kiranmai | ✅ |
| 5 | Search speed measured on 8.0 and 9.7 with the same data: no regression | Varun | ✅ |
| 6 | Found: CP Portal could not start; field insights open to anyone and never saved — fixed | Kiranmai | ✅ |
| 7 | Found: forced password reset skipped after two-step sign-in — fixed | Kiranmai | ✅ |
| 8 | Found: reporter clarification links failed at every step — fixed and walked end to end | Kiranmai, Meera | ✅ |
| 9 | Found: migrations 0064 and 191 broke fresh databases (CI red on main) — fixed | Kiranmai | ✅ |
| 10 | Walk both apps on a sealed 9.7 copy, failing paths included | Kiranmai | ✅ |
| 11 | Postmortem for #816/#817 | Varun | ✅ |
| 12 | Push and open the pull request — PR #818, merged | Varun | ✅ |
| 13 | After merge: switch the dev machine to MySQL 9.7 on port 3306 and make Node 26 the default — seen 2026-11-12: Node 26.13.1, MySQL 9.7.4 on 3306 | Rohith, Varun | ✅ |
| 14 | Walk the rest of #817 on screen: inspector export, E2B, document diff, reconciliation, credential check | Kiranmai, John | ⏳ |

## Now — S1: keep incomplete side-effect reports (no Jira; locked by Rohith 2026-11-12)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | CP Portal: keep the report, name what is missing, tell the reporter, flag it in Submissions | Kiranmai | ✅ |
| 2 | MIMS: stop refusing on the case API; banner on the AE case from the validity check | Kiranmai, Meera | ✅ |
| 3 | Found: E2B four-factor check always passed — now uses the validity check | Varun | ✅ |
| 4 | Walk on sealed copies: incomplete kept and flagged, complete not flagged, banner clears on save, empty description refused | Kiranmai | ✅ |
| 5 | Decide: CP counts a reporter with only a name; MIMS needs email or phone | John | ⏳ |
| 6 | Push and open the pull request | Varun | ⏳ Rohith's word |

## Waiting on a decision

| Item | Waiting for |
|---|---|
| Which cloud, and when | Rohith — unlocks a demo environment, deploys and real backups |
