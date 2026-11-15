# CP Portal and MIMS audit — 13 November 2026

Status: IN PROGRESS. Findings and suggestions only. This is not a complete verification or a release sign-off.

Audit resumed at Rohith's instruction. Test copies and evidence are retained. Control-level execution remains in progress; this report must not be treated as completed verification.

Current runtime snapshot: commit 9c940bf9, exported to /private/tmp/pharaxis-audit-source.GYCxOt. Its doctor-credential changes and the scenarios recorded below have been retested; this does not mean all functionality at this commit has passed. A separate session is changing wt-fin; results use frozen exports. No application fix was written by this audit.

Control-level inventory: 3,543 interactive JSX source locations across 278 files (1,038 CP Portal; 2,505 MIMS), plus 119 route declarations. All parsed without errors. The separate inventory starts pending: prior page-load checks cannot be converted into control-action passes. Dynamic controls, receiving API rules and role/state/tenant variants require additional tracing. See audit-20261113/control-inventory.json and control-coverage.md.

| Finding | Latest evidence/status |
|---|---|
| A01 reconciliation false zero-loss | Query failures corrected by another session in 33f4d685; runtime and screen retest now show 500 sampled cases, 3 unlinked emails and 48 delayed cases. Full cross-source coverage remains unproven; sample limits and operational metric semantics remain open. |
| A02 field-insight delivery | Reproduced; affected source unchanged in fixed snapshot. Open. |
| A03 single-case cross-org export | Reproduced again on 33f4d685. Open. |
| A04 claimed doctor verification | Corrected by another session in 9c940bf9. Physician request rejects 6-digit GMC, accepts 7 digits as pending/inactive; API says format_ok and not registry-confirmed. Approver screen shows number plus the same limitation. Registry integration is not implemented or certified by this audit; database license_verified remains a format-check flag. |
| A05 malformed XML accepted | Service reproduced; validator unchanged despite new E2B screen in snapshot. Open. |
| A06 cross-case export query failure | Corrected by another session. 33f4d685 retest returns 200, 3 current-day cases and 11 audit rows. PDF now declares its 500-event sample; full export integrity and date semantics still need review. |
| A07 stale MIMS admin session | Group-demotion reproduced on d8060a5f with both roles Auditor; relevant auth/user-write logic unchanged in 33f4d685. Open. |
| A08 shared offline draft | Reproduced on doctor→patient screen transition; affected source unchanged. Open. |
| A09 duplicate clarification replies | Two successful concurrent replies, two saved comments; CP screen shows only the second answer. Affected route unchanged. Open. |
| A10 field-insight audience/ownership | Product decision, supported by patient submission and absent operational queue. Not counted as a confirmed audience defect. |
| A11 stale portal audience | Reproduced before/after fresh sign-in; affected source unchanged. Open. |
| A12 incomplete/wrong response diff | Reproduced on screen and contrasted with saved response; affected source unchanged. Open. |
| A13 session cookie in logs | Confirmed using only audit session: 90 response log entries contained the session cookie while request cookies were redacted. Logger unchanged. Open. |
| A14 pinned report opens wrong selection | Confirmed on 9c940bf9: pin 3 navigates to preset=3, receiving Reports selects Operations Summary instead of Cases Received. Open. |
| A15 default landing choice ignored | Confirmed on 9c940bf9: save Cases, log out using Session Management, sign in with password and TOTP; arrives at Overview while saved choice still says Cases. Open. |
| A16 response filters overwritten by an older request | Confirmed on 9c940bf9 using real API responses with controlled delivery order. A row dated 13 Nov appears under To 12 Nov after the older response arrives. Open. |
| A17 inconsistent password instructions | Profile and invitation reset screen say minimum 8 characters; server rejects an 8-character password and requires 12. Open. |
| A18 incomplete personal export | Downloaded synthetic user 107 export omits their saved field insight and medical registration fields. Open. |
| A19 incomplete erasure reported fulfilled | Real admin Fulfil marks synthetic request 18 fulfilled; account name/email removed, but field insight 3 retains reporter name/email and account retains GMC number. Open. |
| A20 concurrent publication advances two major versions | Two concurrent authenticated publish requests for approved synthetic revision 464 both returned 200. Version history has 3.0 and 4.0; predecessor archive note references 3.0. Open. |
| A21 concurrent Send creates duplicate emails | Two concurrent valid SENT transitions for synthetic response 289411 both returned 200 and created pending email jobs 4 and 5 for the same response. Worker stopped; duplicate jobs not delivered. Open. |
| A22 content reader offered forbidden author actions | Reviewer screen offers Clone; click returns 403. Published View opens editable fields and Save Draft, which also returns 403. Server protection works; screen misrepresents allowed actions. Open. |
| A23 portal claims email delivery before it occurs | After normal close-sync, portal shows response 289411 and “A copy was emailed to you” while both associated email jobs are still pending/attempts 0 and delivery_metadata is null. Open. |
| A24 negative patient age accepted | AE patient screen saves −5 Years to version 86 and shows validity 4/4. E2B check says Ready. Synthetic age restored to 40 after evidence. Open. |
| A25 captured suspect product lost in E2B export | Intake and AE version product name Rosucal 10; downloaded XML instead says Suspect Product. Adapter queries nonexistent case_ae_products, swallows error and falls back to nonexistent cases.product_name. Open. |
| A26 E2B(R3) export rejected by official ICH schema | App says Ready; offline xmllint validation against official ICH package 1.11.1 schema rejects generated root. Official ICH reference instance passes the same schema/tool. Open. |
| A27 expanded overdue list clips the transmissions table | At 1440×812, the default expanded 28-row handoff list shrinks the transmission table wrapper to 2px. Ordinary case-link clicks cannot reach the table. Collapsing the list restores the links. Open. |
| A28 destination selection ignored; rejected destination reported SENT | Real screen selects synthetic rejecting target; API receives that selection. Engine sends to both subscribed targets. Selected target returns 503 three times; unselected target returns 200, so UI/history claim selected target SENT/200. Open. |
| A29 effective-access preview omits rights inherited from role | Auditor group says View cases is a locked role right; Preview says no effective capabilities. Normal auditor sign-in can read case 483113. Adding Create Case makes preview show only that grant, still omitting View cases. Open. |
| A30 human capability changes displayed as System | Synthetic group capability grant/revoke were performed by admin 456; database retains user_id=456 but user_name=null. History API omits the ID and screen labels both System. Open. |
| A31 platform-admin timeout upper bound not enforced | Real Sign-in & Security input declares max 480; saving 481 returns 200 and persists after reload. Other tested lower/upper range violations rejected. Restored original 35 minutes. Open. |
| A32 permitted Inbox-only user lands on No System Access | Normal admin removes only Cases from synthetic agent. Fresh password/TOTP sign-in lands at No System Access despite three granted modules; direct Inbox screen/API work. Cases API correctly rejects access. Open. |
| A33 user CSV ignores role/status/group filters | Client admin searches own synthetic agent and selects Reviewer, showing 0 users. Export CSV downloads that Agent anyway. UI sends only search, and export query ignores other filters. Open. |
| A34 quoted CSV department becomes an unintended SSO identifier | Normal Bulk Add uploads valid quoted department "Medical, Information" with blank network_user_id. Preview shows no problem; request/storage split it into department="Medical and network_user_id=Information". Synthetic user 465 created. Open. |
| A35 Bulk Add cannot supply mandatory contractor end date | Client permits personal-email contractors. Bulk Add has no end-date input and drops even an extra CSV access_ends_on value. Normal Create is rejected for the missing mandatory date. Open. |
| A36 one reset token accepts two different concurrent password changes | Real recovery UI plus overlapping replay, 120ms apart, both return 200 for different passwords. Final password is the second; first accepted password is missing from history. Sequential replay is rejected. Open. |

Lead review voice: John. Product/business rules: Saad. Technical evidence: Varun. Coverage tracking: Tim. These are review roles within this session, not independent human reviewers or parallel agents.

## Scope and baseline

Rohith approved: both products, all enhancements including unmerged work; internal staff, outsourced MI agents, healthcare professionals and patients; relevant countries/languages and failure paths. No fixes.

Shared checkout: main a1ca294a. First refreshed origin/main: 0ca3a9bd (#820 incomplete AE intake, #821 sign-in, #822 organisation-admin scope). The first runtime used existing wt-a2 at da03f1c0 (same tree). During the audit another session merged #823, origin/main 39c1625b, and prepared unmerged fix/close-pending-2026-11-13 at d8060a5f. Both APIs and frontends were moved to its existing wt-fin; audit migration 194 applied there. Key reconciliation, cross-organisation export and group-demotion failures were reproduced again on this latest source. Evidence from earlier baselines is labelled by chronology; application files were not modified by this audit.

The repository branch-status script was run for feat/* against refreshed origin/main. Many historical squash-merged branches report unclear; that is not evidence they remain unmerged. Full remaining branch reconciliation is pending.

Two independent database copies were made from the current local dev databases: pharaxis_cp_audit_20261113 and pharaxis_mims_audit_20261113. Mail hosts/connection endpoints were redirected locally; copied SSO/AI/outbound connections disabled. New test accounts were created, not existing passwords reused. MIMS runs HTTP with general workers off; CP uses the external scheduler mode. Controlled single runs have since covered one email job, CP close-sync ticks and one synthetic contractor-expiry sweep. All other jobs remain untested. Upload/storage files have not been copied; missing-file results must not be attributed to the product without checking original storage.

## Evidence ledger

### A36 — P1 — Concurrent password reset consumes one authorization twice

Synthetic user 466 receives a password-recovery code at the local TLS receiver, verifies it through the real screen and reaches Set new password. Held only that screen's actual reset request long enough to start a second request with the same reset token and a different valid generated password, 120ms apart. Both requests return 200 / Password updated successfully. The real UI receives its actual first response and reports success. No token, hash or password is included in this report.

Stored reconciliation: second password is current, nonce cleared, two completed-reset audit events for this pair (three including the earlier normal check). The first accepted password is absent from the retained password history; both requests used the earlier hash read before either update. A subsequent normal sign-in with the second password is accepted and requires two-factor enrolment. Sequential reuse of a consumed reset token correctly returned 401 in the earlier control; it does not protect overlapping requests.

Cause: completeForgotPasswordReset checks the nonce before updatePasswordWithHistory. The later transaction updates by user ID without checking/consuming the expected nonce or locking and re-reading the current hash. Suggestion: serialize reset authorization consumption, password change and history against one locked current user record; exactly one request must consume the token. Changes if: concurrent distinct-password attempts yield one successful change, correct previous-password history and one completion audit event, while expiry/replay and session revocation still hold.

Evidence: backend/controllers/authController.js:369-409,2265-2315; normal UI/request plus overlapping replay; own user 466 hash comparisons and login_audit/history reconciliation. No real account or external email service was used.

### A35 — P2 — Bulk provisioning cannot complete the supported contractor workflow

Client policy company.example.test / personal emails allowed. Normal Bulk Add selects group 72 and Calder; synthetic personal-email row has a future access_ends_on column. The screen has no date field and maps only six identity columns plus group/tenants into its request, dropping the supplied date. Server correctly rejects the batch because personal-email contractors require Access ends on. The same class of user was successfully created through the single-user screen with its date. Restored client policy after this test; no bulk contractor was created.

Suggestion: provide a common end date for the batch or a clearly validated per-row date, preview it and send it through the existing server policy. Changes if: an allowed personal-email batch can be created with valid dates, and missing/past/excessive dates still reject the entire batch. This is a missing bulk workflow; the server's access-date enforcement held.

Evidence: frontend/modules/mimsadmin/components/tabs/BulkUserImport.jsx:130-141, Users file/access controls; backend/routes/admin/users.js:507; normal captured request/rejection and no date input.

### A34 — P1 — Bulk CSV parsing silently changes identity-related columns

Downloaded the actual Bulk Add template. First pasted valid CSV with quoted name “Audit, Quoted”: parser shifts the email and reports it invalid. Then uploaded synthetic CSV with a plain name, valid email, department field "Medical, Information" and blank network_user_id. Preview shows name/email and no problem; Create 1 User succeeds 201. Captured JSON and stored user 465 instead contain department starting with a literal quote ("Medical) and unintended network_user_id ending with a quote (Information"). The admin did not supply an SSO identifier.

Cause: BulkUserImport.parseCsv splits each line on every comma, ignoring CSV quoting. Preview omits the optional department/network columns, so this corruption is not visible before creation. Suggestion: parse CSV with quoted-field/escaped-quote support, reject malformed records, and preview all identity/access-related fields. Changes if: quoted comma, escaped quote and representative line-ending fixtures preserve exact intended values through screen, request and stored user; blank SSO identity remains blank. No real identity provider was contacted and no SSO account takeover is claimed.

Evidence: frontend/modules/mimsadmin/components/tabs/BulkUserImport.jsx:25-39,130-141; synthetic uploaded /private/tmp/pharaxis-audit-bulk-quoted.csv; normal request and users row 465; .playwright-mcp/audit-bulk-users-template.csv.

### A33 — P2 — User export does not match the filtered user list

Client admin Users: search audit.agent@example.test and select Reviewer. Receiving list/API show zero users. Click ordinary Export CSV; downloaded file contains synthetic Audit agent / role agent, one row. Captured export request sends only search, without the selected role. Export backend also only reads search; status/group filters are likewise absent in source, though only the role mismatch was executed. Tenant scope is retained; this is not evidence of a cross-organisation export leak.

Suggestion: share the same validated filter contract between list and export, including role, status and group, and state the export scope. Changes if: zero-match and representative combined filters produce exactly the intended rows, while a deliberate all-user export is explicitly labelled. Pagination/full export and CSV interpretation remain pending.

Evidence: frontend/modules/mimsadmin/components/tabs/Users.jsx:214-232; backend/routes/admin/users.js:76-113; .playwright-mcp/audit-users-role-filter.csv.

### A32 — P2 — Sign-in declares no system access despite remaining permitted screens

Client admin assigns synthetic agent 457 an agent-role group and unticks only Cases in Screens in Calder Therapeutics. All three normal save calls succeed. Stored override is only mims_core=false/org 1; role remains Agent. Fresh normal password/TOTP sign-in goes to /no-access with “No System Access / Please contact admin regarding system access” and only Back to Login. Auth/me confirms remaining modules browse_content, inbox and transmissions. Inbox API returns 200, and direct /mims/inbox opens its actual screen with those three menu links. Cases GET correctly returns 403, so removing Cases itself is enforced.

Suggestion: choose the first permitted destination across the full screen catalogue, honoring the saved preference only when allowed. Show no-access only when no usable destination exists. Changes if: Inbox-only, Browse-only, Transmissions-only and mixed module users enter an allowed screen normally and forbidden routes remain blocked. Only the described three-module profile was executed so far.

Evidence: frontend/modules/max/pages/LoginPage.jsx:108-130,171-186; user 457/org 1 module override; normal sign-in and direct receiving Inbox screen/API.

### A31 — P2 — Platform-admin idle timeout accepts more than the screen's maximum

Synthetic platform administrator 463 opens Sign-in & Security normally. Platform admin idle timeout input has maximum 480. Enter 481 and Save sign-in rules returns 200; reload still shows 481. Restored earlier 35 minutes through the same screen. User timeout 481 and platform timeout 29 both reject, as do tested lower-bound violations for remember days and lockout settings.

Cause: platform_admin_session_timeout_minutes only checks the minimum 30; the separate general-user range checks enforce both ends. Suggestion: make the intended platform maximum explicit in the requirement and use the same validated bounds at both UI and API. Changes if: the agreed boundary is consistently enforced and saved values match the runtime session policy. This proves configuration acceptance; an actual 481-minute idle session was not run.

Evidence: frontend/modules/mimsadmin/components/TwoFactorConfigView.jsx RULE_FIELDS; backend/routes/admin/twoFactor.js:172-176; normal UI save, reload and restoration in audit DB.

### A30 — P2 — Security-group history labels human privilege changes as System

Admin 456 grants and revokes Create Case on synthetic group 70 through the real screen. History displays both UPDATE_PRIVILEGES entries as System, while Create/Add User/Remove User correctly show the audit administrator. Database reconciliation proves both privilege rows retain user_id=456 but user_name is null. The history endpoint selects user_name without user_id or an actor lookup, so the receiving screen cannot identify the actual actor. Actor ID is retained in storage; this is not a claim that the underlying identity was lost.

Suggestion: store a consistent actor snapshot and return its ID/name in the history, with a lookup fallback for older rows. Reserve System for actual service actors. Changes if: human grants and removals show the correct actor, timestamp and before/after rights in the reviewer-facing history.

Evidence: backend/services/accessConfigurationService.js:97-98,225-235; routes/admin/securityGroups.js:313-335; audit_logs entity security_group/id 70 and real group History.

### A29 — P2 — Effective-access preview excludes rights the server actually grants

Created synthetic AUDIT Restricted Readers 20261113 from Read-only Auditor, role auditor, zero extra grants; added audit user 460 through the group screen. Grid accurately says View cases is a locked role right. Preview effective access instead says “0 granted” / “No effective capabilities found”. User 460 signs in normally with password/TOTP, searches for CP-000188, opens case 483113 and reads it. Adding explicit Create Case shows only Create Case in the preview, though View cases still works. The user successfully creates synthetic MI case 483114 while that grant exists.

Cause: the preview endpoint returns resolveEffectivePrivileges, which returns explicit group privilege keys. Actual enforcement also falls back to catalog default_allowed_roles. Suggestion: use one effective-access resolver for both preview and enforcement; identify role, group and scope sources in the preview. Changes if: preview includes all enforced rights and their own/all scope for representative roles, grants and multiple memberships. This is an access-review accuracy defect, not a demonstrated auditor write bypass.

Positive limits: auditor could not create before the grant; normal reporter-question submission and direct comment POST returned 403 and no comment was stored. Revoking Create Case immediately made the intake API return 403 in the same session. The old browser button stayed enabled until reload, then became disabled; backend revocation held. Broader capabilities, site restrictions and stale role claims remain separate pending checks/A07.

Evidence: backend/services/accessConfigurationService.js:680-750; routes/admin/accessConfigurations.js:202-210; normal isolated auditor session; group history; synthetic case 483114 created_by=460.

### A28 — P1 — Handoff goes to unselected targets and reports success for a rejecting destination

Configured two explicit local transport fixtures for the same synthetic AE event: safety_system accepts, audit_rejecting_target returns 503. On the real case Transmission screen chose audit_rejecting_target. Captured POST body confirms target_system=audit_rejecting_target. Local receiver records three rejecting requests at /reject and one accepted request at the unselected /intake. API returns 200/SENT; toast says “Case handed off to audit_rejecting_target”; history attributes SENT/200 to that rejecting destination.

Cause: targetSystem is used as an audit label only. transmit calls fireIntegrationEvent(orgId,eventType,payload), which broadcasts to every enabled subscriber without selecting the destination. It declares success if any subscriber succeeds. Consequently a selected receiver can reject every attempt while the app claims that receiver accepted; the payload also goes to unselected subscribed receivers.

Suggestion: resolve and authorize an immutable target ID, send only to that target for this action, and persist its actual response/receipt. If broadcast is intended, present it explicitly and record a separate result for each receiver. Changes if: selected-fail/unselected-pass and selected-pass/unselected-fail tests both show accurate per-destination results and only the intended delivery occurs. Fixtures contain synthetic information only; no actual external receiver was contacted.

Evidence: services/caseHandoffService.js:326-344; services/integrationEngine.js:117-144; case 483113 UI and captured request; /private/tmp/pharaxis-audit-mail/pv-receipts.jsonl.

### A27 — P2 — Expanded handoff list makes transmission rows unreachable

On the real agent Transmissions screen at 1440×812, the default expanded “Not yet handed off” list contains 28 cases. The lower transmission table exists in the DOM but its wrapper has height 2px and overflow hidden. Normal Playwright clicks on CP-000188 repeatedly fail because the page body intercepts the pointer; the screenshot confirms the table is clipped below the filters/stat strip. Collapsing the overdue list immediately permits the same ordinary case-link click and opens case 483113. No forced click or DOM mutation was used to declare the receiving link working.

Suggestion: give the screen one deliberate scroll layout or constrain the overdue list, and prevent the log from shrinking below a usable height. Changes if: the list and log remain reachable with representative overdue counts at supported viewport sizes. Other viewport and keyboard variants remain pending.

Evidence: frontend/src/modules/transmissions/transmissions.css (.tx-page, .tx-table-wrap); TransmissionsPage.jsx overdue details and table; .playwright-mcp/audit-20261113-transmission-table-clipped.png.

### A26 — P1 — File labelled E2B(R3) Ready is not conformant to the official R3 schema

Downloaded the synthetic AE XML through the real E2B screen, which reports Ready. Its root is ichicsr in namespace urn:ich:e2b:r3. Downloaded the public official ICH implementation package linked from its specification page (IG_Complete_Package_v1_11_1.zip). Offline xmllint against its MCCI_IN200100UV01.xsd fails at the root: “No matching global declaration available for the validation root.” The package's own ICSR reference instance validates with the same command/schema, confirming a working validation setup. Repeated after correcting synthetic patient age to 40: app validation returns valid, export still fails official schema. No regulator or external validation portal received application data.

The [ICH specification page](https://admin.ich.org/node/348) identifies its schema set as the technical rules for R3 message construction/validation. The [FDA regional implementation guide](https://www.fda.gov/media/98536/download), section 4.1.1, specifies the HL7 batch wrapper MCCI_IN200100UV01 and urn:hl7-org:v3 namespace. This finding is an observed schema-conformance failure, not a complete regulatory certification assessment.

Suggestion: build the actual R3 structure from a versioned mapping and validate against the selected official schema and applicable business rules. If the intended output is a proprietary intake XML, label and contract it accordingly instead of E2B(R3) Ready. Changes if: official positive/negative fixtures and representative exports pass the correct schema/business rules, and the screen distinguishes draft intake from validated exchange files.

Evidence: apps/mims/backend/services/pv/e2bGenerator.js:128-160; services/pv/e2bValidator.js:45-62; synthetic downloads /private/tmp/pharaxis-audit-mail/ae-negative-age.xml and ae-corrected-patient.xml; official package/reference/schema retained under /private/tmp/pharaxis-audit-ich-schema.

### A24 — P2 — AE patient form stores a negative age without a validation error

Synthetic AE case 483113 / version 86. On AE Patient Info entered initials AT, age −5, age unit Years and sex Unknown. Save patient info succeeded; database stores age −5 and validity card becomes 4/4. Rechecking E2B also reports Ready. This separates identity completeness from clinical-data validity: an identifiable patient does not make an impossible age acceptable. The XML generator omits age entirely, so no claim is made that it transmitted −5. Restored synthetic age to 40 after collecting evidence.

Suggestion: validate numeric and date semantics at both screen and API boundaries; report completeness separately from data quality. Changes if: negative age is rejected without losing the rest of an incomplete safety intake. Other numeric/date boundaries remain pending.

Evidence: apps/mims/backend/routes/caseAE.js:495-527; frontend/src/modules/cases/components/CaseAETab.jsx; audit-only version 86; real saved form and E2B Ready result.

### A25 — P1 — E2B export replaces a captured suspect product with a placeholder

Safety reviewer confirmed synthetic event as CP-000188, MIMS AE case 483113, linked to MI 483112. Canonical handoff payload correctly names Rosucal 10. AE product version 86 stores Rosucal 10 / is_suspect=1 in case_ae_product_info. Check E2B says Ready; downloaded CP-000188-e2b-r3.xml contains medicinalproduct=Suspect Product instead.

Cause: E2B adapter queries case_ae_products, which does not exist in this schema (the actual table is case_ae_product_info). It catches the query failure as an empty list. With no case_drugs rows, fallback reads c.product_name, also absent; captured case_ae_intake.suspect_drug_name is not read. Suggestion: map from the real current/versioned records, fail explicitly on data-read errors, and reconcile every exported field to its saved source. Changes if: the exported suspect product matches intake/version data and missing-read scenarios cannot silently produce a Ready placeholder.

Evidence: apps/mims/backend/routes/caseHandoff.js:114-146; routes/caseAE.js:228,671-732; downloaded synthetic XML /private/tmp/pharaxis-audit-mail/ae-negative-age.xml and audit-only version 86 product row.

### A23 — P2 — Portal says an email was sent while the delivery jobs are pending

After A21's concurrent Send check, response 289411 is SENT but email jobs 4/5 remain pending, attempts zero; worker is intentionally stopped. Ran the normal local close-sync tick while testing a reporter question. The portal replaced its latest answer with response 289411 and says “A copy was emailed to you.” Source delivery_metadata is null and no worker attempt has occurred. Normal successful delivery of response 289412 was separately proven; this finding concerns queued/failed states, not that all email delivery fails.

Cause: the MIMS bridge selects a SENT response without delivery state; portal answer storage carries no delivery receipt, and the UI always prints the emailed-copy sentence. Suggestion: expose actual channel/delivery state and use accurate queued, delivered or failed wording. Changes if: pending and failed delivery scenarios display truthful status while the portal can still show the signed answer.

Evidence: apps/mims/backend/routes/apiPlatform.js:249-251; apps/cp-portal/backend/services/mimsCloseSync.js:51-92; frontend/src/portal/pages/MySubmissionsPage.jsx:174-184; synthetic response 289411 and email jobs 4/5.

### A22 — P2 — Content review screens offer author actions the user cannot perform

Normal reviewer 458 sign-in, Content Management, synthetic published document 464. Clone is visible but returns “You do not have permission to change content.” View opens the edit/create screen with an editable document-name field and Save Draft / Save & Check-In. Save Draft again returns the same 403. No unauthorized change was demonstrated; server permissions correctly refuse it. The workflow wastes reviewer effort and labels an editing surface as View, including for a published record.

Suggestion: use capability- and state-aware actions consistently, with an actual read-only document detail screen for View. Changes if: reviewer sees permitted review/read actions, immutable records remain read-only, and author editing remains available on permitted drafts.

Evidence: apps/mims/frontend/src/modules/content/components/DocumentsSection.jsx:318-366; DocumentCreationScreen.jsx:874-875; middleware/cmAccess.js. Real reviewer UI negative checks on synthetic document 464.

### A21 — P1 — Concurrent signing of Send queues the same response twice

First completed a normal end-to-end synthetic response 289412 (author, independent approval, Send, controlled local TLS delivery, CP return and PDF download). Sequential attempt to move this SENT response back to READY correctly returned 400. Then used the separately approved synthetic response 289411: two concurrent authenticated PATCH status requests to SENT, each with valid audit password and different audit reason, both returned 200/SENT. Audit database contains two pending email jobs (4,5) for response 289411, attempts zero. The worker remains stopped; those duplicate jobs were not sent.

Cause: existing state is read before signing and transaction, while the UPDATE inside the transaction does not require the expected previous state. Enqueue happens independently after each successful request. Suggestion: atomically claim one expected-state transition and write a uniquely keyed delivery command with the signature in that transaction; replay must return the same receipt or a conflict. Changes if: concurrent Send requests produce one state transition, one signature outcome and one delivery command.

Evidence: apps/mims/backend/routes/cases.js:2622-2880; synthetic audit-only response 289411 and email_job_queue 4/5; real Response History receiving screen after refresh.

### A20 — P1 — Concurrent publication signs and advances the same revision twice

Synthetic document 463 published normally as 2.0. Author created revision 464, updated body, checked in, and a different administrator approved it at 2.1. Sent two concurrent POST /api/cm/documents/464/publish requests with the valid audit password and distinct audit reasons. Both returned 200 (sanitized response-status logs confirmed at 17:54:16.645Z and .647Z). Database and version history show publication at 3.0 and 4.0. Predecessor 463 is Archived with “Superseded by version 3.0.”

Cause: both requests check Approved before the signing/password work and transaction. The later UPDATE increments atomically but does not require the row still be Approved; the second request also publishes. Suggestion: lock and revalidate the state inside one transaction or use an expected-state/version conditional update; allow one publication transition, and tie signatures/history to that transition. Changes if: concurrent valid requests yield one publication and one explicit conflict, with one authoritative version and consistent supersession history.

Evidence: apps/mims/backend/routes/cm/documents.js:1144-1217; synthetic audit-only documents 463/464, version-history rows and sanitized HTTP completion metadata. UI receiving-state verification is recorded in the execution ledger.

### A17 — P3 — Password screens advertise a weaker minimum than the server accepts

Profile tells the user “At least 8 characters.” Entered correct synthetic current password and matching Audit!12 (8 characters): screen displays the server error “Password must be at least 12 characters.” Invitation reset also labels its minimum as 8 and validates only that client-side. The server correctly enforces the stronger minimum; this is misleading guidance, not a demonstrated bypass. No password changed during the failing profile test.

Suggestion: use the same published policy for screen guidance, client validation and all server paths. Changes if: the screens consistently describe the effective policy.

Evidence: apps/cp-portal/frontend/src/portal/pages/ProfilePage.jsx:87,239; ResetPasswordPage.jsx:30,72; backend/utils/passwordRules.js.

### A18 — P2 — Personal data download omits field insights and registration data

Created synthetic physician user 107 via request/approval/invitation. Submitted field insight 3 through the screen, with own synthetic reporter email and marker AUDIT-DSAR-FIELD-107. Download my data successfully downloaded JSON for user 107; the file contains neither the insight nor medical registration fields, although both are stored and linked to this user. The export explicitly excludes MIMS case data, but these omitted records are held in CP itself.

Suggestion: inventory every user-linked dataset when a feature is added, include the appropriate own records in export, and state any deliberate exclusions and reasons. Changes if: the downloaded artifact includes these records or an approved, explicit exclusion is defined. This is a product-control finding, not a legal compliance determination.

Evidence: apps/cp-portal/backend/services/dataSubject.js:125-215; routes/portal/fieldInsights.js. Download artifacts .playwright-mcp/audit-synthetic-user-export-after-insight.json and audit-only DB row 3.

### A19 — P1 — Fulfilled erasure leaves identity in field insights and registration fields

User 107 requested deletion on Profile. CP admin Data Requests showed pending erasure request 18. Backed up the synthetic user and linked audit records privately, then clicked Fulfil and accepted the confirmation. Receiving admin screen shows fulfilled and an anonymization summary. Database confirms account inactive and name/email replaced, but field insight 3 still stores AuditUpdated Credential, audit.credential.20261113@example.test and its narrative; account license_number remains 1111111 with registry GMC. No MIMS case was sent for this insight. The summary does not disclose these retained identifiers.

Suggestion: include field insights and registration identifiers in the erasure/retention map. Define any justified retained fields explicitly, remove unnecessary identity, and report residual work before claiming fulfillment. Changes if: the post-erasure scan finds no identity outside an explicitly approved, disclosed retention rule. Broader retention and legal-hold behaviour remains under review; this finding does not claim all erasure paths fail.

Evidence: apps/cp-portal/backend/services/dataSubject.js:273-477; routes/admin/dataRequests.js; real Data Requests fulfilled screen; audit-only user 107, insight 3 and request 18.

### A14 — P2 — Pinned report opens the wrong report

Overview → Personalise → pin report ID 3 → close → click Report 3. The receiving URL is /mims/reports?preset=3, but the selected report is Operations Summary (ID 1), not Cases Received (ID 3). Pin persistence across reload works. Reports consumes reportKey, not preset; it falls back to the first definition. Retested against frozen 9c940bf9 with the actual receiving screen loaded.

Suggestion: choose from the permitted report catalogue and navigate using the key Reports consumes. Validate absent/deleted/inaccessible pins with an explicit message. Changes if: a supported preset-ID handler is added and the selected definition is proven on screen.

Evidence: apps/mims/frontend/src/modules/max/pages/DashboardPage.jsx:499; modules/reports/pages/ReportsPage.jsx:328. Execution ledger in audit-20261113.

### A15 — P2 — Default Landing View is saved but ignored

Set Default Landing View to Cases. Log out with the current-session Log Out button. Sign in again using the synthetic administrator's email, password and TOTP. The destination is /mims/dashboard, and reopening Personalise still shows Cases. Repository-wide search finds no reader of defaultLandingView outside DashboardPage. Restored the audit preference to Dashboard after the check.

Suggestion: apply a validated, permitted landing destination on sign-in, with a safe fallback when access changes. Changes if: the control is intentionally removed or its destination is implemented and verified for each role.

Evidence: apps/mims/frontend/src/modules/max/pages/DashboardPage.jsx:379; modules/max/pages/LoginPage.jsx:180-186.

### A16 — P2 — Older Response Log requests can overwrite current filter results

Observed a stale row during rapid search/date changes, then reproduced deterministically with real server replies. Held the earlier search-only response for CP-000187 in the browser. Applied To 2026-11-12; the newer API response correctly displayed no rows. Released the earlier response: the screen now shows CP-000187 dated 13 Nov despite To remaining 12 Nov. No response payload was fabricated. This is a controlled network-order test, not evidence of a particular production latency.

Cause: every completed fetch writes responses and total, without cancellation or a request-generation check. Suggestion: discard superseded replies and preserve loading/error state for the current query. Changes if: the latest query alone can update the screen under reordered success/error replies.

Evidence: apps/mims/frontend/src/modules/responselog/pages/ResponseLogPage.jsx:93-115. Supporting execution ledger records the ordinary boundary checks.

### A01 — P1 — Reconciliation reports zero loss after its data queries fail

Confirmed on the MIMS Transmissions screen and API. The audit database has 20,421 undeleted AE cases. GET /api/pv/reconciliation returns 200, balanced=true, reconciliation_rate=100, total_safety_intakes=0, matched_ae_cases=0. The screen displays “100% Balanced (Zero Lost Events)”.

Cause: safetyReconciliationService selects cases.product_name and cases.received_date, neither present in the copied current schema. It also queries inbox_messages, a nonexistent table; actual intake is inquiries. Each read catches its error and substitutes an empty array. The code has no portal-receipt comparison, despite the screen claiming cross-system coverage, and caps cases at 500 and messages at 200 without a coverage warning. Loading the GET also writes a new reconciliation record; React StrictMode caused multiple entries merely from opening it.

Suggestion: reconcile actual intake sources to stable case references, make failures and partial coverage explicit, page the full population, and record runs only through an explicit command/job. Never infer balanced from failed reads.

Evidence: apps/mims/backend/services/safetyReconciliationService.js; routes/pvReconciliation.js; frontend/src/modules/transmissions/components/SafetyReconciliationPanel.jsx. Screenshot: .playwright-mcp/audit-20261113-reconciliation.png. DB counts and HTTP response recorded in chat tools.

### A02 — P1 — Field-insight follow-up reports delivery without reaching MIMS

Confirmed on CP Portal /portal/calder/field-insights. Signed in as new audit doctor. Entered synthetic narrative AUDIT-20261113-FI, selected “Route to Medical Information for formal response”, submitted. Screen: “Field medical insight captured and queued for central Medical Affairs.” Draft was removed. Saved cp_field_insights row id=1, client_id=4, follow_up_requested=1, sync_status=synced. Matching MIMS cases: 0.

Cause: insert labels the record synced before delivery. Follow-up uses an unauthenticated request to /api/v1/cases; failure is swallowed. No persistent retry is created in this route. Repository-wide retry/read-path check remains pending before claiming there is no recovery anywhere.

Suggestion: use the existing authenticated client-scoped bridge and durable outbox/retry mechanism. Persist pending/failed/delivered separately, save the case receipt, expose failed follow-up to staff.

Evidence: apps/cp-portal/backend/routes/portal/fieldInsights.js; frontend/src/portal/pages/FieldInsightPage.jsx. Browser snapshot page-2026-11-13T13-25-22-461Z.yml; audit-copy row and case count checked.

### A03 — P1 — Inspector export bypasses organisation isolation

Confirmed API authorization defect. Created synthetic case 483109 in organisation 26 with one synthetic field-audit marker. Signed in through the real MIMS screen as audit.admin in organisation 1, including successful TOTP enrolment. GET /api/cases/483109 returns 404. POST /api/admin/audit/inspector-export with {case_id:483109,format:json} returns 200 with the foreign audit row and synthetic marker. No password was required for JSON.

Cause: route checks admin role but reads case_audit_trail by case_id without verifying the case belongs to the active organisation or applying case-access rules. Its /admin/audit path does not match the global case middleware.

Suggestion: verify record scope before any audit read, apply the same case access policy to JSON and PDF, and review all alternate exports and related record endpoints for the same pattern.

Evidence: apps/mims/backend/routes/admin/auditInspectorExport.js, middleware/caseAccess.js. Browser API reproduction recorded in chat. Existing real records were not used as the exposure marker. Screen export interaction is pending; the direct case screen/API guard and export API disagree.

### A04 — P1 — Doctor credential service claims registry verification after format checks

Confirmed service and HTTP behavior. POST /api/portal/auth/verify-license with GMC 1111111 returns valid=true, status=active, message “Verified active medical practitioner on UK GMC Medical Register.” The service contains no registry lookup. An arbitrary generic identifier ABCDE also returns active. Four hardcoded test numbers return a claimed revoked/suspended status with no lookup. These results do not establish the true registry status of any number tested.

Request-access writes license_verified=1 based on this result. The screen says verified medical registration is required for CME and clinical material. Actual admin approval still exists; this finding does not claim the identifier alone signs a person in.

Suggestion: distinguish syntax/checksum validation from identity, current registration and professional entitlement. Use a real verified source or documented manual approval evidence; remove fabricated revocation claims and test fixtures from operational decisions.

Evidence: apps/cp-portal/backend/services/credentialVerificationService.js; routes/portal/auth.js; frontend/src/portal/pages/LoginPage.jsx. Complete registration and admin approval journey pending.

### A05 — P1 — E2B fallback validator accepts malformed XML

Confirmed direct service execution: validateE2BXml with a nonexistent XSD path accepts the unclosed payload `<?xml version="1.0"?><ichicsrmessageheader><safetyreport><safetyreportid>1<patient>unclosed` and returns []. Fallback checks string markers, declaration and empty-tag regex; it does not parse XML or enforce the exchange schema. Supplying an unavailable schema silently falls back.

Suggestion: distinguish structural/schema/business-rule checks; require the applicable validated schema for any “validated for transmission” result, and refuse transmission when validation cannot run. Actual external gateway acceptance and authoritative schema conformity have not been checked.

Evidence: apps/mims/backend/services/pv/e2bValidator.js. XML generator and ICSR routes inspected; browser ICSR validation workflow pending.

### A06 — P1 — Cross-case inspector export fails when records match

Confirmed HTTP with the audit admin's password and a stated reason. Date range 2026-09-01 to 2026-10-01 returns 500; an empty November range returns 200 with zero cases. Query selects a.changed_by and a.reason, but current case_audit_trail columns are id, case_id, user_id, user_name, action_type, field_name, old_value, new_value, timestamp.

Additional code concerns to reproduce: PDF includes only first 500 audit rows while reporting total rows; date filters act on case creation dates rather than audit dates; export log failures are ignored; checksum is over JSON rows rather than the delivered CSV/PDF bytes. User/date filter semantics need product review.

Suggestion: align query to the schema, test nonempty exports, state date semantics explicitly, supply a complete artifact and a reproducible integrity check, and make failed audit recording visible.

Evidence: apps/mims/backend/routes/admin/auditInspectorExport.js. Full screen export not yet verified.

### A07 — P1 — Demoted administrator retains admin authorization

Confirmed through the real user-update API with a dedicated synthetic admin and a temporary session fixture. First, direct role=auditor saved the person role but left the organisation role admin. Reproduced more strongly on the latest unmerged wt-fin: created an Auditor security group through the real group API, then assigned the audit admin to it through PUT /api/admin/users/:id. Both users.role and user_org_access.role_at_org became auditor. The same pre-existing JWT session still returned 200 on admin-only /api/admin/security-groups, both before and after the change. Only disabling an account ends its sessions in this user-update path; group/role changes do not. Authentication takes the role from the JWT rather than current role data.

Suggestion: define organisation-specific role as the authority, update all required representations consistently, and revoke/re-evaluate existing sessions when role, group, organisation or module access changes. Test real group changes and role changes across two organisations before sign-off. This reproduction used session fixtures for API authorization, not a second UI sign-in.

Evidence: latest wt-a2 routes/admin/users.js; middleware/auth.js; session fixture and HTTP output in chat.

### A08 — P1 — Unsent field insight leaks between accounts on a shared browser

Confirmed on real screens. Audit doctor typed synthetic name and narrative into Field Insights. Logout API returned 200. Signed in as the dedicated audit patient through the normal login API; opening Field Insights showed the doctor's prior name and narrative, with the patient's account label. Both use localStorage.cp_field_insight_draft. The draft is not keyed to client/user and is not cleared on logout.

Suggestion: scope draft ownership to client and user, prevent restoration under another identity, clear or lock sensitive drafts when access ends, and define explicit offline-storage retention. Test standard menu sign-out, idle expiry and client changes as well; only logout API plus next account was exercised here.

Evidence: frontend/src/portal/pages/FieldInsightPage.jsx and context/PortalContext.jsx. Browser reproduction recorded in chat.

### A09 — P2 — Clarification link accepts concurrent duplicate replies

Confirmed on a synthetic question/case. Two simultaneous POSTs to /api/bridge/clarifications/:token/reply returned 200 success. Two comments were saved. The question references only the last answer_comment_id. The route checks answered_at before opening its transaction, then updates without a conditional unused-token check or a locked re-read.

Suggestion: lock and verify the token inside the transaction or atomically claim an unused token; roll back the losing reply and return a clear already-answered response. Preserve a correction workflow rather than overwriting the answer reference. CP screen rendering of the duplicate result is pending.

Evidence: backend/routes/caseBridge.js; synthetic case 483110, question 1, comment IDs 482428 and 482429.

### A10 — Product decision / P2 — Field Insights accepts patients and has no operational inbox

Confirmed: dedicated patient can open Field Insights and POST an expedited safety_perception insight; API returns 201 with linked_case_id=null and the “queued” message. The route checks sign-in but not a field-medical role, user type or feature entitlement. Repository-wide search finds no staff read/list/queue route for cp_field_insights; the only app references are the insert route, mount and schema. High/expedited urgency alone does not trigger routing, because the code only routes when follow_up_requested is true.

Suggestion: decide who owns and uses this feature. If intended for field-medical staff, provision that entitlement explicitly. If patients/HCPs can submit, give them the appropriate intake workflow and safety triage. Add an accountable staff queue and clear follow-up ownership. Do not call the presence of a patient alone a defect until the audience decision is agreed; the unsupported queue claim and missing urgency routing are separately evidenced.

### A11 — P1 — Portal role changes do not revoke the old role in an open session

Confirmed with the dedicated audit doctor. Logged in as Doctor, then the signed-in CP admin changed that account to Patient using PATCH /api/admin/users/4/105. /auth/me reflected Patient, but the existing session still obtained the HCP training-list result and reached the training module's “not open yet” gate (409) rather than the patient prohibition. After logout and fresh login, the same account received an empty training list and 403 “CME training is restricted to healthcare professionals” for that same module. The live account read validates active/token_version but not the token's user_type; role editing does not increment token_version.

Suggestion: resolve current audience entitlement on each authenticated request or revoke sessions whenever the audience/verification entitlement changes. Check content/download/assistant routes as well as training. An active course was unavailable in the copy; completion or HCP document download under the stale token was not tested.

Evidence: middleware/auth.js; routes/admin/portalUsers.js; routes/portal/training.js; browser HTTP results before and after new sign-in.

### A12 — P2 — MI revision comparison uses a placeholder baseline and omits custom text

Confirmed in the real MI Response Builder on synthetic case CP-000187 (483112). Selected Standard Response Letter Shell (template ID 188), made no changes to the loaded letter, clicked Compare vs Template. Screen showed +18 added / -3 removed against “Standard response template placeholder”, rather than the selected template. The caller compares numeric template IDs to a string select value with strict equality. Added synthetic Additional Custom Text; it was not included in the diff, but was present in the saved DRAFT response (289411).

Suggestion: compare against the exact selected template/version, normalize identifier types, and include the complete response-specific additions. State which content is compared. Keep full response rendering available to the approver; the current diff cannot be relied on for completeness.

Evidence: frontend/src/modules/cases/components/CaseMITab.jsx around comparison input; shared/components/DocumentDiffViewer.jsx. UI shows incorrect baseline and saved response shows omitted custom text.

### A13 — P1 — HTTP logs contain the session cookie in response headers

Confirmed in this audit's MIMS runtime logs. The request Cookie header is redacted, but res.headers.set-cookie contains the full mims_token JWT whenever the session cookie is renewed. No real user's token was used for the check. Logger redaction covers req.headers.cookie and authorization, but not the response Set-Cookie header. Ordinary successful authenticated responses are logged at info level.

Suggestion: redact response cookie headers and any token-bearing response fields, retain safe request context, and verify sign-in, renewal, logout and error logs. Assess access/retention for existing logs as a separate follow-up; this audit has not searched historical logs or established actual misuse.

Evidence: apps/mims/backend/services/logger.js; middleware/requestContext.js; audit-only runtime log checked programmatically without including token values in this report.

## Positive workflow evidence

- MIMS test administrator completed password + authenticator setup + backup-code acknowledgement on screen.
- CP test administrator: incorrect password rejected; correct password led to authenticator enrolment and backup-code acknowledgement.
- New MIMS document AUDIT-20261113-Controlled-Response (462) was created/check-in through the screen and reached Pending. Author's approval returned 403. Publishing Pending returned 400.
- Synthetic high-severity CP alert AUDIT-20261113-SAFETY (25) became visible on the patient's Safety screen immediately. Its writer's second-check attempt returned 403. Independent second checker and notification delivery not yet exercised.
- Latest incomplete AE workflow: CP form submitted without initials, age or sex; reference CP-000186 (submission 186) saved and synced to MIMS case 483111. CP named missing patient information in its receipt. Receiving MIMS case screen showed the report, original seriousness statement and warning to follow up for patient information. Transmission refusal was not exercised yet.
- CP MI submission CP-000187 (187) reached MIMS case 483112. Missing screening and category blocked response progression. Later independent author/reviewer workflow, one controlled email delivery with rendered PDF enclosure, returned portal answer/PDF, follow-up and reporter question/answer were completed. Concurrency and truthful delivery-state failures remain A21/A23; other MI variants remain pending.
- Extended MI check: independent review rejected a wrong signature password, then accepted the correct audit password. Send refused missing screening and no outbound mailbox. After configuring an audit-only TLS mailbox, response 289412 was delivered to the local receiver and its returned CP answer inspected. External mail-provider behaviour is unverified.
- Five-role API probes covered nine endpoints each. Agents could read published content but were denied templates/reviews/user administration; content managers were denied Cases. Reconciliation accepted every role, including content manager. One probe path /admin/platform/organisations returned 404 because it was not a real route; that is not evidence of access protection.
- All 20 report definitions executed through the real run API for 2026-09-01 to 2026-10-01; all returned 200. Open Cases by Age returned 10,000 rows; Open Transmissions returned 35,906; User Access Review returned 15. Counts/formulas, report exports, schedules and audience variation have not been fully reconciled. The report module carries a truncation flag; reaching a row cap alone is not yet a defect.
- CP client admin screen-load sweep covered 31 client routes plus overview. Most loaded; an initial Analytics hook error disappeared after restarting with the latest worktree/dependency optimization. Do not treat that transient setup failure as a confirmed application defect. The guessed /email URL redirected; the actual email-settings route must be checked.
- CP patient screen-load sweep covered 17 reader routes. This does not prove all actions or all audiences. An unavailable ClamAV warning and missing copied logo were expected environment limitations, not attributed to application logic.

## Coverage register

Opened means screen-load evidence only, not workflow approval. Pending rows remain in scope.

| Area | Current evidence | Remaining depth |
|---|---|---|
| Version inventory and unmerged work | Local/remote history and feat/* branch-status | Other branches, dirty worktrees and outstanding PR reconciliation |
| CP portal sign-in | Doctor/patient sign-ins and consent; admin wrong password and authenticator enrolment | Deactivation, reset, SSO, idle and cross-client sessions |
| CP reader home/navigation | Doctor home seen | Patients, visitors, every gate and language |
| CP doctor credentials | Corrected latest request-access/approval/invitation workflow tested with new physician 107, including invalid format and replay | Other registries/countries, registry integration and stronger identity binding |
| CP field insights | Doctor screen submit, patient submit, false follow-up success, cross-account draft leak, persistence and repository recovery-path search | Other countries, standard menu logout/idle, safety escalation and workflow redesign decisions |
| CP content/news/documents/FAQ | Inventory only | Publish/revise/expiry, permissions, files, search and translation |
| CP safety alerts | Synthetic alert published by API and seen on patient screen; writer second check refused | Independent second check, overdue, acknowledgment persistence and notifications |
| CP trials/training/events/MSL | Inventory only | Lifecycle, audiences, completion, appointments and notifications |
| CP MI/AE/PC/Other intake | Incomplete AE and MI submitted through UI, OAuth sync and receiving MIMS cases seen | PC/Other, dynamic required fields, attachments, idempotency and retry recovery |
| CP own submissions/visitor links | Signed-in MI answer/PDF, added information, reporter question/answer and positive safety follow-up traced | Visitor-link states, attachments, cross-user isolation variants, reopening/history |
| CP admin roles/settings/audit/reports | Client admin screen-load sweep; role-change stale audience reproduced | Other admin roles, change paths, confidentiality, exports and real email-settings URL |
| MIMS sign-in | Normal admin/reviewer/author/agent/auditor/platform password/TOTP; contractor email OTP wrong/resend/old-code/new-code, expiry sweep and session revocation | Recovery, full lockout/device/backup-code use, SSO/org switch and other leaver states |
| MIMS Overview/Inbox/Cases | Screens opened | Full triage, conversion, assignment, duplicates, save and failure paths |
| MIMS MI responses | Independent approved/send/delivery/portal return, document-version enclosure, refusal gates, duplicate-send failure | Void/amend, off-label two signers, all delivery failures and document/recipient variants |
| MIMS AE/PC/handoffs | AE from safety review, missing-patient block, patient save, canonical local accept/retry/fail and deadline; E2B mapping/schema failures | Remaining AE sections/versioning, all PC flows, multiple updates/receipts and deadline edge cases |
| MIMS Transmissions | Central synthetic rows/filter/receiving case, local accept/three retries/fail, selected-target failure and clipped-log defect | Pagination, remaining filters/roles, durable per-target receipts and full reconciliation |
| MIMS Content Management | Internal document author/reviewer/admin lifecycle, revision/archive, agent published use/enclosure and reader action negatives | Other content types, review modes, folder ACLs, expiry/withdrawal, checkout/attachments and related records |
| MIMS Reports | Library opened; all 20 definitions run via API | Reconcile numeric results, audience, screen results, export, schedule/timezone and recipients |
| MIMS organisation/admin/security groups | Group lifecycle/member/grant/revoke, same/cross-group SoD, effective-preview/actor defects, client/platform sign-in policy, contractor creation/end, password history | Site/multiple-org restrictions, remaining capabilities, all admin panels, full password/session policy enforcement |
| Inspector export | Cross-org leak and nonempty export failure reproduced | Screen path, full artifact, filters, signature/log and scale |
| Document diff enhancement | Wrong baseline and omitted custom text reproduced on screen | Formatting/table changes, version pinning, long-document performance |
| Reporter clarification enhancement | Concurrent public-link reply defect; normal signed-in CP↔MIMS question/answer and follow-up traced | Public-link screen, expiry/withdrawn/read confidentiality and all notification variants |
| Background jobs/mail/AI/external integrations | Disabled or redirected in audit environment | Explicit controlled runners/local stand-ins and real-provider limitations |
| Uploads, security/privacy, backup/restore | Source inventory only | Authorization, scan failures, retention/hold, erase, storage isolation and restore |

## Structure and business-flow recommendations

1. Preserve the CP outside/MIMS inside boundary while making every intake use the same delivery contract. The normal MI/AE OAuth bridge worked; Field Insights bypasses it and has false delivery state.
2. Use one effective-access policy for active organisation, person role, group, module, folder, record and action. Existing evidence shows a case read guard does not protect an alternate export, and identity/role changes leave stale session rights.
3. Treat “verified”, “validated”, “balanced”, “queued” and “compared” as evidence-backed states. The credential, XML, reconciliation, insight and diff findings each show a stronger claim than the underlying operation supports.
4. Give every new record an accountable receiving queue and recovery path. An insert alone does not complete a clinical follow-up workflow. Define whether Field Insights belongs to field-medical staff, HCPs or patients before extending it.
5. Retain positive controls found: independent approval, refusal before screening, refusal with no sending mailbox, the portal's incomplete-AE retention, and visible failure messages. The evidence does not justify a full product rewrite.
6. Define an approved renewal route for expired contractors. After the synthetic sweep, the client admin's All Statuses search no longer finds user 464; detail/tenant API reads return 404. Platform support can still administer the global person. This visibility boundary protects access, but a client-facing renewal/request workflow needs an explicit product decision. It is recorded as a workflow recommendation, not an authorization defect.

These are recommendations, not approved changes. Changes if: remaining workflow checks or confirmed product requirements show a different ownership or operating model.

## Additional current-baseline evidence

At the final runtime baseline wt-fin d8060a5f (includes #823 plus unmerged follow-ups), repeated A01 reconciliation false-success, A03 foreign-case JSON export and A06 matching cross-case export failure. Repeated A07 through a normal security-group change, with both person and organisation roles confirmed Auditor while the old session still read the admin-only API. Other finding source files have no differences between the original wt-a2 and wt-fin baselines; those paths were not all rewalked after restart.

Open PR inventory was read through GitHub: 17 open PRs, mostly dependency updates, plus #552 CP CI. No open product feature PR at the time of the query. This does not prove every local unpublished branch is redundant. The new wt-fin unmerged changes were explicitly included. Neither branch status nor documentation alone was used to mark a workflow as verified.

## Limits

No application fixes, pushes, merges or external tickets. Shared dev database content was read for copying and metadata only. All test data and accounts are in audit databases. The MIMS schema migration 193 ran automatically in its audit copy. No real external mail, registry, AI, SSO or safety gateway round-trip has been verified. There is no independent human clinical/compliance sign-off. No claim that the complete apps are verified is made.

The shared .claude/launch.json changed in another session during this audit; it was not edited or reverted here. The audit added only this report inside docs/tasks and temporary setup/evidence files. Source dependencies were linked in temporary audit directories; application code was not changed. Audit migrations 193 and 194 ran only against the audit copy. The full coverage register above remains outstanding; do not interpret this findings batch as exhaustive.
