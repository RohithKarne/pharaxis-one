# CP Portal to MIMS bridge — validation records

One record per bridge feature: what it must do, why it matters, what was tried, what happened, and what was **not** checked. Written 10 October 2026 for Saad (compliance, validation and GxP); Rohith signs.

**Where the testing happened.** A scratch copy of both apps on one machine, with real screens in a browser: MIMS and CP Portal on MariaDB 10.11, with a made-up client called "scratch" and made-up people. No real person's data and no real password were used. A MIMS staff login and a portal reporter login were created for the test copy only.

**How to read the result column.** *Pass* means every expected result was seen, including at least one path that should fail. *Pass, with gaps* means it passed but something important was not tested; the gap is named in the record. Nothing here is a failure: each defect found while testing was fixed before the record was written, and the fix is named.

**Risk.** *High* when a mistake could hide or delay a side-effect report, send someone's details where they should not go, or let a stranger read a report. *Medium* when a mistake would leave the two apps disagreeing, and a person would notice. *Low* for convenience.

**Not yet done for any record:** a second person repeating the steps, a run on MySQL 8 (which is what a real installation would use), and a run anywhere but one machine. Both apps are local only today.

## Summary

| # | Feature | Risk | Result | Evidence |
| --- | --- | --- | --- | --- |
| P1 | Side-effect outcome wording is understood | High | Pass | 2 screenshots |
| P2 | Seriousness, product and every form answer reach MIMS | High | Pass | 5 screenshots |
| P3 | Only the connection that sent a case can change it | High | Pass, with gaps | Results below (no screen exists) |
| P4 | A merged or deleted case does not strand the request | Medium | Pass, with gaps | 1 screenshot |
| P5 | The portal holds MIMS's receipt for each report | Medium | Pass | 1 screenshot |
| P6 | A report MIMS lost is found and sent again | High | Pass, with gaps | 1 screenshot |
| P7 | Sign-in secrets are protected and can be changed safely | High | Pass | 1 screenshot |
| F1 | The request's journey shows on both sides | Low | Pass | 1 screenshot |
| F2 | A serious side effect jumps the queue | High | Pass | 2 screenshots |
| F3 | MIMS can ask the reporter a question | Medium | Pass | 3 screenshots |
| F4 | Test Connection proves the whole route | Medium | Pass, with gaps | 1 screenshot |
| F5 | A likely duplicate report is flagged | Medium | Pass | 1 screenshot |
| V1 | A visitor can follow and answer their own report | High | Pass | 5 screenshots |

---

## P1 — Side-effect outcome wording is understood

- **Requirement.** Whatever outcome a reporter picks on the portal ("Not recovered", "Recovering", and so on) is accepted by MIMS and stored as the matching outcome. Wording MIMS does not know is stored as "unknown", and the words actually sent are kept in the case history.
- **Why it matters.** Before the fix, "Not recovered" made MIMS refuse the whole report. The portal retried six times, then gave up: a side-effect report never arrived.
- **What was done.** A side-effect report with outcome "Not recovered" was sent from the portal form. A second report carried outcome wording MIMS has no match for (the path that should fail safely).
- **Expected.** Both reports become cases. The first has the matching outcome. The second has outcome "unknown", and its history records the words that were sent.
- **Actual.** As expected.
- **Evidence.** `p1-case15-outcome-not-recovered.png`, `p1-case16-audit-not-matched.png`.
- **Not checked.** Clients with their own side-effect form and their own outcome list.

## P2 — Seriousness, product and every form answer reach MIMS

- **Requirement.** Seriousness ticked on the portal ticks the matching boxes in MIMS, marked "as reported, to be confirmed at triage", and raises the case's priority. The product named on an enquiry is matched to MIMS's product list. Anything MIMS has no field for, and any value that could not be matched, arrives as one case comment. The portal offers "None of these" for seriousness.
- **Why it matters.** Before the fix, a report of a death arrived as not serious, at normal priority, with "Death" nowhere in MIMS. The product named on an enquiry and the purchase date on a complaint were dropped.
- **What was done.** A side-effect report with seriousness "Death". An enquiry naming a product that is on the list, and one naming a product that is not (should not match). A complaint with a purchase date.
- **Expected.** "Death" ticked and priority High. The listed product matched. The unlisted product and the purchase date in the case comment.
- **Actual.** As expected.
- **Evidence.** `p2-death-ticked-on-events.png`, `p2-death-priority-high.png`, `p2-death-case-header.png`, `p2-unmatched-product-comment.png`, `p2-purchase-date-comment.png`. The before-fix state: `fatal-report-not-serious-in-mims.png`, `fatal-report-normal-priority.png`.
- **Not checked.** A seriousness field that allows several answers. Clients with their own side-effect form (they do not get "None of these").

## P3 — Only the connection that sent a case can change it

- **Requirement.** Adding information, adding a file, or erasing the reporter on a case is refused to any connection except the one that created it. The route that let a connection rewrite a case without leaving a line in its history is removed.
- **Why it matters.** Before the fix, a second connected system in the same organisation read a portal case, rewrote its description and erased its reporter. The rewrite left no trace in the case history.
- **What was done.** Re-run on 10 October 2026 for this record, with a second connection in the same organisation, against a case the portal had sent: add information, erase the reporter, add a file, and rewrite the case.
- **Expected.** Each one refused, and the case unchanged.
- **Actual.** Adding information: refused, "Case not found". Erasing the reporter: refused, "Case not found", and the reporter is still on the case. Rewriting: refused (401). Adding a file: refused earlier, by the file check, because the test file was not a real PDF.
- **Evidence.** The command results above, from the scratch copy. There is no screen for this.
- **Not checked.** A file that passes the file check, sent by the wrong connection (the ownership check for files was traced in the code, not run). Reading a case is still allowed to any connection in the organisation, by design.

## P4 — A merged or deleted case does not strand the request

- **Requirement.** Information, files and erasure sent to a case that was merged into another land on the case it was merged into. The portal is told about a merge or a deletion. A deletion closes the portal request and raises an alert to the portal's team.
- **Why it matters.** Before the fix, new safety information a reporter added to a merged request was refused six times as "case not found" and never reached the surviving case.
- **What was done.** Two cases merged in MIMS, then the reporter added information to the request whose case was merged away. Separately, a case was deleted in MIMS.
- **Expected.** The information on the surviving case. The deleted case closes its request on the portal, with an alert.
- **Actual.** As expected.
- **Evidence.** `p4-merged-followup-on-survivor.png`.
- **Not checked.** The merge was made through MIMS's admin API, because MIMS has no merge button. A chain of three merges. Reopening a surviving case.

## P5 — The portal holds MIMS's receipt for each report

- **Requirement.** For each report, MIMS returns its case number and a fingerprint of exactly what it received. The portal stores both and shows "✓ Receipt" on its requests list. A fingerprint that does not match the report is refused. A report sent again with different content raises an alert.
- **Why it matters.** Without a receipt there is no proof of what MIMS was given, only that the portal sent something.
- **What was done.** Reports sent normally; one sent with a fingerprint that did not match (should be refused).
- **Expected.** "✓ Receipt" on the list; the mismatched one refused.
- **Actual.** As expected.
- **Evidence.** `p5-receipt-on-requests-list.png`.
- **Not checked.** None beyond the shared gaps at the top.

## P6 — A report MIMS lost is found and sent again

- **Requirement.** The portal compares its list of sent reports with MIMS's list: hourly for side effects, nightly for everything. A report MIMS does not have is sent again. One MIMS holds in a different version raises an alert. When more than 20 are missing at once, nothing is re-sent and an alert is raised instead, so a mistake on one side cannot create a flood of duplicate cases. Sync Health shows the last comparisons and a monthly CSV.
- **Why it matters.** Before the fix, a case lost in MIMS (for example after restoring an older backup) still showed "reached MIMS" on the portal, and Sync Health reported no failures.
- **What was done.** A case removed in MIMS, then a comparison run. Then more than 20 removed at once (should stop and alert), then the next run.
- **Expected.** The single lost report sent again. The large gap alerted, not re-sent; the next run re-sends.
- **Actual.** As expected. Sync Health showed the runs and the CSV downloaded.
- **Evidence.** `p6-sync-health-comparison.png`.
- **Not checked.** More than 1000 reports in one comparison. The nightly run across a real night. The scheduled trigger with its secret set.

## P7 — Sign-in secrets are protected and can be changed safely

- **Requirement.** The portal's cached MIMS sign-in token is stored encrypted. Turning the bridge on in MIMS turns on only what the bridge needs. "New secret" on a MIMS connection keeps the old secret working for 7 days, so the portal can be updated without an outage.
- **Why it matters.** The token was stored readable. Turning on the bridge turned on the whole public interface, including parts parked over security findings.
- **What was done.** Bridge-only mode switched on, and the parts it should not serve requested (should be refused). A new secret issued, then the old one used before and after its end date.
- **Expected.** Other parts refused. The old secret works until its end date, then is refused. The token stored encrypted.
- **Actual.** Other parts returned 404. The old secret worked, then got 401. The token is stored encrypted and reused.
- **Evidence.** `p7-new-secret.png`.
- **Not checked.** A cached token that fails to decrypt (traced in the code: it is dropped and a fresh one fetched).

## F1 — The request's journey shows on both sides

- **Requirement.** The portal's requests list shows each request's steps: sent, received by MIMS, taken on, answered, closed. The MIMS case shows which portal request it came from, with a link that opens it.
- **Why it matters.** The portal's team could not see where a request had got to beyond "with the medical team".
- **What was done.** A request followed through each step; the link opened from the MIMS case.
- **Expected.** Each step with its time; the link opens that request.
- **Actual.** As expected.
- **Evidence.** `f1-f2-portal-journey-and-due-date.png`.
- **Not checked.** An installation where the portal's address setting is not filled in: the link would point at the developer's machine. The go-live page says to set it.

## F2 — A serious side effect jumps the queue

- **Requirement.** A side effect reported as serious sends MIMS's case supervisors a critical alert they must acknowledge, with the date it is due to the authorities. The portal's list shows "Serious · due to authorities" with that date.
- **Why it matters.** A serious report has a legal deadline. Before this, it arrived like any other report.
- **What was done.** A serious side effect sent from the portal.
- **Expected.** A critical alert with its due date in MIMS; the badge on the portal.
- **Actual.** As expected.
- **Evidence.** `f2-serious-alert-in-mims.png`, `f1-f2-portal-journey-and-due-date.png`.
- **Not checked.** That a non-serious report raises no critical alert (traced in the code, not run). Email delivery of the alert (no mail server on the test machine).

## F3 — MIMS can ask the reporter a question

- **Requirement.** A MIMS user can ask the reporter a question from the case. The reporter sees it on their portal page, gets an email saying a question is waiting (with no medical content in it), and answers there. The answer arrives on the case as a comment, and the person who asked is notified. A question can be withdrawn. A question cannot be asked where the reporter has no page to answer on.
- **Why it matters.** Missing details on a side effect had to be chased outside both systems, with no record.
- **What was done.** A question asked, shown, answered, and marked answered. Paths that should fail: a second answer; answering another request's question; a withdrawn question; asking on a case whose reporter has no page; a question that is too short.
- **Expected.** The answer on the case; each failing path refused with a reason.
- **Actual.** As expected.
- **Evidence.** `f3-mims-asks-the-reporter.png`, `f3-portal-question.png`, `f3-portal-answered.png`. Visitors were added later; see V1.
- **Not checked.** A merged case whose two reports came from different people (both would see the question). Email delivery.

## F4 — Test Connection proves the whole route

- **Requirement.** Test Connection on the portal checks that both sides speak the same bridge version, then sends one made-up trial report per form, which MIMS checks and throws away. It lists the questions that reach MIMS only inside the case comment.
- **Why it matters.** A connection test that only checks the sign-in says nothing about whether a real report would be accepted.
- **What was done.** Test Connection run against the scratch MIMS; then the case count checked. A trial with a broken fingerprint (should be refused).
- **Expected.** Three trial reports accepted, no case kept, the broken one refused.
- **Actual.** As expected.
- **Evidence.** `f4-test-connection.png`.
- **Not checked.** An older MIMS against the new portal's test (by design, trial reports are not sent to a MIMS older than bridge version 2). Each trial uses up a MIMS case id; case numbers are not affected.

## F5 — A likely duplicate report is flagged

- **Requirement.** A new case from the same reporter about the same product, in the same organisation and of the same type, within 7 days of another, is flagged with a banner and a comment line. Nothing is merged automatically.
- **Why it matters.** The same side effect counted twice distorts safety reporting; merging automatically could hide a genuine second event.
- **What was done.** The same report sent twice; then one about a different product (should not be flagged).
- **Expected.** The banner on the second case only.
- **Actual.** As expected.
- **Evidence.** `f5-possible-duplicate.png`.
- **Not checked.** None beyond the shared gaps at the top.

## V1 — A visitor can follow and answer their own report

- **Requirement.** A visitor who reports without signing in, and gives an email, gets a private link in their confirmation email. The link opens that one request: its progress, the answer, and questions from the medical team, which they can answer there; they can also add information and reply to an answer. A question from MIMS emails the same link again. The link stops working after a year, or as soon as the person's details are erased. Nobody can open another request with it.
- **Why it matters.** Most reporters do not have an account. Before this, they could not see what happened to their report, and MIMS could not ask them anything through the bridge.
- **What was done.** A visitor sent an enquiry from the portal. The link was taken from the confirmation email the portal queued. A MIMS user asked a question on the case; the portal picked it up; the visitor opened the link (not signed in), answered, and the answer was checked on the MIMS case. A second visitor's request was answered by the portal team, and the visitor replied through their link. Paths that should fail: a second answer to the same question; a made-up link; a malformed link; the link on another portal's address; an expired link; a link after the person's details were erased; a signed-in person trying to add to a visitor's request. A signed-in person's request was also sent, to check it gets no link and My Submissions still works.
- **Expected.** The visitor sees and answers the question; the answer arrives in MIMS; their reply reaches the portal team; each failing path is refused; the signed-in person gets no link.
- **Actual.** As expected. The second answer: "already answered". Made-up, malformed, expired and erased links: "This link is not valid or has expired." The visitor's request, seen by a signed-in person: "Request not found." The question email carried the same link as the confirmation email. When the details were erased, all three link columns were emptied.
- **Defect found and fixed while testing.** If MIMS erased a reporter and the same update carried an open question, the portal could still email that question to the erased person. Fixed: the update now treats the person as erased for everything that follows.
- **Defect found in review and fixed.** On a production server without the encryption key, making the link failed before the report was saved, so a visitor's report would have been refused. Fixed: the report is always saved; only the link is skipped, and the failure is logged.
- **Evidence.** `v1-visitor-link-question.png`, `v2-visitor-answered.png`, `v3-answer-in-mims.png`, `v4-visitor-reply.png`, `v5-link-expired.png`.
- **Not checked.** Email delivery (no mail server on the test machine; the email's contents were read from the portal's outbox). The answer to the second visitor was written straight into the test database, not through the portal's answer screen. Mobile screens. A link opened after a year (the expiry was tested by moving the date).

---

## Sign-off

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Tested by | Claude Code, for Kiranmai Avuluri | 10 Oct 2026 | — |
| Reviewed by (second reader, SOP §37.2) | Varun Karne | | |
| Compliance, validation and GxP | Saad Rahman | | |
| Accountable | Rohith Karne | | |

---

**References**

- P1–P7 and decision 3: https://github.com/RohithKarne/pharaxis-one/pull/740
- F1–F5: https://github.com/RohithKarne/pharaxis-one/pull/743
- Bridge plan and decisions: https://claude.ai/code/artifact/0263be33-0607-4253-b25d-3012345bbae5
- Screenshots: `docs/validation/bridge-evidence/`
- V1 code: `apps/cp-portal/backend/services/visitorLink.js`; `apps/cp-portal/backend/routes/portal/submit.js` (`describeRequests`, `requireVisitorLink`, `addFollowUp`, `replyToAnswer`); `apps/cp-portal/frontend/src/portal/pages/VisitorRequestPage.jsx`; migration `apps/cp-portal/backend/database/migrations/0048_add_visitor_request_link.sql`
- V1 defect fix: `apps/cp-portal/backend/services/mimsCloseSync.js` (`applyChange`, after `eraseSubmissionIdentity`)
- P3 routes: `apps/mims/backend/routes/apiPlatform.js` (`/api/v1/cases/:id/follow-ups`, `/redact-reporter`, `/attachments`)
- Verification standard: `docs/TEAM_OPERATING_SOP.md` §26; second reader §37.2; Saad's role §4
