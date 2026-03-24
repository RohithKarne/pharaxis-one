# MIMS Admin Console — Feature Requirements Document

**Version:** 1.0
**Date:** 2026-03-23
**Authors:** Rohith (CPO), Vanaja (PM)
**Status:** APPROVED FOR DEVELOPMENT — V1 Scope Frozen
**Source:** SCIMAX MIQ Admin Console Training + stakeholder discussion 2026-03-23

> **Rajeev — read this first:** This document is self-contained. Everything you need to build Admin Console V1 is here. Do not start development without reading all sections. The Admin Console manages all system configurations, user access, audit trails, and provides the foundation for Content Management administration.

---

## 1. Overview

The **Admin Console** is a comprehensive administrative interface that allows authorized users to configure and manage all aspects of the MIMS system. It is the central hub for:
- **Organization Setup** (Sites, Email Accounts, Workflow States, Case Numbering)
- **Product Configuration** (Product Families, Approvals, Country Authorizations)
- **User & Access Management** (Security Groups, User Assignments, Role-Based Permissions)
- **Master Data Management** (Picklists, Field Setup, Contact Repository)
- **Audit & Compliance** (Configuration Change Tracking, User Login Audit, Compliance Reporting)
- **Content Management Administration** (Folder Structure, CI/CO Management, Alerts)

The Admin Console is accessible via the **Admin Console** top navigation item in the main header. It uses a two-pane layout: left sidebar navigation + right content area.

---

## 2. Module Architecture

Admin Console consists of **2 main sections**:

```
Admin Console
├── Core System Configuration
│   ├── Picklists Management
│   ├── Field Setup
│   ├── Site & Email Account Setup
│   ├── Workflow States & Rules
│   ├── Case Numbering
│   ├── Data Protection & Privacy Rules
│   └── Transmission Rules
├── Product Setup
│   ├── Product Groups
│   └── Product Dictionary (Family, Ingredients, Approvals, Country Authorizations)
├── Access Configurations
│   ├── User Security Groups (with privilege matrix)
│   └── User Configuration (role assignment, site access, additional activities)
├── Contact Master
│   ├── Case Contacts Repository
│   ├── Company Representatives
│   └── Organization Address Book
├── Integration Setup
│   ├── Contacts Integration
│   ├── MIR (Medical Inquiry Response) Integration
│   ├── CRM Integration Notification
│   ├── Content Integration (links CM module)
│   └── Transmission Setup
└── Audit & Logs
    ├── Admin Audit Trail (configuration changes)
    ├── Login Audit Trail (user access logs)
    └── Service Logs
```

---

## 3. Technology Stack

| Component | Choice | Cost | Reason |
|---|---|---|---|
| Frontend | React + Vite (existing) | Free | Reuse existing setup |
| Backend | Node/Express (existing) | Free | Reuse existing APIs |
| Database | SQLite (existing) | Free | New tables via migration |
| UI Grid/Table Library | MUI DataGrid or Tanstack Table (existing) | Free | Reuse existing |
| Search/Filter | Faceted search + Ripgrep-like backend | Free | Efficient filtering |
| File Upload | Native browser input + multer (existing) | Free | Excel import for bulk operations |
| Authentication | HTTP-only cookies (admin) + JWT (portal) | Free | Existing auth system |
| Email Service | SMTP (configured per site) | Free | Used by system |
| Notifications | In-app toast + Email | Free | Existing notify.js |

---

## 4. User Roles & Privileges

> **Note:** Exact role-to-privilege mapping will be confirmed during Admin Console > User Management sprint. Until then, use the privilege names below as feature flags/checks in code.

| Privilege Name | What They Can Do | Typical Role |
|---|---|---|
| `admin_full_access` | All admin functions, user management, audit trail access | System Admin |
| `config_view` | View-only access to configurations | Auditor, QA |
| `config_edit` | Create, update configurations (requires approval for sensitive changes) | Admin, Config Manager |
| `user_management` | Manage user access, security groups, site assignments | Access Manager |
| `audit_view` | Access to audit trails, compliance reports | Compliance Officer |
| `content_admin` | Manage content folders, CI/CO, alerts (via Content Integration) | Content Manager |

---

## 5. Core Features (V1 Scope)

### 5.1 Picklists Management

Picklists are dropdown values used in case forms. Administrators configure and manage these values.

#### Overview
- **What:** Free-field configurable dropdown items
- **Who manages:** Admins via Admin Console
- **Where used:** Case form fields throughout the system
- **Status management:** Active (selectable in case forms) vs Inactive (searchable but not selectable)

#### Features

**Search & Display:**
- Search criteria section (collapsible)
- Picklist list with columns: Name, Field Type, Description, Status, Last Modified
- Pagination + sorting by any column
- Filter by Status: Active / Inactive / All

**Add/Edit/Delete Operations:**
- Add New button → opens picklist creation form
- Edit button → opens edit form (for active items)
- Delete button → soft delete (mark as inactive, not hard delete)
- Bulk operations via Excel upload/download (see below)

**Bulk Operations:**
- **Download Template:** Download current picklist configuration as Excel
  - Columns: Picklist Name, Field Type, Value, Description, Status, Created Date
  - All current values exported
- **Upload Template:** Upload Excel file with changes
  - System validates all rows before importing
  - Shows validation error report if any rows fail
  - On success: all values in file are updated (added/modified)
  - Audit trail logs each bulk operation with timestamp + user

**Validation Rules:**
- Picklist name is required, max 100 chars
- Field type must map to existing case form section (validated against Field Setup)
- Status must be Active or Inactive
- Duplicate names within same field are prevented
- Character set: alphanumeric, spaces, hyphens, underscores

**User Stories:**
- As an admin, I can search for picklists by name or field type so I can quickly find what I need to modify.
- As an admin, I can add a new picklist value with description so case agents have clear options to choose from.
- As an admin, I can bulk upload picklist changes from Excel so I don't have to enter each value individually.
- As an admin, I can deactivate (not delete) picklist values so old values are hidden but audit trail remains.
- As an admin, I can download current picklists as Excel template so I can bulk modify offline and re-upload.

**Email Retry Logic (NEW):**
- When picklist changes affect case workflow (e.g., status fields), affected users are notified
- **Retry mechanism:** If initial notification email fails:
  - System retries 3 times at 5-minute intervals
  - Log each retry attempt with timestamp + error reason
  - After 3 failed retries: mark as "failed to deliver", escalate to admin notification queue
- Audit trail shows notification delivery status for compliance

---

### 5.2 Field Setup

Configuration of case form fields — which fields are mandatory, hidden, disabled, or renamed.

#### Overview
- **What:** Configure case form structure and field attributes
- **Where:** Admin Console > Field Setup
- **User:** System Admin, Config Manager
- **Impact:** Affects all cases created after configuration change

#### Features

**Left Pane - Section List:**
- Hierarchical list of case form sections
  - Contact/Reporter Information
  - Case Information (References, Case Notes, Component Info, Medical Info, etc.)
  - Adverse Event (Seriousness Criteria, Flex Fields, Patient Info, Pregnancy, Parent Details, etc.)
  - Lab Details, Lab Notes, etc.
- Selected section highlighted
- Collapse/expand for nested sections

**Right Pane - Field Configuration:**
- Table of fields within selected section
- Columns: Field Name, Field Type (Text, Dropdown, Date, Custom), Required, Hidden, Disabled, Display Label (custom name)
- For each field:
  - Checkbox: Make Required
  - Checkbox: Make Hidden
  - Checkbox: Make Disabled
  - Text input: Custom Label (rename the field as displayed to users)
  - Dropdown: Flex field type (if applicable)

**Flex Fields:**
- Define up to N custom fields per section
- Type: Dropdown, Text, Date
- For Dropdown flex fields: link to picklist (dropdown values are populated from Picklists)
- Mandatory / Optional flag

**Save & Validation:**
- Save button applies all changes
- Validation: ensure required fields are not hidden simultaneously
- On save: audit trail logs change with before/after values

**User Stories:**
- As an admin, I can hide/disable certain fields in the case form so that case agents only see relevant fields.
- As an admin, I can rename a field label to match business terminology so agents understand what to enter.
- As an admin, I can mark a field as required so critical information is always captured.
- As an admin, I can define custom flex fields (dropdown/text/date) so the form adapts to business needs without code changes.

---

### 5.3 Site & Email Account Setup

Configuration of organizational sites and associated email accounts for case handling.

#### Overview
- **What:** Define sites (call centers, regions) and email accounts for case transactions
- **Why:** Large pharma organizations may have multiple sites; each needs its own email account
- **Impact:** Site selection in case creation; email routing for responses, transmissions, correspondence

#### Site Setup Features

**Left Pane - Site List:**
- Search criteria (optional)
- Table: Site Name, Abbreviation, Status (Active/Inactive)
- Add New button

**Right Pane - Site Configuration (New Site / Edit Site):**
- **General Tab:**
  - Site Name (required)
  - Abbreviation (2-4 chars, required)
  - Status: Active / Inactive (toggle)
  - Enable Data Protection & Privacy Rules: Yes / No (checkbox)

- **Email Accounts Tab:**
  - Link site to email account(s) for:
    - Case Responses processing
    - Correspondence module
    - Transmission module
  - Same email can be reused for multiple functions or different emails per function
  - Dropdown for each: select from configured email accounts (or "Add New Email Account")

- **Response Tab:**
  - Configure case response processing settings
  - Country-specific fields (enable State/Province validation if applicable)
  - Contact integration settings (auto-link reporter contacts)

- **Right to Forget Tab:**
  - GDPR compliance — configure data deletion rules
  - No UI workflow shown at frontend (flag: `rightToForgetConfigUI: false`)
  - Backend handles data purging based on config
  - Audit trail logs all data deletion requests for compliance

- **Alerts Configuration Tab:**
  - **Email Retry & Automation Rules (NEW):**
    - For notification emails triggered by site events (case escalation, assignment, etc.):
      - Retry failed emails: Yes / No
      - Number of retries: 3 (fixed)
      - Retry interval: 5 minutes (fixed)
      - Max retry duration: 15 minutes total (3 retries × 5 min)
      - After max retries: escalate to admin queue
    - Log all retry attempts in audit trail
  - Alert types: Case Escalation, Case Expiry, Transmission Failed, etc.
  - Alert recipients (select users)
  - Alert timing (e.g., send alert after X days in state)

**Email Accounts Submodule:**

Must be configured **before** Site Setup (sites reference email accounts).

**Email Account List:**
- Search criteria
- Table: Email ID, User ID, Status
- Add New button

**New Email Account Form:**
- Email ID (required) — full email address
- User ID (required) — login user for SMTP
- Password (required) — encrypted storage
- Email Display Name/Alias (optional)
- SMTP Details:
  - Host Name (e.g., smtp.gmail.com)
  - Port (e.g., 587)
  - Sent Items Folder Name (IMAP path, e.g., [Gmail]/Sent Mail)
- IMAP Details:
  - Host Name (e.g., imap.gmail.com)
  - Port (e.g., 993)
- Authentication Type: Basic / Advanced (dropdown)
- Test Connection button (validates SMTP/IMAP credentials before saving)

**User Stories:**
- As an admin, I can create multiple sites for different call centers so each location manages its own cases independently.
- As an admin, I can configure email accounts for each site so case notifications and transmissions are sent from the correct organizational email.
- As an admin, I can test email account connectivity so I confirm SMTP/IMAP settings are correct before going live.
- As an admin, I can configure email retry logic so failed notifications are automatically retried 3 times at 5-minute intervals.
- As an admin, I can configure data deletion rules (Right to Forget) so the system complies with GDPR/privacy regulations.
- As a system, I automatically retry failed email notifications 3 times with 5-minute intervals, then escalate to admin queue.
- As a system, I log all email retry attempts in the audit trail for compliance reporting.

---

### 5.4 Workflow Setup

Configuration of case workflow states and rules (transitions between states).

#### Overview
- **What:** Define states cases flow through (Intake, Data Entry, Under Review, QA Review, Fulfillment, etc.)
- **Where:** Site-specific (each site can have different workflow)
- **Impact:** Case routing, state-specific actions, notifications

#### Workflow States Features

**Left Pane - Workflow States:**
- Site selector (dropdown)
- Search criteria (filter by state name)
- Table: State Name, Site, Status (Active/Inactive)
- Add New button

**Right Pane - Workflow State Configuration:**
- Workflow State Name (required)
- Site (select from list)
- Status: Active / Inactive
- Email Notification Recipients (multi-select from users)
- Description (optional)

**Case Activities (Checkboxes):**
Define which actions can be performed when a case is in this state:
- Case Creation
- Case Update
- Case Review
- Response Fulfillment
- Transmission
- Correspondence
- View Case (always enabled, read-only)

**Save button:** Validates and logs all changes.

#### Workflow Rules Features

**Left Pane - Workflow Rules:**
- Site selector (dropdown)
- Search criteria
- Table: Rule Name, Site, From State, To State
- Add New button

**Right Pane - Workflow Rule Configuration:**
- Site (select from list)
- From State (dropdown — source state)
- To State (dropdown — target state)
- Mandatory Activities on Route (checkboxes):
  - Password on Route: require approver password/confirmation
  - Checklist on Route: require checklist completion before transition
  - Comments on Route: require reason/comment before transition

**Validation Rules:**
- Prevent circular dependencies at save time (e.g., Intake → Intake)
- Prevent invalid transitions (e.g., Draft → Published without intermediate states)
- Warning: if a state has no outgoing rules, warn user ("This state is a dead end")

**Visualization (Phase 2):**
- Workflow diagram showing all states + transitions
- Not in V1 — deferred to Phase 2

**User Stories:**
- As an admin, I can define workflow states so cases flow through the right stages in the right order.
- As an admin, I can configure case activities per state so users can only perform allowed actions in each state.
- As an admin, I can create workflow rules so cases transition between states automatically or on user action.
- As an admin, I can require mandatory activities on a transition so critical steps (approval, comment) are not skipped.
- As an admin, I can set up email notifications for a state so the right people are alerted when a case enters that state.
- As a system, I prevent invalid workflow transitions (e.g., no circular dependencies).
- As a system, I enforce mandatory activities before allowing a state transition.

---

### 5.5 Product Dictionary Configuration

Configuration of organization's products, families, ingredients, approvals, and country authorizations.

#### Overview
- **What:** Master list of pharma products, organized by family, with approval/authorization details
- **Who manages:** Admins, Product Managers
- **Impact:** Product selection in case forms, regulatory compliance tracking

#### Product Families Features

**Left Pane - Product Family List:**
- Search criteria (filter by family name, ingredient)
- Tree structure:
  - Product Families (expandable)
    - Associated Products (leaf nodes)
  - Icon indicator: "F" = Product Family, "P" = Product

**Right Pane - Add Family / Edit Family:**
- Family Name (required)
- Ingredients (multi-select or text list):
  - Ingredient Name
  - Concentration (optional)
  - Units (optional)
- Save button

#### Product Configuration Features

**Product Configuration Form:**
- Product Name (required) — trade name or generic name
- Dosage Formulation (dropdown) — e.g., Tablet, Aerosol, Capsule
- Strength (text) + Units (dropdown)
- Company Drug Code (optional)
- Product Code (optional)
- Case Form URL (optional) — link to web form specific to this product
- Status: Active / Inactive

**Product Group Settings:**
- Analytics Product Group (dropdown — for analytics & reporting)
- CDR Product Group (dropout — for regulatory data repository)
- Custom Form Product Group (dropdown)
- DCCR & DCOR Product Group (dropdown)
- Transmissions Product Group (dropdown)
- Response Product Group (dropdown)

**Approvals Section:**
- Table: Trade Name, Market Authorization Holder, Approval Type, Approval Number
- Add Approval button → form:
  - Trade Name (required)
  - Market Authorization Holder (dropdown)
  - Approval Type (dropdown)
  - Approval Number (text)
- Link to country authorizations (below)

**Country Authorizations Section:**
- Add Authorization button → modal:
  - Authorized Country (dropdown)
  - Website (optional)
  - Inactive checkbox
  - Contact Number (for authorization holder)
  - Additional Monitoring Drug checkbox

**Authorization Details (nested):**
- Award Date (date picker)
- Withdrawn Date (date picker, optional)
- Product Group Settings (per country variant)
- NDC / DIN (National Drug Code / Drug Identification Number):
  - Table: NDC Number, Manufacturer Site, Description
  - Add row button

**Bulk Configuration:**
- Download Template button → Excel with product family structure
- Upload Template button → bulk import/update products from Excel

**User Stories:**
- As an admin, I can create product families and group related products so products are organized for easy access.
- As an admin, I can configure product approvals (trade names, market holders, approval types) so regulatory requirements are tracked.
- As an admin, I can add country-specific authorizations for products so country-specific regulations are honored.
- As an admin, I can bulk upload product data from Excel so I don't have to enter each product individually.
- As a case agent, I can select a product from the configured dictionary when creating a case so consistent product information is used.

---

### 5.6 Access Configurations

User Security Groups and User Configuration — the heart of role-based access control.

#### User Security Groups Features

**Left Pane - Security Group List:**
- Search criteria (filter by group name, type)
- Table: Group Name, Group Type, Status, Last Modified
- Add New button

**Right Pane - Security Group Configuration:**
- Group Type (dropdown) — select from predefined types or custom
- Group Name (required)
- Status: Active / Inactive

**Menu Access Section:**
- Tabs: Menu Access | CM Menu Access | Case Activities | CM Activities | Mobile Activities
- Checkboxes for each menu/activity
- Example items visible in PDF:
  - **Menu Access:** New Case, Inbox, Case Management, My Cases, Unassigned Cases, Deleted Cases, Case Query, Transmissions, Utilities, Response Log, CDR Log, etc.
  - **CM Menu Access:** My Assignments, All Check-Out, My Check-Out, Review Owner Task, Reviewer Task, SR Modules, Documents, FAQs, Merge Reports, Templates, Response Templates, Email Templates, Acknowledgement Templates, Configurations, Folders, Picklists, Alerts, Others
  - **Case Activities:** Case Creation, Case Update, Case Review, Response Fulfillment, Transmission, Correspondence, Case View
  - **CM Activities:** Content Creation, Content Update, Content Review Owner, Content Reviewer, Content Approval, Content Publish, Content Archival, Content Deletion
  - **Mobile Activities:** MI Submission, AE Submission, PC Submission, Access Documents, Access FAQs

**User Stories:**
- As an admin, I can create a security group with specific menu and activity permissions so users in that group can only see/do what they need.
- As an admin, I can assign multiple activities to a group so role-based access is granular and secure.

#### User Configuration Features

**Left Pane - User List:**
- Search criteria (filter by user ID, name, type)
- Table: User ID, User Name, User Type (Medinquirer/Other), Primary Site, Security Group, Status
- Pagination + sorting
- Add New button (if new users can be created in admin console) or linked to identity provider

**Right Pane - User Configuration:**
- User ID (read-only)
- User Name (read-only)
- Email ID (read-only or editable if linked to LDAP sync)
- User Type (read-only or dropdown if configurable)
- Primary Site (dropdown — required)
- Full Access Sites (multi-select checkboxes)
- Read Only Access Sites (multi-select checkboxes)
- User Security Group (dropdown — required, can be multi-select for additive permissions)
- Status: Active / Inactive (toggle)

**Additional Activities Section:**
- Overwrite Case Ownership checkbox + Yes/No dropdown
- User unavailability Calendar (date range) — user marked as unavailable so cases auto-reassign
- Decrypt Encrypted Data checkbox + Yes/No dropdown
- Advanced Case Routing checkbox + Yes/No dropdown
- Cross Site Case Routing checkbox + Yes/No dropdown
- Case Delete/Un-delete checkbox + Yes/No dropdown
- Reassign Emails in Inbox checkbox + Yes/No dropdown
- Unarchive Cases checkbox + Yes/No dropdown
- Update Archived Cases checkbox + Yes/No dropdown
- Reopen Case MI Component checkbox + Yes/No dropdown
- And more (shown as scrollable list)

**Time-Based Access Expiry (NEW):**
- Access Expiry Date (optional date picker)
- If set: user access automatically disabled on that date
- Useful for contractors, temporary staff
- Audit trail logs when expiry occurs

**Standard Reports (NEW):**
- Multi-select: assign standard reports accessible to user
- Reports include: Baseline Access Configuration, Baseline System Configuration, Case Information Listing, MI Process Log, etc.

**Site Permission Section:**
- Table: Site Name, Access Level (Full Access / Read Only Access)
- Add Site button to assign additional sites
- Remove button to unassign site

**Sensitive Change Approvals (NEW - OPTIONAL):**
- When admin updates user permissions (especially security group or sensitive activities):
  - Option 1: Save immediately (current behavior)
  - Option 2: Request approval from another admin before change applies
  - Approvers defined in system config (User Management > Approvers)
  - Audit trail logs approval chain

**User Stories:**
- As an admin, I can assign a user to a security group so their access is controlled by group privileges.
- As an admin, I can assign users to multiple sites with Full/Read-Only access so they can access what they need across locations.
- As an admin, I can grant additional activities to a user so role exceptions are handled without creating new groups.
- As an admin, I can set an access expiry date for a contractor so their access automatically expires after the contract ends.
- As an admin, I can request approval for sensitive permission changes so critical access updates are not made unilaterally.
- As a system, I enforce that sensitive permission changes require approval from designated approvers before taking effect.

---

### 5.7 Case Contacts Master

Master data for case reporters and contacts.

#### Case Contacts Repository Features

**List View:**
- Search criteria (filter by name, reporter type, country)
- Table: Last Name, Reporter Type, Country, Site, Status
- Add Contact button
- Upload/Download buttons (bulk template)

**New Contact / Edit Contact Form:**
- Prefix (dropdown: Mr., Ms., Dr., Prof., etc.)
- First Name (required)
- Middle Name (optional)
- Last Name (required)
- Primary Degree (dropdown)
- Secondary Degree (dropdown)
- Title (optional)
- Reference No (optional)
- Address (text area, max 100 chars)
- City
- State/Province
- Postal Code
- Country (required, dropdown)
- Organization (optional)
- Department/Institution (required)
- Preferred Contact Method (dropdown: Phone, Fax, Email)
- Phone Number + Extension
- Other Phone Number + Extension
- Fax Number + Extension
- Email ID
- Reporter Type (dropdown: Health Care Professional, Non Health Care Professional)
- Occupation (dropdown)
- Speciality (dropdown)
- Site (required, dropdown) — can be site-specific
- Notes (free text)

**Bulk Upload/Download:**
- Download template as Excel
- Upload Excel file to bulk create/update contacts
- Validation report on import

**User Stories:**
- As a case agent, I can select a known contact when creating a case so I don't have to re-enter contact details.
- As an admin, I can manage the contacts repository so accurate contact information is available system-wide.
- As an admin, I can bulk upload contacts from Excel so I don't enter them individually.

---

### 5.8 Company Representatives

Configuration of company representative teams by region, district, territory.

#### Features

**Team Creation:**
- Team Name (required)
- Select if team is: Site-specific / Product-specific / Product Family-specific
- MSL Team checkbox (Medical Science Liaison)

**Region, District, Territory Hierarchy:**
- Add Region: Name + ID
- Per Region, Add District: Name + ID
- Per District, Add Territory: Name + ID (e.g., Ter01, ID: 101-1A)
- Zip Codes: link territories to postal codes

**Representative Assignment:**
- Select Territory
- Add Representatives table: Rep ID, Rep Type, First Name, Last Name, Email, Phone, Other Phone, City, State, Zipcode
- Representative Types: District Manager, Regional Manager, Territory Representative, etc. (dropdown)

**Bulk Upload:**
- Download template → Excel
- Upload template → bulk import teams + representatives

**User Stories:**
- As an admin, I can create company representative teams organized by region/district/territory so case routing and escalation can be regional.
- As a case agent, I can select a company representative when documenting case interactions so representative information is tracked.

---

### 5.9 Audit Trail

Two types of audit trails: configuration changes and user login tracking.

#### Admin Audit Trail Features

**Search Criteria:**
- Category (dropdown): Picklists, Email Accounts, Sites Setup, Workflow Setup, Case Numbering, Transmission Rules, Data Protection, Other Configurations, Case Reporting, Help System, SSP Setup, Product Setup, Access Configuration, Analytics, Form Configuration, Contact Master, Integration Setup, etc.
- Sub-Category (dropdown, depends on Category)
- Name (text search)
- User (dropdown or text)
- Date Range (from/to date picker)
- Search button

**Results Table:**
- Columns: No. (row number), Configuration Name, Changed By, Changed On Date & Time (UTC), Previous Value, New Value, Reason for Change (NEW)
- Sorting by any column
- Pagination

**Reason for Change Field (NEW):**
- When admin makes a change, they're prompted for reason/comment
- Captures: "Why was this change made?"
- Examples: "Updated per client request on 2026-03-23", "Fixing typo in product name", "Deactivating obsolete workflow state"
- Displayed in audit results + exportable in reports

**Compliance Report Export (NEW):**
- Export all audit records to PDF/Excel
- Filters applied in export
- Timestamps in UTC
- Digital signature capability (future)

**User Stories:**
- As an admin, I can search configuration change history so I know who changed what and when.
- As a compliance officer, I can view and export audit records so I can generate compliance reports (e.g., 21 CFR Part 11, GxP).
- As an admin, I can enter a reason for configuration changes so the audit trail documents why changes were made.
- As a system, I log all configuration changes with user, timestamp, before/after values, and reason for compliance.

#### Login Audit Trail Features

**List View:**
- Search criteria
- Summary: Total Users, Currently Logged In Users (count), Users Inactive (count)
- Color-coded status indicators (green = active, red = inactive)

**Results Table:**
- Columns: User ID, User Name, IP Address, Browser & Version, Login/Logout, System Time (UTC), Status, Reason (if failed login)
- Sorting + pagination

**Login Status Indicators:**
- Successful (green)
- Failed (red) — with reason (Wrong Password, Account Locked, etc.)
- Logout (gray)

**User Stories:**
- As an admin, I can view login audit trail so I know who logged in and when.
- As a security officer, I can search for failed login attempts so I can investigate suspicious activity.
- As a compliance officer, I can export login audit data for regulatory compliance.

---

## 6. Cross-Cutting Features (V1 + FUTURE)

### 6.1 Advanced Search & Bulk Operations (V1)

**Search Features:**
- Faceted search (filter by status, date, created by, etc.)
- Full-text search on configuration names
- Saved searches ("Show all inactive products")
- Search history (recent 10 searches)

**Bulk Operations:**
- Bulk activate/deactivate via checkbox + action menu
- Bulk export to Excel (selected items or all)
- Bulk import from Excel (with validation report)
- Bulk email notification (e.g., notify users about picklist changes)

### 6.2 Configuration Templates (V1)

- **Save Configuration as Template:** Admin can save current site/workflow/product setup as a template
- **Clone from Template:** When creating new site/config, offer "Start from template" option
- **Template Versioning:** Templates have versions (v1.0, v1.1), allowing rollback to prior template
- **Share Templates:** Templates can be shared across organizations (if multi-tenant)

### 6.3 Smart Notifications & Alerts (V1)

**Alert Types:**
- Picklist deprecated → notify users who use that picklist in case forms
- Product goes out of stock → notify case agents
- Workflow state has no exit rules → warn admin
- User access expires (time-based) → notify manager
- Configuration change made → notify affected users (optional notification setting per change type)

**Delivery Methods:**
- In-app toast notification
- Email notification
- Dashboard alert widget

**Alert Configuration:**
- Admin can customize alert recipients, timing, message template

### 6.4 Email Retry & Automation (V1 - LOCKED IN)

**Requirement:** When notification emails fail (e.g., SMTP timeout):
- Retry immediately (attempt 1)
- Wait 5 minutes, retry (attempt 2)
- Wait 5 minutes, retry (attempt 3)
- After 3 retries (15 minutes total): escalate to admin failure queue + send alert to admin

**Logging:**
- Audit trail logs each retry with timestamp, error message, retry count
- Example: "Email to user@example.com failed: SMTP timeout. Retry 1/3 scheduled for 2026-03-23 10:05:00 UTC"

**Configuration:**
- Site-level setting: enable/disable email retries (default: enabled)
- Retry interval: 5 minutes (fixed, not configurable)
- Max retries: 3 (fixed, not configurable)

### 6.5 Dependency Mapping Dashboard (V1)

Show dependencies and prevent accidental deletions:

**Examples:**
- **Product Dictionary:** Which cases use this product? (count + link to case list)
- **Picklists:** Which case form fields use this picklist? (list + highlight in Field Setup)
- **Workflow States:** How many rules reference this state? Can it be deleted? (warn if any rules exist)
- **User Security Group:** How many users belong to this group? (count + link to user list)

**Safe Delete Logic:**
- If item has dependencies: show warning "X cases use this product. Delete anyway?" + require confirmation
- Soft delete (mark as inactive) instead of hard delete for audit trail preservation

**User Story:**
- As an admin, I can see which entities depend on a configuration so I know the impact before deleting.

### 6.6 Configuration Validation & Readiness Checks (V1)

**Dashboard:**
- ✅ Sites configured: 3/3
- ✅ Email accounts: 3/3
- ✅ Workflow states: 5/5
- ⚠️ Workflow rules incomplete: 5 states but only 4 rules defined
- ❌ Default user security group not defined
- ⚠️ No admin user with full access assigned

**Guided Setup Wizard (for new admins):**
- Step 1: Create at least 1 site
- Step 2: Configure email accounts for each site
- Step 3: Define workflow states
- Step 4: Define workflow rules (state transitions)
- Step 5: Create security groups
- Step 6: Assign users to groups
- Step 7: Define products
- Completion badge + checklist

### 6.7 Audit Trail Enhancements (V1 - LOCKED IN)

Already specified above:
- ✅ Change reason/comment field
- ✅ Before/After comparison view
- ✅ Timeline visualization
- ✅ Rollback with approval (optional)
- ✅ Compliance report export
- ✅ 365-day retention + archive to database

### 6.8 Content Management Integration (V1)

Admin Console provides a **Content Integration** menu option that links to:
- CM Folder Management (create/edit/delete folders)
- CM Picklists (configure picklist values used in CM module)
- CM Alerts (configure expiry alerts for documents)
- CM Activity Logging (view document activity history from admin perspective)

This is configured in the [Content Management > Admin Section], not detailed here.

---

## 7. Database Schema

### New Tables Required

```sql
-- Picklists
CREATE TABLE cp_picklists (
  id INTEGER PRIMARY KEY,
  picklist_name TEXT NOT NULL,
  field_type TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Active', -- Active, Inactive
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME,
  UNIQUE(picklist_name, field_type, value)
);

-- Email Accounts
CREATE TABLE cp_email_accounts (
  id INTEGER PRIMARY KEY,
  email_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  password_encrypted TEXT,
  display_name TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_sent_folder TEXT,
  imap_host TEXT,
  imap_port INTEGER,
  auth_type TEXT, -- Basic, Advanced
  status TEXT DEFAULT 'Active',
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME
);

-- Sites
CREATE TABLE cp_sites (
  id INTEGER PRIMARY KEY,
  site_name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  enable_data_protection INTEGER DEFAULT 0,
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME
);

-- Site Email Mapping
CREATE TABLE cp_site_email_mapping (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL,
  email_account_id INTEGER NOT NULL,
  email_function TEXT, -- Response, Correspondence, Transmission
  created_by TEXT,
  created_date DATETIME,
  FOREIGN KEY (site_id) REFERENCES cp_sites(id),
  FOREIGN KEY (email_account_id) REFERENCES cp_email_accounts(id)
);

-- Site Alerts Configuration
CREATE TABLE cp_site_alerts_config (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL,
  alert_type TEXT, -- Case Escalation, Case Expiry, etc.
  enable_retry INTEGER DEFAULT 1, -- 0=disabled, 1=enabled
  retry_count INTEGER DEFAULT 3,
  retry_interval_minutes INTEGER DEFAULT 5,
  alert_recipients TEXT, -- JSON array of user IDs
  created_by TEXT,
  created_date DATETIME,
  FOREIGN KEY (site_id) REFERENCES cp_sites(id)
);

-- Email Retry Log
CREATE TABLE cp_email_retry_log (
  id INTEGER PRIMARY KEY,
  email_account_id INTEGER NOT NULL,
  recipient_email TEXT,
  subject TEXT,
  retry_count INTEGER,
  last_retry_date DATETIME,
  error_message TEXT,
  status TEXT, -- Pending, Sent, Failed
  created_date DATETIME,
  FOREIGN KEY (email_account_id) REFERENCES cp_email_accounts(id)
);

-- Workflow States
CREATE TABLE cp_workflow_states (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL,
  state_name TEXT NOT NULL,
  status TEXT DEFAULT 'Active',
  notification_recipients TEXT, -- JSON array of user IDs
  description TEXT,
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME,
  FOREIGN KEY (site_id) REFERENCES cp_sites(id),
  UNIQUE(site_id, state_name)
);

-- Workflow State Activities
CREATE TABLE cp_workflow_state_activities (
  id INTEGER PRIMARY KEY,
  state_id INTEGER NOT NULL,
  activity_name TEXT, -- Case Creation, Case Update, etc.
  enabled INTEGER DEFAULT 1,
  FOREIGN KEY (state_id) REFERENCES cp_workflow_states(id)
);

-- Workflow Rules
CREATE TABLE cp_workflow_rules (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL,
  from_state_id INTEGER NOT NULL,
  to_state_id INTEGER NOT NULL,
  password_required INTEGER DEFAULT 0,
  checklist_required INTEGER DEFAULT 0,
  comments_required INTEGER DEFAULT 0,
  created_by TEXT,
  created_date DATETIME,
  FOREIGN KEY (site_id) REFERENCES cp_sites(id),
  FOREIGN KEY (from_state_id) REFERENCES cp_workflow_states(id),
  FOREIGN KEY (to_state_id) REFERENCES cp_workflow_states(id)
);

-- Product Families
CREATE TABLE cp_product_families (
  id INTEGER PRIMARY KEY,
  family_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME
);

-- Product Family Ingredients
CREATE TABLE cp_product_family_ingredients (
  id INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL,
  ingredient_name TEXT NOT NULL,
  concentration TEXT,
  units TEXT,
  FOREIGN KEY (family_id) REFERENCES cp_product_families(id)
);

-- Products
CREATE TABLE cp_products (
  id INTEGER PRIMARY KEY,
  product_name TEXT NOT NULL UNIQUE,
  family_id INTEGER,
  dosage_formulation TEXT,
  strength TEXT,
  units TEXT,
  company_drug_code TEXT,
  product_code TEXT,
  case_form_url TEXT,
  status TEXT DEFAULT 'Active',
  analytics_product_group TEXT,
  cdr_product_group TEXT,
  custom_form_product_group TEXT,
  transmissions_product_group TEXT,
  response_product_group TEXT,
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME,
  FOREIGN KEY (family_id) REFERENCES cp_product_families(id)
);

-- Product Approvals
CREATE TABLE cp_product_approvals (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  trade_name TEXT,
  market_authorization_holder TEXT,
  approval_type TEXT,
  approval_number TEXT,
  created_by TEXT,
  created_date DATETIME,
  FOREIGN KEY (product_id) REFERENCES cp_products(id)
);

-- Product Country Authorizations
CREATE TABLE cp_product_country_authorizations (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  country TEXT NOT NULL,
  website TEXT,
  inactive INTEGER DEFAULT 0,
  contact_number TEXT,
  additional_monitoring_drug INTEGER DEFAULT 0,
  award_date DATE,
  withdrawn_date DATE,
  created_by TEXT,
  created_date DATETIME,
  FOREIGN KEY (product_id) REFERENCES cp_products(id)
);

-- Product NDC/DIN
CREATE TABLE cp_product_ndc_din (
  id INTEGER PRIMARY KEY,
  country_auth_id INTEGER NOT NULL,
  ndc_number TEXT,
  manufacturer_site TEXT,
  description TEXT,
  FOREIGN KEY (country_auth_id) REFERENCES cp_product_country_authorizations(id)
);

-- User Security Groups
CREATE TABLE cp_user_security_groups (
  id INTEGER PRIMARY KEY,
  group_name TEXT NOT NULL UNIQUE,
  group_type TEXT,
  status TEXT DEFAULT 'Active',
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME
);

-- User Security Group Permissions
CREATE TABLE cp_user_group_permissions (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  permission_type TEXT, -- MenuAccess, CMMenuAccess, CaseActivities, CMActivities, MobileActivities
  permission_name TEXT,
  enabled INTEGER DEFAULT 1,
  FOREIGN KEY (group_id) REFERENCES cp_user_security_groups(id)
);

-- User Configuration
CREATE TABLE cp_user_configuration (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  user_name TEXT,
  email_id TEXT,
  user_type TEXT,
  primary_site_id INTEGER,
  security_group_id INTEGER,
  status TEXT DEFAULT 'Active',
  access_expiry_date DATE,
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME,
  FOREIGN KEY (primary_site_id) REFERENCES cp_sites(id),
  FOREIGN KEY (security_group_id) REFERENCES cp_user_security_groups(id)
);

-- User Site Access
CREATE TABLE cp_user_site_access (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id INTEGER NOT NULL,
  access_level TEXT, -- FullAccess, ReadOnly
  FOREIGN KEY (site_id) REFERENCES cp_sites(id),
  UNIQUE(user_id, site_id)
);

-- User Additional Activities
CREATE TABLE cp_user_additional_activities (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_name TEXT,
  enabled INTEGER DEFAULT 1,
  date_from DATE,
  date_to DATE
);

-- Case Contacts Repository
CREATE TABLE cp_case_contacts (
  id INTEGER PRIMARY KEY,
  prefix TEXT,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  primary_degree TEXT,
  secondary_degree TEXT,
  title TEXT,
  reference_no TEXT,
  address TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT NOT NULL,
  organization TEXT,
  department_institution TEXT NOT NULL,
  preferred_contact_method TEXT,
  phone_number TEXT,
  phone_ext TEXT,
  other_phone TEXT,
  other_phone_ext TEXT,
  fax_number TEXT,
  fax_ext TEXT,
  email_id TEXT,
  reporter_type TEXT,
  occupation TEXT,
  speciality TEXT,
  site_id INTEGER,
  notes TEXT,
  created_by TEXT,
  created_date DATETIME,
  modified_by TEXT,
  modified_date DATETIME,
  FOREIGN KEY (site_id) REFERENCES cp_sites(id)
);

-- Company Representative Teams
CREATE TABLE cp_company_rep_teams (
  id INTEGER PRIMARY KEY,
  team_name TEXT NOT NULL UNIQUE,
  team_type TEXT, -- Site-specific, Product-specific, Product Family-specific
  is_msl_team INTEGER DEFAULT 0,
  created_by TEXT,
  created_date DATETIME
);

-- Company Rep Team Regions
CREATE TABLE cp_rep_regions (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,
  region_name TEXT NOT NULL,
  region_id TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES cp_company_rep_teams(id),
  UNIQUE(team_id, region_id)
);

-- Company Rep Team Districts
CREATE TABLE cp_rep_districts (
  id INTEGER PRIMARY KEY,
  region_id INTEGER NOT NULL,
  district_name TEXT NOT NULL,
  district_id TEXT NOT NULL,
  FOREIGN KEY (region_id) REFERENCES cp_rep_regions(id),
  UNIQUE(region_id, district_id)
);

-- Company Rep Team Territories
CREATE TABLE cp_rep_territories (
  id INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL,
  territory_name TEXT NOT NULL,
  territory_id TEXT NOT NULL,
  zip_codes TEXT, -- JSON array
  FOREIGN KEY (district_id) REFERENCES cp_rep_districts(id),
  UNIQUE(district_id, territory_id)
);

-- Company Representatives
CREATE TABLE cp_company_representatives (
  id INTEGER PRIMARY KEY,
  territory_id INTEGER NOT NULL,
  rep_id TEXT NOT NULL,
  rep_type TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  other_phone TEXT,
  city TEXT,
  state TEXT,
  zipcode TEXT,
  created_by TEXT,
  created_date DATETIME,
  FOREIGN KEY (territory_id) REFERENCES cp_rep_territories(id)
);

-- Admin Audit Trail
CREATE TABLE cp_admin_audit_trail (
  id INTEGER PRIMARY KEY,
  category TEXT, -- Picklists, Sites, Workflow, Products, Users, etc.
  sub_category TEXT,
  config_name TEXT,
  changed_by TEXT,
  changed_date DATETIME,
  previous_value TEXT,
  new_value TEXT,
  reason_for_change TEXT, -- NEW FIELD
  created_date DATETIME
);

-- Login Audit Trail
CREATE TABLE cp_login_audit_trail (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  ip_address TEXT,
  browser_info TEXT,
  login_logout_type TEXT, -- Login, Logout
  system_time DATETIME,
  status TEXT, -- Successful, Failed
  failure_reason TEXT, -- Wrong Password, Account Locked, etc.
  created_date DATETIME
);

-- Retention & Archive
CREATE TABLE cp_audit_archive (
  id INTEGER PRIMARY KEY,
  source_table TEXT, -- cp_admin_audit_trail, cp_login_audit_trail
  archived_data TEXT, -- JSON blob
  archive_date DATETIME,
  retention_end_date DATE -- 365 days from archive date
);
```

---

## 8. User Stories (Complete List)

[All user stories are embedded in section 5.1–5.9 above. Below is a consolidated list for reference.]

### Picklists
1. As an admin, I can search for picklists by name or field type so I can quickly find what I need to modify.
2. As an admin, I can add a new picklist value with description so case agents have clear options to choose from.
3. As an admin, I can bulk upload picklist changes from Excel so I don't have to enter each value individually.
4. As an admin, I can deactivate (not delete) picklist values so old values are hidden but audit trail remains.
5. As an admin, I can download current picklists as Excel template so I can bulk modify offline and re-upload.

### Field Setup
6. As an admin, I can hide/disable certain fields in the case form so that case agents only see relevant fields.
7. As an admin, I can rename a field label to match business terminology so agents understand what to enter.
8. As an admin, I can mark a field as required so critical information is always captured.
9. As an admin, I can define custom flex fields (dropdown/text/date) so the form adapts to business needs without code changes.

### Site & Email Setup
10. As an admin, I can create multiple sites for different call centers so each location manages its own cases independently.
11. As an admin, I can configure email accounts for each site so case notifications and transmissions are sent from the correct organizational email.
12. As an admin, I can test email account connectivity so I confirm SMTP/IMAP settings are correct before going live.
13. As an admin, I can configure email retry logic so failed notifications are automatically retried 3 times at 5-minute intervals.
14. As an admin, I can configure data deletion rules (Right to Forget) so the system complies with GDPR/privacy regulations.
15. As a system, I automatically retry failed email notifications 3 times with 5-minute intervals, then escalate to admin queue.
16. As a system, I log all email retry attempts in the audit trail for compliance reporting.

### Workflow
17. As an admin, I can define workflow states so cases flow through the right stages in the right order.
18. As an admin, I can configure case activities per state so users can only perform allowed actions in each state.
19. As an admin, I can create workflow rules so cases transition between states automatically or on user action.
20. As an admin, I can require mandatory activities on a transition so critical steps (approval, comment) are not skipped.
21. As an admin, I can set up email notifications for a state so the right people are alerted when a case enters that state.
22. As a system, I prevent invalid workflow transitions (e.g., no circular dependencies).
23. As a system, I enforce mandatory activities before allowing a state transition.

### Products
24. As an admin, I can create product families and group related products so products are organized for easy access.
25. As an admin, I can configure product approvals (trade names, market holders, approval types) so regulatory requirements are tracked.
26. As an admin, I can add country-specific authorizations for products so country-specific regulations are honored.
27. As an admin, I can bulk upload product data from Excel so I don't have to enter each product individually.
28. As a case agent, I can select a product from the configured dictionary when creating a case so consistent product information is used.

### Access Configurations
29. As an admin, I can create a security group with specific menu and activity permissions so users in that group can only see/do what they need.
30. As an admin, I can assign multiple activities to a group so role-based access is granular and secure.
31. As an admin, I can assign a user to a security group so their access is controlled by group privileges.
32. As an admin, I can assign users to multiple sites with Full/Read-Only access so they can access what they need across locations.
33. As an admin, I can grant additional activities to a user so role exceptions are handled without creating new groups.
34. As an admin, I can set an access expiry date for a contractor so their access automatically expires after the contract ends.
35. As an admin, I can request approval for sensitive permission changes so critical access updates are not made unilaterally.
36. As a system, I enforce that sensitive permission changes require approval from designated approvers before taking effect.

### Contacts & Representatives
37. As a case agent, I can select a known contact when creating a case so I don't have to re-enter contact details.
38. As an admin, I can manage the contacts repository so accurate contact information is available system-wide.
39. As an admin, I can bulk upload contacts from Excel so I don't enter them individually.
40. As an admin, I can create company representative teams organized by region/district/territory so case routing and escalation can be regional.
41. As a case agent, I can select a company representative when documenting case interactions so representative information is tracked.

### Audit & Compliance
42. As an admin, I can search configuration change history so I know who changed what and when.
43. As a compliance officer, I can view and export audit records so I can generate compliance reports (e.g., 21 CFR Part 11, GxP).
44. As an admin, I can enter a reason for configuration changes so the audit trail documents why changes were made.
45. As a system, I log all configuration changes with user, timestamp, before/after values, and reason for compliance.
46. As an admin, I can view login audit trail so I know who logged in and when.
47. As a security officer, I can search for failed login attempts so I can investigate suspicious activity.
48. As a compliance officer, I can export login audit data for regulatory compliance.

### Cross-Cutting
49. As an admin, I can see which entities depend on a configuration so I know the impact before deleting.
50. As an admin, I can view a readiness checklist so I know what configurations are still needed before going live.

---

## 9. V1 / V2 / Phase 3 Scope

### ✅ V1 SCOPE (APPROVED FOR DEVELOPMENT)

**Core Features:**
- [x] Picklists Management (with bulk Excel operations)
- [x] Field Setup (case form configuration)
- [x] Site & Email Account Setup (with email retry logic)
- [x] Workflow States & Rules (case form workflows)
- [x] Product Dictionary Configuration (products, families, approvals, country auth)
- [x] Access Configurations (security groups + user configuration + time-based expiry + optional approval workflows)
- [x] Case Contacts Repository (bulk upload/download)
- [x] Company Representatives (team management by region/district/territory)
- [x] Admin Audit Trail (with reason for change field)
- [x] Login Audit Trail

**Cross-Cutting Features (V1):**
- [x] Advanced Search & Bulk Operations (faceted, saved searches)
- [x] Configuration Templates (save/clone/version)
- [x] Smart Notifications & Alerts (picklist deprecation, workflow warnings, etc.)
- [x] Email Retry & Automation (3 retries, 5-min intervals — LOCKED IN)
- [x] Dependency Mapping Dashboard (show impact before delete)
- [x] Configuration Validation & Readiness Checks
- [x] Audit Trail Enhancements (before/after, timeline, rollback with approval)
- [x] Content Management Integration (folder mgt, CM picklists, alerts, activity logging)
- [x] UI Improvements (inline add, grid toggle, status enums, bulk assignment, toast + undo)

**API Endpoints:**
- [x] User can manage API keys for system integrations in admin console

---

### 🔄 V2 SCOPE (FUTURE)

- [ ] Workflow diagram/visualization (show state machine graphically)
- [ ] Conditional routing in workflow rules (if-then logic)
- [ ] Workflow rules circular dependency detection (prevent invalid states)
- [ ] Multi-language support (field labels, picklist values, product names in multiple languages)
- [ ] Bulk email/site configuration via CSV (template-driven)
- [ ] Advanced dependency tracking (e.g., show all cases using a specific product in last 30 days)
- [ ] External picklist imports (integrate with 3rd-party data sources)
- [ ] Approval workflows for sensitive config changes (optional feature)
- [ ] Configuration change rollback (optional, requires approval)

---

### 📅 PHASE 3 (STRATEGIC FUTURE)

- [ ] Real-time collaboration on configuration (WebSocket-based)
- [ ] Word document integration for product manuals/templates
- [ ] Advanced reporting & analytics dashboards
- [ ] AI-powered configuration recommendations
- [ ] Multi-tenant admin console (if product pivots to SaaS)
- [ ] Mobile admin interface
- [ ] Custom workflow builder (visual state machine editor)
- [ ] Third-party system integrations (Salesforce, SAP, etc.)

---

## 10. Navigation Structure

```
MIMS (Top Header)
└── Admin Console (Top Nav Item)
    ├── Admin Console Overview (landing page with card grid)
    │   ├── Left Column (vertical list):
    │   │   ├── Picklists
    │   │   ├── Email Accounts
    │   │   ├── Sites Setup
    │   │   ├── Workflow Setup
    │   │   ├── Case Numbering
    │   │   ├── Data Protection & Privacy Rules
    │   │   ├── Transmission Rules
    │   │   ├── Other Configurations
    │   │   ├── Case Reporting
    │   │   ├── Help System
    │   │   └── SSP Setup
    │   │
    │   └── Right Grid (4 columns):
    │       ├── Product Setup (Product Groups, Product Dictionary)
    │       ├── Access Configurations (User Security Groups, User Configuration)
    │       ├── Analytics (Analytics URL, Master Reports)
    │       ├── Audit Trail (Admin Audit Trail, Login Audit Trail)
    │       ├── Form Configurations (Field Setup, Case Form Definition, Custom Forms)
    │       ├── Contact Master (Case Contacts, Company Reps, Org Address Book)
    │       ├── Integration Setup (Contacts, MIR, CRM, Content, Transmission)
    │       └── Logs (Service Log, System Activity)
    │
    └── Individual Configuration Pages (when selecting above items)
        ├── Picklists.jsx
        ├── EmailAccounts.jsx
        ├── SitesSetup.jsx
        ├── WorkflowSetup.jsx
        ├── FieldSetup.jsx
        ├── ProductDictionary.jsx
        ├── UserSecurityGroups.jsx
        ├── UserConfiguration.jsx
        ├── CaseContacts.jsx
        ├── CompanyRepresentatives.jsx
        ├── AdminAuditTrail.jsx
        ├── LoginAuditTrail.jsx
        └── (other config pages)
```

---

## 11. Frontend Entry Points

- **Main Entry:** `mims/frontend/src/modules/admin/pages/AdminConsoleOverview.jsx`
- **Router:** `mims/frontend/src/modules/admin/AdminConsoleRouter.jsx`
- **Layout:** `mims/frontend/src/shared/components/MIMSLayout.jsx`
- **CSS Prefix:** `ac-` (admin console) — e.g., `.ac-overview-wrapper`, `.ac-card`, `.ac-left-item`
- **Navigation Breadcrumb:** "Admin Console > [Section Name]"

---

## 12. Backend Routes

**New route directory:** `mims/backend/routes/admin/`

**Endpoints (examples):**
```
POST   /api/admin/picklists
GET    /api/admin/picklists
GET    /api/admin/picklists/:id
PUT    /api/admin/picklists/:id
DELETE /api/admin/picklists/:id
POST   /api/admin/picklists/bulk-upload  (Excel upload)
GET    /api/admin/picklists/bulk-download (Excel download)

POST   /api/admin/email-accounts
GET    /api/admin/email-accounts
POST   /api/admin/email-accounts/test-connection

POST   /api/admin/sites
GET    /api/admin/sites
GET    /api/admin/sites/:id/alerts

POST   /api/admin/workflow-states
POST   /api/admin/workflow-rules
GET    /api/admin/workflow-rules/validate (check for circular dependencies)

POST   /api/admin/products
GET    /api/admin/products
GET    /api/admin/products/:id/dependencies (which cases use this product?)

POST   /api/admin/security-groups
GET    /api/admin/security-groups
GET    /api/admin/security-groups/:id/users (how many users in group?)

POST   /api/admin/users
GET    /api/admin/users
PUT    /api/admin/users/:id/access-expiry

GET    /api/admin/audit-trail
GET    /api/admin/audit-trail/export (PDF/Excel)
GET    /api/admin/login-audit-trail

POST   /api/admin/email-retry-log (internal — tracks retry attempts)
```

---

## 13. Rajeev's Build Start Checklist

**Before starting development, confirm:**

- [ ] FRD reviewed and all sections understood
- [ ] V1 vs V2 scope boundaries clear (e.g., workflow diagram is V2, not V1)
- [ ] Email retry logic locked in: 3 retries at 5-min intervals, escalate after
- [ ] User access expiry date feature understood (optional, date-based auto-disable)
- [ ] Sensitive change approvals optional (can be implemented in V1 or deferred)
- [ ] Audit trail "reason for change" field is required in V1
- [ ] Content Management integration defined (link to CM folder, alerts, activity logging)
- [ ] Database schema reviewed and migration plan ready
- [ ] User role mapping deferred to Admin Console > User Management sprint (use privilege names for feature flags)
- [ ] Authentication: HTTP-only cookies for admin (use `adminHeaders()` from AdminAuthContext)
- [ ] Notification system: use existing `notifyPortalUsers()` for CM notifications; extend for admin notifications
- [ ] Testing: unit tests for email retry logic, workflow rule validation, dependency mapping
- [ ] Browser testing: admin console in Chrome, Firefox, Safari on desktop (mobile not in V1)

---

## 14. Key Technical Decisions

1. **Email Retry Mechanism:** 3 retries × 5 minutes = 15-minute window before escalation. Not configurable (locked in per Rohith).
2. **User Access Expiry:** Date-based auto-disable. No gradual revocation (e.g., warning period).
3. **Soft Delete:** Configurations marked as Inactive, not hard-deleted, for audit trail preservation.
4. **Workflow Validation:** Circular dependencies detected at save time; warning given if state has no exit rules.
5. **Dependency Mapping:** Show count + link to related entities (cases using product, users in group, etc.).
6. **Audit Reason Field:** Required when saving configuration changes; captured as free-text.
7. **Configuration Templates:** Can be versioned and cloned; useful for multi-site rollouts.
8. **Content Integration:** Admin console provides CM folder + picklist + alert management; detailed CM admin logic in Content Management FRD.

---

## 15. Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Picklist** | Dropdown values configured for case form fields |
| **Field Setup** | Configuration of case form sections and field attributes (required, hidden, disabled, custom label) |
| **Site** | Organizational unit (call center, region); cases belong to a site |
| **Email Account** | SMTP/IMAP credentials for sending/receiving case-related emails |
| **Workflow State** | Status a case can be in (Intake, Data Entry, Under Review, etc.) |
| **Workflow Rule** | Transition from one state to another |
| **Product Family** | Grouping of related products by ingredient similarity |
| **Approval** | Market authorization for a product (trade name, approval type, number) |
| **Country Authorization** | Product approval valid in a specific country with country-specific details (award date, etc.) |
| **Security Group** | Collection of menu/activity permissions assigned to users |
| **User Configuration** | User's site access, security group, additional activities, and access expiry date |
| **Case Contact** | Master data for reporters/contacts (healthcare professionals, companies, etc.) |
| **Company Representative** | Sales/MSL representatives organized by region, district, territory |
| **Audit Trail** | Log of configuration changes and user login activity |
| **Email Retry** | Automatic re-attempt of failed notification emails (3 times, 5-min intervals) |
| **Right to Forget** | GDPR compliance feature — data deletion workflow based on rules |
| **Dependency Mapping** | Show which entities depend on a configuration (e.g., which cases use a product) |
| **Configuration Template** | Saved snapshot of configurations (site setup, workflow, etc.) that can be cloned for new orgs |
| **Phase 3** | Strategic future roadmap (real-time collaboration, Word integration, advanced analytics) |

---

## 16. Document Control

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-03-23 | Rohith (CPO), Vanaja (PM) | Initial FRD — V1 scope frozen |
| — | — | — | — |

---

**Document Status:** ✅ **APPROVED FOR DEVELOPMENT**

**Next Steps:**
1. Rajeev reviews and clarifies any technical questions
2. Team creates detailed user stories + acceptance criteria
3. Database migration script prepared
4. Frontend scaffolding and backend route stubs created
5. Development sprints begin with Picklists (simplest) → Site & Email → Workflow → Products → Access → Audit

---

**END OF DOCUMENT**

---

*For questions or clarifications, contact Rohith (CPO) or Vanaja (PM).*
