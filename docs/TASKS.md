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

## Now — one MIMS sign-in (no Jira; locked by Rohith 2026-11-13; replaces A1, folds in A5)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | L1: two-step at sign-in when any of a person's organisations uses it; company login decided by email domain | Kiranmai | ✅ |
| 2 | L2: remove the public organisation list | Kiranmai | ✅ |
| 3 | L3: personal emails per client (off by default), access end date at most 12 months, nightly removal (migration 193) | Kiranmai | ✅ |
| 4 | L4: one Sign-in & Security screen; timeout, methods, remember days, password rules and lockout platform-wide | Kiranmai, Varun | ✅ |
| 5 | Found: second two-step setup when another org turns it on; "jwt expired" wording; system case entry named a person | Kiranmai | ✅ |
| 6 | Walk on the sealed copy — client admin view, failing paths, nightly job | Kiranmai | ✅ |
| 7 | See the platform admin's view of Sign-in & Security on screen | Kiranmai | ⏳ |
| 8 | Push and open the pull request | Varun | ⏳ Rohith's word |
| 9 | Next from the access review: A2/A3 (an org admin's changes reach other orgs), C1 (CP client admin can switch off the portal), A4 (screens per organisation) | Tim | ⏳ |

## Now — A0/A2/A3: an organisation admin acts only inside their own organisation (no Jira; locked by Rohith 2026-11-13)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | A0: set / expire password and the organisation list only for people in the admin's organisation; history rule; sessions end | Kiranmai | ✅ |
| 2 | A2: group change sets the role in this organisation only; a shared person's name, email, user ID by platform admin | Kiranmai | ✅ |
| 3 | A3: an organisation admin removes a shared person from their organisation only | Kiranmai | ✅ |
| 4 | Found: saving Edit User reset or refused a shared person's other organisations | Kiranmai | ✅ |
| 5 | Walk on the sealed copy through the routes the screens call (all paths, failing ones included) | Kiranmai | ✅ |
| 6 | See Edit User on screen with a shared person — name change refused, removal message, Vanaja case still Raj's; found and fixed "User not found" after removal | Kiranmai | ✅ |
| 7 | Push and open the pull request | Varun | ⏳ Rohith's word |

## Now — close the access review: C1, A6, A4 (no Jira; locked by Rohith 2026-11-13)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | C1: CP client switch-off and delete superadmin-only | Kiranmai | ✅ |
| 2 | A6: group list for an organisation admin — own and shared groups only | Kiranmai | ✅ |
| 3 | A4: migration 194; screens and role per organisation; every screen check passes the organisation | Varun, Kiranmai | ✅ |
| 4 | Walk on sealed copies: Vanaja agent screens and label, Access Denied by address, Calder admin screens after switching, Inbox removed in Calder only, group list, C1 refusals | Kiranmai | ✅ |
| 5 | Push and open the pull request | Varun | ⏳ Rohith's word |
| 6 | After merge: one walk of everything from the access review on the shared dev copy, then Rohith's sign-off | Kiranmai, Rohith | ⏳ |

## Now — Full QA verification of MIMS report module (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Audit existing database data & verify baseline data availability across all 20 library reports | Kiranmai, Saad | ✅ |
| 2 | Seed realistic edge-case records for zero-count scenarios (duplicates, ICSR errors, overdue safety hand-offs) | Kiranmai, John | ✅ |
| 3 | Automated programmatic data reconciliation: write and run comprehensive audit script comparing raw SQL tables to all 20 report datasets | Kiranmai, Varun | ✅ |
| 4 | Verify custom report definitions, dashboards (Operations, Compliance Watch), and favourites lifecycle | Kiranmai, Saad | ✅ |
| 5 | Verify schedules, timezone handling, run history logging, and module configuration | Kiranmai, Varun | ✅ |
| 6 | Remediate any defects, query inconsistencies, or edge-case bugs found during the audit | Varun, Kiranmai | ✅ |
| 7 | Walk every report, dashboard, schedule, history, and settings tab on the live browser across Admin and Operator roles, verifying UI filters and CSV exports | Kiranmai, Saad, John | ✅ |
| 8 | Compile comprehensive final QA verification report with clinical and compliance sign-offs | Tim, Saad, John, Varun, Kiranmai | ✅ |

## Now — Reporting Module Enhancements: REP-1 & REP-4 (locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Backend: Build Executive PDF generation engine `reportPdfService.js` with landscape layout, audit blocks, metadata, and pagination | Kiranmai, Varun | ✅ |
| 2 | Backend: Wire PDF export into `POST /reports/module/definitions/:id/export` with GxP audit trail logging (`EXPORT_PDF`) | Kiranmai, Saad | ✅ |
| 3 | Frontend: Add "Export PDF" button to `ReportFilterBar.jsx` and wire PDF blob download in `ReportsPage.jsx` | Kiranmai | ✅ |
| 4 | Frontend: Build in-context Case Drill-Through Drawer in `ReportsPage.jsx` for non-disruptive case inspection | Kiranmai, Saad | ✅ |
| 5 | Automated Verification: Test PDF generation and Case Drawer on real browser via Playwright, verify PDF file on disk, capture screenshots | Kiranmai, John | ✅ |
| 6 | Review & Sign-off: Record completed work in TASKS.md and PROGRESS.md | Tim, Varun, Saad, John | ✅ |

## Now — Full QA verification of MIMS content module (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Audit database schema, existing content records & admin data mappings (document types, folders, picklists, settings) | Kiranmai, Saad | ✅ |
| 2 | Seed realistic edge-case records for zero-count / critical test scenarios (monographs, modules, FAQs, response templates, expired evidence, pending reviews) | Kiranmai, John | ✅ |
| 3 | Automated programmatic data reconciliation: write and run comprehensive audit script comparing raw SQL tables to all CM API endpoints and admin feeds | Kiranmai, Varun | ✅ |
| 4 | Verify authoring workflows, concurrency checkout locks, and modular assembly cache invalidation | Kiranmai, Varun | ✅ |
| 5 | Verify review cycles, independent approver gate, electronic signature compliance, and 21 CFR Part 11 audit trails | Kiranmai, Daniel, Saad | ✅ |
| 6 | Verify downstream delivery: Browse Content catalog search and Case MI response letter builder template merging | Kiranmai, Meera | ✅ |
| 7 | Remediate any defects, query inconsistencies, broken logic, or edge-case bugs found during the audit | Varun, Kiranmai | ✅ |
| 8 | Walk every content screen, modal, and export on the live browser across Author, Reviewer, and Admin roles | Kiranmai, Saad, John | ✅ |
| 9 | Compile comprehensive final QA verification report with clinical, regulatory, and technology sign-offs | Tim, Saad, John, Varun, Kiranmai | ✅ |

## Now — MIMS Content Module Enhancements (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Migration 196: Baseline seed migration for CM picklists, review configs, default folder permissions, and organization alert settings | Kiranmai, Varun | ✅ |
| 2 | Auto-Attach Prescribing Information: Backend & frontend auto-binding and locking of active PI document on off-label inquiries in MI Response Builder | Kiranmai, John | ✅ |
| 3 | Version Increment Rationale Modal: Authoring check-in modal enforcing Major vs Minor classification with predefined clinical justification for 21 CFR Part 11 | Kiranmai, Saad | ✅ |
| 4 | Live Template Token Validator: Real-time syntax highlighting and dictionary validation of merge fields ({{tokens}}) in Template Editor | Kiranmai, Meera | ✅ |
| 5 | GxP Watermarked PDF Rendition: Server-side PDF export with embedded approval signature block and release watermark | Kiranmai, Daniel | ✅ |
| 6 | Automated test suite verification for all 5 enhancements | Kiranmai, Varun | ✅ |
| 7 | Walk enhanced workflows, off-label PI auto-attachment, version modal, and PDF export on live browser | Kiranmai, Saad, John | ✅ |
| 8 | Document in PROGRESS.md and compile final completion report with multi-disciplinary sign-offs | Tim, Saad, John, Varun, Kiranmai | ✅ |

## Now — Full QA verification of MIMS admin module (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Audit database tables and active admin configuration endpoints across all 11 tabs and 35 panels for Calder and Vanaja | Kiranmai, Saad | ✅ |
| 2 | Programmatic reconciliation: audit script comparing admin config tables to case data, content items, and reports | Kiranmai, Varun | ✅ |
| 3 | Security & Access verification: users, group security, sign-in & security (2FA/SSO), company login, and tenant boundaries | Kiranmai, Saad | ✅ |
| 4 | Forms & Fields verification: Case Form Fields, Case Numbering, smart fields, grid templates, and dynamic case form rendering | Kiranmai, Saad | ✅ |
| 5 | Workflow, Rules & Medical/Safety verification: workflow engines, CAPA, change approvals, MI response settings, safety transmissions, lot master | John, Meera, Kiranmai | ✅ |
| 6 | Data Protection, Compliance & Platform Integrations: DPPR rules, PII redaction, routing rules, email accounts, API clients, parameters | Varun, Saad, Kiranmai | ✅ |
| 7 | Remediate any defects, broken logic, query mismatches, or UI errors found during the audit | Varun, Kiranmai | ✅ |
| 8 | Walk all 11 admin tabs on the real browser across Org Admin and Platform Admin roles, testing happy and failing paths | Kiranmai, Saad, John | ✅ |
| 9 | Compile comprehensive final QA verification report with clinical, regulatory, and technology sign-offs | Tim, Saad, John, Varun, Kiranmai | ✅ |

## Waiting on a decision

| Item | Waiting for |
|---|---|
| Which cloud, and when | Rohith — unlocks a demo environment, deploys and real backups |

## Now — Retire site controls in MIMS (locked by Rohith 2026-11-17)

| Step | Who | Status |
|---|---|---|
| Remove site controls and make organisation setup use its existing automatic defaults. | Kiranmai | Implemented locally |
| Verify onboarding, case intake, content folders, and API connections against the live database. | Kiranmai | Pending |

## Now — One organisation selector in MIMS Admin (locked by Rohith 2026-11-17)

| Step | Who | Status |
|---|---|---|
| Replace the separate Admin Tenant scope with the signed-in organisation. | Kiranmai | Implemented locally |
| Verify the switch, cancelled or refused switch, and settings isolation in the running app. | Kiranmai | Live verification pending |

## Now — MIMS Primary Reporter details (locked by Rohith 2026-11-17)

| Step | Who | Status |
|---|---|---|
| Expand Primary Reporter details and save edits through Save Case. | Kiranmai | Implemented locally |
| Verify display, editing, and reopening the saved case. | Rohith | Pending |

## Now — MIMS New Case owner (locked by Rohith 2026-11-17)

| Step | Who | Status |
|---|---|---|
| Save the eligible creator as Case Owner when they use manual New Case. | Kiranmai | Implemented locally |
| Create a new case and confirm the saved owner on the case header. | Rohith | Pending |

## Now — MIMS New Case Reporter Country (locked by Rohith 2026-11-17)

| Step | Who | Status |
|---|---|---|
| Offer all 249 catalog entries with names and two-letter codes. Accept a listed code or a blank on creation. | Kiranmai | Implemented locally |
| Verify save and reopen on the running app with a local test agent. | Kiranmai | Pending |
| Review the code and full workflow evidence. | Varun | Pending |

## Now — Full QA verification of MIMS case form complete module (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Audit database schema, field setup, picklists, case numbering, and cut-list configuration across Calder and Vanaja | Kiranmai, Saad | ✅ |
| 2 | Automated programmatic audit script: compare case form field setup to case tables, required fields validator, and cut list | Kiranmai, Varun | ✅ |
| 3 | Test case creation and data validation across all case types: MI, AE, PC, and multi-type inquiries | Kiranmai, John | ✅ |
| 4 | Verify multi-tenant admin isolation (Calder vs Vanaja): custom labels, required toggles, section visibility | Kiranmai, Saad | ✅ |
| 5 | Verify clinical validation logic: E2B(R3) four-factor criteria, suspect product binding, and MI safety screening gate | John, Meera, Kiranmai | ✅ |
| 6 | Verify cut-list behavior: cut fields hidden on new cases, preserved and rendered on historical cases | Kiranmai, Saad | ✅ |
| 7 | Remediate any defects, query inconsistencies, broken logic, or edge-case bugs found during the audit | Varun, Kiranmai | ✅ |
| 8 | Walk every case form tab and screen on the live browser across Admin and Agent roles, verifying happy and failing paths | Kiranmai, Saad, John | ✅ |
| 9 | Compile comprehensive final QA verification report with clinical, compliance, and technology sign-offs | Tim, Saad, John, Varun, Kiranmai | ✅ |

## Now — Case form upgrade Drop 1: Safety & Compliance Core (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Migration 195: case_relationships table, E2B seriousness criteria columns on case_ae_events/versions, and dechallenge/rechallenge columns on case_ae_events | Kiranmai, Varun | ✅ |
| 2 | Backend CF-01: Seriousness evaluation and 15-day expedited regulatory clock calculation in caseAE.js | Kiranmai | ✅ |
| 3 | Backend CF-02: Split & Link Case API (POST /api/cases/:id/split) with PV queue routing & child case cloning | Kiranmai, Saad | ✅ |
| 4 | Backend CF-04: Structured dechallenge/rechallenge and lowercase ENUM payload normalizer in caseAE.js | Kiranmai, John | ✅ |
| 5 | Frontend CF-01: Seriousness 6-factor checklist & visual 15-day countdown SLA badge on AE header/tab | Kiranmai | ✅ |
| 6 | Frontend CF-02: "Split Case" modal with selective field cloning and PV queue routing in Case Header | Kiranmai, Saad | ✅ |
| 7 | Frontend CF-04: Structured dechallenge/rechallenge dropdowns and pregnancy exposure fields in AE tab | Kiranmai, John | ✅ |
| 8 | Walk upgraded case forms, split-case flow, and regulatory clock on live browser across MI and AE cases | Kiranmai, Saad, John | ✅ |
| 9 | Review, document in PROGRESS.md, and compile completion report with persona sign-offs | Tim, Varun, Saad, John, Kiranmai | ✅ |

## Now — Case form upgrade Drop 2: Clinical Intake Intelligence (locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Migration 198: Add `screening_override_rationale` and `safety_triggers_detected` columns to `case_mi` | Kiranmai, Varun | ✅ |
| 2 | Backend CF-03: Real-Time E2B(R3) 4-Factor Gate at transmission time (`POST /cases/:id/ae-transmissions`) | Kiranmai, Saad | ✅ |
| 3 | Backend CF-05: AI / Clinical Safety Term Interception dictionary scanner and override validator in `caseMI.js` | Kiranmai, John | ✅ |
| 4 | Frontend CF-03: Live 4-factor validity check and hard transmission gate in `CaseAETab.jsx` | Kiranmai | ✅ |
| 5 | Frontend CF-05: Real-time clinical trigger detection banner & override rationale field in `CaseMITab.jsx` | Kiranmai, Meera | ✅ |
| 6 | Automated Verification: Test 4-factor gating and safety term override on real browser via Playwright with screenshots | Kiranmai, John | ✅ |
| 7 | Review, document in PROGRESS.md, and compile completion report with persona sign-offs | Tim, Varun, Saad, John, Kiranmai | ✅ |

## Now — Case form upgrade Drop 3: Regulatory Safeguards & Quality-Safety Fusion (locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Migration 199: Add commercial clearance columns to `case_mi` and patient harm / 3-day FAR columns to `case_pc_general` | Kiranmai, Varun | ✅ |
| 2 | Backend CF-06: Hard-block response dispatch for solicited off-label inquiries in `cases.js` and `miSendCheck.js` without Medical Director clearance | Kiranmai, Saad | ✅ |
| 3 | Backend CF-07: 3-Day FDA FAR clock calculation engine (72h with business-day awareness) in `haClockService.js` and `casePC.js` | Kiranmai, John | ✅ |
| 4 | Frontend CF-06: Off-label solicited commercial gating alert, clearance review action in `MiApprovalPanel.jsx`, and builder lockout | Kiranmai, Saad | ✅ |
| 5 | Frontend CF-07: Patient harm toggle, 3-Day FAR countdown clock badge, and AE split/link prompt in `PCTabPanel.jsx` / `CasePCTab.jsx` | Kiranmai, John | ✅ |
| 6 | Automated Verification: End-to-end browser walk via Playwright validating CF-06 commercial gating and CF-07 FAR clock with screenshots | Kiranmai, John | ✅ |
| 7 | Review, document in PROGRESS.md, and compile completion report with persona sign-offs | Tim, Varun, Saad, John, Kiranmai | ✅ |

## Now — MIMS Admin Clinical Governance & Regulatory Capabilities Remediation (no Jira; locked by Rohith 2026-11-16)

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Ticket 1: Activate two-signer rule for off-label responses in Calder Therapeutics (`mi_two_signer_rules`) | Kiranmai, Saad | ✅ |
| 2 | Ticket 2: Tiered transmission SLAs (0d expedited for serious AE, 1d standard) in backend services and `TransmissionSetup.jsx` | Kiranmai, Varun | ✅ |
| 3 | Ticket 3: Seed real `lot_master` batches for Calder products linked to `field_action_records` recall entry (`COS-2025-442C`) | Kiranmai, John | ✅ |
| 4 | Ticket 4: Standardize MedWatch safety contact closing statement and `require_pi_offlabel` in `mi_response_settings` | Kiranmai, John | ✅ |
| 5 | Migration 197: Create `product_regional_labels` table, `emergency_safety_contacts` table, and `enforce_safety_screening_gate` column | Kiranmai, Varun | ✅ |
| 6 | Ticket 5: Build Regional Product Labeling UI (`RegionalLabelsAdmin.jsx`) and backend CRUD endpoints in `productDictionary.js` | Kiranmai, John | ✅ |
| 7 | Ticket 6: Build Emergency Safety Directory UI (`EmergencySafetyAdmin.jsx`) and backend CRUD endpoints in `emergencySafetyContacts.js` | Kiranmai, Meera | ✅ |
| 8 | Ticket 7: Integrate `enforce_safety_screening_gate` into `miResponseSettings.js` backend and UI toggle in `MiResponseSettings.jsx` | Kiranmai, Saad | ✅ |
| 9 | Verify end-to-end with 29 automated tests, live browser walk on Chrome (0 errors, 5 screenshots), and compile final report | Tim, Saad, John, Varun, Kiranmai | ✅ |



