# Pharaxis Vault — End-to-End Feature Testing Guide

> **Audience:** QA / Rohith  
> **Purpose:** Step-by-step navigation and use-case verification for every feature in Pharaxis Vault.  
> **Date:** 2026-05-04  
> **Flagged gaps for Varun:** See ⚠️ markers inline.

---

## Environment

| Item | Value |
|------|-------|
| Frontend URL | `http://localhost:5176` |
| Backend URL | `http://localhost:5100` |
| Org slug | `novartis` |
| SuperAdmin login | `http://localhost:5176/control-tower/login` |

## Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@novartis.local` | `Admin@123` |
| Author | `author@novartis.local` | `Author@123` |
| Reviewer | `reviewer@novartis.local` | `Reviewer@123` |
| Approver | `approver@novartis.local` | `Approver@123` |
| Viewer | `viewer@novartis.local` | `Viewer@123` |
| SuperAdmin | `superadmin@pharaxis.io` | *(check `.env` or seed file)* |

---

## FEATURE 1 — Authentication & Login

### Use Case 1.1 — Org User Login

**Goal:** Log into the vault as an admin user.

1. Open `http://localhost:5176`  
2. You land on the **Login Page** (`/`)
3. Enter **Email:** `admin@novartis.local`
4. Enter **Password:** `Admin@123`
5. Enter **Org Slug:** `novartis`
6. Click **Sign In**

**Expected:** Redirect to `/vault` — Vault Home page loads with folder tree on the left and content grid on the right.

**Verify:**
- ✅ Top nav shows user name and org name
- ✅ Left sidebar shows folder tree
- ✅ Recent workflow stats tiles are visible
- ✅ Quick action links are visible (Upload, Tasks, Search, Slots, Dossiers, Expiry)

---

### Use Case 1.2 — Wrong Password

1. Open login page
2. Enter correct email, wrong password, correct org slug
3. Click **Sign In**

**Expected:** Error message shown — "Invalid credentials" or similar. No redirect.

---

### Use Case 1.3 — Wrong Org Slug

1. Enter correct email + password but wrong org slug (e.g., `wrongorg`)
2. Click **Sign In**

**Expected:** Error shown — org not found or invalid credentials. ⚠️ Varun verify: error message should be explicit, not a 500.

---

### Use Case 1.4 — Logout

1. Log in as any user
2. Look for user profile menu or logout button in the top bar
3. Click **Logout** (or look in top-right avatar menu)

**Expected:** Redirected back to `/` login page. Session cookie/token cleared.

⚠️ **Varun:** Confirm logout button is visible and functional in the WorkspaceShell nav.

---

### Use Case 1.5 — Viewer RBAC (Access Restriction)

1. Log in as `viewer@novartis.local` / `Viewer@123` / `novartis`
2. Try navigating to `http://localhost:5176/admin/users`

**Expected:** Redirect back to `/vault` or 403 error — viewer cannot access admin pages.

---

## FEATURE 2 — Vault Home Page

**URL:** `http://localhost:5176/vault`  
**Access:** All roles

### Use Case 2.1 — Home Page Dashboard Overview

1. Log in as Admin
2. You are on `/vault` — Vault Home

**Verify all these sections:**
- ✅ **Workflow Stats tiles** — shows count of Pending Ready, Pending Waiting, Completed, Rejected, Escalated tasks
- ✅ **Quick Actions** — 6 action links (Upload New Document, Open Task Inbox, Find a Document, Create Content Slot, Build Dossier, Expiry Dashboard)
- ✅ **Workspace Setup Steps** — 5 steps: Create Users, Define Taxonomy, Configure Lifecycle, Upload Content, Run Workflow Tasks
- ✅ **Recent Workflow Activity** — table showing recent workflow items
- ✅ **Intelligence Summary** — stale count, at-risk count, expiry-in-30d count, total governed
- ✅ **Folder Tree** on left — can click folders to filter content
- ✅ **Content Grid** — shows documents in selected folder

---

### Use Case 2.2 — Folder Tree Navigation

1. On the Vault Home, find the **Folder Tree** on the left
2. Click any folder (e.g., "Clinical")
3. Content grid on right should filter to show only docs in that folder

**Expected:** Folder highlighted in blue, content grid updates.

---

### Use Case 2.3 — Config Studio (Admin Only)

1. Log in as Admin
2. On the Vault Home, look for the **Config Studio** section
3. You should see 3 groups: Foundation Setup, Integrations & Security, Workflow Governance
4. Click **Users** link → navigates to `/admin/users`

**Expected:** Navigates correctly. Click back to `/vault` to return.

⚠️ **Varun:** Config Studio should be hidden or disabled for non-admin roles.

---

## FEATURE 3 — Document Upload

**URL:** `http://localhost:5176/vault/upload`  
**Access:** Author, Admin (not Viewer)

### Use Case 3.1 — Upload a New Document

1. Log in as `author@novartis.local`
2. Navigate to `/vault/upload` (or click **Upload New Document** from Home)
3. The Upload page loads with a form

**Steps:**
4. **File:** Click the file selector and choose any PDF or Word file
5. **Title:** Enter `Test SOP Document`
6. **Content Type:** Select a type from the dropdown (taxonomy must be pre-configured)
7. **Classification:** Select a classification
8. **Folder:** Select a folder from the dropdown
9. Click **Upload**

**Expected:**
- ✅ Upload progress shown
- ✅ Success message displayed
- ✅ "View Document" link appears pointing to `/vault/content/:id`

**Failure cases to verify:**
- Upload without selecting a file → error shown
- Upload without selecting type → error shown

⚠️ **Varun:** If taxonomy (types/classifications) isn't seeded, the dropdowns will be empty and upload will fail. Make sure seed data includes at least 1 type + 1 classification.

---

### Use Case 3.2 — Upload with Wrong File Type (if restricted)

1. Try uploading an `.exe` or unsupported file type
2. Expect an error or frontend validation preventing submission

---

## FEATURE 4 — Content Library (Vault Home Grid)

**URL:** `http://localhost:5176/vault`

### Use Case 4.1 — Browse All Documents

1. Log in as any user
2. On Vault Home, the content grid shows all documents
3. Verify columns: Title, Type, Status, Version, Created/Modified

---

### Use Case 4.2 — Open a Document Detail Page

1. Click on any document title in the content grid
2. Navigate to `/vault/content/:id`

**Expected:**
- ✅ Document detail page loads with **VaultRecordHeader** (breadcrumb, lifecycle tracker)
- ✅ Metadata panel on right (type, subtype, classification, folder, owner, version)
- ✅ **Version History** panel shows all versions
- ✅ Action buttons: **Start Workflow**, **View Document** (open viewer)

---

## FEATURE 5 — Document Viewer

**URL:** `http://localhost:5176/vault/content/:id/viewer`  
**Access:** All roles

### Use Case 5.1 — View a Document

1. From a Content Detail page, click **View Document**
2. Navigate to `/vault/content/:id/viewer`

**Expected:**
- ✅ PDF renders inline using PDF.js
- ✅ Page navigation controls visible (prev/next page)
- ✅ Breadcrumb back to content detail

---

### Use Case 5.2 — View Specific Version

1. From Content Detail, open Version History panel
2. Click **View** on an older version
3. Navigate to `/vault/content/:id/versions/:versionId/viewer`

**Expected:** That specific version's file renders, not the current version.

---

## FEATURE 6 — Search

**URL:** `http://localhost:5176/vault/search`  
**Access:** All roles

### Use Case 6.1 — Full Text Search

1. Log in as any user
2. Navigate to `/vault/search` (or click **Find a Document** from Home)
3. Type a keyword (e.g., `SOP`, `Test`, part of a document title)
4. Press Enter or click Search

**Expected:**
- ✅ Results list appears with matching documents
- ✅ Each result shows title, type, status, folder path
- ✅ Click a result → navigates to `/vault/content/:id`

---

### Use Case 6.2 — Filter Search Results

1. On search page, use any filter dropdowns (type, status, folder, date range)
2. Apply filter and confirm results narrow down

---

### Use Case 6.3 — Empty Search

1. Search for a term that doesn't match anything
2. Expect "No results found" message

---

## FEATURE 7 — My Tasks (Workflow Inbox)

**URL:** `http://localhost:5176/vault/tasks`  
**Access:** All roles (shows tasks assigned to the logged-in user)

### Use Case 7.1 — View Assigned Tasks

1. Log in as `reviewer@novartis.local`
2. Navigate to `/vault/tasks`

**Expected:**
- ✅ List of pending workflow tasks assigned to this reviewer
- ✅ Each task shows: document name, step name, due date, escalation date, status (Pending Ready / Pending Waiting)
- ✅ "Ready" tasks have action buttons visible

---

### Use Case 7.2 — Complete a Review Task (Sign-Off)

**Pre-condition:** A workflow must be running on a document with reviewer as the assigned step.

1. Log in as `reviewer@novartis.local`
2. Open `/vault/tasks`
3. Click on a **Pending Ready** task
4. Task detail panel opens on the right
5. Read the task comment thread
6. Add a comment in the comment box → click **Post Comment**
7. Click **Approve** (or **Complete**)
8. A signature modal appears — re-enter password `Reviewer@123`
9. Click **Confirm Sign-Off**

**Expected:**
- ✅ Task moves to Completed status
- ✅ Workflow advances to next step
- ✅ Signature manifest entry created (visible on Sign-Off Certificate)
- ✅ Comment thread updated

---

### Use Case 7.3 — Reject a Task

1. On a Pending Ready task, click **Reject**
2. Enter rejection reason
3. Confirm

**Expected:** Task status moves to Rejected. Workflow may terminate or loop back depending on template rules.

---

### Use Case 7.4 — Reassign a Task (Admin/Approver)

1. Log in as Admin
2. Open `/vault/tasks`
3. On a pending task, click **Reassign**
4. Select a new assignee from the dropdown
5. Click **Reassign**

**Expected:** Task re-assigned to new user. Audit event created.

---

## FEATURE 8 — Content Detail Page

**URL:** `http://localhost:5176/vault/content/:id`  
**Access:** All roles

### Use Case 8.1 — View Metadata

1. Navigate to any content detail page
2. Right panel shows metadata: Type, Subtype, Classification, Folder, Owner, Status, Version No

**Verify:**
- ✅ Lifecycle tracker at top shows current lifecycle stage
- ✅ Version number and status match

---

### Use Case 8.2 — Start a Workflow

1. On a content detail page, click **Start Workflow**
2. A modal or dropdown appears with available workflow templates
3. Select a template (e.g., Review & Approve)
4. Assign reviewers/approvers if prompted
5. Click **Launch**

**Expected:**
- ✅ Workflow created
- ✅ Task appears in assigned users' `/vault/tasks` inbox
- ✅ Document status may change (e.g., Draft → In Review)

⚠️ **Varun:** If no workflow templates are configured (empty `/admin/lifecycle` or `/admin/workflows`), the Launch button must show an error: "No active workflow templates configured."

---

### Use Case 8.3 — Version History

1. On Content Detail, expand the **Version History** panel
2. All versions listed with version number, created date, uploaded by

**Verify:**
- ✅ Each version has a **View** link that goes to the version viewer
- ✅ Current version is marked

---

## FEATURE 9 — Sign-Off Certificate

**URL:** `http://localhost:5176/vault/content/:id/signoff`  
**Access:** Admin, Author

### Use Case 9.1 — View Sign-Off Certificate

1. Navigate to a content item that has a completed workflow with signatures
2. Go to `/vault/content/:id/signoff`

**Expected:**
- ✅ Certificate page shows document title, version, org
- ✅ Signature manifest table: user name, role, action (Approved/Rejected), timestamp, password-verified indicator
- ✅ Printable format

⚠️ **Varun:** This page should only show data if the document has completed workflow signatures. If no signatures exist, show "No signatures on record."

---

## FEATURE 10 — Content Slots

**URL:** `http://localhost:5176/vault/slots`  
**Access:** Admin, Author

### Use Case 10.1 — View All Content Slots

1. Log in as Admin
2. Navigate to `/vault/slots`

**Expected:**
- ✅ Table of defined content slots (planned content placeholders)
- ✅ Each slot shows: name, type, target folder, assigned document (if linked), status

---

### Use Case 10.2 — Create a Content Slot

1. On `/vault/slots`, click **New Slot** or **Create Content Slot**
2. Fill in: Name, Type, Target Folder
3. Click **Create**

**Expected:** New slot appears in the table.

⚠️ **Varun:** Verify the create form validates required fields.

---

### Use Case 10.3 — Link a Document to a Slot

1. Open an existing content slot
2. Click **Link Document**
3. Search for or select an existing document
4. Confirm

**Expected:** Slot status updates to "Filled" or similar. Document reference appears in the slot row.

---

## FEATURE 11 — Dossiers

**URL:** `http://localhost:5176/vault/dossiers`  
**Access:** Admin, Author

### Use Case 11.1 — View Dossiers

1. Navigate to `/vault/dossiers`

**Expected:**
- ✅ List of dossiers (submission packages)
- ✅ Each shows: name, type, status, document count, created date

---

### Use Case 11.2 — Create a Dossier

1. On `/vault/dossiers`, click **New Dossier**
2. Enter name, type (e.g., CTD), description
3. Click **Create**

**Expected:** Dossier created and appears in the list.

---

### Use Case 11.3 — Add Documents to Dossier

1. Open a dossier
2. Click **Add Document** or **Link Content**
3. Search and select documents
4. Confirm

**Expected:** Document list inside the dossier updates.

---

## FEATURE 12 — Expiry Dashboard

**URL:** `http://localhost:5176/vault/expiry`  
**Access:** All roles

### Use Case 12.1 — View Expiring Documents

1. Navigate to `/vault/expiry`

**Expected:**
- ✅ Dashboard tiles: Expiring in 30 days, Expiring in 60 days, Expired
- ✅ Table of documents with expiry date, days remaining, owner
- ✅ Color-coded: red = expired, amber = < 30 days, green = > 30 days

---

### Use Case 12.2 — Click Through to Document

1. Click any document name in the expiry table
2. Navigate to its content detail page

**Expected:** Content Detail page loads for that document.

---

## FEATURE 13 — Training Assignments

**URL:** `http://localhost:5176/vault/training`  
**Access:** Admin, Author, Viewer (read-only for Viewer)

### Use Case 13.1 — View Training Assignments

1. Navigate to `/vault/training`

**Expected:**
- ✅ Table of training assignments (which users are assigned to which documents/SOPs)
- ✅ Columns: User, Document, Status (Assigned/Completed), Due Date, Completed Date

---

### Use Case 13.2 — Create Training Assignment (Admin)

1. Log in as Admin
2. On `/vault/training`, click **Assign Training**
3. Select user(s) and document(s)
4. Set due date
5. Click **Assign**

**Expected:** Training assignment created and appears in table.

---

### Use Case 13.3 — Mark Training Complete

1. Log in as the user assigned to training (e.g., `author@novartis.local`)
2. Navigate to `/vault/training`
3. Find the pending assignment
4. Click **Mark Complete** or **Complete Training**

**Expected:** Status updates to Completed with timestamp.

---

## FEATURE 14 — Notifications

**URL:** `http://localhost:5176/vault/notifications`  
**Access:** All roles

### Use Case 14.1 — View Notifications

1. Log in as any user
2. Navigate to `/vault/notifications`

**Expected:**
- ✅ List of notifications (workflow tasks assigned, documents expiring, training due, etc.)
- ✅ Unread notifications highlighted
- ✅ Click notification → navigates to relevant document/task

---

### Use Case 14.2 — Mark as Read

1. Click on an unread notification
2. Confirm it moves from unread to read state

---

## FEATURE 15 — Content Intelligence

**URL:** `http://localhost:5176/vault/intelligence`  
**Access:** Admin, Author

### Use Case 15.1 — View Intelligence Summary

1. Navigate to `/vault/intelligence`

**Expected:**
- ✅ AI-generated or computed summary tiles: Stale documents, At-risk documents, Expiring soon, Total governed
- ✅ Trend charts or statistics if available
- ✅ Recommendations list (e.g., "5 documents haven't been reviewed in 12 months")

⚠️ **Varun:** Confirm AI intelligence endpoints are active and returning data. If the AI backend is not integrated, these tiles should show "—" not crash.

---

## FEATURE 16 — Reach Score

**URL:** `http://localhost:5176/vault/reach`  
**Access:** Admin, Author

### Use Case 16.1 — View Reach Score Dashboard

1. Navigate to `/vault/reach`

**Expected:**
- ✅ Reach score per document (a completeness/distribution metric)
- ✅ List of documents with their reach scores
- ✅ Breakdown of what contributes to a score (metadata completeness, channel distribution, etc.)

---

## FEATURE 17 — Bulk Operations

**URL:** `http://localhost:5176/vault/bulk`  
**Access:** Admin only

### Use Case 17.1 — Access Bulk Operations Page

1. Log in as Admin
2. Navigate to `/vault/bulk`

**Expected:**
- ✅ Page loads with bulk operation options
- ✅ Options may include: Bulk update lifecycle status, Bulk assign owner, Bulk tag documents

---

### Use Case 17.2 — RBAC — Non-Admin Blocked

1. Log in as `author@novartis.local`
2. Try navigating to `/vault/bulk`

**Expected:** Redirected to `/vault` — not admin.

---

## FEATURE 18 — Reports

**URL:** `http://localhost:5176/vault/reports`  
**Access:** Admin only

### Use Case 18.1 — View Reports

1. Log in as Admin
2. Navigate to `/vault/reports`

**Expected:**
- ✅ Report options: Workflow completion rates, Document lifecycle summary, Training compliance, Audit events
- ✅ Filter by date range, type, folder
- ✅ Export option (CSV or PDF)

---

## FEATURE 19 — External Share

**URL:** `http://localhost:5176/external/vault-share/:token`

### Use Case 19.1 — Access an External Share Link

**Pre-condition:** Admin generates an external share link for a document.

1. Open the share link in an incognito browser (no login)
2. URL: `http://localhost:5176/external/vault-share/:token`

**Expected:**
- ✅ Document title and metadata shown (name, type, version)
- ✅ Download or view button for the shared document
- ✅ Link expiry shown if applicable

⚠️ **Varun:** Confirm the share token generation endpoint exists on the backend and share link creation is accessible from the Content Detail page.

---

## ADMIN FEATURES (Role: Admin)

---

## FEATURE 20 — Admin Console

**URL:** `http://localhost:5176/admin`  
**Access:** Admin only

### Use Case 20.1 — View Admin Console

1. Log in as Admin
2. Navigate to `/admin`

**Expected:**
- ✅ Admin dashboard with links to all admin sections
- ✅ Navigation tabs: Users, Taxonomy, Lifecycle, Retention, Channels, Integrations, Security, Audit, Workflows
- ✅ Quick stats if available

---

## FEATURE 21 — Setup Wizard

**URL:** `http://localhost:5176/admin/wizard`  
**Access:** Admin only

### Use Case 21.1 — Run Setup Wizard

1. Navigate to `/admin/wizard`
2. Wizard guides through: Create Users → Define Taxonomy → Configure Lifecycle → Set Retention → Set Up Channels

**Verify:** Each step is navigable, form fields are present.

---

## FEATURE 22 — User Management

**URL:** `http://localhost:5176/admin/users`  
**Access:** Admin only

### Use Case 22.1 — View Users

1. Navigate to `/admin/users`

**Expected:**
- ✅ Table of all org users: Name, Email, Role, Active Status, Last Login
- ✅ Filter by role dropdown

---

### Use Case 22.2 — Create a New User

1. On `/admin/users`, fill in the Create User form:
   - Name: `Test User`
   - Email: `testuser@novartis.local`
   - Role: `author`
   - Password: `TestUser@123`
2. Click **Create User**

**Expected:** New user appears in the table with status Active.

---

### Use Case 22.3 — Change User Role

1. Find an existing user in the table
2. Change their role dropdown (e.g., from `author` to `reviewer`)
3. Click **Save** or the save icon

**Expected:** Role updated immediately, confirmed without page reload.

---

### Use Case 22.4 — Deactivate a User

1. On a user row, toggle the **Active** switch OFF
2. Click Save

**Expected:** User deactivated — they can no longer log in.

---

## FEATURE 23 — Taxonomy Management

**URL:** `http://localhost:5176/admin/taxonomy`  
**Access:** Admin only

### Use Case 23.1 — View Taxonomy

1. Navigate to `/admin/taxonomy`

**Expected:**
- ✅ Three panels: Content Types, Subtypes, Classifications
- ✅ Existing types listed (should have SOP, Work Instruction, Policy, etc. from seed)

---

### Use Case 23.2 — Create a Content Type

1. In the Types panel, enter a new type name (e.g., `Quality Manual`)
2. Click **Add Type**

**Expected:** New type appears in the list. Should now be available in upload form.

---

### Use Case 23.3 — Create a Subtype

1. Select a parent type first
2. Add a subtype under it (e.g., `Manufacturing SOP`)
3. Click **Add**

**Expected:** Subtype appears nested under the parent type.

---

### Use Case 23.4 — Create a Classification

1. In Classifications panel, add a new classification (e.g., `Confidential`)
2. Click **Add**

**Expected:** Classification appears in the list and is available in upload form.

---

## FEATURE 24 — Lifecycle Rules

**URL:** `http://localhost:5176/admin/lifecycle`  
**Access:** Admin only

### Use Case 24.1 — View Lifecycle Rules

1. Navigate to `/admin/lifecycle`

**Expected:**
- ✅ List of configured lifecycle rules (e.g., Draft → In Review → Approved → Effective → Retired)
- ✅ Each rule shows permitted transitions and required roles

---

### Use Case 24.2 — Create a Lifecycle Rule

1. Click **New Rule** or **Add Transition**
2. From State: `Draft`, To State: `In Review`, Required Role: `reviewer`
3. Click **Save**

**Expected:** Transition rule created and visible.

⚠️ **Varun:** Verify lifecycle rules are correctly driving the workflow state transitions. If rules are misconfigured, content status won't advance.

---

## FEATURE 25 — Retention Policies

**URL:** `http://localhost:5176/admin/retention`  
**Access:** Admin only

### Use Case 25.1 — View Retention Policies

1. Navigate to `/admin/retention`

**Expected:**
- ✅ Table of retention policies: Content Type, Review Interval (days), Retention Period
- ✅ Documents linked to each policy shown or counted

---

### Use Case 25.2 — Create a Retention Policy

1. Click **New Policy**
2. Select Content Type: `SOP`
3. Set Review Interval: `365` days
4. Set Retention: `7 years`
5. Click **Save**

**Expected:** Policy saved and applies to all documents of that type.

---

## FEATURE 26 — Content Channels

**URL:** `http://localhost:5176/admin/channels`  
**Access:** Admin only

### Use Case 26.1 — View Channels

1. Navigate to `/admin/channels`

**Expected:**
- ✅ List of configured outbound channels (integrations with other systems)
- ✅ Each channel shows: Name, System (QMS, MIMS, Safety), Status (Active/Inactive), Last Sync

---

### Use Case 26.2 — Create a Channel

1. Click **New Channel**
2. Name: `QMS Integration`
3. System: `QMS`
4. Endpoint URL: `http://localhost:3145`
5. Click **Save**

**Expected:** Channel appears in the list with Inactive status.

---

## FEATURE 27 — Integrations

**URL:** `http://localhost:5176/admin/integrations`  
**Access:** Admin only

### Use Case 27.1 — View Integrations

1. Navigate to `/admin/integrations`

**Expected:**
- ✅ List of registered API connectors
- ✅ Each shows: Name, Type, Health Status (Online/Offline), Last Checked

---

### Use Case 27.2 — Test Integration Health

1. Click **Test Health** on a connector

**Expected:** Health check result shown (success or failure with error details).

---

## FEATURE 28 — Security Settings

**URL:** `http://localhost:5176/admin/security`  
**Access:** Admin only

### Use Case 28.1 — View Security Settings

1. Navigate to `/admin/security`

**Expected:**
- ✅ MFA settings (enabled/disabled for org)
- ✅ SSO policy settings
- ✅ Workflow RBAC matrix (which roles can perform which workflow actions)
- ✅ Password policy settings

---

### Use Case 28.2 — Enable MFA

1. Toggle **MFA Required** to ON
2. Click **Save**

**Expected:** Setting persisted. Next login for users will require MFA.

⚠️ **Varun:** If MFA is not yet implemented end-to-end, the toggle should be present but clearly labeled as "Coming Soon" or show a placeholder.

---

## FEATURE 29 — Audit Trail (Admin)

**URL:** `http://localhost:5176/admin/audit`  
**Access:** Admin only

### Use Case 29.1 — View Audit Events

1. Navigate to `/admin/audit`

**Expected:**
- ✅ Chronological list of all system events: user logins, uploads, workflow actions, admin changes
- ✅ Each event: timestamp, user, action type, entity affected, before/after payload
- ✅ Filter by date, user, action type

---

### Use Case 29.2 — Verify Upload Audit Event

1. Upload a new document (Feature 3)
2. Come back to `/admin/audit`
3. Find the "content.upload" or "content.created" event

**Expected:** Event appears with file name, user who uploaded, org_id.

---

## FEATURE 30 — Workflow Queue (Admin)

**URL:** `http://localhost:5176/admin/workflows`  
**Access:** Admin only

### Use Case 30.1 — View Workflow Templates

1. Navigate to `/admin/workflows`

**Expected:**
- ✅ **Configured Templates** table: Name, Steps, Status (Active/Inactive), Created Date
- ✅ **Workflow Queue** table: active/recent workflow instances

---

### Use Case 30.2 — Create a Workflow Template

1. Click **New Template**
2. Name: `Standard Review`
3. Add Step 1: Name = `Document Review`, Assigned Role = `reviewer`, Type = `review`
4. Add Step 2: Name = `Final Approval`, Assigned Role = `approver`, Type = `approve`
5. Click **Save Template**

**Expected:** Template appears in Configured Templates with status `Inactive`.

---

### Use Case 30.3 — Activate a Template

1. Find the new template in the Configured Templates table
2. Click **Activate**

**Expected:** Template status changes to `Active`. It is now available when launching workflows on documents.

---

### Use Case 30.4 — View Admin Workflow Queue

1. On `/admin/workflows`, look at the **Queue** table
2. Should show all in-progress workflow instances across all documents

**Expected:** Each row shows document name, template used, current step, assignee, due date, escalation status.

---

## SUPERADMIN FEATURES

---

## FEATURE 31 — SuperAdmin Login

**URL:** `http://localhost:5176/control-tower/login`

### Use Case 31.1 — SuperAdmin Login

1. Navigate to `/control-tower/login`
2. Enter SuperAdmin credentials
3. Click **Login**

**Expected:** Redirect to `/control-tower/dashboard`.

---

## FEATURE 32 — SuperAdmin Dashboard

**URL:** `http://localhost:5176/control-tower/dashboard`

### Use Case 32.1 — View Platform Dashboard

1. Log in as SuperAdmin
2. Navigate to `/control-tower/dashboard`

**Expected:**
- ✅ Platform-wide stats: total orgs, total users, total content items, total workflows
- ✅ Health indicators

---

## FEATURE 33 — Org Management (SuperAdmin)

**URL:** `http://localhost:5176/control-tower/orgs`

### Use Case 33.1 — View All Orgs

1. Navigate to `/control-tower/orgs`

**Expected:**
- ✅ Table of all orgs: Org Name, Slug, Status (Active/Suspended), User Count, Created Date

---

### Use Case 33.2 — View Org Detail

1. Click any org row
2. Navigate to `/control-tower/orgs/:id`

**Expected:**
- ✅ Org detail: name, slug, plan, user list, content stats, creation date

---

### Use Case 33.3 — Suspend/Activate an Org

1. On Org Detail, toggle org status from Active to Suspended
2. Confirm

**Expected:** Org users can no longer log in. Status updated.

---

## FEATURE 34 — SuperAdmin Audit

**URL:** `http://localhost:5176/control-tower/audit`

### Use Case 34.1 — View SuperAdmin Audit Log

1. Navigate to `/control-tower/audit`

**Expected:**
- ✅ Platform-wide audit events: org created, org suspended, user actions
- ✅ Filter by org, user, action type, date

---

## KNOWN GAPS / VARUN ACTION ITEMS

| # | Issue | Location | Action |
|---|-------|----------|--------|
| V-01 | Logout button visibility | WorkspaceShell navbar | Verify logout button is present and functional for all users |
| V-02 | Taxonomy seed | Upload page | Ensure at least 1 Type + 1 Classification seeded so upload form works |
| V-03 | Workflow template required for Start Workflow | Content Detail | Show error if no active template exists instead of blank modal |
| V-04 | Sign-Off Certificate empty state | `/vault/content/:id/signoff` | Show "No signatures on record" if no workflow has completed |
| V-05 | Content Slots create validation | `/vault/slots` | Validate required fields on create |
| V-06 | External share link generation | Content Detail | Confirm share link generation button exists on content detail page |
| V-07 | MFA placeholder | Admin Security | If MFA not implemented, label clearly as Coming Soon |
| V-08 | Config Studio visibility | VaultHomePage | Config Studio links should not appear for non-admin users |
| V-09 | Content Intelligence data | `/vault/intelligence` | Confirm AI endpoints return data; show — not crash if unavailable |
