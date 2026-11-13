# Progress — Pharaxis One

What is done, what broke, what is next. Newest first. Updated by whoever does the work, as it happens.

> Built 2026-11-10 from the version histories, sprint records, status and known issues in PRD.md / ARCHITECTURE_AND_SYSTEM_DESIGN.md (then ARCHITECTURE.md) › CP Portal and PRD.md / ARCHITECTURE_AND_SYSTEM_DESIGN.md › MIMS, and the open-gaps table in RULES.md › Getting a change to main. The controlled record of every change, with its revalidation flag, stays in [CHANGELOG.md](CHANGELOG.md).

## Where things stand — 2026-11-10

```
CP Portal ── active development ── local only ── last merged: #795 (27 Oct review, E1–E5, F1–F5)
MIMS ─────── active development ── local only ── last merged: #794 (migration 174, "Used in cases")
Bridge ───── live between the two, locally ── watched by Sync Health and the Inquiry Ledger
Documents ── six core files replace the SOP (#802)
Team ─────── restructured 2026-11-10: Rohith → Tim → Technology (Varun) and Medical Affairs (John)
```

| | CP Portal | MIMS |
|---|---|---|
| Last full screen walk | 10 Oct 2026, every admin screen and portal page | 14 Oct 2026, access review and revalidation pass |
| Revalidation flag (Unreleased) | Full | Partial |
| Tagged release | None — tags paused by Rohith, 2026-10-04 | None |

## Done — 2026-11-13: one MIMS sign-in (L1–L4, locked by Rohith)

One sign-in for all of MIMS; sign-in settings on one screen (Sign-in & Security). Walked on a sealed copy: two-step asked when any organisation uses it; switch without a second step; a company-domain email refused a password; the public organisation list gone; personal emails refused, then required an end date, then a contractor removed by the nightly job with their case unassigned. Found and fixed on the way: a second setup demanded when another organisation turned two-step on; "jwt expired" shown to people; a system case entry named a person. PRD and Architecture lines changed on Rohith's lock (2026-11-13). **Not seen on screen:** the platform admin's view of Sign-in & Security (sign-in did not finish inside the 10-minute code step during the walk). A4 (screens per organisation) is still open and was seen live in the walk.

## Done — 2026-11-13: A0/A2/A3, organisation admins kept inside their organisation (locked by Rohith)

Found while re-reading (A0): any organisation admin could set any person's password in any organisation. Fixed with A2 (role per organisation) and A3 (remove from one organisation, not every one), plus Edit User's organisation save. Checked on a sealed copy through the routes the screens call; CI suite 215/215. Edit User walked on screen with a shared person ("User not found" after removal found and fixed). Still open from the access review: C1, A4.

## Done — 2026-11-13: access review closed (C1, A6, A4; locked by Rohith)

Every item from the 11-13 access and organisations review is built: S1, L1–L4 (A1, A5), A0, A2, A3, C1, A6, A4. A4 walked on screen: an agent in Vanaja sees agent screens and "Case Operator", is refused MIMS Admin by address (screen and server), and has admin screens again after switching to Calder; a screen removed in Calder stays in Vanaja. CI suite 215/215, frontend 18/18. **Not checked:** a CP superadmin switching a portal off (no superadmin test user on the copy); the platform admin's TENANT choice on Edit User's Screens.

## Next

The work in hand is in [TASKS.md](TASKS.md). The ticket list is Jira (CPPM for CP Portal, MIPM for MIMS).

## Records

Kept where they are; never rewritten here.

| Record | Where |
|---|---|
| Every change and its revalidation flag | `docs/CHANGELOG.md` |
| MIMS validation: URS, FS, DS, IQ, OQ, PQ, traceability, revalidation 2026-10-14 | `apps/mims/validation/` |
| MIMS compliance policies: access control, BCP/DR, GDPR DPIA, HIPAA, incident response, Schrems II, security, SOC 2 | `apps/mims/compliance/` |
| Bridge validation and walk-through, 41 screenshots | `docs/validation/` |
| Postmortems | `docs/postmortems/` |
| Accessibility conformance reports (drafts) | `docs/accessibility/` |

---

# Still open — known gaps

What our way of working does not yet enforce, said openly.

| Gap | Consequence | Owner |
|---|---|---|
| **CI is not a required check** | A red pipeline does not block a merge. A human must read it. | Varun |
| **`CODEOWNERS` cannot express Gate 2** | RULES.md › How work flows requires *"Varun review complete"*, and `.github/CODEOWNERS` routes every path to `@RohithKarne`. **This was first recorded as a contradiction to fix; that was wrong.** `RohithKarne` is the only account with repository access — every other team member is a simulated persona with no GitHub identity, so no other name can appear in `CODEOWNERS` without being silently ignored. **Varun's review is an in-process step recorded in chat (RULES.md › How work flows), not a GitHub mechanism.** `CODEOWNERS` is correct as written; the gap is that GitHub cannot enforce the review the SOP requires, and nothing but discipline closes it. | Varun |
| **E2E tests never run in CI** | Playwright is installed in MIMS and CP Portal and is invoked by no workflow. Browser verification stays manual — and from 2026-09-20 that is the only verification there is. | Varun |
| **No coverage floor** | Test counts: MIMS 30, CP Portal 5. Nothing stops that falling, and nothing adds to it — writing automated tests is retired (RULES.md › Proving it works). | Varun |
| ~~**MIMS has no quality gate**~~ | **Closed 2026-08-07** (#533). It was worse than absent: the shared workflow guards the job with `if: quality_command != ''`, so it **skipped — and a skipped check reports as a pass.** `ci-mims.yml` now passes `npm run test:static`, which parses all 447 backend files and refuses to pass on an empty walk. | — |
| ~~**No deploy rollback**~~ | **Closed 2026-09-24 by removing the deploy.** Both products are local-only; there is no automatic deploy to roll back from. | — |
| ~~**Only CP Portal deploys**~~ | **Closed 2026-09-24.** Neither product deploys. The MIMS stub was removed with the rest (RULES.md › Getting a change to main). | — |
| **Nothing is deployed anywhere** | Both products run only on a developer machine. Nobody outside the team can reach either one, and no client demonstration is possible without rebuilding a deployment path. **Accepted deliberately** — see RULES.md › Getting a change to main. | Rohith |
| **Monitoring and incident response are not built** | No error tracking, no APM, no uptime check. We learn a product is down when someone opens it. **Owned by Varun from 2026-09-20** (see RULES.md › Who does what), so this is still a build task with a name against it. | Varun |
| **Releases are not tagged** | Paused by Rohith on 2026-10-04 (RULES.md › Getting a change to main); the old `v1.0.0` tag is deleted. Changes are logged in `docs/CHANGELOG.md` under Unreleased, with their revalidation flags. The release workflows have never run. | Varun |
| **No automated test is written any more** | RULES.md › Proving it works retired 2026-09-20. Every regression is now found by a person opening a screen. For a GxP product this is a reduction in evidence an auditor can read. | Rohith |
| **The tester is the author** | Since 2026-09-28 Kiranmai writes and tests most changes, and Varun reviews the code and signs. FDA's General Principles of Software Validation (section 4.9, independence of review) calls self-validation extremely difficult; our independence rests on Varun's reading of her evidence, not on a separate tester. **Replaces** the 2026-09-20 gap *"the author is usually the reviewer"*, which closed the same day. | Rohith |
| **Nobody challenges the compliance position** | Sarvanan left 2026-09-20. The regulatory position — Saad's from 2026-10-01, Vasu's before — is stated and never tested from outside. | Rohith |
| **Compliance is held by the product owner** | Vasu left 2026-10-01 and Saad took compliance, validation and GxP alongside product. The person who defines a feature also rules on its compliance and confirms its revalidation flag; a client's supplier audit looks for those two to be independent. **From 2026-11-10 Saad also reports to the Head of Technology**, so compliance sits inside engineering's own line. Rohith set it; Saad said so once. Rohith's sign-off is the control that remains. | Rohith |
| **Work found mid-build skips the lock** | From 2026-10-01 (RULES.md › How work flows, *Found while working*) a defect, a miss or a new feature found while working is built in the same session without Rohith's prior approval. It is still its own ticket and its own commit, checked on the real screen, named in the report, and not pushed until he says so — but nobody outside the session agrees it before it is built. | Rohith |
| **AI governance is unstaffed** | Mark Antony left 2026-09-20. Varun frames the question, Rohith decides — **neither is a substitute for the expertise that left.** Clinical judgement, unstaffed from 2026-09-20 (Sowmya), moved to John's Medical Affairs team on 2026-11-10. | Rohith |


---

# CP Portal

## Current status

**Status: ACTIVE FEATURE DEVELOPMENT** — set 2026-08-08 by Rohith

CP Portal reopened to feature development on 2026-08-08, when `docs/CP_PM.md` introduced the CP-PM routine whose analyst-specified work is built and shipped. The last closed sprint (Sprint 6) ended 2026-03-24; everything since runs through the lock (RULES.md › How work flows) and the RULES.md › Getting a change to main delivery path. This section previously still read *STABLE — no active sprint*, contradicting the header of the old CP Portal SOP section; corrected 2026-09-13 on Rohith's instruction.

**What is working:**
- Full admin panel (35 pages) — all features operational
- Full portal (31 pages) — all feature-gated pages operational
- 6-language auto-translation — content auto-translates on save
- MySQL migration complete — native MySQL on the developer machine, shared with MIMS

**Time on screen:** screens show the viewer's local time with UTC on hover; exports and the audit trail are in UTC (Rohith, 2026-10-10).

**Last test result:** 10 Oct 2026, after the ease-of-use plan merged: every admin screen as superadmin and client admin, every portal page as a doctor and as a visitor, one failing path on 20 forms, and every migration on MySQL 8.0.46 (see Version History). Before that, every screen, role and user type walked on the real screens 4–7 Oct 2026 (CP Portal end-to-end walk, PRs #723, #724, #727); what was not checked is listed in each pull request. Before that: all core flows stable at Sprint 6 close (2026-03-24).


## What broke — known issues

| # | Item | Type | Priority |
|---|------|------|----------|
| 1 | `Unknown column 'client_code'` in `cp_clients` — appears in some edge queries | Low-severity bug | Low |
| 2 | ~~npm vulnerabilities~~ — **closed 2026-10-27**: none left in the backend; in the frontend two moderate `react-router` advisories remain, fixed only by a major upgrade and not reachable here (no server rendering, no redirect read from a link) | Security debt | Low |
| 3 | Translation coverage — existing content before 2026-03-21 has empty `translations_json`. Where machine translation is on, an admin clicks "Retranslate All Content" once per client to backfill; where it is off, the team supplies the translations. | Data gap | Low |
| 4 | Bundle size — 1.1MB JS bundle (single chunk). Should split with `React.lazy()` per route when performance matters. | Performance debt | Low |
| 5 | Uploads are gitignored. **From 2026-10-27** `docs/scripts/backup-cp-portal.sh` copies uploads and the database to `~/Pharaxis-Backups/cp-portal` (newest 14; a restore was checked). Run by hand — Rohith declined a nightly schedule, 2026-10-27. Same machine and unencrypted, so not disaster recovery; any deployment still needs persistent storage. | Deployment risk | Medium |
| 6 | ~~MIMS → CP Portal integration not built~~ — **closed 2026-07-15.** Shipped both directions and browser-verified; see Version History | Closed | — |


## Done — version history

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-03-27 | Bala | Initial creation — full snapshot as of 2026-03-22 stable release |
| 2026-07-15 | Bala | CP↔MIMS integration SHIPPED and browser-verified (approved by Rohith). Outbound sync to MIMS `POST /api/v1/cases` (OAuth client-credentials with auto-refresh — `services/mimsAuth.js`), idempotent on CP reference, attachments forwarded, close-sync poller auto-closes CP inquiries, retry poller (incl. stale `pending_sync`), audit trail. Admin: Integration page gained an OAuth auth type + per-form-type Field Mapping builder (`cp_field_mapping`, dot-path targets); new Sync Health dashboard page (`/admin/clients/:id/sync-health`). Secrets encrypted at rest; provisioning scripts must load `.env` (see RULES.md › Lessons, L-011). |
| 2026-10-03 | Saad | Doctor Review release merged in PR #709 (CPPM-84–95, CPPM-106–117, CPPM-119, CPPM-121, CPPM-122). Fixes: forms, drafts, submissions and feature switches. Doctors gain: check-your-answers before sending, request access, "I have read this" on high and critical safety letters, notifications that open the exact item, "For you" on Home, an event page with Register and Add to calendar. Admins gain: approve or decline access requests, therapeutic-area tags on news, documents and events, on/off switches for Clinical Trials and Training. Migrations 0039–0042, folded into the baseline. Not yet done: the revalidation flag and a tagged release. |
| 2026-10-07 | Saad | CP Portal end-to-end walk, 4–7 Oct 2026, on Rohith's instruction and with no Jira: every admin screen, every portal page, every admin role and every portal user type opened on a local copy with its own test users, happy path and failing path, and fixed as found. 30 fixes and features in three pull requests (#723, #724, #727), each verified on the real screen; the change log under "CP Portal end-to-end walk" lists them by area. Excluded by decision: the CP–MIMS bridge, SSO round trips and anything calling out. Open at the close: the Clinical Trials page hides itself while no trial is active (documented as intended); the client admin opening the platform audit page sees the server's refusal text rather than being sent away; a visitor's cookie consent before sign-in is recorded to the account only from this release on. |
| 2026-10-10 | Saad | CP Portal ease-of-use plan, all 22 rows (drag-to-reorder on Features left out), merged in three pull requests (#739, #742, #744), alongside the CP-to-MIMS bridge work (#740, #743). Admins gain: a sidebar that opens each area to its screens, a "To do today" list on the client Overview, Submissions as an inbox with the case open beside the list, four ready Branding themes with a live preview, grouped Features, and one set of status words on every content screen. Decisions (Rohith, 10 Oct): a clinical trial goes live only after a second person publishes it (migration 0047); safety alerts stay direct, with no review step; screens show local time with UTC on hover, while exports and the audit trail stay in UTC. Checked the same day: every CP Portal migration on MySQL 8.0.46, fresh and as an upgrade; every admin screen as superadmin and client admin, every portal page as a doctor and as a visitor, and one failing path on 20 forms. Four faults found were fixed: the audit trail showed local time, a client admin opening the platform audit page saw empty filters, two client lists counted open submissions under "Submissions", and Features misdescribed Coming soon training modules. Not checked: screen readers, phone widths for Branding and Features, real MIMS traffic after #744. |
| 2026-10-27 | Saad | 27 Oct review, on Rohith's instruction (no Jira, no branch; changes in the working copy): the home page Safety Update box shows the live alert; task cards carry one link each; Popular searches set on Branding; doctor two-step sign-in, optional per client; search reads inside PDF documents; package updates clear the critical and high advisories; a backup script for uploads and the database. Guide corrected the same day: Process Explorer and Custom Reports no longer exist; screen and table counts; sign-in sessions are HttpOnly cookies, not browser storage. |
| 2026-10-27 | Saad | Enhancements E1–E5, on Rohith's instruction (no Jira, no branch): search matches news and FAQ translations and answers in the reader's language; Analytics shows top searches and searches that found nothing (no names kept, 90 days); the home Safety box says how many more alerts are live; doctors may have a browser remembered for the sign-in code for 7 days, forgotten on a password change; the AI assistant also draws on approved documents, never drafts or unapproved ones. Found and fixed: the assistant looked up the whole question as one phrase and so found almost nothing; Calder's chat provider was Anthropic with an OpenAI key and model (set to OpenAI). Open: none of Calder's 18 live documents carries an approval record, so the assistant quotes none until a reviewer approves them; the virus-list updater had stopped (list 28 days old) — restarted, cause not found. Revalidation flag Full, approved by Rohith. |
| 2026-11-11 | Varun | ARCHITECTURE.md bridge corrected on Rohith's word, from reading the code for his systems-engineering session 1: the portal reads all of MIMS's changes (closed, reopened, answers, questions for the reporter), not only "closed"; the hourly and nightly list comparison added; retries are 1, 2, 4, 8, 16 minutes, not every minute; "MIMS → CP Portal" reworded, since MIMS never calls the portal. |
| 2026-11-11 | Varun | On Rohith's word: `ARCHITECTURE.md` became `ARCHITECTURE_AND_SYSTEM_DESIGN.md`, split into Part A Architecture (context, building blocks, technology with real versions, where it runs, security model, the bridge, key decisions, targets) and Part B System Design (folders, key flows, background jobs of both apps, CP Portal and MIMS design, running it, go-live runbook, a short help-article appendix). Corrected against the code: route-file counts (33 and 18), Node 20, versions, machine translation, removed MIMS routes and legacy files, platform-admin two-step, the forced-reset order, which MI steps are signed, the CP database password removed. Added: MIMS workers, Redis, WebSocket, OCR, AI, file storage, security headers, both job catalogues. Links updated in CLAUDE.md, README, both app READMEs, RULES.md, `.env.example` |
| 2026-11-11 | Kiranmai | Table 1 Core Fixes: CME training gated from patients on portal and API; product catalogs harmonized via MIMS migration 191; 4-factor AE validation enforced on intake; forced password reset reordered after two-step verification in MIMS; high-visibility side-effect alert banner rendered on case header; expired response templates auto-archived by daily scheduler; signature documentation aligned to Approve and Send only. |
| 2026-11-11 | Kiranmai | Seven Strategic Enhancements: Cross-Case Inspector Export Suite (MIMS-62) with SHA-256 seal and row-limit lift; Automated Safety Transmission Gateway (E2B-R3) in-app generator and validation; Interactive Two-Way Reporter Dialogue with 72h encrypted magic links; Response Document Review Diffing Engine with inline and side-by-side comparison; Field Medical Insight Capture Screen with mobile offline caching; Real-Time Safety Reconciliation Engine comparing intake receipts to cases; Doctor Credential Verification Gateway (US NPI & UK GMC) during registration. |
| 2026-11-12 | Kiranmai | Toolchain upgrade (Rohith, "upgrade all in one go"): Node 26 LTS, MySQL 9.7 LTS, every package latest — React 19.3, react-router 7.18, Vite 8.3, Express 5.3, passkeys 14, Anthropic SDK 1.8, pdfjs 6, dotenv 18. Found and fixed on the way, each walked on screen: the backend could not start (two routes loaded a missing file); field insights had no sign-in, listed every client's insights to anyone, and never saved; reporter clarification links failed at every step; migration 0064 was not in the baseline. Walked on a sealed 9.7 copy: 32 admin screens, 20 portal pages, sign-in with a wrong password, another client's data refused. Postmortem: `docs/postmortems/2026-11-12-said-the-11-nov-features-were-walked.md`. |


## Sprint history

| Sprint | Goal | Outcome | Key Delivered | Carryover |
|--------|------|---------|---------------|-----------|
| Sprint 1 | Foundation | Stable | Auth, dashboard, client management, basic portal, branding | Browser testing not yet enforced |
| Sprint 2 | Stability + Content | Stable | News, FAQs, Documents, Safety Alerts, MSL directory | None |
| Sprint 3 | Compliance + Integration | Stable | GDPR compliance, CRM field mapping, user type gate, consent records | None |
| Sprint 4 | Analytics + Process | Stable | Analytics module, Process Explorer (47 flows, 295+ captures), custom reports | None |
| Sprint 5 | Language + Translation | CLOSED (2026-03-21) | 6-language auto-translation (MyMemory), language switcher, Chinese support, review queue | npm audit fix (15 pre-existing vulns) |
| Sprint 6 | MySQL Migration + Stability | CLOSED (2026-03-24) | Full SQLite → MySQL migration, all 34 tables migrated. Initially Docker, later moved to native MySQL 8.0.45 (same instance as MIMS). Stable release pushed to GitHub. | `Unknown column 'client_code'` in cp_clients — low priority |


---

# MIMS

## What broke — known issues

| # | Item | Type | Priority | Owner |
|---|------|------|----------|-------|
| 1 | ~~Multi-row AE tabs (lab results, medical history, product info) — row-level CRUD UI is placeholder only~~ | **RESOLVED Sprint 18** — AEMultiRowTab component built. | — | — |
| 2 | CSS for `cf-` namespace — CasesPage/CaseFormPage use `cf-` classes, no dedicated stylesheet | Visual debt | Medium | Kiranmai |
| 3 | `browser-test.js` (66 tests) — not re-run since Sprint 6 Phase 2 — may need selector updates | Test debt | Low | Kiranmai |
| 4 | CP Portal: `Unknown column 'client_code'` in `cp_clients` | CP Portal bug | Low | Varun |
| 5 | Sprint 11 Phase 3 (Safety + CRM) — Argus/Veeva/TrackWise/Salesforce integration | Future sprint | Planned | TBD |
| 6 | Analytics module (`/analytics`) — placeholder only. Rohith deferred (2026-04-22). | Future sprint | Deferred | TBD |
| 7 | Production deployment — Lightsail plan: 2GB instance + Managed MySQL + Object Storage ~$29/mo. Deferred by Rohith. | Deployment | When ready | Varun |
| 8 | Email OTP live success depends on correct SMTP encryption/port. Use `Platform Admin -> 2FA Configuration -> Test SMTP Connection / Send Test Email` before signing off. | Config / QA dependency | High | Varun / Kiranmai |
| 9 | Forgot-password + change-password browser QA needed after password-history rule addition. Backend done, UI/browser evidence pending. | QA follow-up | High | Kiranmai |
| 10 | ~~npm vulnerabilities — 19 flagged (8 high, 9 moderate, 2 low).~~ | **RESOLVED Sprint 16** — `npm audit fix` run. DOMPurify patched. Backend lockfile created. 0 vulnerabilities. | — | — |
| 11 | Chunk size warning in Vite build — main bundle ~1.2MB. Not an error; no action needed unless performance is flagged. | Build debt | Low | Varun |
| 12 | ~~PC Case — no end-to-end QA walkthrough done since backend was built.~~ | **RESOLVED Sprint 20 QA** — 6 bugs found and fixed: (1) `pc-flex-fields` tab had no backend route — added GET/PUT + `case_pc_flex_fields` table. (2) General tab `pc_status`/`pc_classification` fields not saved — added columns + backend support. (3) Patient-info `gender` key mismatch with DB column `sex` — fixed frontend key. (4) Patient-info `injury_experienced` not saved — added column + backend support. (5) `return_requested` rendered as picklist select but DB is TINYINT boolean — changed to checkbox. (6) `replacement_approved` and `refund_approved` same issue — changed to checkboxes. | — | — |
| 13 | MI email delivery depends on SMTP being configured in Admin Console → Email Accounts with `site_email_purpose` = 'response'. If not configured, email is silently skipped (SENT status is still committed). | Config dependency | High | Varun / Kiranmai |
| 14 | DPPR scheduler runs at 02:00 UTC daily. Requires server restart after first deploy to register cron. DPPR Privacy (DPPR) tab in CaseFormPage visible to admin/platform-admin only — non-admin users will see 401 on load (handled silently). | Config / deploy | High | Varun |
| 15 | After any backend route file change (e.g. `cmAuditTrail.js` entity_id filter), server must be restarted — nodemon or manual `node --env-file=.env backend/server.js`. | Ops | Medium | Varun |
| 16 | **Inspector Export (cross-case)** — deferred candidate, see PRD.md › Later — not locked. Jira **MIMS-62** under the *MIMS Deferred* epic **MIMS-60**. Raised from DCI-4 (Katrina, 1 Aug 2026). Cross-case audit *query* exists; cross-case signed *export* does not. | Future feature | Deferred | Saad |


## Done — version history

Section numbers in these rows are the old MIMS SOP's own sections, kept as written; that SOP is in git history.

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-03-27 | Bala | Initial creation — full Sprint 7 state |
| 2026-03-28 | Bala | Sprint 8 complete: session timeout, platform admin lockdown, org/site toggles, data cleanup, site uniqueness. DB, API, frontend, team updated. |
| 2026-03-28 | Bala | Post-Sprint 8: org-controlled user 2FA, Platform Admin 2FA Config, platform SMTP test, QA status added. |
| 2026-03-28 | Bala | Password recovery + history: forgot-password, in-app change-password, backend blocks reuse of current + last 5 passwords. |
| 2026-03-28 | Bala | Reshape: audit + login-audit endpoints → Section 7. Platform Admin pages table → Section 8. Sprint 8 summary expanded. Section 11 updated (2FA infra, SMTP, reset-2fa, audit). |
| 2026-03-28 | Bala | Section 11 trimmed — verbose sprint blocks removed. Content already in sections 7–9, 13. Section 11 = current sprint only. |
| 2026-03-28 | Bala | Team promotions: Varun → Senior Director Engineering, Bhavya → Senior Architect, Vivek → Principal SWE, Karthik → QA Manager, Vanaja → Director Product Management, Vinay → Product Owner. Section 5 updated. |
| 2026-03-28 | Bala | Sprint 9 closed: Platform Admin dashboard, audit filters + CSV export, user lifecycle controls, alerts engine, in-app notifications, duplicate alert-rule fix. Sections 7–13 updated. |
| 2026-03-28 | Bala | Sprint 9 DB enriched: platform_admin_alert_rules, platform_admin_alert_events, notifications expanded. Sprint 9 affected tables documented. |
| 2026-03-31 | Bala | Sprint 10 closed: org seed service (`seedService.js`), GET /api/cases/form-config, Case Form UI dynamic rendering (AE 9 tabs / PC 7 tabs), Field Setup UI two-pane + flex field CRUD. field_setup unique key fixed (org_id). Backfill script. Dev workflow rule. Sprint 11 roadmap locked. All sections updated. |
| 2026-04-05 | Bala | Sprints 11–13 closed. Sprint 14 active. Section 5 → pointer to `TEAM_OPERATING_SOP.md`. Section 14 → pointer to `memory/protocols.md`. Section 13 trimmed (rules → `memory/feedback.md`). Section 11 = current sprint only. Sprint history updated to Sprint 14. |
| 2026-04-07 | Bala | Sprint 14 closed. 13/14 items complete. G13-3 (client-facing demo env) deferred to Sprint 15. Gate 1 passed (exit code 0). Sprint history + Section 11 updated to Sprint 15 READY. |
| 2026-04-18 | Bala | Sprint 15 active changes: CM Phase 4 (4 new document tabs), Regression Testing Suite built, navbar restructured (Utilities dropdown), auth infinite-loop fixed, ExceptionToast silenced, regression mi-categories self-heal fix. Sections 6, 7, 9, 9b, 11, 12, 13 updated. |
| 2026-04-22 | Bala | Sprints 16-18 closed. MI Full Approval Workflow (DRAFT→READY→APPROVED→SENT + e-sign), AE multi-row tab CRUD, Transmissions page, Browse Content page, Impact Preview, npm audit fix, MI bypass fix, DB DEFAULT fix. All sections updated. |
| 2026-04-23 | Bala | Sprint 19 closed. MI email delivery on SENT transition, Response Log page, SLA badge on case list, Dashboard MI KPIs, Inbox→Case context carry, Case Audit Trail diff UI + per-case CSV. Sections 6, 7, 9b, 10, 11, 12, 13 updated. |
| 2026-04-26 | Bala | Sprint 21 (Sprints A+B+C combined) in progress. Sprint A: shared apiClient.js created, regression tests co-located, Joi validation added. Sprint B: db.js split into 001-015 migrations. Sprint C: ContentPage.jsx 3950→68 lines (14 sub-components extracted to content/components/), CaseFormPage 2856→2273 lines (5 components extracted), AdminMiscSection 1782→23 lines (6 panels extracted to AdminProductsPanel, AdminAuditPanel, AdminEmailAccountsPanel, AdminContactMasterPanel, AdminCaseNumberingPanel + AdminShared.jsx created, duplicates removed from AdminWorkflowSection + AdminAccessSection). Total −6,000+ lines from monoliths, 30+ focused files created. |
| 2026-04-28 | Bala | Sprint 21 closed (mims). Sprint A complete in app code: frontend raw `fetch()` migrated to shared `httpFetch` wrapper across 83 files (448→1 wrapper-only call), backend integration services (`mirService`, `crmService`, `vaultService`, `oauth2Service`) moved to backend `httpFetch` wrapper. Sprint B close validation complete: new Jest suite `backend/tests/migrationRunner.test.js` covers fresh DB / legacy bootstrap / already-applied paths (3/3 PASS). Sprint C QA regression close: `Sprint21SplitRegression.test.jsx` added for `CaseFormPage` + `ContentPage` split behavior (4/4 PASS), full frontend tests green (10/10), frontend build PASS. Deferred item unchanged: `authRateLimiter` left as-is. |
| 2026-04-28 | Bala | Sprint 21 final closure. Platform AdminPage.jsx (3456 lines) split into 13 files: `platform-admin/utils/guardedFetch.js` + 12 view components (`DashboardView`, `OrganisationsView`, `TwoFactorConfigView`, `UsersView`, `AlertsView`, `NotificationsView`, `AuditView`, `LoginAuditView`, `IntegrationsView`, `ReportsAccessView`, `HelpContentView`, `CopyDivisionView`). Shell reduced to 107 lines. Global 401 session-expiry handler wired into `shared/api/httpFetch.js` — all 84 `httpFetch` call sites now auto-logout on 401. `createModuleApp.jsx` registers handler for all non-platform-admin modules. `guardedFetch.js` simplified to re-export from shared. Build PASS (246 modules). All code work for Sprint 21 complete. Remaining: QA regression browser pass (human) + MIMS_MEMORY_SOP Sprint 21 docs. |
| 2026-05-12 | Varun | System Design Sprint complete (16 fixes), Architecture fixes complete (A1+A2), Code Review fixes complete (10 issues). UAT/QA system built and wired. `production` git branch created. All sections updated. |
| 2026-05-12 | Bala | UAT server live on Rohith's MacBook (port 4001). Full UAT setup documented in Section 15 (new): PM2 process, DB, credentials, push-to-UAT workflow, feedback widget, QA dashboard, deploy script. |
| 2026-05-12 | Bala | Section 15 expanded — Local vs UAT app purpose, audience, data, workflow fully documented so any team member can understand the difference without verbal explanation. |
| 2026-05-20 | Varun | Local MIMS UAT environment retired and removed from repo/machine. No PM2 `mims-uat`, port `4001`, or `pharaxis_mims_uat` database should be assumed active. |
| 2026-07-15 | Bala | CP Portal↔MIMS integration LIVE (approved by Rohith, browser-verified). API platform: `POST /oauth/token` (client credentials, 1h tokens — CP auto-refreshes), `POST/GET /api/v1/cases`, `POST /api/v1/cases/:id/attachments`; case writes now populate the UI-read structures (`case_contacts`, versioned `case_ae_*`/`case_pc_*`, `case_mi`); idempotent on CP reference (= `case_number`). Fixes shipped: tokenIssuer scope double-parse (mysql2 JSON column, sibling of the apiKeyAuth bug); infinite `/api/auth/me`+security-groups fetch loop in AuthContext (root cause of "Too many authentication requests" lockouts); ProtectedRoute now waits for cookie-session restore instead of bouncing to /login on refresh; auth rate limiter no longer counts successful requests; dev `JWT_SECRET` fixed in `.env` (sessions survive nodemon restarts); `FeatureFlagsProvider` mounted in Max app — it never was, so ALL `cf.*` tenant flags rendered OFF app-wide. `cf.theme6_documents` enabled for Novartis (org 1): Case Attachments workspace now visible (Communications → Attachments). |
| 2026-10-03 | Saad | Two stale lines corrected. *Git push*: enabled since 2026-07-27, always through a pull request, never to `main`. *Section 15*: nothing is deployed; MIMS runs on the local copy only. |
| 2026-10-13 | Saad | Case form clean-up (#769, #770, #771): Case Form Fields is the one admin screen for the case form; Customize Forms and Validation Rules retired; Required is the Required tick only, on every save path; the cut list hides about 95 fields and 11 sections, never deletes; Latest Information Date, verbatim reaction, hospital dates, product Role and Pregnancy Trimester added; the ICSR now takes its reaction text, labs, history and dechallenge from the AE tab; new organisations get the target form only. Migrations 170–175. Sections 7, 8, 9, 9b and 13 updated. |
| 2026-10-13 | Saad | Case form pending items closed: E2B dates written CCYYMMDD; one-sided lab ranges split; long verbatim kept whole in the narrative; ICSR builder readable; Customize Forms and Validation Rules files and endpoints removed; Case Form Fields shows show-only-when rules. Sections 8 and 9 updated. |
| 2026-10-13 | Saad | MI and PC field review (Rohith, "go with all 6"): MI answer is the signed letter (MI answer boxes hidden, "Answer sent" shown), AE/PC screening answer required before a response is sent (`miSendCheck.js`); PC strength, reply to complainant, counterfeit (makes the case Urgent), device part, patient initials, Investigation & CAPA cut to what the complaint record needs, check before Route to Quality (`pcHandoffCheck.js`). Migrations 176–177. Section 9b updated. |
| 2026-10-14 | Saad | MI response and hand-off review: MI Response Settings (off-label and closing statements, prescribing information required on off-label letters, routine/urgent working days, second-signer rules; migration 178); Transmission Setup screen (safety and quality targets, encrypted key, hand-off days, test); hand-off due date and reconciliation list. Sections 8 and 9b updated. |
| 2026-10-14 | Saad | Content management review: letters use only published, in-date modules, templates and documents; templates signed on approve and publish with an independent approver and moving versions; document fields that were dropped now saved (review cycle, regulatory reference, extra expiry recipients); expired check-outs released; Revise for published documents and templates (migration 179); product and language on documents, followed by the letter builder (migration 180); one merge-field list with case fields and Insert field; Make letter files a letter on the case; Merge Reports retired; MI shows documents sent; linked documents suggested. Sections 1 and 7 updated. |
| 2026-10-14 | Saad | Content management review follow-up: Revise for modules (documents built from a module move to its new version) and FAQs (migration 181); Make letter files a PDF; templates carry a language (migration 182); new documents default to a yearly review. Section 7 updated. |
| 2026-10-14 | Saad | Content management in-depth review: emailed letters enclose on-screen and module-built documents as PDFs; folder permissions enforced (and Configure folders checked); review outcome when nobody accepts, reviewer decisions shown to the approver, Reviews I Started, daily overdue reminders; version history across revisions and for modules and FAQs; compare versions by text; Relations, alert settings, publishing checks, Browse filters and bookmarks, dashboard review queues and the module form fixed; unreachable screens, the activity log and the duplicate Browse tab removed. No migration. Section 7 updated. |
| 2026-10-14 | Saad | Reports review: formula fields, certify/publish/versions and the open scheduled-export routes removed; report audience enforced; server-side audited export; Schedule reports privilege; Reports Access grids removed; library rebuilt (20 reports on case, MI, hand-off, inbox, content and user data) with a filter bar; dashboards rebuilt; schedules by period, monthly, time-zone list, recipients inside the organisation who can see the report; Governance tab, Overview and legacy `/api/reports/*` removed; hand-off "sent" ignores MI letters (migration 183). Section 7 updated. |
| 2026-10-14 | Saad | Menu (Rohith, "go with your menu recommendation"): New Case at the top; Work · Knowledge · Reporting · Administration; items a user cannot open are hidden, not greyed; Cases opens the list, with Correspondence added; Deleted Cases for administrators only; menu, quick search and Overview follow each page's access rule. Section 6 updated. |
| 2026-10-14 | Saad | Access review: one case-access check in front of every case route (`middleware/caseAccess.js`), read-only cases for people without Update case; Inbox, content reads, admin endpoints and attachments follow their screen; audit-trail write routes, the attachment search and the shared role-screens route removed; Create transmission enforced; 46 unchecked permissions, the manager role and template, the old Group Security screen and six screen-less modules removed (migrations 184, 185); Screens per person on Edit User; MIMS Admin address for administrators only. Sections 4, 7 and 8 updated. |
| 2026-11-12 | Kiranmai | Toolchain upgrade: Node 26 LTS, MySQL 9.7 LTS, every package latest — Express 5.3, express-rate-limit 8, ioredis 6, imapflow 2, passkeys 14, ESLint 10, Vitest 5, TipTap 3.33. Found and fixed, each walked on screen: a forced password reset was skipped after two-step sign-in; migration 191 named the wrong table, so a fresh database could not be built; the clarification bridge read and wrote columns that do not exist; ESLint 10 found 4 dead assignments. Jest 215/215 on 8.0 and 9.7. Same case search measured on 8.0 and 9.7 with the same data: no slower on 9.7 (the search itself takes seconds on 482k cases on both). |


## Sprint history

| Sprint | Goal | Outcome | Key Features Delivered | Carryover |
|--------|------|---------|----------------------|-----------|
| Sprint 1 | Foundation | Stable base | Auth, login, dashboard, basic inbox, core navigation | Browser verification not enforced — lesson learned |
| Sprint 2 | Stability | Patch/hotfix only | Bug fixes, no new features | Client onboarding held pending stability |
| Sprint 3 | Operational Maturity | CLOSED — 27 stories done | 6 features + Sprint 2 tech debt cleared. GitHub sync disabled. | None |
| Sprint 4 | Admin Console Phase A + B | CLOSED — 10 stories done | Phase A: 7 admin features. Phase B: 3 features | None |
| Sprint 5 | Platform completeness | CLOSED — 9 stories done | 850 frontend modules, 0 errors. Core platform stabilised. | None |
| Sprint 6 | Admin Console + Case Form | CLOSED — Gate 2 approved 2026-03-25 | Phase 1A: Admin Console redesign (165/166 QA). Phase 1B: Extended admin features. Phase 2: Full case form (F-13 to F-18, 195/195 QA). 6 bugs fixed. | Phase 3 (Argus/Veeva integration) — deferred |
| Sprint 7 | Multi-Org Architecture | CLOSED — 2026-03-27 | Multi-org DB, JWT org context, switch-org API, platform admin user+org management, password reset flow, data isolation on all routes, org switcher UI, 7 bugs fixed | None |
| Sprint 8 | Security + Data Integrity | CLOSED — 2026-03-28 | Session timeout (per org + platform admin global), 2FA infra, per-org 2FA config, platform SMTP + test-email, audit + login-audit pages, platform admin lockdown, org/site toggles, site uniqueness, data cleanup. 20/20 QA passing. | None |
| Sprint 9 | Platform Admin Control, Audit, and Alerts | CLOSED — 2026-03-28 | Platform Admin dashboard, audit/login-audit filters + CSV export, user lifecycle controls, alerts engine, alert rules/events, in-app notifications, org/site deactivation alerts, duplicate alert-rule fix. QA passed. | Small future polish only |
| Sprint 10 | Case Form Foundation | CLOSED — 2026-03-31 | Org seed service (`seedService.js`), field_setup unique key fix, GET /api/cases/form-config, Case Form UI dynamic rendering (AE 9 tabs / PC 7 tabs), Field Setup UI two-pane + flex field CRUD, backfill script. 37/37 QA passing. | None |
| Sprint 11 | Integration Foundation + Reports Backend | CLOSED | Integration screens, org_integrations DB, API key auth layer, Integration Engine service, EMIR, Reports backend. | AdminConsolePage split — deferred to Sprint 13 |
| Sprint 12 | Admin Console + Workflow Gaps | CLOSED | Admin Console workflow engine, CM backend, security hardening. | AdminConsolePage split — carried to Sprint 13 |
| Sprint 13 | AdminConsolePage Refactor + Reports UI + CM Frontend + Admin Gaps + Security | CLOSED — 2026-04-05 | AdminConsolePage 6,395→763 lines (5 sub-components), Reports frontend (27 reports), CM frontend, Admin Console FRD gaps, Case Workflow Engine fix, Security hardening, Platform Admin Reports Access. 50/50 items. Gate 2 approved. | Security Groups deactivation — Sprint 14 |
| Sprint 14 | Case Management Gaps + UX + QA + Architecture | CLOSED — 2026-04-07 | G10: Global search, case comments, case reassignment, notifications. G11: Home dashboard, session management UI. G12: Full regression suite, Security Groups deactivation fix. G13: API versioning (/api/v1/*), log aggregation endpoint. 13/14 items. Gate 1 passed. | G13-3: Demo env provisioning — Sprint 15 |
| Sprint 15 | CM Phase 4 + Regression Suite + UX Fixes | CLOSED — 2026-04-18 | CM 4-tab extension (Other Attributes, Associated Docs, Usage Instructions, Version Alerts), Owner lock model, CM picklists fix, Regression Testing Suite (dashboard + history + self-healing test user), Auth infinite loop fix, Navbar restructure (Utilities dropdown), ExceptionToast silenced. | G13-3 demo env carry-in |
| Sprint 16 | MI Full Approval Workflow (D1) | CLOSED — 2026-04-22 | D1: MI response lifecycle DRAFT→READY→APPROVED→SENT with 21 CFR Part 11 e-sign. VOIDED terminal state. `case_mi_responses` + `case_mi_response_transitions` tables. MI e-sign modal in CaseFormPage. C1 fix: removed direct SENT bypass. T4: DB DEFAULT 'SENT'→'DRAFT'. T1: npm audit fix (DOMPurify + lockfile). | None |
| Sprint 17 | Master-data Impact Preview (D2) | CLOSED — 2026-04-22 | D2: POST `/api/admin/impact-preview` — blast-radius for workflow/field/taxonomy changes. 5-min TTL cache. "Preview Impact" buttons in AdminWorkflowSection and AdminPicklistsSection. ImpactPreviewModal with risk_level badge + breakdown table. | None |
| Sprint 18 | UX Completions — AE Multi-row, Transmissions, Browse Content | CLOSED — 2026-04-22 | C2: AEMultiRowTab component — inline CRUD for Lab Results, Medical History, Product Info (frontend only; backend was already complete). H1: TransmissionsPage `/transmissions` — filtered log with stats strip. H2: BrowseContentPage `/browse-content` — card grid + folder sidebar + detail sidebar. Both wired into App.jsx + existing navbar links activated. | None |
| Sprint 19 | P0/P1 Completions — Email delivery, Response Log, SLA, Dashboard KPIs, Audit Trail UX | CLOSED — 2026-04-23 | P0: MI SENT transition now sends nodemailer email to primary case contact (SMTP from site_email_purpose/fallback), logs to transmission_audit_trail. P0: ResponseLogPage `/response-log` — full filtered MI response log with detail modal. P0: SLA badge on case list (green/amber/red from response_required_by). P1: Dashboard MI KPI section (pending/approval/sent today/SLA breached). P1: Inbox→Case carries email subject+body+sender into description+internal_notes. P1: Audit Trail UI rebuilt — per-case field audit (before/after diff in red/green + CSV export) + system audit log "Diff" modal per row. | None |
| Sprint 20 | DPPR + Audit Trail Redesign + Copy Division Fix | CLOSED — 2026-04-25 | F-CopyDiv: Copy Division org dropdown fixed (removed `subdomain` column that doesn't exist in organisations table). F-7 DPPR: tenant-level data privacy rules — `dppr_rules`, `dppr_execution_log`, `case_dppr_overrides` tables; 9-route backend (`/api/admin/dppr/*`); DPPRPage.jsx with Privacy Rules + Execution History tabs, Run Now, scheduler at 02:00 UTC (`dpprScheduler.js`). F-8 Individual DPPR: "Privacy (DPPR)" tab added to CaseFormPage — per-domain override UI (action/retention_days/reason), enforces ≥ restrictive constraint vs tenant rule. Audit Trail Redesign: all 3 audit pages rebuilt as two-panel versioned UI — left = summary list, right = click-to-expand version history with before/after diff (Case: red/green field-level; CM: entity changelog with details col; Transmission: numbered records with payload/response detail). CM audit trail `entity_id` filter added to backend. | None |


## Sprint 21 record (the last numbered sprint)

**Sprint 21 — ALL CODE COMPLETE (2026-04-28). QA browser pass pending (human).**

| Item | Status | Detail |
|------|--------|--------|
| Sprint A: shared `httpFetch` wrapper (83 files) | ✅ DONE | Raw fetch migrated. 401 global session-expiry handler now live in `httpFetch.js`. All modules auto-logout on expired token. |
| Sprint A: `createModuleApp.jsx` session handler | ✅ DONE | All non-platform-admin modules (Admin, Content, DV) register session-expiry handler on mount via `setSessionExpiryHandler`. |
| Sprint B: `db.js` → migrations 001–015 | ✅ DONE | Migration runner with fresh DB + legacy bootstrap + already-applied path coverage (3/3 tests PASS). |
| Sprint C: `CaseFormPage.jsx` split + `useCaseForm` hook | ✅ DONE | Shell 2856→2273 lines. 5 tab components extracted. |
| Sprint C: `ContentPage.jsx` split | ✅ DONE | Shell 3950→68 lines. 14 sub-components in `content/components/`. |
| Sprint C: `Platform AdminPage.jsx` split | ✅ DONE | 3456→107 lines. 12 view components + shared `guardedFetch` utility. Build PASS. |
| Sprint C: `AdminMiscSection.jsx` split | ✅ DONE | 1782→23 lines. 6 panels extracted. |
| QA regression browser pass | ⏳ PENDING | Human click-through — CaseForm tabs, Content sections, Platform Admin 12 sections. ~1 hr. |
| `authRateLimiter` review | ⏳ DEFERRED | Left as-is by Rohith decision. |

**Sprints 15-18 — ALL CLOSED (2026-04-22). Gate 1 PASSED.**

**Summary of Sprints 16-18 (one-shot delivery):**

| Item | ID | Status | Detail |
|------|----|--------|--------|
| MI Full Approval Workflow | D1 | ✅ DONE | DRAFT→READY→APPROVED→SENT lifecycle. E-sign modal (password + reason) for APPROVED and SENT transitions. VOIDED terminal state. Backend: `case_mi_responses`, `case_mi_response_transitions` tables + transition API. |
| MI "Send Response" bypass fix | C1 | ✅ DONE | Removed button that directly created SENT records. Creation modal now only has "Save as Draft". Info notice explains full workflow. |
| DB response_status DEFAULT fix | T4 | ✅ DONE | `case_mi_responses.response_status` DEFAULT changed from 'SENT' to 'DRAFT'. MODIFY COLUMN statement added to fix existing running DBs. |
| npm audit fix | T1 | ✅ DONE | DOMPurify ≤3.3.3 vuln fixed via `npm audit fix`. Backend `package-lock.json` created via `npm install --package-lock-only` (0 vulns). |
| Impact Preview (blast-radius) | D2 | ✅ DONE | POST `/api/admin/impact-preview` — 3 change_types (workflow_rule/field_definition/taxonomy), 5-min TTL cache. "⚠ Preview Impact" buttons in AdminWorkflowSection + AdminPicklistsSection. ImpactPreviewModal with risk_level badge + breakdown. |
| AE multi-row tab CRUD | C2 | ✅ DONE | `AEMultiRowTab` component in CaseFormPage: Lab Results, Medical History, Product Info — inline add/delete rows, API calls to existing backend routes. `.cf-multirow-*` CSS added. |
| Transmissions page | H1 | ✅ DONE | `/transmissions` → TransmissionsPage.jsx. Filter by system/status/date, search, pagination, stats strip. Uses `/api/admin/transmission-audit-trail`. CSS namespace: `tx-`. |
| Browse Content page | H2 | ✅ DONE | `/browse-content` → BrowseContentPage.jsx. Folder sidebar + card grid + detail sidebar. Uses `/api/cm/documents` + `/api/cm/folders`. CSS namespace: `bc-`. |
| MIMS SOP update | T2 | ✅ DONE | Sprints 16-18 documented in all relevant sections. |

**Sprint 19 — CLOSED (2026-04-23). All 6 items delivered.**

| Item | ID | Status | Detail |
|------|----|--------|--------|
| MI email delivery on SENT | P0-1 | ✅ DONE | nodemailer fires when response transitions to SENT. Primary case contact email fetched from case_contacts. SMTP resolved via site_email_purpose (purpose='response') → any active account fallback. Success + failure both logged to transmission_audit_trail. Non-fatal: SENT status not rolled back on email failure. |
| Response Log page | P0-2 | ✅ DONE | `/response-log` → ResponseLogPage.jsx. Cross-case MI response log, filterable by status/date/search. Detail modal per row with full response text. Added to Utilities dropdown. CSS namespace: `rl-`. |
| SLA badge on case list | P0-3 | ✅ DONE | `SlaBadge` component in CasesPage.jsx reads `sla_due` (SQL subquery: MIN(response_required_by) from case_mi). Green ✓ (>48h), Amber ⚠ (<48h), Red ✕ (breached). Added to My Cases + Unassigned Cases columns. |
| Dashboard MI KPIs | P1-4 | ✅ DONE | dashboard-summary backend now returns `mi_stats` object. DashboardPage shows "MI Response Activity" section: In Progress / Pending Approval / Sent Today / SLA Breached (red if > 0). Links to /response-log. |
| Inbox→Case context carry | P1-5 | ✅ DONE | createCaseFromInquiry() now passes `description` (email body, first 1000 chars) and `internal_notes` (sender + subject + received timestamp) into POST /api/cases. Agent no longer has to retype inquiry content. |
| Case Audit Trail UI rebuild | P1-7 | ✅ DONE | AdminMiscSection audit-admin section replaced with AuditAdminPanel component: (1) Case Field Audit — enter case ID → before/after diff table (red = old, green = new) + CSV export; (2) System Audit Log — "Diff" button per row → modal showing parsed change details. |

**Sprint 20 — CLOSED (2026-04-25). All items delivered.**

| Item | ID | Status | Detail |
|------|----|--------|--------|
| Copy Division dropdown fix | BUG-1 | ✅ DONE | `copyDivision.js` queried non-existent `subdomain` column. Fixed: query now `SELECT id, name FROM organisations`. Frontend option label stripped subdomain suffix. |
| Feature 7: DPPR (tenant-level) | F-7 | ✅ DONE | 3 new DB tables (`dppr_rules`, `dppr_execution_log`, `case_dppr_overrides`). 9-route backend at `/api/admin/dppr/*`. `DPPRPage.jsx` — Privacy Rules tab (CRUD, toggle, Run Now) + Execution History tab. `dpprScheduler.js` — node-cron at 02:00 UTC. Navbar link added. ACTION_RANK enforces Delete > Anonymize > None ordering. |
| Feature 8: Individual DPPR | F-8 | ✅ DONE | "Privacy (DPPR)" tab in CaseFormPage (8th tab). Per-domain override form: action (filtered to ≥ tenant rule), retention_days (capped at tenant minimum), override_reason. Set/Update/Remove per domain. Badge shows active override count. Wired to `PUT/DELETE /api/admin/dppr/cases/:caseId/overrides`. |
| Audit Trail Redesign — Case | AT-1 | ✅ DONE | `CaseAuditTrailPage.jsx` rebuilt: left panel = case summary list (search, pagination); right panel = entries grouped into versions (30s window, same user), each version expandable to field-by-field before/after diff table. New backend endpoint `GET /case-audit-trail/cases-summary`. CSS namespace: `cat-`. |
| Audit Trail Redesign — CM | AT-2 | ✅ DONE | `CMAuditTrailPage.jsx` rebuilt: left = entity list (filter by type); right = versioned changelog per entity. Backend: `entity_id` filter added to `GET /cm-audit-trail`. New `GET /cm-audit-trail/entities-summary` endpoint. CSS namespace: `cmat-`. |
| Audit Trail Redesign — Transmission | AT-3 | ✅ DONE | `TransmissionAuditTrailPage.jsx` rebuilt: left = cases with transmissions (sent/failed counts); right = numbered transmission records (#1 oldest→#N newest), each expandable to show target system, status, response code, sent by, payload summary. New `GET /transmission-audit-trail/cases-summary` endpoint. CSS namespace: `tat-`. |

**Next sprint planning:** TBD by Rohith.

