# Bridge watch — recorded walk-through

One record per feature of the bridge watch: what it must do, what was tried on the
real screens, what happened, and what was **not** checked. Walked 27 October 2026 by
Kiranmai (builds and tests); Varun reviews; Saad confirms the compliance view;
Rohith signs. Written for CPPM-161 (Rohith's decision 7: a sample report and a
recorded walk-through, until a cloud is chosen and the products can be shown live).

## What the bridge watch adds

```
 Doctor / visitor
       │ submits
       ▼
 ┌──────────────────────────┐   report (target 15 min, serious 5)   ┌─────────────────────────┐
 │ CP Portal                │ ─────────────────────────────────────▶ │ MIMS                    │
 │  • Bridge heartbeat      │   compare lists (all reports covered)  │  • Inquiry Ledger       │
 │  • Delivery-time alerts  │ ◀───────────────────────────────────── │    every channel, aged, │
 │  • Other-request holder  │   updates (watched for silence)        │    red past its limit   │
 │  • Zero-Loss Report      │                                        │  • one notice per red   │
 └──────────────────────────┘                                        └─────────────────────────┘
        │ alerts: Overview + email                                          │ notices: bell + alert email
        ▼                                                                   ▼
   client's admins / safety team / holder                       case owner / case supervisors
```

## How the walk was run

| Point | How |
|---|---|
| Where | Throwaway copies of both dev databases (`pharaxis_cp_portal_bridge`, `pharaxis_mims_bridge`), a separate code copy, and walk servers on their own ports. The shared dev servers and dev databases were not touched. |
| Sealed | Every mail server, mailbox and connection in the copies pointed at local stand-ins: a mail catcher (plain and TLS) and the walk MIMS. See the deviation below. |
| Sign-in | Own test users on the copies, signing in with password and authenticator code through the real screens. |
| Time | Never waited for: a job was stopped by holding its lock; ages were set by moving a report's or case's received time; jobs were run through the scheduler's own trigger or handler. |

## Summary

| # | Feature | Ticket | Result | Evidence |
|---|---|---|---|---|
| W1 | A stopped bridge job is shown and alerted | CPPM-157 | Pass | `w1-heartbeat-late.jpg` |
| W2 | The comparison covers older reports, and says when it cannot | CPPM-162 | Pass | `w2-comparison-not-covered.jpg`, `w3-comparison-covers-older-reports.jpg` |
| W3 | A client's own side-effect form asks about seriousness | CPPM-163 | Pass | `w4-seriousness-on-client-form.jpg`, `w5-seriousness-required.jpg`, `w15-serious-report-high-priority-in-mims.jpg` |
| W4 | A late report is alerted; delivery time is measured | CPPM-158 | Pass | `w6-delivery-late-alerts.jpg`, `w7-delivery-time-this-month.jpg` |
| W5 | An Other request has a holder and is chased | CPPM-160 | Pass | `w8-other-request-held-on-arrival.jpg` |
| W6 | The Zero-Loss Report accounts for the month | CPPM-159 | Pass | `w9-zero-loss-october.jpg`, `w10-zero-loss-planted-loss.jpg`, `sample-zero-loss-report-2026-10.pdf` |
| W7 | The Inquiry Ledger shows every open inquiry and chases the red ones | MIPM-223 | Pass | `w11-inquiry-ledger.jpg`, `w12-ledger-portal-cases.jpg`, `w13-ledger-notices.jpg`, `w14-ledger-own-cases-only.jpg` |

---

## W1 — A stopped bridge job is shown and alerted (CPPM-157)

- **Requirement.** Each of the four bridge jobs shows when it last finished. One missing three runs is Late, raises one alert per client with a MIMS connection, and the alert closes itself when the job runs again.
- **What was done.** The "Sending reports to MIMS" job was stopped by holding the lock it runs under, and its last run moved 10 minutes back.
- **Expected.** Late on Sync Health; one alert emailed; closed when the job runs.
- **Actual.** As expected. Late on screen ("11 minutes ago"); one alert to the client's two admins within a minute; closed 8 seconds after the lock was released ("system: the job ran again").
- **Not checked.** The whole portal process stopping (then no screen opens at all, which is its own signal). An outside cron driving the jobs instead of the portal itself.

## W2 — The comparison covers older reports, and says when it cannot (CPPM-162, found during W1)

- **Requirement.** Every report in MIMS is compared, including those sent before reports carried a key; any it cannot compare is counted on screen.
- **What was done.** Sync Health opened before the first comparison; the comparison run through the scheduler's trigger; one case hidden from the portal's connection in MIMS; then a stand-in for an older MIMS.
- **Expected.** "22 not covered" before; 22 keyed after; the hidden one found and sent again; the older MIMS leaves reports unkeyed.
- **Actual.** As expected. 11 side-effect reports checked where 0 had been; CP-000072 found missing and sent again (now CP-000072-2); the older-MIMS stand-in stored no key.
- **Not checked.** None beyond the shared gaps at the foot.

## W3 — A client's own side-effect form asks about seriousness (CPPM-163, found during W4)

- **Requirement.** A side-effect form without a seriousness question gets the built-in one, required.
- **What was done.** Calder's side-effect form opened as a visitor; sent once without the answer, then with "Hospitalization", then another with "None of these".
- **Expected.** Refused without an answer; the serious one arrives in MIMS at high priority with a critical notice; "None of these" at normal priority.
- **Actual.** As expected ("1 question needs an answer — Seriousness"; CP-000186 High and critical; CP-000191 normal).
- **Not checked.** A client form that asks seriousness under another name than the three MIMS reads.

## W4 — A late report is alerted; delivery time is measured (CPPM-158)

- **Requirement.** Not in MIMS at twice its target (30 minutes, 10 for serious): one alert, closed on arrival. Sync Health shows the month.
- **What was done.** MIMS stopped; a serious side-effect report and an inquiry sent; their times moved to 11 and 20, then 31 minutes; MIMS started.
- **Expected.** Serious alerted at 11; the inquiry not at 20, alerted at 31; both closed when sent.
- **Actual.** As expected; both closed themselves within two minutes of MIMS returning.
- **Not checked.** None beyond the shared gaps at the foot.

## W5 — An Other request has a holder and is chased (CPPM-160)

- **Requirement.** A default holder for new Other requests; an alert to admins and holder when one waits past the client's limit; closed when answered.
- **What was done.** Holder set on screen (a viewer and 0 hours refused); an Other request sent; moved to 49 hours; answered with Approve & send. A reviewer given an old request; a deactivated holder; a medical inquiry.
- **Expected.** Held on arrival; alert at 49 hours; closed when answered; the reviewer emailed; nothing given by a deactivated holder or to an inquiry.
- **Actual.** As expected. Two real Other requests in the dev data, unanswered for 93 and 108 days, were flagged on the first run.
- **Not checked.** None beyond the shared gaps at the foot.

## W6 — The Zero-Loss Report accounts for the month (CPPM-159)

- **Requirement.** One page per month: verdict, received and in MIMS, delivery, comparisons, files, alerts, Other requests, what it does not cover; print or PDF; fingerprint in the audit trail; not called a signature.
- **What was done.** October opened; one report hidden as lost; restored by the sender; June opened; the PDF downloaded; another client's report asked for.
- **Expected.** "4 of 4"; red verdict naming the hidden one with a different fingerprint, then the first fingerprint back; June makes no claim; PDF; refused for another client.
- **Actual.** As expected (cbfc84ed… → 148a614a… → cbfc84ed…; 403 for another client).
- **Not checked.** Printing to paper from a browser's print dialog (print styles applied; the PDF is the supported copy).

## W7 — The Inquiry Ledger shows every open inquiry and chases the red ones (MIPM-223)

- **Requirement.** Every open case from every channel, its stage, age and light; one notice per newly red case; a summary above 20; only own cases for an own-cases reader.
- **What was done.** Opened as a supervisor (90,341 open cases); a portal inquiry at 9 hours, a serious side effect at 2 hours, an email case with an owner at 5 days, a by-hand case at 5 hours; the job run twice; alert email off, then on with a TLS mail catcher; an own-cases agent signed in.
- **Expected.** Supervisors told of the portal two, the owner of the email one, nobody of the by-hand one; nothing twice; email blocked by the switch, then delivered; the agent sees only their case.
- **Actual.** As expected. The first run told org 1's supervisors once about 54,430 backlog cases (one summary). Every portal case in the dev data, about 30, had waited 34 to 108 days for an owner.
- **Not checked.** None beyond the shared gaps at the foot.

## Deviation recorded during the walk

The first copy of the databases carried the real mail servers. Before they were
sealed, the portal copy sent two bridge-job alert emails through a client's Gmail
account (to `calder_admin@example.com` and `walk.admin@bridge.test`, neither
deliverable; title and link only), and the MIMS copy read two new messages from
the real MIMS inbox into the copy, without marking them read. Lesson L-019; the copy
script now seals every copy before first start.

## Shared gaps (every record)

- One machine, one person; nobody repeated the steps.
- The real mail providers were not used; delivery stopped at local catchers.
- MySQL 8 on this machine only.

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Built and walked | Kiranmai Avuluri | 27 Oct 2026 | Recorded in the project chat, not a signature |
| Reviewed | Varun Karne | | |
| Compliance view | Saad Rahman | | |
| Accountable | Rohith Karne | | |

---

**References**
- Evidence: `docs/validation/bridge-evidence/w1-…` to `w15-…`, `sample-zero-loss-report-2026-10.pdf`
- Earlier bridge records: `docs/validation/CP_MIMS_BRIDGE_VALIDATION.md`
- Lessons: `docs/lessons.md` L-019 to L-021
- Tickets: CPPM-157, 158, 159, 160, 161, 162, 163; MIPM-223
