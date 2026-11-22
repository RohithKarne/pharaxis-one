# Progress — Pharaxis One

What is done, what broke, what is next. Newest first. Updated by whoever does the work, as it happens.

> Trimmed 2026-11-22 on Rohith's word: finished work is one line each; old version and sprint histories and closed gaps are in git history. The controlled record of every change, with its revalidation flag, stays in [CHANGELOG.md](CHANGELOG.md).

## In verification — 2026-11-17: Site controls retired in MIMS

Organisations, the Setup Wizard, Folder Manager, and API connections no longer show site controls. Legacy site-access and new site-specific rules or assignment options were removed from their forms. Setup uses Bootstrap to supply its internal default. Folder and API connection edits preserve stored site links when the field is omitted. Historical records and compatibility routes remain.

Frontend build and backend syntax checks passed. A browser preview with sample responses verified the Organisations page, wizard completion through Bootstrap, and folder and API settings saves without site fields. Live database workflows and already-imported Help articles remain unverified.

## In verification — 2026-11-17: One organisation selector in MIMS Admin

MIMS Admin follows the signed-in organisation in the header. Switching keeps the settings page address and reloads its content for the new organisation. Admin asks before switching so unsaved work can be saved first. Platform admins can select active organisations without requiring a separate membership. Ordinary users still need active membership. Platform-wide panels keep their scope.

Backend syntax and frontend build checks passed. A browser preview with sample API responses confirmed the setup checks followed the selected organisation, the Admin workspace was disabled during the switch, cancel and refusal kept the prior selection, and standalone Admin used the same selector. Live role checks and saving settings in both organisations remain unverified.

## Awaiting Rohith's verification — 2026-11-17: MIMS reporter erasure and stale edits

Successful erasure clears the contact editor and its browser draft. MIMS checks the saved erasure status when opening the reporter and rejects contact writes that would restore the erased reporter. Live erasure, stale-tab save, and reopen were left for Rohith to verify.

## Awaiting Rohith's verification — 2026-11-17: MIMS Primary Reporter details

Reporter & Patient shows a full-width Primary Reporter section. Save Case submits pending reporter edits through the existing contact update route and includes those edits in the reason-for-change prompt when required. No live screen or database workflow was run.

## Awaiting Rohith's verification — 2026-11-17: MIMS New Case owner

Manual New Case requests assignment to its creator. MIMS checks the creator against the existing owner eligibility rules and records an eligible creator as Case Owner during creation. Rohith will verify the change in MIMS. No tests or screen checks were run, per his request.

## In verification — 2026-11-17: MIMS New Case Reporter Country

The New Case dropdown lists all 249 catalog entries with country names and two-letter codes. The create route accepts a listed code or a blank. The frontend build passed. The browser preview with test API responses showed the full list and allowed selection of India and United States on MI, AE and PC. The create route rejected invalid values before database access in an isolated check. Saving and reopening a case against the running database remains unverified.

## Where things stand — 2026-11-22

```
CP Portal ── active development ── local only ── last merged: #795 (27 Oct review, E1–E5, F1–F5)
MIMS ─────── active development ── local only ── last merged: #828 (site controls retired, one organisation selector, reporter and New Case fixes)
Bridge ───── live between the two, locally ── watched by Sync Health and the Inquiry Ledger
Team ─────── restructured 2026-11-22: Rohith → Product (Saad) · Development (Varun) · QA & Compliance (Swaroop) · Medical Affairs (John); 17 simulated personas
```

| | CP Portal | MIMS |
|---|---|---|
| Last full screen walk | 10 Oct 2026, every admin screen and portal page | 14 Oct 2026, access review and revalidation pass |
| Revalidation flag (Unreleased) | Full | Partial |
| Tagged release | None — tags paused by Rohith, 2026-10-04 | None |

## Done

One line per finished piece of work, newest first. The full write-ups are in git history (before 2026-11-22) and in [CHANGELOG.md](CHANGELOG.md).

| Date | What | Pull request |
|---|---|---|
| 2026-11-22 | Team with heads and members: 17 simulated personas; shorter session-opening prompt | #829 |
| 2026-11-18 | Four teams, no Chief of Staff; Katrina as simulated client | #827 |
| 2026-11-16 | MIMS Admin clinical governance and regulatory capabilities (two-signer off-label, tiered SLAs, regional labels, emergency safety directory, screening gate) | #826 |
| 2026-11-16 | Case form Drops 1–3: seriousness and regulatory clocks, split and link, four-factor gate, safety-term interception, solicited off-label gate, 3-day FAR clock | #826 |
| 2026-11-16 | Content module enhancements: off-label PI auto-attach, version rationale, token validator, watermarked PDF | #826 |
| 2026-11-16 | Reports REP-1 (executive PDF export) and REP-4 (case drill-through drawer) | #826 |
| 2026-11-16 | Full QA verification of the MIMS reports, content, admin and case form modules | #824, #826 |
| 2026-11-13 | Access review closed: C1, A6, A4 | #823 |
| 2026-11-13 | A0/A2/A3: organisation admins kept inside their organisation | #822 |
| 2026-11-13 | One MIMS sign-in (L1–L4) | #821 |
| 2026-11-12 | S1: keep side-effect reports that miss a validity criterion | #820 |
| 2026-11-12 | Toolchain upgrade: Node 26, MySQL 9.7, every package latest | #818 |
| 2026-11-12 | Seven strategic enhancements | #817 |
| 2026-11-11 | Table 1 core fixes | #816 |
| 2026-11-10 | Six core documents replace the SOP; team meeting decisions | #802–#809 |

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
| **Nothing is deployed anywhere** | Both products run only on a developer machine. Nobody outside the team can reach either one, and no client demonstration is possible without rebuilding a deployment path. **Accepted deliberately** — see RULES.md › Getting a change to main. | Rohith |
| **Monitoring and incident response are not built** | No error tracking, no APM, no uptime check. We learn a product is down when someone opens it. **Owned by Varun from 2026-09-20** (see RULES.md › Who does what), so this is still a build task with a name against it. | Varun |
| **Releases are not tagged** | Paused by Rohith on 2026-10-04 (RULES.md › Getting a change to main); the old `v1.0.0` tag is deleted. Changes are logged in `docs/CHANGELOG.md` under Unreleased, with their revalidation flags. The release workflows have never run. | Varun |
| **No automated test is written any more** | RULES.md › Proving it works retired 2026-09-20. Every regression is now found by a person opening a screen. For a GxP product this is a reduction in evidence an auditor can read. | Rohith |
| **Nobody challenges the compliance position** | Sarvanan left 2026-09-20. The regulatory position — Saad's from 2026-10-01, Vasu's before — is stated and never tested from outside. | Rohith |
| **Work found mid-build skips the lock** | From 2026-10-01 (RULES.md › How work flows, *Found while working*) a defect, a miss or a new feature found while working is built in the same session without Rohith's prior approval. It is still its own ticket and its own commit, checked on the real screen, named in the report, and not pushed until he says so — but nobody outside the session agrees it before it is built. **Narrowed 2026-11-18:** only finds inside the agreed scope; a significant product decision, architecture change, wider scope or risk goes to Rohith first. | Rohith |
| **13 screen walks owed** | Removed from TASKS.md on 2026-11-22 without being walked: the rest of #817 (inspector export, E2B, document diff, reconciliation, credential check); the #828 checks (site controls, organisation selector, Primary Reporter, New Case owner and Reporter Country, reporter erasure); the platform admin's Sign-in & Security; the access-review walk on the shared dev copy; Katrina's test users; John's S1 reporter decision; the routines that still name the old SOP. The code is merged, but nobody has seen these flows on screen. The list is in TASKS.md's git history. | Rohith |
| **AI governance has no expert** | Mark Antony left 2026-09-20. From 2026-11-22 Radhika gives the first pass and Rohith decides — **neither is a substitute for the expertise that left.** | Rohith |


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

**Last test result:** 10 Oct 2026, after the ease-of-use plan merged: every admin screen as superadmin and client admin, every portal page as a doctor and as a visitor, one failing path on 20 forms, and every migration on MySQL 8.0.46. Before that, every screen, role and user type walked on the real screens 4–7 Oct 2026 (CP Portal end-to-end walk, PRs #723, #724, #727); what was not checked is listed in each pull request. Before that: all core flows stable at Sprint 6 close (2026-03-24).


## What broke — known issues

| # | Item | Type | Priority |
|---|------|------|----------|
| 1 | `Unknown column 'client_code'` in `cp_clients` — appears in some edge queries | Low-severity bug | Low |
| 3 | Translation coverage — existing content before 2026-03-21 has empty `translations_json`. Where machine translation is on, an admin clicks "Retranslate All Content" once per client to backfill; where it is off, the team supplies the translations. | Data gap | Low |
| 4 | Bundle size — 1.1MB JS bundle (single chunk). Should split with `React.lazy()` per route when performance matters. | Performance debt | Low |
| 5 | Uploads are gitignored. **From 2026-10-27** `docs/scripts/backup-cp-portal.sh` copies uploads and the database to `~/Pharaxis-Backups/cp-portal` (newest 14; a restore was checked). Run by hand — Rohith declined a nightly schedule, 2026-10-27. Same machine and unencrypted, so not disaster recovery; any deployment still needs persistent storage. | Deployment risk | Medium |



---

# MIMS

## What broke — known issues

| # | Item | Type | Priority | Owner |
|---|------|------|----------|-------|
| 2 | CSS for `cf-` namespace — CasesPage/CaseFormPage use `cf-` classes, no dedicated stylesheet | Visual debt | Medium | Kiranmai |
| 3 | `browser-test.js` (66 tests) — not re-run since Sprint 6 Phase 2 — may need selector updates | Test debt | Low | Kiranmai |
| 4 | CP Portal: `Unknown column 'client_code'` in `cp_clients` | CP Portal bug | Low | Varun |
| 5 | Sprint 11 Phase 3 (Safety + CRM) — Argus/Veeva/TrackWise/Salesforce integration | Future sprint | Planned | TBD |
| 6 | Analytics module (`/analytics`) — placeholder only. Rohith deferred (2026-04-22). | Future sprint | Deferred | TBD |
| 7 | Production deployment — Lightsail plan: 2GB instance + Managed MySQL + Object Storage ~$29/mo. Deferred by Rohith. | Deployment | When ready | Varun |
| 8 | Email OTP live success depends on correct SMTP encryption/port. Use `Platform Admin -> 2FA Configuration -> Test SMTP Connection / Send Test Email` before signing off. | Config / QA dependency | High | Varun / Kiranmai |
| 9 | Forgot-password + change-password browser QA needed after password-history rule addition. Backend done, UI/browser evidence pending. | QA follow-up | High | Kiranmai |
| 11 | Chunk size warning in Vite build — main bundle ~1.2MB. Not an error; no action needed unless performance is flagged. | Build debt | Low | Varun |
| 13 | MI email delivery depends on SMTP being configured in Admin Console → Email Accounts with `site_email_purpose` = 'response'. If not configured, email is silently skipped (SENT status is still committed). | Config dependency | High | Varun / Kiranmai |
| 14 | DPPR scheduler runs at 02:00 UTC daily. Requires server restart after first deploy to register cron. DPPR Privacy (DPPR) tab in CaseFormPage visible to admin/platform-admin only — non-admin users will see 401 on load (handled silently). | Config / deploy | High | Varun |
| 15 | After any backend route file change (e.g. `cmAuditTrail.js` entity_id filter), server must be restarted — nodemon or manual `node --env-file=.env backend/server.js`. | Ops | Medium | Varun |
| 16 | **Inspector Export (cross-case)** — deferred candidate, see PRD.md › Later — not locked. Jira **MIMS-62** under the *MIMS Deferred* epic **MIMS-60**. Raised from DCI-4 (Katrina, 1 Aug 2026). Cross-case audit *query* exists; cross-case signed *export* does not. | Future feature | Deferred | Saad |
