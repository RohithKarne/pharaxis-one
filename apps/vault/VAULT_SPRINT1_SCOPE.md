# Pharaxis Vault — Sprint 1 Scope
> **Purpose:** Complete handover document for the external development team.
> **App:** Pharaxis Vault — located at `apps/vault/` within the Pharaxis One monorepo.
> **Date:** 2026-04-08
> **Prepared by:** Vanaja (Product) + Bala (PM)

---

## 1. Product Overview

**Pharaxis Vault** is a regulated content management platform — a Veeva Vault challenger built for life sciences and healthcare mid-size companies. It provides a centralised content hub that integrates with any downstream application via open API.

**Core value proposition:**
- Everything Veeva Vault does, at 50% of the cost
- Open API — not locked to one vendor ecosystem
- Built for regulated industries: pharma, life sciences, healthcare
- Single source of truth for content, mapped to multiple downstream apps

**Target customer:** Mid-size pharma / healthcare companies. Anchor: Novartis.

---

## 2. Tech Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js v18+ |
| Framework | Express ^4.x |
| Auth | jsonwebtoken ^9.x |
| Password hashing | bcrypt ^6.x |
| DB driver | mysql2 ^3.x |
| File upload | multer ^2.x |
| File storage | AWS S3 (prod) / MinIO (local dev) |
| Scheduled jobs | node-cron ^4.x |
| PDF watermarking | pdf-lib |
| Email | nodemailer ^8.x |
| Dev server | nodemon ^3.x |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React ^19.x |
| Build tool | Vite ^7.x |
| Routing | react-router-dom ^7.x |
| PDF inline viewer | PDF.js |

### Database
| Component | Detail |
|-----------|--------|
| Engine | MySQL 8.0.45 (native, NOT Docker) |
| Port | 3306 |
| Database name | `pharaxis_vault_dev` |
| User | `devuser` / `devpass` |
| Root password | `Manager@123` |
| Location | `/usr/local/mysql/` on Mac |

### Environment File — `apps/vault/.env`
```
PORT=5000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=devuser
MYSQL_PASSWORD=devpass
MYSQL_DATABASE=pharaxis_vault_dev
JWT_SECRET=<set_a_strong_secret>
SUPERADMIN_JWT_SECRET=<set_a_different_strong_secret>
S3_BUCKET=pharaxis-vault-dev
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

---

## 3. Architecture — Non-Negotiable Rules

These rules are enforced by the architecture owner (Bhavya). Violating them requires approval before any workaround.

| Rule | Detail |
|------|--------|
| **org_id on every table** | Every single table must carry `org_id`. No exceptions. All queries must be scoped by `org_id`. |
| **Multi-tenancy: single DB** | One database `pharaxis_vault_dev`. No schema-per-org. Tenant isolation via `org_id` only. |
| **Immutable versions** | `vault_versions` rows are NEVER updated or deleted. Insert only. |
| **Audit log insert-only** | `vault_audit_log` rows are NEVER updated or deleted. |
| **No hard deletes** | All records use status flags (is_active, status enum). Never DELETE a record. |
| **Check-out lock is server-side** | Lock enforced at API level — not just UI. Bypass attempt returns HTTP 423 Locked. |
| **Watermark at render time** | Source file stored on S3 is NEVER modified. Watermark is applied on-the-fly at view time. |
| **SuperAdmin JWT** | Signed with `SUPERADMIN_JWT_SECRET`. Token stored as `vault_superadmin_token` in localStorage. |
| **Org user JWT** | Signed with `JWT_SECRET`. Token stored as `vault_token` in localStorage. |
| **JWT fields** | Org user: `{ userId, orgId, role }`. SuperAdmin: `{ superadminId }`. |
| **Role check pattern** | Always use `req.user.role` from middleware. Never trust role from request body. |
| **No cross-org data** | Every SQL query that returns org data must include `WHERE org_id = req.user.orgId`. |

---

## 4. Three-Tier Access Model

```
Tier 1 — Pharaxis SuperAdmin (Pharaxis internal team only)
  - Create / manage orgs, onboard / offboard customers
  - System-wide audit and monitoring
  - Manage Connect Hub integrations globally
  - Platform health dashboard
  - Login: /superadmin — uses vault_superadmin_token

Tier 2 — Org Admin (customer admin, e.g. Novartis admin)
  - Manage users within their org
  - Configure taxonomy (types, subtypes, classifications)
  - Configure lifecycle rules
  - Manage org-level Content Channels (integrations)
  - View org audit trail

Tier 3 — Org Users (authors, reviewers, approvers, viewers)
  - Upload, review, approve, search content
  - Role-based permissions within their org
  - Login: / — uses vault_token
```

**5 Org Roles (stored in `users.role`):** `admin` | `author` | `reviewer` | `approver` | `viewer`

---

## 5. Folder Structure

```
apps/vault/
├── .env
├── .env.example
├── package.json                         ← backend package
├── backend/
│   ├── server.js                        ← Express entry point, port 5000
│   ├── database/
│   │   └── db.js                        ← mysql2 pool + initializeDatabase() (21 tables)
│   ├── middleware/
│   │   ├── auth.js                      ← JWT verify for org users → req.user
│   │   └── superadminAuth.js            ← JWT verify for superadmin → req.superadmin
│   ├── routes/
│   │   ├── auth.js                      ← /api/auth/* — login, logout, me
│   │   ├── superadminAuth.js            ← /api/superadmin/* — login, orgs CRUD
│   │   └── (remaining routes — to be built in Sprint 1)
│   └── services/
│       └── (service files — to be built in Sprint 1)
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                      ← React Router root
        └── modules/
            ├── auth/pages/
            │   └── LoginPage.jsx        ← org user login (orgSlug + email + password)
            ├── superadmin/pages/
            │   └── SuperadminLoginPage.jsx
            ├── vault/                   ← content browsing, upload, viewer
            ├── admin/                   ← org admin console
            └── (remaining modules — to be built in Sprint 1)
```

---

## 6. Database Schema — All 21 Tables

All tables already created via `initializeDatabase()` in `backend/database/db.js`. Do NOT re-create them. Add columns via ALTER TABLE if needed.

| # | Table | Key Columns | Notes |
|---|-------|-------------|-------|
| 1 | `superadmin_users` | id, name, email, password_hash, is_active | No org_id — cross-org |
| 2 | `orgs` | id, name, slug (UNIQUE), doc_number_prefix, status, storage_quota_mb | slug used at login |
| 3 | `users` | id, org_id, name, email, password_hash, role, is_active | UNIQUE(email, org_id) |
| 4 | `content_types` | id, org_id, name, code, is_active | UNIQUE(org_id, code) |
| 5 | `content_subtypes` | id, org_id, content_type_id, name, is_active | — |
| 6 | `classifications` | id, org_id, content_subtype_id, name, is_active | — |
| 7 | `vault_folders` | id, org_id, parent_id (self-ref), name, path, created_by | Hierarchical |
| 8 | `vault_content` | id, org_id, doc_number (UNIQUE), title, folder_id, content_type_id, lifecycle_state, current_version_id | Master record |
| 9 | `vault_versions` | id, org_id, content_id, version_number, file_name, s3_key, checksum, uploaded_by | INSERT ONLY |
| 10 | `vault_metadata` | id, org_id, content_id (UNIQUE), language, country_region, audience, confidentiality, regulated, expiry_date | 1-to-1 with vault_content |
| 11 | `doc_number_sequences` | id, org_id, content_type_id, year, last_sequence | UNIQUE(org_id, type, year) |
| 12 | `checkout_locks` | id, org_id, content_id (UNIQUE), locked_by, locked_at, force_released_by | One lock per content |
| 13 | `lifecycle_states` | id, org_id, content_type_id, state_name, state_code, is_initial, is_terminal | — |
| 14 | `lifecycle_transitions` | id, org_id, content_type_id, from_state, to_state, allowed_roles | — |
| 15 | `vault_dossiers` | id, org_id, title, description, status, created_by | — |
| 16 | `dossier_items` | id, org_id, dossier_id, content_id, position, added_by | — |
| 17 | `content_slots` | id, org_id, folder_id, dossier_id, title, expected_type_id, due_date, status, filled_content_id | status: pending/filled |
| 18 | `vault_audit_log` | id (BIGINT), org_id, user_id, user_type, action, entity_type, entity_id, before_value, after_value | INSERT ONLY |
| 19 | `login_audit` | id (BIGINT), org_id, user_id, user_type, email, action, ip_address | No org_id constraint |
| 20 | `content_channels` | id, org_id, app_name, api_key (UNIQUE), webhook_url, status | — |
| 21 | `org_config` | id, org_id, config_key, config_value | UNIQUE(org_id, config_key) |

---

## 7. Current State — What Is Already Built

**Feature 1 (Project Setup & Auth) — COMPLETE**

The following files are already implemented and working. Do not rewrite them — build on top of them.

### Backend — Already Built
| File | What It Does |
|------|-------------|
| `backend/server.js` | Express server, port 5000, wires `/api/auth` and `/api/superadmin` routes, calls `initializeDatabase()` on start |
| `backend/database/db.js` | mysql2 pool + `initializeDatabase()` — creates all 21 tables if not exist |
| `backend/middleware/auth.js` | Verifies Bearer JWT using `JWT_SECRET`, attaches `req.user = { userId, orgId, role }` |
| `backend/middleware/superadminAuth.js` | Verifies Bearer JWT using `SUPERADMIN_JWT_SECRET`, attaches `req.superadmin = { superadminId }` |
| `backend/routes/auth.js` | `POST /api/auth/login` (orgSlug + email + password, logs to login_audit), `POST /api/auth/logout`, `GET /api/auth/me` |
| `backend/routes/superadminAuth.js` | `POST /api/superadmin/login`, `GET /api/superadmin/orgs` (with user count), `POST /api/superadmin/orgs`, `PATCH /api/superadmin/orgs/:id/status` |

### Frontend — Already Built
| File | What It Does |
|------|-------------|
| `frontend/src/App.jsx` | React Router: `/` → LoginPage, `/vault` → placeholder, `/superadmin` → SuperadminLoginPage, `/superadmin/dashboard` → placeholder |
| `frontend/src/modules/auth/pages/LoginPage.jsx` | 3-field login (orgSlug, email, password), POSTs to `/api/auth/login`, stores `vault_token` in localStorage |
| `frontend/src/modules/superadmin/pages/SuperadminLoginPage.jsx` | POSTs to `/api/superadmin/login`, stores `vault_superadmin_token` in localStorage |

### How to Start the App (Local Dev)
```bash
# Backend (from apps/vault/)
npm install          # if not done
node backend/server.js   # or: npx nodemon backend/server.js

# Frontend (from apps/vault/frontend/)
npm install          # if not done
npm run dev          # Vite dev server on http://localhost:5173

# Backend runs on: http://localhost:5000
# Frontend proxy: vite.config.js proxies /api → http://localhost:5000
```

---

## 8. Sprint 1 — Feature Backlog (Features 2–20)

**Features 1 is DONE. Build features 2–20 in the order listed below. Do not skip or reorder.**

---

### Feature 2 — Org & User Management
**Priority:** P1 | **Effort:** M | **Owner:** Bhavya, Vivek

**Description:** Org admin can invite, view, deactivate and update role of users within their org. All user operations are scoped to the admin's org_id.

**User Stories:**
- As an org admin, I can see a list of all users in my org (name, email, role, status, last login)
- As an org admin, I can create a new user by entering name, email, role and a temporary password
- As an org admin, I can change a user's role (admin / author / reviewer / approver / viewer)
- As an org admin, I can deactivate a user (is_active = 0). No hard delete.
- As a user, I cannot see or modify users from another org

**Backend — create `backend/routes/users.js`:**
```
GET    /api/users              → list users WHERE org_id = req.user.orgId
POST   /api/users              → create user (name, email, role, password). bcrypt hash. Requires role=admin.
PATCH  /api/users/:id          → update role or is_active. Requires role=admin. Verify user.org_id = req.user.orgId.
DELETE not permitted           → use PATCH is_active=0 only
```
Wire in `server.js`: `app.use('/api/users', require('./routes/users'))`

**Frontend — create `frontend/src/modules/admin/pages/UsersPage.jsx`:**
- Table: name, email, role, status, last login
- Add User modal: name, email, role, password fields
- Edit row: role dropdown + activate/deactivate toggle
- Role filter dropdown at top

**Audit:** Log `user_created`, `user_role_changed`, `user_deactivated` to `vault_audit_log` on each action.

---

### Feature 3 — Content Type & Taxonomy
**Priority:** P1 | **Effort:** M | **Owner:** Bhavya, Vivek

**Description:** Org admin configures the taxonomy tree: content types → subtypes → classifications. This drives the document classification system throughout the app.

**User Stories:**
- As an org admin, I can create, rename, and deactivate content types for my org (e.g. SOP, Policy, Template)
- As an org admin, I can create subtypes under each content type
- As an org admin, I can create classification values under each subtype
- Deactivated types/subtypes/classifications are hidden from document upload forms but existing documents retain their values

**Backend — create `backend/routes/taxonomy.js`:**
```
GET    /api/taxonomy/types                       → list content_types WHERE org_id = req.user.orgId
POST   /api/taxonomy/types                       → create content type. Requires admin.
PATCH  /api/taxonomy/types/:id                   → update name or is_active. Requires admin.

GET    /api/taxonomy/types/:typeId/subtypes       → list subtypes for a type
POST   /api/taxonomy/types/:typeId/subtypes       → create subtype. Requires admin.
PATCH  /api/taxonomy/subtypes/:id                → update name or is_active. Requires admin.

GET    /api/taxonomy/subtypes/:subtypeId/classifications  → list classifications
POST   /api/taxonomy/subtypes/:subtypeId/classifications  → create classification. Requires admin.
PATCH  /api/taxonomy/classifications/:id                  → update name or is_active. Requires admin.
```
Wire in `server.js`: `app.use('/api/taxonomy', require('./routes/taxonomy'))`

**Frontend — create `frontend/src/modules/admin/pages/TaxonomyPage.jsx`:**
- Three-column layout: Types → Subtypes → Classifications
- Clicking a type shows its subtypes. Clicking a subtype shows its classifications.
- Add / Rename / Deactivate inline for each column

---

### Feature 4 — Folder Structure
**Priority:** P1 | **Effort:** S | **Owner:** Vivek

**Description:** Folders provide hierarchical organisation for content. Folders are org-scoped. Support root folders and nested sub-folders.

**User Stories:**
- As any org user, I can see the folder tree for my org
- As an org admin or author, I can create a new folder (root or nested under any existing folder)
- As an org admin, I can rename a folder
- Folders cannot be deleted if they contain content

**Backend — create `backend/routes/folders.js`:**
```
GET    /api/folders             → full folder tree for req.user.orgId (nested structure)
POST   /api/folders             → create folder (name, parent_id). Compute path. Requires admin or author.
PATCH  /api/folders/:id         → rename. Requires admin. Verify org_id.
DELETE /api/folders/:id         → block if any vault_content.folder_id = this folder. Return 409 with count. Requires admin.
```
Wire in `server.js`: `app.use('/api/folders', require('./routes/folders'))`

**Frontend — create `frontend/src/modules/vault/components/FolderTree.jsx`:**
- Collapsible tree sidebar panel
- Clicking a folder filters the content list to that folder
- Right-click or icon to add sub-folder, rename folder

---

### Feature 5 — Document Upload & Storage
**Priority:** P1 | **Effort:** L | **Owner:** Bhavya, Vivek

**Description:** Users upload files (PDF, Word, Excel, images). On upload, a `vault_content` record is created, a `vault_versions` record is inserted (v1), a `vault_metadata` record is created, and the file is stored in S3 (prod) or MinIO (local dev). Auto-numbering runs at upload time.

**User Stories:**
- As an author, I can upload a new document by selecting file, entering title, choosing type/subtype/classification and folder
- The system auto-assigns a document number (e.g. PHX-SOP-2026-00001)
- Uploaded document appears in the content list with status = `draft`
- As an author, I can upload a new version of an existing document (increments version number, old version retained)

**Allowed file types:** PDF, DOCX, DOC, XLSX, XLS, PNG, JPG, JPEG. Max size: 50MB.

**Backend — create `backend/routes/upload.js` and `backend/services/storageService.js`:**
```
POST   /api/upload              → upload new document. Multipart form. Fields: title, folder_id, content_type_id, content_subtype_id, classification_id, file. Requires author or admin.
POST   /api/upload/:contentId/version → upload new version of existing doc. Requires author or admin. Must hold checkout lock.
```
Wire in `server.js`: `app.use('/api/upload', require('./routes/upload'))`

**`backend/services/storageService.js`:**
- `uploadFile(file, orgId, contentId, versionId)` → uploads to MinIO (local) or S3 (prod) based on env
- `getSignedUrl(s3Key)` → returns time-limited signed URL for download/view
- Returns `s3_key`, `file_path`, `file_size_kb`, `mime_type`, `checksum` (SHA-256)

**On upload, the route must:**
1. Call `numberingService.generateDocNumber(orgId, contentTypeId)` → get doc_number
2. INSERT into `vault_content` (doc_number, title, folder_id, type, status=draft, created_by)
3. INSERT into `vault_versions` (content_id, version_number=1.0, s3_key, checksum, uploaded_by)
4. UPDATE `vault_content.current_version_id` to new version id
5. INSERT into `vault_metadata` (content_id, defaults only — extended metadata via Feature 10)
6. INSERT into `vault_audit_log` (action=document_uploaded)

**Frontend — create `frontend/src/modules/vault/pages/UploadPage.jsx`:**
- File picker (drag-and-drop + browse)
- Fields: title, content type (dropdown from taxonomy), subtype, classification, folder (folder tree picker)
- Progress bar during upload
- On success: show assigned doc number, redirect to content detail

---

### Feature 6 — Auto-Numbering
**Priority:** P1 | **Effort:** S | **Owner:** Vivek

**Description:** Every document gets a unique auto-assigned number in the format `{ORG_PREFIX}-{TYPE_CODE}-{YEAR}-{SEQUENCE}`. Sequence is per org per content type per year, zero-padded to 5 digits.

**Example:** `PHX-SOP-2026-00001`, `PHX-SOP-2026-00002`, `NVT-POL-2026-00001`

**Backend — create `backend/services/numberingService.js`:**
```javascript
async function generateDocNumber(orgId, contentTypeId) {
  // 1. Get org doc_number_prefix from orgs table
  // 2. Get content type code from content_types table
  // 3. Get current year
  // 4. Use INSERT ... ON DUPLICATE KEY UPDATE last_sequence = last_sequence + 1 on doc_number_sequences
  //    to atomically increment and retrieve the new sequence number
  // 5. Return formatted string: {prefix}-{typeCode}-{year}-{padded sequence}
}
```

**Rules:**
- Sequence resets to 1 on new year automatically (new row in doc_number_sequences)
- Sequence is atomic — concurrent uploads must not produce duplicate numbers
- Use a MySQL transaction with SELECT ... FOR UPDATE on `doc_number_sequences` to guarantee atomicity

---

### Feature 7 — Version Control
**Priority:** P1 | **Effort:** M | **Owner:** Bhavya, Vivek

**Description:** Every upload creates an immutable version record. All previous versions are retained and accessible. Users can view the version history and access any prior version.

**User Stories:**
- As any user, I can see the full version history of a document (version number, uploaded by, date, file size)
- As any user, I can download or view any previous version inline
- Versions are never deleted
- Re-uploading to an existing document creates version 2.0, 3.0 etc. (major versions for new file uploads)

**Version numbering convention:**
- New document upload: `1.0`
- New file version upload: `2.0`, `3.0` (increment major, reset minor)
- Minor revisions (metadata-only changes): `1.1`, `1.2` (increment minor — future feature)

**Backend — add to `backend/routes/content.js` (create this file):**
```
GET    /api/content/:id/versions    → list all versions for a content record. Requires org scope.
GET    /api/content/:id/versions/:versionId/download → return signed S3 URL for a specific version
```

**Frontend — create `frontend/src/modules/vault/components/VersionHistoryPanel.jsx`:**
- Accordion panel in content detail view
- Table: version number, uploaded by, date, file size, download icon
- Click version number → opens inline viewer for that version

---

### Feature 8 — Check-in / Check-out
**Priority:** P1 | **Effort:** M | **Owner:** Vivek

**Description:** Prevents two users from uploading conflicting versions. A user must check out a document before uploading a new version. The document is locked to that user until they check it back in. Admins can force-release a lock.

**User Stories:**
- As an author, I can check out a document to indicate I am editing it
- While checked out by me, no other user can upload a new version (returns HTTP 423)
- As an author, I can check the document back in when I'm done
- As an org admin, I can force-release any checkout lock (with reason logged to audit)
- Checked-out status is visible in the content list (who has it checked out, since when)

**Backend — create `backend/routes/checkout.js`:**
```
POST   /api/content/:id/checkout        → lock document. Insert into checkout_locks. Fails if already locked (423).
POST   /api/content/:id/checkin         → release lock. Only the locking user or admin can check in.
DELETE /api/content/:id/checkout/force  → admin force-release. Requires role=admin. Logs to audit.
GET    /api/content/:id/checkout        → get current lock status
```
Wire in `server.js`: `app.use('/api/content', require('./routes/content'))` (consolidate checkout + version + content routes here)

**Lock enforcement rule:** Upload route (`POST /api/upload/:contentId/version`) must verify `checkout_locks.locked_by = req.user.userId` before allowing new version upload. If not locked by current user, return 423.

**Frontend additions:**
- Content list shows lock indicator badge (user avatar or "Checked out by [Name]")
- Check Out / Check In button on content detail page
- Admin "Force Release" button with confirmation modal

---

### Feature 9 — Content Lifecycle
**Priority:** P1 | **Effort:** L | **Owner:** Bhavya, Vivek

**Description:** Documents move through a lifecycle state machine. Default lifecycle: `draft → in_review → approved → published → archived`. Transitions are role-enforced. The state machine is configurable per content type per org.

**Default lifecycle transitions:**
| From | To | Allowed Roles |
|------|----|--------------|
| draft | in_review | author, admin |
| in_review | approved | approver, admin |
| in_review | draft | reviewer, approver, admin (reject/send back) |
| approved | published | admin, approver |
| published | archived | admin |
| archived | draft | admin (unarchive) |

**User Stories:**
- As an author, I can submit my draft document for review
- As a reviewer, I can add comments and send back to draft, or pass to approver
- As an approver, I can approve a document or reject it back to draft
- As an admin, I can publish an approved document and archive published ones
- All lifecycle transitions are recorded in the audit log

**Backend — create `backend/services/lifecycleService.js`:**
```javascript
async function transition(orgId, contentId, toState, userId, role) {
  // 1. Get current lifecycle_state from vault_content
  // 2. Check lifecycle_transitions table for a row matching (org_id, from_state=current, to_state=toState)
  //    where allowed_roles contains the user's role
  // 3. If no valid transition found → return 403
  // 4. UPDATE vault_content SET lifecycle_state = toState
  // 5. INSERT into vault_audit_log (action=lifecycle_transition, before_value=current, after_value=toState)
  // 6. Return updated content
}
```

**Backend — add to `backend/routes/content.js`:**
```
POST   /api/content/:id/transition   → body: { toState }. Calls lifecycleService.transition().
```

**Backend — add lifecycle seeding to `backend/routes/taxonomy.js` or a separate `backend/routes/lifecycle.js`:**
```
GET    /api/lifecycle/states/:typeId         → list lifecycle states for a content type
POST   /api/lifecycle/states                 → create state. Admin only.
GET    /api/lifecycle/transitions/:typeId    → list transitions for a content type
POST   /api/lifecycle/transitions            → create transition rule. Admin only.
```
On org creation, seed default lifecycle states and transitions for all content types.

**Frontend additions:**
- Lifecycle state badge on content detail page (colour-coded: draft=grey, in_review=yellow, approved=green, published=blue, archived=dark)
- Transition action buttons rendered based on allowed transitions for current user's role
- Confirm modal before any transition

---

### Feature 10 — Content Metadata
**Priority:** P1 | **Effort:** M | **Owner:** Vivek

**Description:** Extended metadata per document. Basic metadata (type, subtype, classification, folder) is captured at upload. Extended metadata is captured/edited via the Metadata panel on the content detail page.

**Metadata fields (stored in `vault_metadata`):**
| Field | Type | Notes |
|-------|------|-------|
| description | Text | Free text description |
| language | VARCHAR | e.g. English, French |
| country_region | VARCHAR | e.g. US, EU, Global |
| audience | ENUM | internal / external / hcp / patient / regulator |
| confidentiality | ENUM | public / internal / confidential / restricted |
| regulated | Boolean | Is this a regulated document? |
| therapeutic_area | VARCHAR | e.g. Oncology, Cardiology |
| product_brand | VARCHAR | e.g. Drug/product name |
| department | VARCHAR | Owning department |
| keywords | Text | Comma-separated keywords |
| effective_date | DATE | When document becomes effective |
| expiry_date | DATE | When document expires (drives Feature 19) |
| review_cycle_months | INT | How often to review (e.g. 12 = annual) |

**Backend — add to `backend/routes/content.js`:**
```
GET    /api/content/:id/metadata    → get metadata for content
PATCH  /api/content/:id/metadata    → update metadata fields. Requires author or admin. Log changes to audit.
```

**Frontend — create `frontend/src/modules/vault/components/MetadataPanel.jsx`:**
- Accordion section in content detail page
- All fields as form inputs with Save button
- Show effective_date and expiry_date with date pickers
- Read-only view for viewer role

---

### Feature 11 — Inline Document Viewer
**Priority:** P1 | **Effort:** M | **Owner:** Vivek

**Description:** Users can view documents inline in the browser without being forced to download. PDF.js renders PDFs. Other file types fall back to download. Every view action is logged to the audit trail. Watermark is applied at render time (see Feature 16).

**User Stories:**
- As any user with view access, I can click a document and read it inline in the browser
- PDFs open in an embedded PDF.js viewer
- Every view is logged: who viewed, what document, what version, when, from what IP

**Backend — add to `backend/routes/content.js`:**
```
GET    /api/content/:id/view                     → returns signed S3 URL for current version. Logs view to vault_audit_log.
GET    /api/content/:id/versions/:vId/view       → returns signed S3 URL for specific version. Logs view.
```
The signed URL has a short expiry (15 minutes). Frontend uses this URL to render in PDF.js.

**Frontend — create `frontend/src/modules/vault/pages/DocumentViewerPage.jsx`:**
- Fetches signed URL from backend
- For PDFs: renders via PDF.js embedded viewer (full width, paginated, zoom controls)
- For non-PDF: shows file info + download button
- Watermark overlay rendered over PDF viewer (see Feature 16 for watermark logic)
- Document title, doc number, version, lifecycle state shown in header

---

### Feature 12 — Full-text & Metadata Search
**Priority:** P1 | **Effort:** M | **Owner:** Bhavya, Vivek

**Description:** Users can search and filter their org's documents by multiple criteria. Search is always scoped to `req.user.orgId`.

**Search fields:**
- Title (LIKE)
- Document number (exact or partial match)
- Content type, subtype, classification (dropdown filter)
- Lifecycle state (dropdown filter)
- Folder (folder picker filter)
- Date range (created_at, effective_date, expiry_date)
- Keywords (from vault_metadata)
- Regulated flag (yes/no filter)
- Audience, confidentiality filters

**Backend — create `backend/routes/search.js`:**
```
GET    /api/search    → query params: q (text), type_id, subtype_id, classification_id,
                        state, folder_id, date_from, date_to, regulated, audience, confidentiality,
                        page (default 1), limit (default 25)
                      → JOIN vault_content + vault_metadata + content_types
                      → All WHERE clauses include org_id = req.user.orgId
                      → Returns: { results: [...], total, page, limit }
```
Wire in `server.js`: `app.use('/api/search', require('./routes/search'))`

**Frontend — create `frontend/src/modules/vault/pages/SearchPage.jsx`:**
- Top search bar (text input)
- Collapsible filter panel on left (all filter fields)
- Results grid: doc number, title, type, state, created date, version
- Click result → goes to DocumentViewerPage
- Pagination at bottom

---

### Feature 13 — Audit Trail
**Priority:** P1 | **Effort:** M | **Owner:** Bhavya

**Description:** Every significant action in the system is logged to `vault_audit_log`. The log is tamper-proof (insert-only). Org admins can view their org's audit trail. SuperAdmins can view cross-org.

**Actions that must be logged (minimum):**
`user_created`, `user_deactivated`, `user_role_changed`, `login_success`, `login_fail`, `logout`, `document_uploaded`, `new_version_uploaded`, `document_viewed`, `document_downloaded`, `lifecycle_transition`, `checkout`, `checkin`, `force_checkin`, `metadata_updated`, `folder_created`, `folder_renamed`, `taxonomy_changed`, `dossier_created`, `slot_filled`

**Backend — create `backend/services/auditService.js`:**
```javascript
async function log(orgId, userId, userType, action, entityType, entityId, ip, beforeValue, afterValue, notes) {
  // INSERT into vault_audit_log
  // Never throws — audit failure must not break the main operation (wrap in try/catch internally)
}
```
This service is imported and called from every route that performs a significant action.

**Backend — create `backend/routes/audit.js`:**
```
GET    /api/audit    → list audit entries for req.user.orgId. Filters: action, entity_type, user_id,
                       date_from, date_to. Pagination. Requires admin.
```
Wire in `server.js`: `app.use('/api/audit', require('./routes/audit'))`

**Frontend — create `frontend/src/modules/admin/pages/AuditPage.jsx`:**
- Table: timestamp, user, action, entity type, entity id, IP
- Filter bar: action filter, user filter, date range
- No edit / delete controls — read only

---

### Feature 14 — Admin Console
**Priority:** P1 | **Effort:** L | **Owner:** Bhavya, Vivek

**Description:** The Org Admin console is a dedicated section where admins manage their org's configuration. All sections from Features 2, 3, 9, 13 are surfaced here as tabs.

**Admin Console Tabs:**
| Tab | Links To |
|-----|----------|
| Users | Feature 2 — UsersPage.jsx |
| Taxonomy | Feature 3 — TaxonomyPage.jsx |
| Lifecycle Rules | Feature 9 — lifecycle config |
| Retention Policies | Configure review_cycle_months defaults per content type |
| Content Channels | Manage downstream app integrations (content_channels table) |
| Audit Trail | Feature 13 — AuditPage.jsx |

**Backend — add to `backend/routes/admin.js` (create this file):**
```
GET    /api/admin/channels           → list content_channels for org
POST   /api/admin/channels           → create channel (app_name, webhook_url). Auto-generate api_key. Requires admin.
PATCH  /api/admin/channels/:id       → update status or webhook_url. Requires admin.

GET    /api/admin/retention          → get default review_cycle_months per content type for org (from org_config)
PATCH  /api/admin/retention          → update retention defaults per type. Requires admin.
```
Wire in `server.js`: `app.use('/api/admin', require('./routes/admin'))`

**Frontend — create `frontend/src/modules/admin/pages/AdminConsolePage.jsx`:**
- Left sidebar with 6 tabs
- Each tab renders the appropriate component
- Only accessible to users with `role = admin`
- Route: `/admin` (add to App.jsx, protect with role guard)

---

### Feature 15 — SuperAdmin Module
**Priority:** P1 | **Effort:** M | **Owner:** Bhavya, Vivek

**Description:** The Pharaxis SuperAdmin portal. Only accessible to Pharaxis team members. Provides org creation, management, and a system-wide dashboard.

**SuperAdmin screens:**

**1. Orgs List & Management** (already partially built — expand)
- List all orgs with: name, slug, status, user count, storage used, created date
- Create Org modal: name, slug, doc_number_prefix, storage_quota_mb
- Activate / Deactivate org toggle

**2. Org Detail & User Drill-down** (new)
- Click an org → view all users in that org, their roles and status

**3. System Dashboard** (new)
- Total orgs (active / inactive)
- Total documents across all orgs
- Total storage used across all orgs
- Recent login activity (last 50 entries from login_audit cross-org)

**Backend — add to `backend/routes/superadminAuth.js`:**
```
GET    /api/superadmin/orgs/:id/users    → list users for a specific org. Requires superadmin.
GET    /api/superadmin/dashboard         → system stats (org count, doc count, storage total). Requires superadmin.
GET    /api/superadmin/audit             → cross-org audit log. Filters: org_id, action, date range. Requires superadmin.
```

**Frontend:**
- Create `frontend/src/modules/superadmin/pages/SuperadminDashboardPage.jsx` — stats cards + recent logins
- Create `frontend/src/modules/superadmin/pages/SuperadminOrgsPage.jsx` — orgs list + create org modal
- Create `frontend/src/modules/superadmin/pages/SuperadminOrgDetailPage.jsx` — users in selected org
- Update `frontend/src/App.jsx` routes: `/superadmin/dashboard`, `/superadmin/orgs`, `/superadmin/orgs/:id`

---

### Feature 16 — Watermarking
**Priority:** P1 | **Effort:** M | **Owner:** Vivek

**Description:** PDFs are automatically watermarked at view/render time based on their lifecycle state. The source file stored on S3 is NEVER modified. Watermarking is applied on-the-fly when the viewer is served.

**Watermark rules:**
| Lifecycle State | Watermark Text |
|-----------------|---------------|
| draft | DRAFT — Not for Distribution |
| in_review | UNDER REVIEW — Not for Distribution |
| approved | APPROVED |
| published | (no watermark — clean document) |
| archived | ARCHIVED — Superseded |

**Backend — create `backend/services/watermarkService.js`:**
- Uses `pdf-lib` (install: `npm install pdf-lib`)
- `async function applyWatermark(pdfBuffer, lifecycleState)` → applies diagonal semi-transparent text stamp to every page, returns modified buffer
- Watermark: large diagonal text, 45 degrees, red semi-transparent, centred on page

**Backend — modify `GET /api/content/:id/view`:**
- Instead of returning a signed URL for PDFs, stream the file from S3, apply watermark via watermarkService, return the watermarked buffer inline
- Non-PDF files: return signed URL as before (no watermarking)
- Set `Content-Disposition: inline` and `Content-Type: application/pdf`

**Frontend — `DocumentViewerPage.jsx`:**
- For PDFs, request `/api/content/:id/view` → receive the watermarked PDF buffer inline
- Render via PDF.js `pdfjsLib.getDocument({ data: arrayBuffer })`

---

### Feature 17 — Content Slots
**Priority:** P2 | **Effort:** S | **Owner:** Vivek

**Description:** Content slots are placeholders for expected documents. They represent a document that should exist — defining what type it should be, who is responsible for it, and when it is due. When a matching document is uploaded, the slot is filled automatically.

**User Stories:**
- As an org admin, I can create a content slot specifying: title, expected content type, responsible user, due date, folder or dossier
- As any user, I can see unfilled slots (pending) and which ones are overdue
- When an author uploads a document of the matching type into the matching folder, the slot can be manually linked or auto-matched

**Backend — create `backend/routes/slots.js`:**
```
GET    /api/slots               → list slots for org. Filter: status=pending/filled, overdue=true. Requires auth.
POST   /api/slots               → create slot. Requires admin.
PATCH  /api/slots/:id           → update slot (due date, responsible user). Requires admin.
POST   /api/slots/:id/fill      → mark slot as filled with a specific content_id. Sets status=filled, filled_content_id. Requires admin or author.
```
Wire in `server.js`: `app.use('/api/slots', require('./routes/slots'))`

**Frontend — create `frontend/src/modules/vault/pages/ContentSlotsPage.jsx`:**
- List view: title, expected type, responsible user, due date, status badge, overdue highlight
- Filter: pending / filled / overdue
- Create Slot button (admin only) with modal
- Fill Slot button → document picker to link an existing content record

---

### Feature 18 — Dossiers
**Priority:** P2 | **Effort:** M | **Owner:** Bhavya, Vivek

**Description:** Dossiers (also called Binders) are curated collections of documents for regulatory submission or review packages. A dossier has a title, status, and an ordered list of documents.

**User Stories:**
- As an author or admin, I can create a dossier with a title and description
- I can add existing documents to a dossier and set their order (table of contents)
- I can remove documents from a dossier
- I can view a dossier as a table of contents — each entry shows doc number, title, version, lifecycle state
- I can export the dossier table of contents as PDF or print it

**Backend — create `backend/routes/dossiers.js`:**
```
GET    /api/dossiers                     → list dossiers for org. Filter: status.
POST   /api/dossiers                     → create dossier (title, description). Requires author or admin.
GET    /api/dossiers/:id                 → get dossier detail + ordered item list.
PATCH  /api/dossiers/:id                 → update title, description, status. Requires admin.
POST   /api/dossiers/:id/items           → add document to dossier (content_id, position). Requires author or admin.
DELETE /api/dossiers/:id/items/:itemId   → remove document from dossier. Requires author or admin.
PATCH  /api/dossiers/:id/items/reorder   → update positions (body: [{ itemId, position }]).
```
Wire in `server.js`: `app.use('/api/dossiers', require('./routes/dossiers'))`

**Frontend — create `frontend/src/modules/vault/pages/DossiersPage.jsx`:**
- Dossier list: title, item count, status
- Dossier detail: table of contents view with drag-to-reorder
- Add Document button → search-and-select document picker
- Export ToC as PDF button (client-side using jspdf)

---

### Feature 19 — Expiry Intelligence Dashboard
**Priority:** P2 | **Effort:** M | **Owner:** Vivek

**Description:** Surfaces documents approaching expiry and sends automated email alerts to document owners (the user who uploaded the document). Expiry is tracked via `vault_metadata.expiry_date`.

**User Stories:**
- As an admin or author, I can see a dashboard of documents expiring in the next 30, 60, and 90 days
- Document owners receive an automated email 30 days before expiry
- The dashboard shows: doc number, title, owner, expiry date, days remaining, current lifecycle state

**Backend — add to `backend/routes/content.js`:**
```
GET    /api/content/expiry-dashboard    → returns docs grouped by: expiring_30, expiring_60, expiring_90, expired.
                                          JOIN vault_content + vault_metadata + users (for owner name/email).
                                          Scoped to req.user.orgId.
```

**Backend — create `backend/services/expiryAlertService.js`:**
- Scheduled job (node-cron) running daily at 08:00 org timezone (default UTC)
- Query: documents where `expiry_date = TODAY + 30 days` and `lifecycle_state != 'archived'`
- Send email via nodemailer to the `created_by` user of each matching document
- Log alert sent to `vault_audit_log` (action=expiry_alert_sent)
- Register cron in `server.js` after `initializeDatabase()`

**Frontend — create `frontend/src/modules/vault/pages/ExpiryDashboardPage.jsx`:**
- Three columns: Expiring in 30 days / 60 days / 90 days + Expired
- Each card: doc number, title, owner, expiry date, days remaining, lifecycle badge
- Click card → opens document detail
- Route: `/vault/expiry` (add to App.jsx)

---

### Feature 20 — QA — Test Suite + Playwright E2E
**Priority:** P1 | **Effort:** L | **Owner:** Karthik, Shivani

**Description:** Full test coverage for Sprint 1. Gate 1 cannot be raised without this passing.

**Backend smoke tests — create `backend/tests/smoke-sprint1.js`:**

Cover at minimum:
- `POST /api/auth/login` — valid credentials → 200 + token
- `POST /api/auth/login` — invalid credentials → 401
- `POST /api/auth/login` — inactive org → 401
- `GET /api/auth/me` — valid token → 200 + user object
- `GET /api/users` — admin token → 200 + array
- `POST /api/users` — non-admin token → 403
- `GET /api/taxonomy/types` → 200
- `GET /api/folders` → 200 (array)
- `GET /api/search?q=test` → 200 + { results, total }
- `GET /api/content/expiry-dashboard` → 200 + { expiring_30, expiring_60, expiring_90, expired }
- `GET /api/audit` — admin → 200
- `GET /api/audit` — non-admin → 403
- Checkout a document → 200
- Attempt second checkout by different user → 423
- Check in → 200

**Playwright E2E — create `e2e/vault-auth.spec.js`:**
- SuperAdmin login page loads
- Org user login page loads
- Login with wrong credentials shows error message
- After login, redirects to /vault

**Gate 1 command — add to `package.json`:**
```json
"test:sprint-close:gate1": "node backend/tests/smoke-sprint1.js && npx playwright test"
```

---

## 9. Routes Summary (Sprint 1 Complete)

| Route File | Mounted At | Key Endpoints |
|-----------|-----------|--------------|
| `routes/auth.js` | `/api/auth` | login, logout, me |
| `routes/superadminAuth.js` | `/api/superadmin` | login, orgs CRUD, dashboard, org users, cross-org audit |
| `routes/users.js` | `/api/users` | CRUD for org users |
| `routes/taxonomy.js` | `/api/taxonomy` | types, subtypes, classifications |
| `routes/folders.js` | `/api/folders` | folder tree CRUD |
| `routes/upload.js` | `/api/upload` | new doc upload, new version upload |
| `routes/content.js` | `/api/content` | versions, checkout, lifecycle transition, metadata, view, expiry dashboard |
| `routes/search.js` | `/api/search` | full-text + metadata search |
| `routes/audit.js` | `/api/audit` | org audit log |
| `routes/admin.js` | `/api/admin` | channels, retention settings |
| `routes/dossiers.js` | `/api/dossiers` | dossier CRUD + items |
| `routes/slots.js` | `/api/slots` | content slots CRUD + fill |
| `routes/lifecycle.js` | `/api/lifecycle` | lifecycle states + transitions config |

---

## 10. Services Summary (Sprint 1 Complete)

| Service File | Purpose |
|-------------|---------|
| `services/auditService.js` | Centralised audit log writer — called from all routes |
| `services/numberingService.js` | Auto doc number generation — atomic sequence increment |
| `services/storageService.js` | S3/MinIO abstraction — upload, getSignedUrl |
| `services/lifecycleService.js` | State machine — validate and execute lifecycle transitions |
| `services/watermarkService.js` | PDF watermarking at render time using pdf-lib |
| `services/expiryAlertService.js` | Daily cron — email alerts for expiring documents |

---

## 11. Frontend Pages Summary (Sprint 1 Complete)

| Page / Component | Route | Module |
|-----------------|-------|--------|
| `LoginPage.jsx` | `/` | auth — **DONE** |
| `SuperadminLoginPage.jsx` | `/superadmin` | superadmin — **DONE** |
| `SuperadminDashboardPage.jsx` | `/superadmin/dashboard` | superadmin |
| `SuperadminOrgsPage.jsx` | `/superadmin/orgs` | superadmin |
| `SuperadminOrgDetailPage.jsx` | `/superadmin/orgs/:id` | superadmin |
| `VaultHomePage.jsx` | `/vault` | vault — content list + folder tree |
| `UploadPage.jsx` | `/vault/upload` | vault |
| `DocumentViewerPage.jsx` | `/vault/content/:id` | vault |
| `SearchPage.jsx` | `/vault/search` | vault |
| `ExpiryDashboardPage.jsx` | `/vault/expiry` | vault |
| `DossiersPage.jsx` | `/vault/dossiers` | vault |
| `ContentSlotsPage.jsx` | `/vault/slots` | vault |
| `AdminConsolePage.jsx` | `/admin` | admin |
| `UsersPage.jsx` | inside AdminConsolePage | admin |
| `TaxonomyPage.jsx` | inside AdminConsolePage | admin |
| `AuditPage.jsx` | inside AdminConsolePage | admin |
| `FolderTree.jsx` | shared component | vault |
| `VersionHistoryPanel.jsx` | component in content detail | vault |
| `MetadataPanel.jsx` | component in content detail | vault |
| `NotificationOverlay.jsx` | future — not in Sprint 1 | — |

---

## 12. Development Rules for This Team

These are non-negotiable and must be followed for every line of code delivered.

| Rule | Detail |
|------|--------|
| **Codex for all code** | All backend routes, services, frontend pages must be written via Codex CLI. Do not write code directly in the editor. |
| **No git push** | Git push is disabled for this project. Commit locally only. |
| **org_id on every query** | Every SELECT, INSERT, UPDATE must include `org_id = req.user.orgId`. Never trust org from request body. |
| **Role enforcement** | Always check `req.user.role` from the JWT middleware. Never trust role from request body. |
| **Audit every action** | Call `auditService.log()` for every significant action. See Feature 13 for the action list. |
| **No hard deletes** | Use status flags only. Never run DELETE on content, user, org, folder, dossier, or slot records. |
| **Browser verification** | After each feature, verify it works in the browser. Do not mark a feature done without browser confirmation. |
| **Gate 1 before handback** | Run `npm run test:sprint-close:gate1` and confirm exit code 0 before returning the sprint to Pharaxis. |
| **Immutable records** | vault_versions and vault_audit_log are insert-only. Never UPDATE or DELETE these rows. |

---

## 13. Gate 1 — Sprint Close Criteria

Gate 1 must pass before the sprint is considered closed and handed back to Pharaxis.

**Checklist:**
- [ ] All 20 features implemented (Feature 1 done — Features 2–20 built in this sprint)
- [ ] Backend starts without errors: `node backend/server.js`
- [ ] Frontend builds without errors: `npm run build` in `frontend/`
- [ ] `npm run test:sprint-close:gate1` exits with code 0
- [ ] Smoke tests: all assertions pass
- [ ] Playwright e2e: all tests pass or are intentionally skipped with a comment
- [ ] Browser verified: login, upload, view, lifecycle transition, search all tested in browser manually
- [ ] No hard-coded credentials or secrets in any file
- [ ] `.env` not committed to git

**Deliver back to Pharaxis:**
- Updated `SPRINT14_STATUS.md` equivalent: `VAULT_SPRINT1_STATUS.md` at `apps/vault/`
- Gate evidence file: `VAULT_SPRINT1_GATE1_EVIDENCE.md` at `apps/vault/`
- Both files following the same format as MIMS sprint reports

---

*Document prepared by Vanaja + Bala — 2026-04-08. All questions to be raised before development begins.*
