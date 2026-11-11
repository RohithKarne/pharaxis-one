# PRD — Pharaxis One

What we build, and for whom. Two products, one repository, sold separately.

> Changes only when Rohith confirms (RULES.md › Keeping these documents current). Built 2026-11-10 from the old SOP's CP Portal and MIMS sections and the old project overview (now in git history).

```
            Pharma company (one "client" / "organisation")
                 │                                │
   doctors, patients, visitors            medical-information team
                 │                                │
                 ▼                                ▼
          ┌─────────────┐   reports, questions  ┌──────────┐
          │  CP Portal  │ ────────────────────► │   MIMS   │
          │  (outside)  │ ◄──────────────────── │ (inside) │
          └─────────────┘   status, answers     └──────────┘
```

**Pharaxis One has no customers.** Nothing here describes any company as one.

**Positioning: Medical Information first** (Rohith, 2026-08-04). The medical-information workflow is the wedge. Pharmacovigilance stays in the product and is described honestly.

**Both products are in active development**, neither ahead of the other. Both run locally only; no cloud until Rohith picks one.

---

## CP Portal

A white-label medical-information portal. Each pharma client gets its own branded portal for healthcare professionals and patients, at `/portal/<client code>/`.

### Who uses it

| Person | Uses it to |
|---|---|
| Doctor (healthcare professional) | Read approved information, ask a medical question, report a side effect or product complaint, book a medical science liaison, register for events |
| Patient or visitor | Read public information, report a side effect, follow a private link to their question |
| Client admin (the pharma company) | Brand the portal, publish content, switch features, read submissions, run reports |
| Platform superadmin (us) | Set up clients and their admins |

### What the portal gives a doctor
- **Home:** the most important live safety alert and a count of the rest, "For you", tasks, popular searches.
- **Search** across news, documents (including words inside PDFs), FAQs and safety alerts, in the reader's language.
- **Ask or report:** medical question, side effect, product complaint, other. A check-your-answers step before sending. Each report goes to MIMS.
- **My submissions:** status, the answer, a PDF copy of a sent answer.
- **Content:** therapeutic areas, drug information, documents, news, safety alerts ("I have read this" on high and critical), FAQs, events (register, add to calendar), resources, clinical trials, training.
- **Find an MSL** and book a meeting; told when it is confirmed or cancelled.
- **Account:** saved items, notifications that open the exact item, preferences, request access, optional two-step sign-in by emailed code, "remember this browser for 7 days".
- **AI assistant** that answers only from approved, published, in-date documents the reader may see, and quotes them.
- Six languages: English, French, German, Spanish, Japanese, Chinese.

### What the admin panel gives a client
- **Overview:** a "To do today" list, alerts, recent activity, a setup checklist.
- **Branding:** four ready themes with a live preview, logo, fonts, popular searches.
- **Features:** on/off switches grouped into Content, Asking and reporting, Accounts.
- **Content:** news, safety alerts (no review step: live when saved or at the scheduled time), documents, FAQs, therapeutic areas, drugs, events with attendee lists, resources, MSLs, clinical trials (Draft → Needs review → Live; whoever sent it for review cannot publish it).
- **Submissions** as an inbox, the case beside the list; side-effect reports flagged; MIMS links open the case.
- **Forms, gate and user types, compliance (GDPR by jurisdiction), single sign-on, email settings, languages, chat assistant, integration with MIMS.**
- **Reports:** page views, submissions, users, top searches and searches that found nothing ("Write an FAQ"), the monthly Zero-Loss Report.
- **Sync Health:** the MIMS bridge — when each job last ran, delivery times, anything not covered.
- **Audit trail**, review queue, admin users, feedback.

### Product decisions on record
- A clinical trial goes live only after a second person publishes it (2026-10-10).
- Safety alerts go out directly, no review step (2026-10-10).
- Screens show local time with UTC on hover; exports and the audit trail stay in UTC (2026-10-10).
- "Other" requests stay in CP Portal; they never go to MIMS.
- Nothing the bridge carries may be lost unseen: heartbeat, delivery target (15 minutes; 5 for a serious side effect), comparison coverage, Zero-Loss Report (2026-10-27).

---

## MIMS

Medical Information Management System. One installation serves many pharma organisations, each fully separated.

### Who uses it

| Person | Uses it to |
|---|---|
| Agent | Take in questions and reports from email, phone and the portal; work cases |
| Reviewer / approver | Review and sign answer letters and content |
| Content manager | Write and publish documents, modules, FAQs and letter templates |
| Administrator | Set up the organisation: users, screens, permissions, forms, workflows, mailboxes |
| Platform admin (us) | Organisations, sign-in policy, platform alerts, audit |

### What it does
- **Intake:** an email inbox triaged by agents; reports from CP Portal arrive as cases.
- **Cases** of three types: Medical Information (MI), Adverse Event (AE), Product Complaint (PC). Case numbers, owners, workflow states, comments, attachments, history.
- **MI:** the answer is a signed letter (Draft → Ready → Approved → Sent; password and reason required at Approve and Send). Before sending, the AE/PC screening question must be answered; a "yes" needs a linked AE or PC case.
- **AE:** versioned; events, patient, labs, history, products; an E2B file for safety hand-off.
- **PC:** versioned; checks before Route to Quality; counterfeit makes a case urgent.
- **Hand-offs** to safety and quality with due dates and a reconciliation list.
- **Inquiry Ledger:** every open case from every channel, its stage and age, red past its limit.
- **Content management:** documents, modules, FAQs, letter templates; review and approval with an independent approver; versions and revisions; letters built only from published, in-date content.
- **Reports:** a library of 20 reports and dashboards, scheduled sends, exports audited.
- **Administration:** users and their screens, 32 permissions, groups, case form fields (the one screen for the form), MI response settings, transmission setup, sites, mailboxes, case numbering, audit trails.
- **Security:** per-organisation two-step sign-in, session timeout, password history, single sign-on per organisation.

**Menu:** New Case · Work (Overview, Inbox, Cases, Transmissions) · Knowledge (Browse Content, Content Management) · Reporting (Reports) · Administration (MIMS Admin). A person sees only what they can open.

---

## Later — not locked

| Item | Problem | Status |
|---|---|---|
| **Inspector Export (cross-case)** — MIMS-62 | An inspector asks for a body of records; MIMS signs exports for one case only. Hand-assembling 400 exports invites errors | Candidate. Needs the lock. Owner: Saad. First pass would: export the field-level audit across cases by user, date, type, organisation; sign it; lift the 10,000-row cap; generate in the background; log the export itself; PDF and CSV; state the filter and row count; enforce organisation scope; add the button |
| Safety and CRM integrations (Argus, Veeva, TrackWise, Salesforce) | — | Future |
| MIMS Analytics screen | Placeholder only | Deferred by Rohith |
| A demo environment anyone outside can open | Nothing is deployed | Waits on Rohith choosing a cloud |

**Open question:** positioning beyond "Medical Information first" — how we describe ourselves against competitors. Saad owns it; the competitive brief is `docs/CP_Portal_Competitive_Brief.docx` and `docs/CP_Portal_Competitive_Matrix.xlsx`.
