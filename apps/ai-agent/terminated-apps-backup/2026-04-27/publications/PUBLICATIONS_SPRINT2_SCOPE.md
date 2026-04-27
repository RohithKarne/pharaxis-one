# Publications App — Sprint 2 Scope
> Pharaxis One | Publications — Pharma Publication Lifecycle Management
> Prepared by: Vanaja (Director of Product Management) + Vinay (Product Owner)
> Reviewed by: Rajeev (CTO) + Varun (Senior Director of Software Systems)
> Approved by: Rohith (CPO)
> Date: 2026-04-11
> Handover: External Development Team

---

## Sprint 2 Context

Sprint 2 builds exclusively on a proven, fully signed-off Sprint 1 foundation. Do not start Sprint 2 until all Sprint 1 Checkpoint 2 items are signed off by Rohith.

Sprint 2 has three focus areas:

1. **Workflow Automation** — Automate lifecycle transitions, deadline alerts, and GPP enforcement at workflow gates
2. **Advanced Features** — Full disclosure management, journal and congress submission tracking, Gantt plan view, document version comparison, in-app annotation, publication templates
3. **Platform Integration & Reporting** — MIMS integration, Safety integration, in-app notification centre, advanced analytics, bulk import

---

## Prerequisites — Sprint 2 Does Not Start Until All Are Met

| Prerequisite | Owner | Why It Matters |
|-------------|-------|---------------|
| Sprint 1 fully signed off by Rohith — zero open defects | Rohith | Sprint 2 builds on Sprint 1 data models and workflows. Shaky foundation = compounding problems |
| MIMS API integration contract documented | Rajeev + Varun | Feature #25 depends on this. Must know the MIMS drug record API shape before building |
| Safety module integration event contract documented | Rajeev + Varun | Feature #26 depends on this. Safety team must confirm the event/webhook contract |
| Background job infrastructure provisioned (Bull + Redis) | Varun | Features #16 (deadline alerts) and #29 (GPP enforcement cron) depend on this |
| Real-time infrastructure decision made (WebSocket vs SSE) | Rajeev | Feature #27 (in-app notification centre) depends on this decision |
| Gantt library selection confirmed | Varun | Feature #19 — see note below. Must be agreed before frontend work starts on this feature |

---

## SPRINT 2 FEATURE SCOPE

### Section A: Workflow Automation

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 16 | **Automated Workflow Transitions & Deadline Alerts** | As a publications manager I receive alerts 7 days, 3 days, and on the day of each milestone deadline. As the system I automatically advance a publication status when all reviewers have approved | Deadline alert emails sent at 7-day, 3-day, and same-day marks. Alerts tested by setting a milestone 7 days in future and verifying email fires on schedule. Status auto-advances from Internal Review to Journal Submission when all assigned reviewers have approved — no manual intervention needed. Overdue milestone escalation email sent to Publications Manager when milestone passes without completion. | Bull queue + Redis, cron job for daily deadline scan, auto-transition trigger on final reviewer approval, escalation email template | 5 days | Backend, Bull queue, Redis, Scheduler | Sprint 1 fully complete — #5, #7, #10, #14 | Deadline alert cron runs daily at a configurable time (default: 08:00 org timezone). Escalation email goes to Publications Manager assigned to the publication. |
| 17 | **Full Disclosure Management** | As a publications manager I can manage full author disclosure history across publications. As an author I complete a disclosure sign-off workflow per publication | Full disclosure form per author per publication — financial interests, company relationships, COI declarations. Disclosure history viewable across publications per author. Disclosure sign-off status per author per publication — Pending / Signed / Waived. Publications Manager can request disclosure completion from an author via email. Publication cannot advance past Internal Review until all author disclosures are Signed or Waived. Disclosure audit trail logged. | Disclosure data model (per author per publication), sign-off workflow, email trigger on disclosure request, status enforcement at Internal Review stage, audit log entries for disclosure events | 5 days | Full-stack | Sprint 1 #6 (Author Management) — builds on top of disclosure flag | Sprint 1 captures disclosure flag (yes/no). Sprint 2 builds the full sign-off workflow and history on top of that foundation. |
| 29 | **GPP Compliance Enforcement at Workflow Transitions** | As the system I block a publication from advancing to Journal Submission if required GPP checklist items are not complete | Required GPP items (configurable by org admin — defaults from Sprint 1 Appendix A) must be checked before publication can advance to Journal Submission stage. System shows a blocking message listing unchecked required items. Publications Manager cannot bypass — no override button, no workaround. Non-required items are tracked but do not block transition. | Required-item flag per checklist item, transition validation in workflow state machine, blocking UI with unmet items list | 4 days | Full-stack, Business rules | Sprint 1 #5, #11 | Sprint 1 tracks GPP items but does not enforce. Sprint 2 adds enforcement. Required vs optional distinction configured by org admin. Defaults: items 1–5, 7, 10, 13 from Appendix A are required. |

---

### Section B: Advanced Publication Features

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 18 | **Journal & Congress Submission Tracking** | As a medical writer I can log the details of a journal submission and track peer review rounds. As a publications manager I can log a congress submission and track the decision | Journal submission: journal name, submission date, manuscript reference ID, peer review status (Under Review / Revision Requested / Accepted / Rejected), revision round tracking. Congress submission: conference name, abstract reference ID, submission date, decision (Accepted / Rejected / Poster / Oral reassigned). Multiple submission attempts per publication supported — if rejected and resubmitted elsewhere. Submission history visible on publication record. | Journal submission model, congress submission model, submission history list, status tracking UI | 4 days | Full-stack | Sprint 1 #4, #5 | Publication status Journal Submission in Sprint 1 is a single stage. Sprint 2 adds the detailed submission record beneath that stage. |
| 19 | **Publication Plan View — Gantt Style** | As a publications manager I can see all publications in my organisation on a single timeline view, colour-coded by status and type | All active publications displayed on a horizontal timeline. Each publication shown as a bar spanning its planned start to target submission date. Colour-coded by publication status. Filter by: therapeutic area, publication type, publications manager. Bar click navigates to publication record. | Gantt timeline component, publication plan query (all active pubs with dates), filter logic | 6 days | Frontend, Data visualisation | Sprint 1 #4, #7 | **Library guidance for external team:** Use `@dhtmlx/trial-react-gantt` or `react-gantt-task` as a starting point. Custom implementation is also acceptable. Do NOT use Syncfusion — licensing cost. Confirm library selection with Varun before building. Gantt data query must be efficient — do not load all publication fields, load plan-view-specific projection only. |
| 20 | **Manuscript Version Comparison** | As a medical writer I can compare two versions of a document side by side to understand what changed | User selects two versions of the same document. Side-by-side view shows both documents. For Word (.docx) documents: text diff highlighting is shown. For PDF: side-by-side view without inline diff (structural diff not feasible for PDFs at v1). Version selection UI on the document history panel. | Document comparison UI, docx diff library (mammoth.js + diff library), PDF.js for side-by-side PDF view | 5 days | Frontend, Document processing | Sprint 1 #9 | Word diff: use mammoth.js to extract text from .docx, then apply diff highlighting. PDF diff: side-by-side display only — no inline change tracking at v1. Full PDF diff is Sprint 3 scope if needed. |
| 21 | **Comments & Annotation on Documents** | As a reviewer I can add inline comments on a document. As a medical writer I can resolve or respond to comments | Comments added on a specific page number of the document (not inline annotation overlay at v1 — page-level comments). Each comment has: page number, comment text, commenter, timestamp. Comment threads — reply to a comment. Resolve/reopen a comment. All comments visible to all users with access to the publication. Comment history visible even after resolved. | Comment data model (linked to document version and page number), comment thread UI, resolve/reopen logic, comment feed on document viewer | 5 days | Full-stack, Document viewer | Sprint 1 #9, #10 | v1 is page-level comments — not PDF annotation overlay. True inline annotation (highlight text in PDF) is a significant frontend complexity. Defer to Sprint 3 if needed. Page-level comments are sufficient for medical review workflows at v1. |
| 22 | **Publication Templates** | As an org admin I can create and manage publication templates that pre-fill standard fields and checklist configurations for each publication type | Admin can create a template per publication type. Template defines: default milestone set (with relative due dates e.g. First Draft = Day 0, Internal Review = Day 30), custom GPP checklist items appended to defaults, default reviewer pool. When a new publication is created and a template selected, milestones and checklist items auto-populate. Org admin can edit and delete templates. | Template data model, milestone template items with relative date offsets, checklist template items, template application logic on publication creation UI | 4 days | Full-stack | Sprint 1 #4, #7, #11 | Relative dates: offset from publication creation date. Example: First Draft Due = 14 days after creation. System calculates absolute date on application. |
| 23 | **Congress & Conference Calendar** | As a publications manager I can view upcoming congresses relevant to my therapeutic areas and see which publications are targeting each congress | Calendar view of upcoming conferences. Each conference entry: name, abstract submission deadline, presentation dates, therapeutic area tags. Publications can be linked to a conference. Publications targeting a conference appear on that conference's card. Abstract submission deadline highlighted when within 60 days and a linked publication is not yet at Journal Submission stage. | Conference data model, calendar UI (FullCalendar or custom month/list view), publication-to-conference linkage, deadline proximity alert logic | 4 days | Full-stack, FullCalendar | Sprint 1 #4 | Conference data entered manually by org admin at v1. External conference database feed is future scope. FullCalendar is the recommended library — confirm with Varun before building. |

---

### Section C: Platform Integration & Reporting

| # | Feature | User Story | Acceptance Criteria | Technical Component | Effort | Skills Required | Dependencies | Notes |
|---|---------|-----------|---------------------|-------------------|--------|----------------|--------------|-------|
| 24 | **In-App Notification Centre** | As a user I can see all my notifications in one place inside the app, mark them as read, and filter by type | Notification bell icon in header shows unread count. Notification panel lists all notifications in reverse chronological order. Each notification: message text, publication title, action link, timestamp, read/unread status. Mark as read individually or mark all as read. Filter by notification type. Unread count updates in real time when a new notification arrives while user is logged in. | Notification centre UI, notification data model, real-time unread count (WebSocket or SSE), mark-as-read API, notification type filter | 3 days | Full-stack, WebSocket or SSE | Sprint 1 #14 — builds on top of notification model | Sprint 1 delivers email notifications only. Sprint 2 adds the in-app centre. Same notification events trigger both channels. User preference controls which channels are active per event type. |
| 25 | **MIMS Integration — Drug/Compound Reference** | As a medical writer I can link a publication to a MIMS drug record instead of entering drug name as free text. As a MIMS user I can see all publications linked to a drug | Publications creation form shows a drug search backed by MIMS API (search by drug name or compound). Selected MIMS drug record ID stored on publication alongside drug name. MIMS drug record page shows a linked publications count and list. Bidirectional — Publications shows MIMS link, MIMS shows Publications link. If MIMS API is unavailable, free-text drug name field falls back gracefully. | MIMS API client (read-only), drug search UI with typeahead, MIMS drug_id foreign reference on publication table, MIMS-side publication link endpoint | 5 days | Full-stack, API integration | Sprint 1 fully complete + MIMS API contract confirmed | Integration is read-only from Publications side at v1. Publications fetches drug data from MIMS — does not write to MIMS. MIMS writes the publication link to its own DB when queried. Confirm the exact API contract with Varun and Rajeev before building. |
| 26 | **Safety Integration — Safety Case Link** | As a medical writer I can flag a publication as safety-related and link it to a Safety module case record. As a safety officer I receive a notification when a safety-linked publication moves to Journal Submission | Publications can be flagged as safety-relevant. Free-text safety case reference at v1 (full Safety API linkage in Sprint 3 if needed). Safety-relevant flag stored on publication. When a safety-relevant publication advances to Journal Submission stage, a webhook/event fires to the Safety module. Safety module notifies relevant safety officer. If Safety module is unavailable, event is queued and retried. | Safety-relevant flag on publication, event emission on status transition, webhook/event bus to Safety module, retry logic on delivery failure | 4 days | Backend, API integration, Event-driven design | Sprint 1 #5 + Safety module event contract confirmed | v1 is a lightweight integration — flag + event. Deep Safety case record linkage (bidirectional, data sync) is Sprint 3 scope. The event contract (payload structure, endpoint) must be confirmed with the Safety team before building. |
| 27 | **Advanced Reporting & Export** | As a medical affairs director I can view portfolio-level reports on publication activity and export them | Reports available: publications by status over a selected date range (chart + table), author workload (how many active publications per author), GPP compliance rate by publication type, milestone hit rate (% milestones completed on time). Each report exportable to PDF and Excel. Scheduled report: org admin can configure a weekly or monthly report email to selected recipients. | Report data queries (aggregation), PDF export (PDFKit), Excel export (ExcelJS), scheduled email report (Bull cron), report configuration UI | 6 days | Full-stack, PDFKit, ExcelJS, Recharts, Bull | Sprint 1 fully complete | Sprint 1 delivers the basic dashboard (counts and upcoming milestones). Sprint 2 delivers time-range analytics, export, and scheduled delivery. |
| 28 | **User Activity & Workload Report** | As a publications manager I can see how many active publications each team member owns and their review completion rate | Per-user report: active publications owned, reviews completed this quarter, average review turnaround time, milestones met vs missed. Viewable by Publications Manager and Org Admin. Exportable to Excel. | Per-user aggregation queries, workload report UI, Excel export | 3 days | Full-stack, ExcelJS | Sprint 1 fully complete | Useful for resource planning — if one Medical Writer owns 12 active publications and another owns 2, Publications Manager can rebalance. |
| 30 | **Bulk Actions & Publication Import** | As an org admin I can import existing publications from a CSV to migrate from spreadsheets. As a publications manager I can bulk update status or bulk assign a reviewer across multiple publications | CSV import: accepts a defined template (downloadable from the UI), maps columns to publication fields, validates on upload, shows preview with error rows flagged, confirms and imports. Bulk actions: select multiple publications in list view → bulk status update or bulk reviewer assign. Audit log entries created for each record affected by a bulk action. | CSV parser (csv-parser), import validation engine, import preview UI, bulk action multi-select UI, bulk action API endpoint, audit log bulk write | 4 days | Full-stack, csv-parser | Sprint 1 fully complete | CSV import template downloadable from the app — do not ask users to figure out the column format. Validation: unknown publication types, missing required fields, and duplicate titles within the org all flagged as import errors. |

---

### CHECKPOINT — Sprint 2 Complete Gate

> Full browser verification by Varun's team. Vanaja product walkthrough. Karthik and Shivani QA sign-off. Rohith final sign-off.

- [ ] Deadline alert email fires correctly at 7-day and 3-day marks (test with synthetic milestone dates).
- [ ] Publication auto-advances from Internal Review to Journal Submission when all reviewers approve — no manual trigger needed.
- [ ] GPP enforcement blocks publication from advancing to Journal Submission with unchecked required items. Blocking message lists the specific unchecked items.
- [ ] Full disclosure sign-off workflow: Publications Manager requests disclosure → author receives email → disclosure submitted → status updates → audit log records each step.
- [ ] Journal submission logged with peer review round tracking. Congress submission logged with decision status.
- [ ] Gantt plan view shows all active publications on timeline. Filter by therapeutic area returns correct subset.
- [ ] Two versions of a Word document compared — diff highlighting visible. Two PDF versions shown side by side.
- [ ] Page-level comment added, replied to, and resolved. Comment history visible after resolution.
- [ ] Publication template applied on creation — milestones and checklist items auto-populated correctly.
- [ ] Conference calendar shows upcoming conferences. Publication linked to conference appears on conference card.
- [ ] In-app notification centre shows unread count. New notification appears in real time without page refresh.
- [ ] MIMS drug search returns results from MIMS API. Drug linked to publication. Publication appears in MIMS drug record.
- [ ] Safety-relevant publication flagged and advanced to Journal Submission — Safety module receives event.
- [ ] Advanced report generated for publications by status over a 90-day range. Export to PDF and Excel both work.
- [ ] CSV import: valid CSV imports correctly. CSV with errors shows preview with error rows flagged — does not import bad rows.
- [ ] Bulk status update applied to 5 publications — all 5 audit log entries created.
- [ ] All above verified in browser as a real user — not API testing only.

---

## IN-BETWEEN FEATURE RULES — Sprint 2
> Same rules as Sprint 1 apply to every Sprint 2 feature. No exceptions.

| Rule | What It Means |
|------|--------------|
| No feature ships without audit log coverage | Sprint 2 actions — disclosure sign-offs, bulk actions, import events, integration events — all logged |
| No feature ships without role enforcement tested | Every Sprint 2 endpoint tested with wrong-role user. Must get 403. |
| No feature ships without negative path tested | GPP enforcement: test that a publication with missing required items is correctly blocked. Import: test invalid CSV. Disclosure: test advancing past Internal Review with unsigned disclosures. |
| Integration features must fail gracefully | MIMS and Safety integrations must handle API downtime without breaking the Publications app core workflow. Fallback to free-text for drug name if MIMS is down. Queue and retry for Safety events. |
| Automation must be tested with synthetic dates | Deadline alert cron and auto-transition features cannot only be tested in real time. Use synthetic past/future dates in the test environment to verify scheduler logic. |
| Bulk actions must write individual audit log entries | A bulk status update of 10 publications must produce 10 audit log entries — not one batch entry. Each record's audit trail must be complete. |
| GPP enforcement is never bypassable | No override button, no admin bypass, no workaround. Test explicitly that even org admin and super admin cannot bypass the GPP transition block. |

---

## FULL SPRINT 2 FEATURE SUMMARY TABLE

| # | Feature | Section | Priority | Effort | Skills | Technology |
|---|---------|---------|----------|--------|--------|-----------|
| 16 | Automated Workflow Transitions & Deadline Alerts | Automation | P0 | 5 days | Backend, Bull, Redis | Node.js, Bull, Redis, Nodemailer |
| 17 | Full Disclosure Management | Automation | P0 | 5 days | Full-stack | React, Node.js, MySQL |
| 18 | Journal & Congress Submission Tracking | Advanced Features | P0 | 4 days | Full-stack | React, Node.js, MySQL |
| 19 | Publication Plan View — Gantt | Advanced Features | P0 | 6 days | Frontend, Data viz | React, Gantt library, Node.js |
| 20 | Manuscript Version Comparison | Advanced Features | P1 | 5 days | Frontend, Doc processing | React, mammoth.js, PDF.js |
| 21 | Comments & Annotation on Documents | Advanced Features | P1 | 5 days | Full-stack | React, Node.js, MySQL |
| 22 | Publication Templates | Advanced Features | P1 | 4 days | Full-stack | React, Node.js, MySQL |
| 23 | Congress & Conference Calendar | Advanced Features | P1 | 4 days | Full-stack | React, FullCalendar, Node.js |
| 24 | In-App Notification Centre | Integration & Reporting | P1 | 3 days | Full-stack, Real-time | React, Node.js, WebSocket/SSE |
| 25 | MIMS Integration — Drug/Compound Reference | Integration & Reporting | P0 | 5 days | Full-stack, API integration | React, Node.js, REST API |
| 26 | Safety Integration — Safety Case Link | Integration & Reporting | P1 | 4 days | Backend, Event-driven | Node.js, Webhook/Event bus |
| 27 | Advanced Reporting & Export | Integration & Reporting | P1 | 6 days | Full-stack, Reporting | React, Node.js, PDFKit, ExcelJS |
| 28 | User Activity & Workload Report | Integration & Reporting | P2 | 3 days | Full-stack | React, Node.js, ExcelJS |
| 29 | GPP Compliance Enforcement at Transitions | Automation | P0 | 4 days | Full-stack, Business rules | React, Node.js, MySQL |
| 30 | Bulk Actions & Publication Import | Integration & Reporting | P2 | 4 days | Full-stack, csv-parser | React, Node.js, csv-parser |

---

## EFFORT SUMMARY — SPRINT 2

| Category | Features | Effort |
|----------|----------|--------|
| P0 — Must have | 6 | 28 days |
| P1 — High value | 9 | 34 days |
| P2 — Important, not blocking | 2 | 7 days |
| **Total Sprint 2** | **17** | **69 days** |

---

## TECHNOLOGY ADDITIONS — SPRINT 2

The following are new to Sprint 2 — all Sprint 1 technologies continue to apply.

| Technology | Feature | Notes |
|-----------|---------|-------|
| Bull + Redis | #16, #29 | Background job queue for deadline alerts and scheduled tasks. Bull v4 + Redis 6+ recommended |
| WebSocket or SSE | #24 | Real-time notification count. SSE is simpler if only server-to-client updates needed. Confirm with Rajeev before building. |
| PDFKit | #27 | Server-side PDF report generation |
| ExcelJS | #27, #28 | Excel report export |
| mammoth.js | #20 | Extract text from .docx for version diff |
| PDF.js | #20, #21 | In-browser PDF rendering for comparison and page-level comments |
| FullCalendar | #23 | Congress calendar view |
| Gantt library | #19 | See library guidance in feature #19 notes — confirm with Varun before building |
| csv-parser | #30 | CSV import processing |

---

## SKILLS REQUIRED — SPRINT 2

| Skill Area | Required Level | New vs Sprint 1 |
|------------|---------------|----------------|
| React + TypeScript | Expert | Continued from Sprint 1 |
| Node.js + Express | Expert | Continued from Sprint 1 |
| MySQL + mysql2 | Expert | Continued from Sprint 1 |
| Background job scheduling (Bull + Redis) | Proficient | New in Sprint 2 |
| Real-time (WebSocket / SSE) | Proficient | New in Sprint 2 |
| API integration (REST) | Proficient | New in Sprint 2 — MIMS and Safety |
| Event-driven / Webhook design | Proficient | New in Sprint 2 — Safety integration |
| Document processing (mammoth.js, PDF.js) | Proficient | New in Sprint 2 |
| Data aggregation and analytics queries | Proficient | New in Sprint 2 |
| PDF export (PDFKit) | Proficient | New in Sprint 2 |
| Excel export (ExcelJS) | Proficient | New in Sprint 2 |
| CSV import and validation | Proficient | New in Sprint 2 |
| Calendar UI (FullCalendar) | Working knowledge | New in Sprint 2 |
| Gantt timeline UI | Working knowledge | New in Sprint 2 |

---

## COMBINED SPRINT OVERVIEW

| Metric | Sprint 1 | Sprint 2 | Total |
|--------|----------|----------|-------|
| Total Features | 15 | 17 | 32 |
| P0 Features | 10 | 6 | 16 |
| P1 Features | 5 | 9 | 14 |
| P2 Features | 0 | 2 | 2 |
| Total Effort (days) | 55 | 69 | 124 |

---

## HANDOVER NOTES — IMPORTANT

These two files (PUBLICATIONS_SPRINT1_SCOPE.md and PUBLICATIONS_SPRINT2_SCOPE.md) are the complete handover package for the external development team.

### Before Sprint 1 Begins — Mandatory Steps

1. Read both scope files in full before any discussion or planning
2. Complete all Pre-Development Checklist items in PUBLICATIONS_SPRINT1_SCOPE.md
3. Confirm all architecture decisions with Rajeev and Varun — list is in Sprint 1 Pre-Dev Checklist
4. Submit all 11 data models for Rajeev and Varun review and sign-off
5. Do not write any application code until data models are approved
6. Do not start Sprint 2 features until Sprint 1 Checkpoint 2 is signed off by Rohith

### Questions and Escalation During Development

| Topic | Contact | Role |
|-------|---------|------|
| Architecture decisions | Rajeev | CTO |
| Engineering direction and task assignment | Varun | Senior Director of Software Systems |
| Product and feature scope | Vanaja | Director of Product Management |
| User stories and acceptance criteria | Vinay | Product Owner |
| Project tracking and gate approvals | Bala | Director of Project Management |
| Final approval on all gates | Rohith | CPO |

### What "Done" Means on This Project

A feature is not done when the code is written. A feature is done when:
1. It works correctly in the browser as a real user would use it
2. The negative path has been tested — the wrong input, the wrong role, the wrong tenant
3. The audit log captures every relevant action from that feature
4. No existing Sprint 1 feature has been broken by the Sprint 2 addition
5. Rohith has given final sign-off

There are no exceptions to this definition.
