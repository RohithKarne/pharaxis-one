# Pharaxis QMS — End-to-End Feature Testing Guide

> **Audience:** QA / Rohith  
> **Purpose:** Step-by-step navigation and use-case verification for every feature in Pharaxis QMS.  
> **Date:** 2026-05-04  
> **Flagged gaps for Varun:** See ⚠️ markers inline.

---

## Environment

| Item | Value |
|------|-------|
| Frontend URL | `http://localhost:3146` |
| Backend URL | `http://localhost:3145` |
| Org Code | `PHA_DEV` |
| SuperAdmin login | `http://localhost:3146/superadmin/login` |

## Credentials

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin | `admin@pharaxis.local` | `Admin@123` | Full access to all modules |
| QA Reviewer | `qareviewer@pharaxis.local` | `QaReviewer@123` | Read/write on quality modules |
| SuperAdmin | `superadmin@pharaxis.local` | `Manager@123` | Platform-level superadmin |

> **Login flow:** Enter email → password → OTP (check backend console for `devOtp` in dev mode) → authenticated.

---

## FEATURE 1 — Authentication & Login

### Use Case 1.1 — Standard Login (OTP Flow)

1. Open `http://localhost:3146`
2. You land on the **Login page** → enter:
   - Email: `admin@pharaxis.local`
   - Password: `Admin@123`
3. Click **Continue** / **Login**
4. A challenge step appears — enter the OTP (in dev mode, the OTP is logged to the backend console — look for `devOtp`)
5. Enter the OTP and submit

**Expected:**
- ✅ Redirect to Dashboard `/dashboard`
- ✅ Left sidebar navigation visible with all QMS modules
- ✅ User name shown in top bar or sidebar footer

⚠️ **Varun:** In production the OTP goes to email. In dev mode, confirm `devOtp` is always printed to the backend console so testers can log in.

---

### Use Case 1.2 — Wrong Password

1. Enter correct email, wrong password
2. Submit

**Expected:** Error shown — "Invalid credentials." No OTP step reached.

---

### Use Case 1.3 — Wrong OTP

1. Complete email + password step correctly
2. Enter a wrong OTP (e.g., `000000`)

**Expected:** Error — "Invalid OTP" or "OTP expired." User stays on OTP screen.

---

### Use Case 1.4 — SuperAdmin Login

1. Navigate to `http://localhost:3146/superadmin/login`
2. Enter: `superadmin@pharaxis.local` / `Manager@123`
3. Complete OTP challenge

**Expected:** Redirect to `/superadmin` — SuperAdmin console loads with org management tools.

---

### Use Case 1.5 — RBAC Check (QA Reviewer Access)

1. Log in as `qareviewer@pharaxis.local`
2. Navigate around — verify they can read all quality modules
3. Try to access SuperAdmin page `/superadmin`

**Expected:** Redirected away from superadmin. QA reviewer can read quality modules but cannot perform admin operations.

---

### Use Case 1.6 — Logout

1. Log in as any user
2. Find the **Logout** button (usually in sidebar footer or top-right avatar)
3. Click Logout

**Expected:** Session cleared, redirect to `/login`.

---

## FEATURE 2 — Dashboard

**URL:** `http://localhost:3146/dashboard`  
**Access:** All authenticated roles

### Use Case 2.1 — Dashboard Overview

1. Log in as Admin
2. You are on `/dashboard` (default redirect after login)

**Verify all sections:**
- ✅ **Summary Cards** (6 tiles): Controlled Documents, Open CAPAs, Open Deviations, Active Audits, Validation Systems, Change Requests
- ✅ **Compliance Alerts** panel: "X records require approval", "X CAPA records carry due-date sensitivity"
- ✅ **My Tasks** table: shows open CAPAs and Change Requests assigned to user
- ✅ **Task filter** input: type a code or title to narrow down my tasks list
- ✅ **Last Loaded At** timestamp shown

---

### Use Case 2.2 — My Tasks Filter

1. On the Dashboard, in the My Tasks section, type `CAP` in the filter box

**Expected:** Only CAPA type tasks shown. Clears when filter removed.

---

### Use Case 2.3 — Compliance Alert Accuracy

1. Ensure there are some open CAPAs in the system (Feature 4)
2. Return to Dashboard
3. The Open CAPAs tile count should reflect the current number

**Expected:** Tile counts are accurate, not cached stale values.

---

## FEATURE 3 — Document Control

**URL:** `http://localhost:3146/document-control`  
**Access:** All roles (read); write requires appropriate role

### Use Case 3.1 — View Document List

1. Navigate to `/document-control`

**Expected:**
- ✅ Header: "Document Control" with "New Document" button
- ✅ Table columns: Code, Title, Type, Department, Criticality, Version, Next Review, Status
- ✅ Status badges color-coded: Draft (grey), Review (blue), Approved (indigo), Effective (green), Retired (slate)
- ✅ Criticality badges: Critical (red), High (orange), Medium (amber), Low (green)
- ✅ Clicking a row → navigates to `/document-control/:id`

---

### Use Case 3.2 — Create a New Document

1. Click **New Document** button (top right)
2. Slide-in drawer opens from the right
3. Fill in:
   - **Title:** `Test SOP - Quality Procedures`
   - **Document Type:** `SOP`
   - **Subtype:** `Manufacturing` (optional)
   - **Department:** `Quality`
   - **Criticality:** `High`
   - **Review Interval (days):** `365`
   - **Site Code:** `SITE-01` (optional)
   - **Content Summary:** `Standard operating procedures for quality checks`
   - **Reason for Change:** `Initial creation`
   - **Training Required:** ✓ checked
   - **Controlled Copy Required:** ✓ checked
4. Click **Create Document**

**Expected:**
- ✅ Drawer closes
- ✅ New document appears in the list with a generated `DOC-XXXX` code
- ✅ Status = `Draft`
- ✅ Criticality badge = `High` (orange)

---

### Use Case 3.3 — Open Document Detail Page

1. Click any document row in the list
2. Navigate to `/document-control/:id`

**Verify on the detail page:**
- ✅ **RecordHeader**: breadcrumb (Document Control > DOC-XXXX), lifecycle stepper (Draft → Review → Approved → Effective → Retired)
- ✅ **Left sidebar** with section groups: Document Content (Versions, Periodic Reviews), Distribution & Access (Distribution Targets, Access Policies), Summary & Conclusions (Timeline), Related Processes
- ✅ **Right content area** with metadata: document_type, department, criticality, owner, version, next review date
- ✅ **Training Required** badge if checked
- ✅ Lifecycle stepper shows current state highlighted

---

### Use Case 3.4 — Document Versions Panel

1. On Document Detail, click **Versions** in the sidebar
2. Panel expands/navigates to the Versions section

**Expected:**
- ✅ Table of all versions: Version No, Status, Author, Created At
- ✅ At least version 1.0 present (created when document was first saved)

⚠️ **Varun:** Confirm version record is auto-created in the backend when a new document is created via POST `/document-control/documents`.

---

### Use Case 3.5 — Document Timeline

1. On Document Detail, scroll to **Timeline** section (Summary & Conclusions → Timeline)

**Expected:**
- ✅ Chronological list of events: document created, status transitions, reviews
- ✅ Each event: event_type, to_status, actor_name, event_at timestamp

---

### Use Case 3.6 — Lifecycle: Transition Document to Review

1. On Document Detail, click **Submit for Review** action button in the RecordHeader toolbar
2. Confirm the action

**Expected:**
- ✅ Lifecycle stepper advances: Draft → Review highlighted
- ✅ Status badge on list view updates to `Review`
- ✅ Timeline event logged

⚠️ **Varun:** Action buttons in RecordHeader (`@action` handler) need to be wired to the appropriate API call (`PATCH /document-control/documents/:id/status`). Confirm these are not just stubs.

---

## FEATURE 4 — CAPA (Corrective and Preventive Actions)

**URL:** `http://localhost:3146/capa`  
**Access:** All roles (read); write requires `qa_reviewer` or above

### Use Case 4.1 — View CAPA List

1. Navigate to `/capa`

**Expected:**
- ✅ Header: "CAPAs" with **New CAPA** button
- ✅ Table columns: Code, Title, Source, Classification, Risk Band, Department, Due Date, Status
- ✅ Status badges: Open (blue), Investigation (amber), RCA (purple), EffectivenessCheck (indigo), Closed (green)
- ✅ Each row clickable → `/capa/:id`

---

### Use Case 4.2 — Create a New CAPA

1. Click **New CAPA**
2. Slide-in drawer opens
3. Fill in:
   - **Title:** `Supplier Deviation CAPA`
   - **Source:** `SupplierAudit`
   - **Classification:** `Major`
   - **Risk Band:** `High`
   - **Department:** `Quality`
   - **Due Date:** *(pick a future date)*
   - **Description:** `Root cause analysis for supplier material deviation`
4. Click **Create CAPA**

**Expected:**
- ✅ New CAPA with code `CAP-XXXX` appears in the list
- ✅ Status = `Open`

---

### Use Case 4.3 — Open CAPA Detail Page

1. Click any CAPA row
2. Navigate to `/capa/:id`

**Verify:**
- ✅ RecordHeader with CAPA lifecycle stepper: Open → Investigation → RCA → EffectivenessCheck → Closed
- ✅ Left sidebar: Investigation & Root Cause, Linked Records (Deviations, Complaints, NCRs), Actions & Effectiveness, Related Processes
- ✅ Summary card: source, classification, risk band, department, due date
- ✅ Action toolbar buttons: Submit for Investigation, Close, etc.

---

### Use Case 4.4 — Linked Deviations Panel

1. On CAPA Detail, open **Linked Deviations** related records panel

**Expected:**
- ✅ Shows any deviations linked to this CAPA
- ✅ **Link Deviation** button to add a deviation reference

---

## FEATURE 5 — Deviations

**URL:** `http://localhost:3146/deviations`  
**Access:** All roles (read); write requires `qa_reviewer` or above

### Use Case 5.1 — View Deviation List

1. Navigate to `/deviations`

**Expected:**
- ✅ Header: "Deviations" with **New Deviation** button
- ✅ Table columns: Code, Title, Type, Classification, Department, Due Date, Status
- ✅ Classification badges: Critical (red), Major (orange), Minor (amber), Observation (green)
- ✅ Status badges: Open (blue), Investigation (amber), QaReview (purple), CapaLinked (indigo), Closed (green)
- ✅ Clicking row → `/deviations/:id`

---

### Use Case 5.2 — Create a New Deviation

1. Click **New Deviation**
2. Drawer opens — fill in:
   - **Title:** `Process Temperature Deviation`
   - **Description:** `Batch temperature exceeded limit by 2°C during manufacturing`
   - **Type:** `Process`
   - **Classification:** `Major`
   - **Department:** `Manufacturing`
   - **Date of Occurrence:** *(today or yesterday)*
   - **Due Date:** *(30 days from now)*
3. Click **Create Deviation**

**Expected:**
- ✅ `DEV-XXXX` code assigned
- ✅ Status = `Open`
- ✅ Appears in list

---

### Use Case 5.3 — Open Deviation Detail Page

1. Click a deviation row
2. Navigate to `/deviations/:id`

**Verify:**
- ✅ RecordHeader: lifecycle stepper Open → Investigation → QaReview → CapaLinked → Closed
- ✅ Left sidebar: Investigation & Root Cause (CAPA Links), Impact & Containment (Containment Actions), Related Processes
- ✅ Summary card: deviation_type, classification, department, date_of_occurrence, due_date

---

### Use Case 5.4 — Link CAPA from Deviation

1. On Deviation Detail, go to CAPA Links panel
2. Click **Link CAPA**
3. Select an existing CAPA from the list
4. Confirm

**Expected:** CAPA appears in the linked list. Deviation status may advance to `CapaLinked`.

⚠️ **Varun:** Verify the link CAPA API endpoint exists and the status transition is triggered server-side.

---

## FEATURE 6 — Audits

**URL:** `http://localhost:3146/audits`  
**Access:** All roles (read); write requires `qa_reviewer` or above

### Use Case 6.1 — View Audit List

1. Navigate to `/audits`

**Expected:**
- ✅ Header: "Audits" with **New Audit** button
- ✅ Table columns: Code, Title, Type, Planned Date, Findings (x/y), Status
- ✅ Status badges: Planned (blue), Active (amber), FindingsReview (purple), Closed (green)
- ✅ Findings column shows `open/total` counts (e.g., `3/5`)
- ✅ Clicking row → `/audits/:id`

---

### Use Case 6.2 — Create a New Audit

1. Click **New Audit**
2. Drawer opens — fill in:
   - **Title:** `Annual Supplier Audit 2026`
   - **Audit Type:** `Supplier`
   - **Department:** `Quality`
   - **Lead Auditor:** *(your user or any name)*
   - **Planned Date:** *(future date)*
   - **Scope:** `Full process audit for primary API supplier`
3. Click **Create Audit**

**Expected:**
- ✅ `AUD-XXXX` code assigned
- ✅ Status = `Planned`

---

### Use Case 6.3 — Open Audit Detail Page

1. Click an audit row → `/audits/:id`

**Verify:**
- ✅ Lifecycle stepper: Planned → Active → FindingsReview → Closed
- ✅ Left sidebar: Audit Execution (Findings, Audit Binder), Follow-Up Actions (CAPAs), Related Processes
- ✅ Summary: audit_type, lead_auditor, planned_date, scope

---

### Use Case 6.4 — Add a Finding

1. On Audit Detail, go to **Findings** panel
2. Click **Add Finding** (or **New Finding** button)
3. Enter: Description, Severity (Major/Minor/Critical/Observation), Reference
4. Save

**Expected:** Finding appears in the list. Total finding count increases. Open count = total until finding is resolved.

---

### Use Case 6.5 — Link CAPA to Finding

1. In the Findings panel, find an open finding
2. Click **Link CAPA** on that finding
3. Select an existing CAPA or create a new one

**Expected:** CAPA linked to the finding. Finding status updates.

---

## FEATURE 7 — Change Control

**URL:** `http://localhost:3146/change-control`  
**Access:** All roles (read); write requires `qa_reviewer` or above

### Use Case 7.1 — View Change Control List

1. Navigate to `/change-control`

**Expected:**
- ✅ Header: "Change Control" with **New Change Request** button
- ✅ Table columns: Code, Title, Type, Risk Level, CAB, Planned Start, Steps (x/y), Status
- ✅ Status badges: Draft, PendingApproval, Approved, Implemented, Closed
- ✅ CAB column shows Yes/No
- ✅ Steps shows `completed/total`
- ✅ Clicking row → `/change-control/:id`

---

### Use Case 7.2 — Create a New Change Request

1. Click **New Change Request**
2. Drawer opens — fill in:
   - **Title:** `Upgrade HPLC System Firmware`
   - **Type:** `Equipment`
   - **Risk Level:** `High`
   - **Department:** `QC Lab`
   - **Planned Start Date:** *(future date)*
   - **Description:** `Firmware upgrade for HPLC-001 to version 4.2`
   - **CAB Required:** ✓ checked
3. Click **Create Change**

**Expected:**
- ✅ `CHG-XXXX` code assigned
- ✅ Status = `Draft`

---

### Use Case 7.3 — Open Change Control Detail

1. Click a change row → `/change-control/:id`

**Verify:**
- ✅ Lifecycle stepper: Draft → PendingApproval → Approved → Implemented → Closed
- ✅ Left sidebar: Impact & Planning (Impact Assessment, Implementation Steps), Approvals (CAB Review, Approvals), Related Records (Deviations, CAPAs), Related Processes
- ✅ Summary card: type, risk_level, department, planned_start, cab_required
- ✅ Steps progress indicator

---

### Use Case 7.4 — Add Implementation Steps

1. On Change Control Detail, go to **Implementation Steps** panel
2. Click **Add Step**
3. Enter: Step name, description, assignee, sequence number
4. Save

**Expected:** Step appears in list. Steps counter (x/y) on list view updates.

---

## FEATURE 8 — Complaints

**URL:** `http://localhost:3146/complaints`  
**Access:** All roles (read); write requires `qa_reviewer` or above

### Use Case 8.1 — View Complaints List

1. Navigate to `/complaints`

**Expected:**
- ✅ Header: "Complaints" with **New Complaint** button
- ✅ Table columns: Code, Summary, Source, Severity, Customer, Due Date, Status
- ✅ Severity badges: Critical (red), High (orange), Medium (amber), Low (green)
- ✅ Status badges: Open (blue), Investigation (amber), Dispositioned (purple), Closed (green)
- ✅ Clicking row → `/complaints/:id`

---

### Use Case 8.2 — Create a New Complaint

1. Click **New Complaint**
2. Drawer opens — fill in:
   - **Summary:** `Product labeling error reported by customer`
   - **Source:** `Customer`
   - **Severity:** `High`
   - **Customer:** `Novartis Distribution AG`
   - **Due Date:** *(30 days from now)*
   - **Description:** `Customer reports incorrect dosage printed on batch 2024-B01`
3. Click **Create Complaint**

**Expected:**
- ✅ `CMP-XXXX` code assigned
- ✅ Status = `Open`
- ✅ Appears in list with correct severity badge

---

### Use Case 8.3 — Open Complaint Detail

1. Click a complaint row → `/complaints/:id`

**Verify:**
- ✅ Lifecycle stepper: Open → Investigation → Dispositioned → Closed
- ✅ Left sidebar: Investigation (CAPA Links), Customer Communication (Notes), Related Processes
- ✅ Summary: source, severity, customer, due_date

---

## FEATURE 9 — Nonconformances

**URL:** `http://localhost:3146/nonconformance`  
**Access:** All roles (read); write requires `qa_reviewer` or above

### Use Case 9.1 — View Nonconformance List

1. Navigate to `/nonconformance`

**Expected:**
- ✅ Header: "Nonconformances" with **New Nonconformance** button
- ✅ Table columns: Code, Summary, Source, Severity, Item Reference, Due Date, Status
- ✅ Severity badges color-coded
- ✅ Status badges: Open, Containment, Dispositioned, CapaLinked, Closed
- ✅ Clicking row → `/nonconformance/:id`

---

### Use Case 9.2 — Create a New Nonconformance

1. Click **New Nonconformance**
2. Drawer opens — fill in:
   - **Summary:** `Raw material particle size out of spec`
   - **Source Type:** `Incoming Inspection`
   - **Severity:** `Critical`
   - **Item Reference:** `RM-2024-Lot-005`
   - **Due Date:** *(2 weeks from now)*
3. Click **Create Nonconformance**

**Expected:**
- ✅ `NCR-XXXX` code assigned
- ✅ Status = `Open`

---

### Use Case 9.3 — Open Nonconformance Detail

1. Click an NCR row → `/nonconformance/:id`

**Verify:**
- ✅ Lifecycle: Open → Containment → Dispositioned → CapaLinked → Closed
- ✅ Left sidebar: Investigation & Actions (CAPA Links), Related Processes
- ✅ Summary: source_type, severity, disposition, item_reference, CAPA links count

---

### Use Case 9.4 — Link CAPA to NCR

1. On NCR Detail, go to CAPA Links panel
2. Click **Link CAPA**, select an existing CAPA

**Expected:** CAPA linked. NCR status may advance to `CapaLinked`.

---

## FEATURE 10 — Supplier Quality

**URL:** `http://localhost:3146/supplier-quality`  
**Access:** All roles (read); write requires `qa_reviewer`, `admin`, or `superadmin`

### Use Case 10.1 — View Supplier List

1. Navigate to `/supplier-quality`

**Expected:**
- ✅ Header: "Supplier Quality" with **New Supplier** button
- ✅ Table columns: Code, Supplier Name, Type, Risk Level, Contact, Approved, Qualification
- ✅ Qualification badges: Qualified (green), Conditional (amber), Pending (blue), Disqualified (red)
- ✅ Risk Level badges: Critical (red), High (orange), Medium (amber), Low (green)
- ✅ Clicking row → `/supplier-quality/:id`

---

### Use Case 10.2 — Create a New Supplier

1. Click **New Supplier**
2. Drawer opens — fill in:
   - **Supplier Name:** `BioMat Chemicals Ltd`
   - **Supplier Type:** `RawMaterial`
   - **Contact Email:** `quality@biomat.com`
   - **Risk Level:** `High`
   - **Initial Status:** `Pending`
3. Click **Create Supplier**

**Expected:**
- ✅ `SUP-XXXX` code assigned
- ✅ Qualification = `Pending`

---

### Use Case 10.3 — Open Supplier Detail

1. Click a supplier row → `/supplier-quality/:id`

**Verify:**
- ✅ Lifecycle stepper: Pending → Qualified → Conditional → Disqualified
- ✅ Left sidebar: Performance (Supplier Audits, SCARs), Related Processes
- ✅ Summary: supplier_type, risk_level, contact_email, approval date (if any)

**Note:** The detail page loads by fetching all suppliers client-side and filtering by ID — this is expected behavior since the backend doesn't have an individual supplier endpoint.

---

### Use Case 10.4 — View Supplier Audits

1. On Supplier Detail, navigate to **Supplier Audits** panel

**Expected:**
- ✅ List of audits conducted for this supplier (from the `supplier_audits` table filtered by supplier_id)
- ✅ Each audit: audit date, auditor, outcome, findings count

---

### Use Case 10.5 — View SCARs for Supplier

1. On Supplier Detail, navigate to **SCARs** panel

**Expected:**
- ✅ Supplier Corrective Action Requests linked to this supplier
- ✅ Each SCAR: code, title, status, due date

---

## FEATURE 11 — Risk Management

**URL:** `http://localhost:3146/risk-management`  
**Access:** All roles (read)

### Use Case 11.1 — View Risk Register

1. Navigate to `/risk-management`

**Expected:**
- ✅ Header: "Risk Management" with **New Risk** button (if write access)
- ✅ Table or grid of risks with: Code, Title, Category, Likelihood, Impact, Risk Score, Status
- ✅ Risk score color: Red = High/Critical (≥15), Amber = Medium (8–14), Green = Low (≤7)

---

### Use Case 11.2 — Create a New Risk

1. Click **New Risk** (admin/qa_reviewer)
2. Fill in:
   - **Title:** `API Supplier Single-Source Dependency`
   - **Category:** `Supply Chain`
   - **Likelihood:** `4` (out of 5)
   - **Impact:** `5` (out of 5)
   - **Mitigation:** `Qualify secondary supplier within 6 months`
3. Click **Create**

**Expected:**
- ✅ Risk score = 20 (Critical)
- ✅ Red badge on Risk Score

---

### Use Case 11.3 — Verify Risk Score Formula

1. Create a risk with Likelihood=2, Impact=3
2. Expected Risk Score = 6 (Low, green badge)

---

## FEATURE 12 — Training Management

**URL:** `http://localhost:3146/training-management`  
**Access:** All roles (read)

### Use Case 12.1 — View Training Records

1. Navigate to `/training-management`

**Expected:**
- ✅ Header: "Training Management"
- ✅ Table of training records: Employee, Document/Course, Completion Date, Status (Assigned/Completed/Overdue)

---

### Use Case 12.2 — Create a Training Assignment

1. Click **New Training** or **Assign Training**
2. Select:
   - **Employee/User:** *(pick from list)*
   - **Document:** *(pick a controlled document)*
   - **Due Date:** *(future date)*
3. Click **Assign**

**Expected:** Training record created with status `Assigned`.

---

### Use Case 12.3 — Mark Training Complete

1. Find an assigned training record
2. Click **Mark Complete**
3. Confirm

**Expected:** Status updates to `Completed` with completion timestamp.

---

## FEATURE 13 — Validation (Computerized System Validation)

**URL:** `http://localhost:3146/validation`  
**Access:** All roles (read)

### Use Case 13.1 — View Validation Systems

1. Navigate to `/validation`

**Expected:**
- ✅ Header: "Validation"
- ✅ Table of validated systems: System Name, Category (CSV/Spreadsheet/Other), Validation Status, Last Validated Date
- ✅ Validation Status badges: Draft, InProgress, Validated, Retired

---

### Use Case 13.2 — Create a Validation System

1. Click **New System**
2. Fill in:
   - **System Name:** `LIMS - Laboratory Information System`
   - **Category:** `CSV`
   - **Description:** `Manages lab sample tracking and results`
3. Click **Create**

**Expected:** System appears with status `Draft`.

---

### Use Case 13.3 — Open Validation System Detail

1. Click a system row (if detail page exists)

**Expected:**
- ✅ Validation lifecycle: Draft → InProgress → Validated → Retired
- ✅ Validation documents: IQ, OQ, PQ protocols linked
- ✅ Test execution summary

⚠️ **Varun:** Confirm a Validation detail page (`/validation/:id`) exists and is routed. The router currently shows only the list view at `/validation`. If detail view exists, add the route.

---

## FEATURE 14 — Management Review

**URL:** `http://localhost:3146/management-review`  
**Access:** Admin, QA Reviewer

### Use Case 14.1 — View Management Reviews

1. Navigate to `/management-review`

**Expected:**
- ✅ Header: "Management Review"
- ✅ List of management review meetings: Review Date, Agenda Topics, Participants, Status (Planned/Completed)

---

### Use Case 14.2 — Create a Management Review

1. Click **New Review**
2. Fill in:
   - **Review Date:** *(future date)*
   - **Period:** `Q1 2026`
   - **Chair:** `Rohith Karne`
   - **Agenda:** `CAPA status, Deviation trends, Audit findings, Quality objectives`
3. Click **Create**

**Expected:** Management Review record created with status `Planned`.

---

### Use Case 14.3 — Add Minutes/Outcomes to a Review

1. Open a completed management review
2. Add meeting outcomes/minutes
3. Save

**Expected:** Outcomes saved and visible on the record.

---

## FEATURE 15 — Quality Events Hub (Platform Intelligence)

**URL:** `http://localhost:3146/event-hub`  
**Access:** All roles

### Use Case 15.1 — View Event Hub

1. Navigate to `/event-hub`

**Expected:**
- ✅ Header: "Quality Events Hub" with **Refresh** button
- ✅ **5 Stat Tiles** (clickable): Deviations (amber), CAPAs (cyan), Complaints (rose), Nonconformances (purple), Risks (red) — each shows total count
- ✅ Clicking a tile selects that module and updates the status distribution chart below

---

### Use Case 15.2 — Status Distribution Chart

1. Click **Deviations** tile
2. Below: "Deviations — Status Distribution" with `Total: X`
3. Each status shown as a horizontal progress bar with count + percentage

**Expected:** Progress bars render proportionally. Colors cycle through indigo, amber, green, rose, cyan, purple.

---

### Use Case 15.3 — CAPA Status Mix (Right Panel)

1. On the right panel, see **CAPA Status Mix** mini-table
2. Shows each CAPA status and its count

---

### Use Case 15.4 — Risk Status Mix (Right Panel)

1. Below CAPA Status Mix, see **Risk Status Mix** mini-table

---

### Use Case 15.5 — Refresh Data

1. Click the **Refresh** button in the header

**Expected:** All stat tiles and status distributions reload fresh data from the backend.

---

## FEATURE 16 — AI Quality Insights (Platform Intelligence)

**URL:** `http://localhost:3146/quality-insights`  
**Access:** All roles

### Use Case 16.1 — View Quality Insights

1. Navigate to `/quality-insights`
2. Page auto-loads on mount — waits for response from `/intelligence/quality-insights`

**Expected:**
- ✅ Header: "AI Quality Insights" with **Refresh** button
- ✅ Loading spinner shows while generating
- ✅ Once loaded: **4 Highlight Tiles**: Overdue SCARs (red), High/Critical Risks (orange), Generated timestamp tile

---

### Use Case 16.2 — Narrative Brief

1. In the Narrative Brief card, bullet points summarize the quality state

**Expected:**
- ✅ 3–5 bullet points describing quality trends in plain language
- ✅ Each bullet has an indigo dot indicator

---

### Use Case 16.3 — Leading Indicators

1. In the Leading Indicators card:
   - **Complaint Severity** — shows top complaint severity buckets with totals
   - **Nonconformance Sources** — shows top NC source types with counts

---

### Use Case 16.4 — Weekly Trends

1. In the Weekly Trends section (3-column grid):
   - **Deviations by Week** — last 4 weeks of deviation counts
   - **CAPAs by Week** — last 4 weeks of CAPA counts
   - **Complaints by Week** — last 4 weeks of complaint counts

**Expected:** Each column shows dated week buckets with totals. Shows "No data." if empty.

---

### Use Case 16.5 — Insight Cache History

1. If the cache table is shown below Weekly Trends, it lists previously generated insight snapshots

**Expected:**
- ✅ Table: `insight_key` column (monospace), `Generated At` column with formatted date
- ✅ If no cached items, the table section is hidden

---

### Use Case 16.6 — Refresh Insights

1. Click **Refresh** in the header

**Expected:** All insight panels reload with fresh AI-generated data. Loading spinner shows during generation.

⚠️ **Varun:** Confirm the AI insights backend (`GET /intelligence/quality-insights`) is connected to an active AI/LLM service. If not, it should return a mock/generated payload with no error.

---

## FEATURE 17 — Workflow Inbox

**URL:** `http://localhost:3146/workflow-inbox`  
**Feature Flag:** Must be enabled via `featureFlags.workflowInbox = true`  
**Access:** All roles

### Use Case 17.1 — Access Workflow Inbox

1. Navigate to `/workflow-inbox`

**Expected:**
- ✅ If feature flag is ON: Inbox loads with list of pending workflow tasks for the current user
- ✅ If feature flag is OFF: Redirect to the first accessible module (dashboard)

⚠️ **Varun:** Verify feature flag `workflowInbox` is configured in `featureFlags.js`. If the inbox route exists but the flag is off, users will be silently redirected — add a notice.

---

## FEATURE 18 — Notifications Center

**URL:** `http://localhost:3146/notifications-center`  
**Feature Flag:** Must be enabled via `featureFlags.notificationsCenter = true`  
**Access:** All roles

### Use Case 18.1 — Access Notifications Center

1. Navigate to `/notifications-center`

**Expected:**
- ✅ If feature flag is ON: List of system notifications (overdue CAPAs, upcoming reviews, etc.)
- ✅ If flag is OFF: Redirect to first accessible module

---

## FEATURE 19 — Integrations

**URL:** `http://localhost:3146/integrations`  
**Access:** Admin

### Use Case 19.1 — View Integrations

1. Navigate to `/integrations`

**Expected:**
- ✅ List of configured integrations (e.g., Pharaxis Vault content channel)
- ✅ Each: Name, System, Status, Last Sync

---

## FEATURE 20 — SuperAdmin Console

**URL:** `http://localhost:3146/superadmin`  
**Access:** SuperAdmin only

### Use Case 20.1 — View SuperAdmin Dashboard

1. Log in as `superadmin@pharaxis.local`
2. Navigate to `/superadmin`

**Expected:**
- ✅ Platform overview: all orgs, users, module usage
- ✅ Ability to create, activate, or suspend orgs
- ✅ Org-level feature flag controls
- ✅ Platform audit log

---

### Use Case 20.2 — Create a New Org

1. In SuperAdmin, click **New Organisation**
2. Fill in: org_name, org_code, admin email, admin password
3. Click **Create**

**Expected:** New org created. Admin user created for that org.

---

### Use Case 20.3 — RBAC: Regular User Cannot Access SuperAdmin

1. Log in as `admin@pharaxis.local`
2. Navigate to `/superadmin`

**Expected:** Redirect to `/dashboard` — regular admin cannot access superadmin area.

---

## RBAC MATRIX VERIFICATION

| Feature | Admin | QA Reviewer | Viewer (if exists) |
|---------|-------|-------------|---------------------|
| Read all modules | ✅ | ✅ | ✅ |
| Create CAPA | ✅ | ✅ | ❌ |
| Create Deviation | ✅ | ✅ | ❌ |
| Create Supplier | ✅ | ✅ | ❌ |
| Create Document | ✅ | ✅ | ❌ |
| Access SuperAdmin | ❌ | ❌ | ❌ |

### Use Case RBAC.1 — Write Blocked for Read-Only

1. Identify a user without `qa_reviewer` or `admin` role
2. Navigate to `/capa`
3. The **New CAPA** button should be disabled (greyed out) or absent
4. A warning banner should appear: "You have read-only access to this module."

**Expected:** Write-disabled users see the amber banner warning and cannot click create.

---

## END-TO-END FLOW TEST (Full Lifecycle)

### Complete E2E Use Case — Deviation → CAPA → Closure

**Purpose:** Verify the full lifecycle traceability from deviation detection to CAPA closure.

**Step 1 — Detect Deviation**
1. Log in as Admin
2. Go to `/deviations` → click **New Deviation**
3. Fill: Title = `Batch 2026-A contamination event`, Type = `Product`, Classification = `Critical`, Department = `Manufacturing`, Occurrence Date = today
4. Create → note the `DEV-XXXX` code

**Step 2 — Open Investigation**
1. Click on the deviation → go to its Detail page
2. Click **Submit for Investigation** action button
3. Status should advance to `Investigation`

**Step 3 — Create Linked CAPA**
1. Go to `/capa` → **New CAPA**
2. Title = `Contamination Root Cause and Prevention`, Source = `InternalAudit`, Classification = `Critical`, Risk Band = `High`
3. Create → note `CAP-XXXX` code

**Step 4 — Link CAPA to Deviation**
1. Return to the Deviation Detail page
2. In CAPA Links panel → **Link CAPA** → select `CAP-XXXX`
3. Deviation status should advance to `CapaLinked`

**Step 5 — Advance CAPA**
1. Go to CAPA Detail (`/capa/:id`)
2. Progress through: Open → Investigation (click action) → RCA → EffectivenessCheck

**Step 6 — Close CAPA**
1. After confirming effectiveness, click **Close CAPA**
2. Status = `Closed`

**Step 7 — Close Deviation**
1. Return to Deviation Detail
2. Click **Close Deviation**
3. Status = `Closed`

**Step 8 — Verify on Dashboard**
1. Go to `/dashboard`
2. Open Deviations count should decrease by 1
3. Open CAPAs count should decrease by 1

**Step 9 — Verify in Event Hub**
1. Go to `/event-hub`
2. Deviations tile total should reflect the update
3. CAPAs tile total should reflect the update

---

## KNOWN GAPS / VARUN ACTION ITEMS

| # | Issue | Location | Action Required |
|---|-------|----------|-----------------|
| Q-01 | OTP in dev mode | Login | Ensure `devOtp` is always printed to backend console in dev environment |
| Q-02 | Action buttons wiring | All detail pages (RecordHeader) | Verify `@action` / `@edit` handlers call actual API endpoints, not just console.log stubs |
| Q-03 | Validation detail route | Router | Add `/validation/:id` route if a detail page exists for validation systems |
| Q-04 | Supplier no individual GET endpoint | SupplierQualityDetailView | Backend doesn't have `GET /supplier-quality/:id` — detail page works client-side. Consider adding backend endpoint for reliability |
| Q-05 | AI Insights backend | `/intelligence/quality-insights` | Confirm AI service is wired; if not, return deterministic mock data so page doesn't error |
| Q-06 | Workflow Inbox feature flag | featureFlags.js | Confirm flag exists and is documented; users should see a clear message if disabled |
| Q-07 | Logout button | App shell / Sidebar | Verify logout is visible and functional for all user roles |
| Q-08 | Lifecycle action buttons | All detail pages | Each lifecycle transition button should call the correct PATCH status endpoint and update UI without full reload |
| Q-09 | Create training from detail | TrainingManagementView | Ensure "Assign Training" can link directly to a controlled document by ID |
| Q-10 | Management Review completion flow | ManagementReviewView | After creating a review, verify the flow to mark it Completed and attach minutes |
