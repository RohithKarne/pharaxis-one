# MIMS Content Management — Feature Requirements Document

**Version:** 1.0
**Date:** 2026-03-22
**Authors:** Rohith (CPO), Vanaja (PM)
**Status:** APPROVED FOR DEVELOPMENT — V1 Scope Frozen
**Source:** SCIMAX MIQ CM Training deck + stakeholder discussion 2026-03-22

> **Rajeev — read this first:** This document is self-contained. Everything you need to build Content Management V1 is here. Do not start development without reading all sections. Role mapping will be confirmed separately during Admin Console > User Management sprint — use placeholder privilege checks for now.

---

## 1. Overview

Content Management (CM) is the module within MIMS that allows authorised users to create, review, approve, publish, and manage all content assets used in medical inquiry fulfilment. It is accessible via the **Browse Content** top navigation item and the **CM Console** (setup icon).

Content assets created here are consumed by:
- Case Management (agents attach documents/FAQs to responses)
- Transmissions (Merge Reports)
- Inbox / Correspondence (Email Templates)
- Self Service Portal users (published FAQs only)

---

## 2. Module Architecture

Content Management consists of **4 modules**:

```
Content Management
├── Documents          (Standard Response Docs, Enclosures, Info Docs, Internal Docs)
├── FAQs               (Approved Q&A responses for case fulfilment)
├── Merge Reports      (Word docs with merge fields for case transmissions)
└── Templates          (Response, Email, Acknowledgment templates — no workflow)
```

Modules 1–3 share the **same content lifecycle**: Create → Check-In → Review → Approve → Publish.
Module 4 (Templates) is standalone — create and activate, no lifecycle workflow.

---

## 3. Technology Stack

| Component | Choice | Cost | Reason |
|---|---|---|---|
| Rich Text Editor | **TipTap Core** | Free (MIT) | Headings, bold, italic, tables, lists, paste — covers all authoring needs |
| File Upload | Native browser file input + multer (already used in project) | Free | Upload DOC, DOCX, PDF, TXT |
| Real-time Collaboration | **Not in V1** | — | Requires WebSocket infra + Y.js + Hocuspocus. Deferred to Phase 3 |
| Track Changes / Comments | **Not in V1** | — | Requires TipTap Pro ($149/month). Deferred to Phase 3 |
| Modular SRDs | **Not in V1** | — | Many-to-many versioning + cascading review = 5x complexity. Phase 3 |
| Word-compatible editor | **Not in V1** | — | OnlyOffice embed requires separate server. Phase 3 |
| Database | SQLite (existing) | Free | New tables added via migration |
| Backend | Node/Express (existing) | Free | New route files added |
| Frontend | React + Vite (existing) | Free | New pages/components under `modules/content/` |

---

## 4. User Roles & Privileges

> **Note:** Exact role-to-privilege mapping will be confirmed during Admin Console > User Management sprint. Until then, use the privilege names below as feature flags/checks in code.

| Privilege Name | What They Can Do |
|---|---|
| `cm_author` | Create documents, upload files, author with rich text editor, save drafts, check in |
| `cm_review_owner` | Initiate reviews, assign reviewers, close reviews, transfer review ownership |
| `cm_reviewer` | Perform assigned reviews, add comments, set review status |
| `cm_approver` | Approve documents after review is closed |
| `cm_publisher` | Publish approved documents |
| `cm_admin` | All of the above + manage folders, archive, delete |

These map to existing MIMS user roles — mapping to be added to User Management config.

---

## 5. Core Content Lifecycle

This lifecycle applies to **Documents, FAQs, and Merge Reports**.

```
[DRAFT] ──► [CHECKED-IN / PENDING] ──► [UNDER REVIEW] ──► [APPROVED] ──► [PUBLISHED]
                                                                              │
                                                                         [ARCHIVED]
                                                                    (previous version auto-archived
                                                                     when new version published)
```

### Status Definitions

| Status | Description |
|---|---|
| **Draft** | Created, saved but not yet checked in. Only visible to author. |
| **Pending** | Checked in. Available for Review Owner to initiate review. |
| **Under Review** | Review initiated. Reviewers have been assigned. |
| **Approved** | Review closed, Approver has approved. Ready to publish. |
| **Published** | Live. Available to case agents, portal users (if FAQ). |
| **Archived** | Superseded by a newer published version. Read-only. |

### Lifecycle Rules
- Only one version can be **Published** at a time per document.
- Publishing a new version **auto-archives** the previous published version.
- **Archived** documents are read-only — cannot be edited or re-published directly. A new version must be created from them.
- A document in **Under Review** cannot be edited by the author until review is closed.
- **Expiry Date** — if set and date passes, document status changes to Archived automatically (background job or on-read check).

---

## 6. Module 1: Documents

### 6.1 Document Types

| Type | Description | Sub-types |
|---|---|---|
| **Standard Response Document (SRD)** | Primary medical response documents sent to HCPs/patients | File (uploaded), Module (V1 = flat only, modular = Phase 3) |
| **Enclosure** | Supporting attachments included with SRDs | File only |
| **Information Document** | General information documents, not case-specific | File only |
| **Internal Document** | Internal reference documents, not sent to requesters | File only |

### 6.2 Folder Management

Folders are the top-level organisational unit for all documents.

**Folder Setup Screen** — `CM Console > Configurations > Folders`

**Fields:**
- Folder Name (required)
- Associated Product (dropdown — from Product Dictionary)
- Region / Site (optional — for global/local content control)
- Status (Active / Inactive)
- Description (optional)

**Rules:**
- A folder must exist before a document can be created inside it.
- Inactive folders are hidden from document creation dropdowns but existing documents are retained.
- Folders cannot be deleted if they contain documents — must be inactivated.

**User Stories:**
- As a CM Admin, I can create a new folder and associate it with a product so that documents are organised by product.
- As a CM Admin, I can inactivate a folder so that new documents cannot be added to it without deleting existing content.

### 6.3 Document Creation

Two methods of creating document content:

#### Method 1: File Upload
- User selects a file from local machine
- Supported formats: PDF, DOC, DOCX, TXT
- File stored in `mims/backend/uploads/cm_documents/`
- File metadata (name, size, type) stored in DB

#### Method 2: Online Authoring (Rich Text Editor)
- User authors content directly in TipTap Core editor
- Supports: headings (H1–H3), bold, italic, underline, bullet lists, numbered lists, tables, hyperlinks
- Content stored as HTML in DB
- On publish, can be rendered/exported as HTML view
- No Microsoft Word dependency

**New Document Form Fields (Header):**
- Folder Name (required, dropdown)
- Document Type (required, dropdown — SRD / Enclosure / Information / Internal)
- Document Name (required, text)
- Document ID (auto-generated by system — e.g., SYS-DOC-00001)

**Tabs on Document Form:**
1. General Attributes
2. Other Attributes
3. Associated Documents
4. Usage Instructions
5. Version Alerts

**Actions:**
- **Save** — saves as Draft (not checked in, not visible to others)
- **Save & Check-In** — saves and moves status to Pending
- **Cancel** — discard

### 6.4 Document Attributes

#### General Attributes Tab

| Field | Type | Required | Notes |
|---|---|---|---|
| Response Document Type | Dropdown | Yes (for SRD) | File / Module (Module = Phase 3) |
| Standard Response Letter / Cover Letter Text | Rich Text | No | Intro text for the response |
| MI Categories and Sub-Categories | Multi-checkbox tree | No | Drives category selection in case form |
| Search Tags | Free text (comma separated) | No | For search indexing |
| Source Attachments | File upload (multiple) | No | Reference source documents |
| Document Category | Dropdown | No | From picklist |
| Activation Date | Date picker | No | Date from which document becomes active |
| Expiry Date | Date picker | No | Document auto-archives on this date |
| Page Count | Number | No | Manual entry |
| Publish as PDF | Checkbox | No | Output as PDF on publish |
| Send as PDF | Checkbox | No | Send to requester as PDF |

#### Other Attributes Tab
- Product Specific (checkbox) — links document to specific product(s)
- Contact/Reporter Specific (checkbox)
- Site Specific (checkbox) — restricts document to specific sites/regions
- Language (dropdown) — for multi-language support

#### Associated Documents Tab
- Link other documents as enclosures or references
- Shows: Document Name, Type, Version, Status

#### Usage Instructions Tab
- Free text field for internal notes on when/how to use this document
- Not sent to requesters

#### Version Alerts Tab
- Configure alerts for document expiry
- Alert recipients (user selection)
- Alert timing (e.g., 30 days before expiry, 15 days before expiry)

### 6.5 Check-In / Check-Out (CI/CO)

**Check-Out:** A user takes exclusive editing rights on a document.
- Only one user can have a document checked out at a time.
- Checked-out documents show CO status + the username of the person who checked it out.
- Other users can VIEW but cannot EDIT a checked-out document.
- If author checks out → edits → checks back in → status moves to Pending.

**Check-In:** User returns the document after editing.
- On Check-In, status moves to Pending (available for review).
- If user saves without checking in → document stays in Draft (My Checkouts).

**My Checkouts View:**
- Personal view showing all documents currently checked out by the logged-in user.
- Actions: Check-In, Discard Changes.

**Rules:**
- CM Admin can force check-in a document if a user is unavailable.
- Checked-out documents appear with a lock icon in document list.

**User Stories:**
- As an author, I can check out a document so that I have exclusive editing rights and others cannot modify it simultaneously.
- As an author, I can see all my checked-out documents in My Checkouts so I can manage my pending work.
- As a CM Admin, I can force check-in a document so that it is not stuck if an author is unavailable.

### 6.6 Review Workflow

Review is initiated by a **Review Owner** on a document that is in Pending status.

#### Setting Up a Review

**Setup New Review Form:**
- Review Title (required, dropdown or custom)
- Custom Title (text, if "Other" selected)
- Planned End Date (required)
- Non-Amendable Review (checkbox) — if checked, reviewers can only comment, not edit content
- Review Description (free text)
- Reviewers (multi-select from users with `cm_reviewer` privilege)
- Custom Email Message (optional — additional info sent to reviewers)

#### Reviewer Actions
On receiving email notification, reviewer opens their **Reviewer Task** list.
- Task list tabs: Open / Completed / Cancelled
- Columns: Review Title, Document Name, Version, Planned End Date, Document Review Status, My Review Status

Reviewer opens document and sets their status to one of:
- **Ongoing** (default)
- **Accepted**
- **Accepted with Changes**
- **Declined**
- **Rejected**

Reviewer provides a Reason for Status Change.

For **non-real-time parallel review (V1):**
- Multiple reviewers can be assigned simultaneously.
- Each reviewer independently opens the document, reads it, leaves comments (text comments, not inline track changes), and sets their status.
- All reviewer comments are visible to the Review Owner.

#### Review Owner Actions
After all reviewers complete:
- Review Owner views all reviewer statuses and comments.
- Can accept or reject the edits/comments.
- If any reviewer Rejected → Review Owner must send document for Re-Review before closing.
- **Close Review** — moves document to Approved status (if Review Owner accepts).
- **End Review** — cancels the review. Document stays in Pending. All comments preserved in Reference Document.
- Review Owner can **Transfer Ownership** to another user with `cm_review_owner` privilege.
- Review Owner can **Change Status** of the review.
- Review Owner can **Send Message** to reviewers.

#### Review Schedule
- Multiple reviews can be set up for a document (planned in sequence).
- Reviews are performed in top-down order.
- Auto-start of next scheduled review is supported.
- Sequence/order of planned reviews can be re-arranged.

#### Review States
| State | Description |
|---|---|
| Open | Review is active, awaiting reviewer actions |
| Completed | All reviewers done, Review Owner has closed it |
| Cancelled | Review Owner ended the review |

**User Stories:**
- As a Review Owner, I can set up a new review and assign reviewers so that the document goes through collaborative review.
- As a Reviewer, I receive an email notification when assigned a review task so I can take action promptly.
- As a Reviewer, I can open the document, add comments, and set my review status so the Review Owner knows my decision.
- As a Review Owner, I can close a review after all reviewers complete so the document moves to Approved status.
- As a Review Owner, I can send a document for re-review if a reviewer has rejected it so the review cycle can continue.
- As a Review Owner, I can transfer review ownership to another user so reviews are not blocked by my absence.

### 6.7 Content Approval

Triggered after Review is Closed.

**Approver Actions (user with `cm_approver` privilege):**
- Opens document from Review Owner Task list → selects "Approve"
- Approval confirmation dialog:
  - User ID (pre-filled, read-only)
  - Password (required — electronic signature)
  - Reason for Approving Document (required)
  - Confirm / Cancel
- On approval, document status → **Approved**
- Approver receives confirmation. Document Owner notified.

**User Stories:**
- As a Content Approver, I can approve a reviewed document with my password and reason so that it is authenticated and ready for publishing.

### 6.8 Content Publish

Triggered after Approval.

**Publisher Actions (user with `cm_publisher` privilege):**
- Opens document → selects "Publish"
- Publish confirmation dialog:
  - User ID (pre-filled)
  - Password (required — electronic signature)
  - System Version (auto — e.g., 1.1)
  - Org Version (optional — organisation's own version label)
  - Reason for Publishing Document (required)
  - Confirm / Cancel
- On publish:
  - Document status → **Published**
  - Previous published version → **Archived** (auto)
  - All users with access are notified of new content availability
  - Users who had the old version are notified of old content expiry

**User Stories:**
- As a Content Publisher, I can publish an approved document so that it becomes available for use in case responses.
- As a system, when a new version is published, I auto-archive the previous published version so only one version is live at a time.

### 6.9 Version History

Every document has a **Versions** tab showing all versions ever created.

**Version History Table Columns:**
- Version Number
- Status (Draft / Pending / Under Review / Approved / Published / Archived)
- Created By
- Created Date
- Published Date (if applicable)
- Archived Date (if applicable)
- Action: View (read-only), Compare (V2)

**Versioning Rules:**
- Every Check-In of an edited document creates a new minor version (1.0 → 1.1).
- Every Publish creates a new major version (1.x → 2.0) — configurable.
- Version numbers are system-generated, not user-editable.

**User Stories:**
- As a CM User, I can view the complete version history of a document so I can understand how it has evolved over time.
- As a CM User, I can view any historical version of a document in read-only mode for reference.

### 6.10 Expiry & Version Alerts

Configured in the **Version Alerts** tab of each document.

**Alert Configuration:**
- Alert Type: Expiry Alert / Version Review Reminder
- Days Before Expiry: (e.g., 30, 15, 7)
- Alert Recipients: select users from list
- Alert Method: In-app notification + Email

**System Behaviour:**
- Background job (cron) runs daily and checks expiry dates.
- On expiry date: document auto-moves to Archived status.
- Alert emails sent at configured intervals before expiry.
- Document list shows expiry date column with visual indicator (red if expired, amber if within 30 days).

**User Stories:**
- As a CM Admin, I can configure expiry alerts on a document so that the team is notified before content becomes outdated.
- As a system, I auto-archive documents on their expiry date so expired content is not available for case responses.

### 6.11 Activity History per Document

Every document has an **Activity History** tab — a full audit trail at document level.

**Activity History Table Columns:**
- Date & Time
- User
- Action (Created / Edited / Checked-In / Checked-Out / Review Initiated / Reviewed / Approved / Published / Archived / Version Alert Set)
- Version
- Notes / Reason

**User Stories:**
- As a CM User, I can view the full activity history of a document so I have complete traceability of every action taken on it.

### 6.12 My Checkouts

Personal view accessible from CM Console > My Assignments > My Check-Out.

Shows all documents currently checked out by the logged-in user.

**Columns:** Document Name, Folder, Document Type, Version, Check-Out Date, Actions (Check-In, Discard)

### 6.13 Document Search & Filters (Browse Content)

The **Browse Content** top navigation item opens the Document Library — the agent-facing view of published content.

**Search Criteria Panel (collapsible):**
- Document Name (text)
- Folder (dropdown)
- Document Type (dropdown)
- Status (dropdown — for CM users; agents see Published only)
- MI Category / Sub-Category (dropdown)
- Product (dropdown)
- Activation Date range (from/to)
- Expiry Date range (from/to)
- Search Tags (text)

**Buttons:** Search / Clear / View All

**Results Table Columns:**
- Document Name
- Latest Version
- Status
- Expiry Date
- CI/CO indicator
- CO User (if checked out)
- Actions (View, Edit, Copy, Initiate Review, Publish, Archive — shown based on privilege)

**User Stories:**
- As a case agent, I can search published documents by product and MI category so I can quickly find the right response document for a case.
- As a CM User, I can filter documents by status so I can manage my content pipeline.

### 6.14 Document Copy

Available from document context menu (for users with `cm_author` privilege).

- Creates a new Draft document pre-filled with all attributes from the source document.
- New document gets a new Document ID.
- Version starts at 1.0.
- User can edit and proceed through normal lifecycle.

**User Stories:**
- As a CM Author, I can copy an existing document to create a similar one so I save time on re-entering common attributes.

---

## 7. Module 2: FAQs

### 7.1 Overview

FAQs are approved standard Q&A responses created based on general queries related to a product. They can be used as verbal or written responses in fulfilling a medical inquiry.

Only **Published** FAQs are available to:
- Central users (case agents)
- Mobile users
- Self Service Portal users

### 7.2 Pre-requisites (must exist before FAQ creation)

| Item | Where Configured | Required |
|---|---|---|
| Folders | CM Console > Configurations > Folders | Mandatory |
| Picklists (FAQ Categories) | Admin Console > Picklists | Optional |

### 7.3 FAQ Creation

**New FAQ Form Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Folder Name | Dropdown | Yes | Must exist in Configurations > Folders |
| FAQ Category | Dropdown | No | From Picklist |
| Activation Date | Date picker | No | |
| Expiry Date | Date picker | No | |
| Approval Required | Checkbox | No | If unchecked, goes directly to Published on Check-In |
| Question | Rich Text | Yes | The FAQ question |
| Answer | Rich Text | Yes | The FAQ answer |
| Verbatim | Text area | No | Exact verbatim phrasing if different from Answer |

**Tabs:**
1. General Attributes
2. Associated Documents
3. Version Alert

**Actions:** Save / Save & Check-In / Cancel

### 7.4 General Attributes

| Field | Type | Notes |
|---|---|---|
| MI Categories and Sub-Categories | Multi-checkbox tree | Drives MI category selection in case form when FAQ is selected |
| Product Specific | Checkbox | If checked, FAQ only appears when specific product is selected in case form |
| Products | Multi-select | Appears if Product Specific checked |
| Contact / Reporter Specific | Checkbox | FAQ appears only for specific contact/reporter type |
| Overwrite Folder Site Configuration | Checkbox | Override site-level settings |
| Source Document | Document link | Add reference source document |
| Source Attachments | File upload | Supporting files |
| FAQ Availability for Other Modules | Checkboxes | MIMS / Cover Letter / Standard Response Letter / MIMS on Mobile |
| Search Tags | Text | For search indexing per module |

### 7.5 FAQ Workflow

Same lifecycle as Documents: Create → Check-In → Review → Approve → Publish

If **Approval Required = unchecked**, the FAQ skips Review and Approval and goes directly to Published on Check-In.

**User Stories:**
- As a CM Author, I can create an FAQ with a question, answer, and associated product so it is available to agents during case fulfilment.
- As a case agent, I can see relevant FAQs in the case form when I select a specific product so I can provide accurate responses quickly.
- As a system, I make only Published FAQs available to portal and mobile users so unapproved content is never exposed.

---

## 8. Module 3: Merge Reports

### 8.1 Overview

Merge Reports are Word documents with merge fields that pull case data automatically during transmission. Published Merge Reports are available to:
- Case agents at Case Transmission Rules
- Administrators at Transmission Rules configuration

### 8.2 Merge Report Creation (Upload only — V1)

**New Merge Report Form:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Report Name | Text | Yes | |
| Report ID | Text | No | Auto-generated |
| Activation Date | Date picker | No | |
| Expiry Date | Date picker | No | |
| Approval Required | Checkbox | No | |
| Report File | File upload | Yes | DOC / DOCX format with merge fields |
| Output File Type | Dropdown | Yes | Word / PDF / Excel |
| Linked To AE | Checkbox | No | Links report to Adverse Events |
| Linked To PC | Checkbox | No | Links report to Product Complaints |
| Transmit as PDF | Checkbox | No | |
| Acknowledgement Not Required | Checkbox | No | |
| Acknowledgement Template | Dropdown | No | Select from Acknowledgment Templates |
| Site Specific | Checkbox | No | Restrict to specific sites |
| Search Tags | Text area | No | |
| Source Attachments | File upload | No | |

**Output Settings:**
| Field | Type | Notes |
|---|---|---|
| Append version number to file name | Checkbox | |
| Append date and time to file name | Checkbox | |
| Always include with MI XML | Checkbox | |
| Always include with AE XML | Checkbox | |
| Always include with PC XML | Checkbox | |
| Default Output Method | Dropdown | |
| Default Email Template | Dropdown | From Email Templates |

**Tabs:** General Attributes / Version Alerts

**Actions:** Save / Save & Check-In / Cancel

### 8.3 Merge Report Workflow

```
New Merge Report
      ↓
Upload Report File
      ↓
Save → My Checkouts (Draft)
Save & Check-In → Pending
      ↓
Approve / Publish
      ↓
Published as Version 1.0
```

- Merge Reports follow the same lifecycle but typically do not go through the full Review workflow (Review is optional).
- Admin user can make a Merge Report site-specific.

**User Stories:**
- As a CM Author, I can upload a merge report template with merge fields so it can be used in case transmissions to automatically populate case data.
- As a CM Admin, I can mark a merge report as site-specific so it only appears in transmission rules for that site.
- As a case agent, I can select a published merge report in transmission rules so case data is automatically merged and transmitted.

---

## 9. Module 4: Templates

### 9.1 Overview

Templates are pre-formatted text blocks that use case data via merge fields and placeholders. They are used across Response, Transmission, Correspondence, CDR, and Inbox modules.

**Key difference from Documents:** Templates do NOT go through the Create → Review → Approve → Publish lifecycle. They are created and set to Active/Inactive directly.

Templates are organised into **3 categories**:

```
Templates
├── Response Templates
│   ├── Standard Response Letter Formal (SRL)
│   │   ├── Opening Template
│   │   ├── Closing Template
│   │   └── Header/Footer
│   └── Cover Letter Format
│       ├── Opening Template
│       ├── Body Template
│       ├── Closing Template
│       └── Header/Footer
├── Email Templates
│   ├── Correspondences Template
│   │   ├── Compose Template
│   │   ├── Reply Template
│   │   └── Forward Template
│   ├── Response Email Template
│   ├── Transmission Email Template
│   └── CDR Email Template
└── Acknowledgment Templates
```

### 9.2 Response Templates

Used in the Response screen for case fulfilment.

**Create Response Template Form:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Template Name | Text | Yes | |
| Template Type | Dropdown | Yes | Opening / Closing / Body / Cover Letter / Header-Footer / Standard Response Letter / Mailing Label / Fulfillment Instructions / Fax Cover Letter |
| Status | Radio | Yes | Active / Inactive |
| Content | Rich Text Editor | Yes | Merge fields/placeholders supported |
| To / Cc / Bcc | Text | No | Placeholders from Merge Field Guide |
| Subject | Text | No | With placeholders |

**Template List Columns:** Template Name / Template Type / Status / Actions (Edit, Copy, Deactivate)

**User Stories:**
- As a CM Admin, I can create a response template with merge placeholders so agents have pre-formatted response letters ready to use.
- As a case agent, I can select a response template in the case response screen so I do not have to write responses from scratch.

### 9.3 Email Templates

Used across Inbox, Correspondence, and Transmission modules.

**Template Types and Usage:**

| Type | Used In |
|---|---|
| Compose Template | Correspondence — composing new emails from case |
| Reply Template | Inbox + Correspondence — replying to emails |
| Forward Template | Inbox + Correspondence — forwarding emails |
| Response Email Template | Case response screen |
| Transmission Template | Scheduled transmissions |
| CDR Template | On-demand Case Detail Reports sent via email |

**Create Email Template Form:**

| Field | Type | Required |
|---|---|---|
| Template Name | Text | Yes |
| Template Type | Dropdown | Yes |
| Status | Radio (Active/Inactive) | Yes |
| Subject | Text with placeholders | No |
| To / Cc / Bcc | Text with placeholders | No |
| Body | Rich Text Editor | Yes |

**User Stories:**
- As a CM Admin, I can create a transmission email template so that scheduled transmissions are sent with a consistent, pre-formatted email body.
- As a case agent, I can select a compose template when writing a new correspondence so I save time on formatting.

### 9.4 Acknowledgment Templates

Used by transmission recipients to acknowledge received transmissions back to MIMS.

**Create Acknowledgment Template Form:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Template Name | Text | Yes | |
| Status | Radio (Active/Inactive) | Yes | |
| Acknowledgement Link Text | Text | Yes | Clickable text in the email |
| Link Placing | Radio | Yes | Append to Email Body / Prepend to Email Body |
| Acknowledgement Website Text | Text area | Yes | Text shown on acknowledgment webpage |
| Acknowledgement Webpage Confirmation Button Label | Text | Yes | Button label on acknowledgment page |
| Flex Field Configuration | Table | No | Up to 3 flex fields — Visible, Field Name, Field Label, Required, Append To |
| Email Address Field Label | Text | No | Label for email field on acknowledgment page |
| Acceptable Domain | Text | No | Restrict to specific email domains |

**User Stories:**
- As a CM Admin, I can create an acknowledgment template so that transmission recipients can confirm receipt and provide a Safety Case ID back to MIMS.

---

## 10. Cross-Cutting Features

### 10.1 CM Console Navigation Structure

```
CM Console (accessible via setup icon or top nav)
├── SR Module (Documents)
│   └── Document Library (folder tree + document list)
├── Documents
│   └── Document Library
├── FAQs
│   └── FAQ Library
├── Merge Reports
│   └── Merge Report Library
├── Templates
│   ├── Response Templates
│   ├── Email Templates
│   └── Acknowledgment Templates
├── Configurations
│   ├── Folders
│   ├── Picklists
│   ├── Alerts
│   └── Others
└── My Assignments
    ├── All Check-Out
    ├── My Check-Out
    ├── Review Owner Task
    └── Reviewer Task
```

### 10.2 In-App Notifications for CM

Triggered by lifecycle events. Shown in MIMS notification centre.

| Event | Who Gets Notified |
|---|---|
| Review task assigned | Reviewer(s) |
| Reviewer completes review | Review Owner |
| Review closed, approval needed | Approver |
| Document approved, publish needed | Publisher |
| Document published | Document Owner + team |
| Document expiring in X days | Configured alert recipients |
| Document auto-archived on expiry | Document Owner |
| Forced check-in by admin | Original checkout user |

Email notifications sent for all the above events in addition to in-app.

### 10.3 Picklists for CM (Admin Console dependency)

The following picklist values must be configured in **Admin Console > Picklists** before CM can be fully used:

- FAQ Categories
- Document Categories
- Review Titles
- MI Categories and Sub-Categories (may already exist)

### 10.4 Content Usage Tracking (V2 — do not build in V1)

Track which documents/FAQs are used in which case responses. Feeds Analytics module.

### 10.5 Expiry Dashboard (V2 — do not build in V1)

Dashboard showing documents expiring in 30/60/90 days, content pending review > X days, recently archived.

### 10.6 Bulk Operations (V2 — do not build in V1)

Bulk assign reviewer, bulk archive, bulk update expiry dates.

### 10.7 Modular SRDs (Phase 3 — do not build in V1 or V2)

Many-to-many module-to-SRD composition. See feasibility discussion in stakeholder notes.

### 10.8 Real-Time Collaborative Editing (Phase 3)

Requires WebSocket infra + Y.js/CRDT. Not in V1 or V2.

### 10.9 Full Word-Compatible Editor (Phase 3)

OnlyOffice embed or equivalent. Not in V1 or V2.

---

## 11. Database Schema

> Rajeev — add all tables via the existing `db.js` migration pattern (safe ALTER TABLE or CREATE TABLE IF NOT EXISTS).

### New Tables Required

```sql
-- Folders
cm_folders (
  id, name, product_id, site_id, region, status, description,
  created_by, created_at, updated_at
)

-- Documents
cm_documents (
  id, system_doc_id, folder_id, document_type,
  document_name, document_id_custom,
  response_doc_type, cover_letter_text,
  file_path, file_type, content_html,
  status, latest_version, latest_published_version,
  activation_date, expiry_date, page_count,
  publish_as_pdf, send_as_pdf,
  document_category, search_tags,
  is_product_specific, is_contact_specific, is_site_specific,
  site_id, language,
  checked_out_by, checked_out_at,
  created_by, created_at, updated_at
)

-- Document Versions
cm_document_versions (
  id, document_id, version_number, status,
  file_path, content_html,
  created_by, created_at,
  published_at, archived_at, reason
)

-- Document MI Categories (junction)
cm_document_mi_categories (
  id, document_id, mi_category_id, mi_subcategory_id
)

-- Document Associated Docs (junction)
cm_document_associations (
  id, document_id, associated_document_id, association_type
)

-- Document Version Alerts
cm_document_alerts (
  id, document_id, alert_type, days_before, recipient_user_ids,
  created_by, created_at
)

-- Reviews
cm_reviews (
  id, document_id, document_version, review_title, review_description,
  planned_end_date, actual_end_date, status, is_non_amendable,
  review_owner_id, custom_email_message,
  auto_start, sequence_order,
  created_at, updated_at
)

-- Review Assignments
cm_review_assignments (
  id, review_id, reviewer_user_id,
  status, comments, reason,
  started_at, completed_at, created_at
)

-- FAQs
cm_faqs (
  id, system_faq_id, folder_id, faq_category,
  question, answer, verbatim,
  status, latest_version, latest_published_version,
  activation_date, expiry_date,
  approval_required,
  is_product_specific, is_contact_specific,
  overwrite_folder_site_config,
  search_tags,
  availability_mims, availability_cover_letter, availability_srl, availability_mobile,
  checked_out_by, checked_out_at,
  created_by, created_at, updated_at
)

-- FAQ Versions
cm_faq_versions (
  id, faq_id, version_number, status,
  question, answer, verbatim,
  created_by, created_at, published_at, archived_at
)

-- Merge Reports
cm_merge_reports (
  id, report_name, report_id_custom,
  activation_date, expiry_date, approval_required,
  file_path, file_type, output_file_type,
  linked_to_ae, linked_to_pc,
  transmit_as_pdf, acknowledgement_not_required,
  acknowledgement_template_id,
  is_site_specific, site_id,
  search_tags,
  append_version_to_name, append_datetime_to_name,
  include_with_mi_xml, include_with_ae_xml, include_with_pc_xml,
  default_output_method, default_email_template_id,
  status, latest_version,
  checked_out_by, checked_out_at,
  created_by, created_at, updated_at
)

-- Response Templates
cm_response_templates (
  id, template_name, template_type, status,
  subject, to_field, cc_field, bcc_field,
  content_html,
  created_by, created_at, updated_at
)

-- Email Templates
cm_email_templates (
  id, template_name, template_type, status,
  subject, to_field, cc_field, bcc_field,
  body_html,
  created_by, created_at, updated_at
)

-- Acknowledgment Templates
cm_ack_templates (
  id, template_name, status,
  ack_link_text, link_placing, ack_website_text,
  confirmation_button_label,
  email_address_field_label, acceptable_domains,
  flex_fields_json,
  created_by, created_at, updated_at
)

-- Activity History (all CM entities)
cm_activity_log (
  id, entity_type, entity_id, version,
  action, performed_by, notes, created_at
)
```

---

## 12. User Stories — Complete List

### Documents
1. As a CM Admin, I can create and manage folders so documents are organised by product.
2. As a CM Author, I can create a new document by uploading a file or using the rich text editor.
3. As a CM Author, I can save a document as a draft and continue editing later.
4. As a CM Author, I can check in a document so it becomes available for review.
5. As a CM Author, I can check out a document for exclusive editing.
6. As a CM Admin, I can force check-in a document if an author is unavailable.
7. As a CM Author, I can view all my checked-out documents in My Checkouts.
8. As a Review Owner, I can set up a review, assign reviewers, and set a planned end date.
9. As a Review Owner, I can enable Non-Amendable Review to restrict reviewers to comment-only.
10. As a Review Owner, I can send a custom email message to reviewers when initiating a review.
11. As a Reviewer, I receive email and in-app notification when assigned a review task.
12. As a Reviewer, I can open a document, read it, add comments, and set my review status.
13. As a Review Owner, I can view all reviewer statuses and comments and close the review.
14. As a Review Owner, I can send a document for re-review if any reviewer has rejected it.
15. As a Review Owner, I can transfer review ownership to another authorised user.
16. As a Review Owner, I can end a review to cancel it without completing.
17. As a Content Approver, I can approve a document with password and reason.
18. As a Content Publisher, I can publish an approved document with password and reason.
19. As a system, I auto-archive the previous published version when a new version is published.
20. As a system, I notify users of new content availability and old content expiry on publish.
21. As a CM User, I can view the full version history of any document.
22. As a CM User, I can view any historical version of a document in read-only mode.
23. As a CM Admin, I can configure expiry alerts with recipients and timing on a document.
24. As a system, I auto-archive a document on its expiry date.
25. As a system, I send expiry alert notifications at configured intervals.
26. As a CM User, I can view the full activity history of a document.
27. As a CM Author, I can copy an existing document to create a similar one.
28. As a case agent, I can search published documents by product, category, and tags via Browse Content.
29. As a CM User, I can filter documents by status, folder, type, and date range.

### FAQs
30. As a CM Author, I can create a FAQ with question, answer, category, and product association.
31. As a CM Author, I can mark a FAQ as product-specific so it appears in the case form only for that product.
32. As a CM Author, I can associate MI categories with a FAQ so it drives category selection in the case form.
33. As a case agent, I can see relevant published FAQs in the case form based on selected product.
34. As a system, I make only Published FAQs available to portal, mobile, and SSP users.
35. As a CM Author, I can create a FAQ without approval workflow by leaving Approval Required unchecked.

### Merge Reports
36. As a CM Author, I can upload a merge report template file with merge fields.
37. As a CM Author, I can configure output file type, AE/PC links, and transmission defaults.
38. As a CM Admin, I can mark a merge report as site-specific.
39. As a case agent, I can select a published merge report in transmission rules.
40. As a system, I auto-populate case data into the merge report fields on transmission.

### Templates
41. As a CM Admin, I can create a response template with merge placeholders and assign a type.
42. As a case agent, I can select a response template in the response screen.
43. As a CM Admin, I can create email templates for compose, reply, forward, transmission, and CDR.
44. As a CM Admin, I can create acknowledgment templates for email-based transmission acknowledgments.
45. As a transmission recipient, I can click an acknowledgment link in a received email and provide my Safety Case ID back to MIMS.

### Cross-Cutting
46. As a CM User, I receive in-app and email notifications for all workflow events relevant to my role.
47. As a CM Admin, I can configure CM-related picklist values (FAQ categories, document categories, review titles).

---

## 13. V1 vs Phase Breakdown

### V1 — Build Now
- [ ] Folder Management (create, edit, inactivate)
- [ ] Document Library (list, search, filter, folder tree)
- [ ] Document Creation — File Upload
- [ ] Document Creation — Rich Text Editor (TipTap Core)
- [ ] Document Attributes (all tabs)
- [ ] Check-In / Check-Out
- [ ] My Checkouts view
- [ ] Review Workflow (parallel non-real-time, comments, statuses)
- [ ] Review Owner Task view
- [ ] Reviewer Task view
- [ ] Content Approval (password + reason)
- [ ] Content Publish (password + reason, auto-archive)
- [ ] Version History view
- [ ] Expiry & Version Alerts (cron job + notifications)
- [ ] Activity History per document
- [ ] Document Copy
- [ ] FAQ Module (create, workflow, publish)
- [ ] Merge Report Module (upload, configure, publish)
- [ ] Response Templates (create, list, edit)
- [ ] Email Templates (create, list, edit)
- [ ] Acknowledgment Templates (create, list, edit)
- [ ] In-App + Email Notifications for all CM events
- [ ] CM Console navigation structure
- [ ] Browse Content page (agent-facing search)

### V2 — Next Phase
- [ ] Content Usage Tracking (which docs used in which cases)
- [ ] Expiry Dashboard (content health view)
- [ ] Bulk Operations (assign, archive, expiry update)
- [ ] Version Compare (diff between two versions)

### Phase 3 — Future
- [ ] Modular SRDs (many-to-many modules)
- [ ] Real-Time Collaborative Editing (WebSocket + Y.js)
- [ ] Full Word-compatible editor (OnlyOffice embed)
- [ ] 3rd Party CMS Integration (Vault MedComms, SharePoint, Documentum)

---

## 14. Navigation Entry Points

| Entry Point | What It Opens |
|---|---|
| **Browse Content** (top navbar) | Document Library — agent-facing, Published docs only |
| **Setup Icon > CM Console** | Full CM Console — all modules, configurations, assignments |
| **Inbox → Reviewer Task** | Reviewer's task list (also accessible from CM Console > My Assignments) |

---

## 15. What Rajeev Needs to Start — Checklist

Before writing any code, confirm:

- [ ] Read this entire document
- [ ] Read `project_session_handoff.md` in memory for project context
- [ ] File: `mims/frontend/src/modules/content/pages/ContentPage.jsx` — currently a blank stub. This becomes the CM Console entry point.
- [ ] File uploads go to `mims/backend/uploads/cm_documents/` — create directory if needed
- [ ] All new DB tables added in `mims/backend/database/db.js` using safe migration pattern
- [ ] New backend routes go in `mims/backend/routes/content/` (new directory)
- [ ] New frontend pages go in `mims/frontend/src/modules/content/`
- [ ] CSS prefix for CM module: `cm-` (already used in Admin Console — pick something like `cmc-` to avoid conflict)
- [ ] Role/privilege checks: use placeholder `user.privileges.includes('cm_author')` etc. until User Management sprint confirms mappings
- [ ] TipTap Core installation: `npm install @tiptap/react @tiptap/pm @tiptap/starter-kit` in frontend
- [ ] Run `npm run build` after every non-trivial change — 0 errors required before marking any story done

**Start sequence recommendation:**
1. DB migrations (all cm_ tables)
2. Folder Management (simple CRUD — unblocks everything else)
3. Document Library shell + file upload + attributes form
4. Check-In / Check-Out + My Checkouts
5. Review Workflow (Owner + Reviewer tasks)
6. Approval + Publish + auto-archive
7. Version History + Activity History
8. Expiry alerts (cron)
9. FAQ module (reuses most of document workflow)
10. Merge Reports module
11. Templates (standalone CRUD, no workflow)
12. Browse Content page (agent view)
13. Notifications
