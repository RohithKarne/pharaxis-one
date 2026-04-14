# Pharaxis Vault Memory SOP
> **Purpose:** Single source of truth for Pharaxis Vault. Intended for any developer, QA engineer, or team member who needs to onboard or resume work without requiring verbal explanation.
> **Scope:** Pharaxis Vault only. Other apps documented separately in their own SOP files.
> **Update Protocol:** This file is only updated when Rohith explicitly confirms. Rohith says "Bala, update the Vault Memory SOP — [what changed]" and Bala updates it. No one else modifies this file. Each update adds a version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-04-06 | Bala | Initial creation — product definition, Sprint 1 scope, terminology, architecture decisions locked |

---

## 1. What Is Pharaxis Vault

**Pharaxis Vault — Regulated Content Management Platform**
A Veeva Vault challenger built for life sciences and healthcare mid-size companies. Provides a centralised content hub that integrates with any downstream application via open API — eliminating document duplication across systems.

**Core value proposition:**
- Everything Veeva Vault does, at 50% of the cost
- Open API integration to any system (not locked to one ecosystem)
- Built for regulated industries: life sciences, pharma, healthcare
- Centralized vault — single source of truth mapped to multiple downstream apps

**Target customers:**
- Anchor: Novartis (currently on Veeva Vault, wants 50% cost reduction)
- Consulting firms: Freyr Solutions, Eversana, PrimeVigilance, TechSol Life Sciences
- Startup partnership: SciMax

**Relationship to other Pharaxis One apps:**
Pharaxis Vault is a standalone product. Future integration planned with MIMS, QMS, and Safety via Content Channels (API integration layer). Vault is the content source of truth — other apps consume from it.

---

## 2. Full Tech Stack

### Backend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Runtime | Node.js | v18+ |
| Framework | Express | ^4.x |
| Authentication | JSON Web Token (jsonwebtoken) | ^9.x |
| Password hashing | bcrypt | ^6.x |
| Database driver | mysql2 | ^3.x |
| File upload | multer | ^2.x |
| File storage | AWS S3 | Production |
| Email sending | nodemailer | ^8.x |
| Scheduled jobs | node-cron | ^4.x |
| CORS | cors | ^2.x |
| Dev server | nodemon | ^3.x |

### Frontend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Framework | React | ^19.x |
| Build tool | Vite | ^7.x |
| Routing | react-router-dom | ^7.x |
| PDF viewer | PDF.js | latest |

### Database
| Component | Detail |
|-----------|--------|
| Engine | MySQL 8.0.45 (native install) |
| Location | `/usr/local/mysql/` on Mac |
| Port | 3306 |
| Database name | `pharaxis_vault_dev` |
| User | `devuser` / `devpass` |
| Multi-tenancy | `org_id` on every table — no exceptions |

### File Storage
| Environment | Solution |
|-------------|----------|
| Local dev | MinIO (self-hosted S3-compatible) |
| Production | AWS S3 |

---

## 3. How to Start the App

> To be completed once app scaffold is built in Sprint 1.

---

## 4. System Architecture

### Three-Tier Access Model
```
Tier 1 — Pharaxis SuperAdmin (Pharaxis team only)
│   Create/manage orgs, onboard/offboard customers
│   System-wide audit and monitoring
│   Manage Connect Hub integrations globally
│   Platform health dashboard
│
Tier 2 — Org Admin (customer — e.g. Novartis admin)
│   Manage users within their org
│   Configure taxonomy (types, subtypes, classifications)
│   Configure lifecycle rules
│   Manage org-level Content Channels (integrations)
│   View org audit trail
│
Tier 3 — Org Users (authors, reviewers, approvers, viewers)
    Upload, review, approve, search content
    Role-based access within their org
```

### Multi-tenancy
- Single database: `pharaxis_vault_dev`
- Every table carries `org_id` — no exceptions
- All queries scoped by `org_id` at service layer
- No cross-org data leakage possible

### Content Channels (Integration Layer)
- REST API for pull (downstream apps request content on demand)
- Webhooks for push (notify when content changes, expires, or is published)
- Per-org API key + OAuth 2.0 client credentials flow
- Signed webhook payloads (HMAC-SHA256)
- REST first — webhooks Phase 2

### File Storage Architecture
- Binary files (PDFs, Word, images) → AWS S3 (prod) / MinIO (local)
- Structured content (FAQs, templates, modules) → MySQL
- Metadata for both → MySQL (`vault_content` + `vault_versions`)

---

## 5. Team Structure

> Full org chart in `docs/TEAM_OPERATING_SOP.md`. Restructured 2026-04-14.

| Full Name | Role | Vault Responsibility |
|-----------|------|---------------------|
| Rohith Karne | CEO & Co-Founder | All gates, final sign-off, product direction |
| Varun Karne | CTO & Co-Founder | Architecture review, engineering lead, code review, Gate 2 sign-off |
| Saad Rahman | CPO | Product strategy, feature prioritisation, requirement quality |
| Bhavya Bobba | Engineering Manager + QA Manager | Schema owner, Codex prompt author, root cause, implementation, QA sign-off |
| Bala Kaviti | Head of PMO, Business & Operations | Sprint facilitation, blockers, gate coordination |

---

## 6. Frontend Route Map

> To be completed once Sprint 1 scaffold is built.

---

## 7. Backend API Map

> To be completed once Sprint 1 backend routes are built.

---

## 8. Admin Console Sections

### Org Admin Console
- User management (invite, deactivate, roles)
- Taxonomy configuration (content types, subtypes, classifications)
- Lifecycle rules per content type
- Content Channels (org-level integrations)
- Retention policies
- Org audit trail viewer

### SuperAdmin Console
- Org creation and management
- Org admin assignment
- System-wide usage dashboard
- Connect Hub global management
- Cross-org audit logs
- Platform health monitoring

---

## 9. Database Tables Reference

### Core Tables (Sprint 1)
| Table | Purpose |
|-------|---------|
| `orgs` | Customer organisations — org_id, name, slug, status, storage_quota |
| `users` | Org-level users — id, org_id, name, email, role, is_active |
| `superadmin_users` | Pharaxis SuperAdmin users — separate from org users |
| `content_types` | Configurable content types per org |
| `content_subtypes` | Sub-types per content type per org |
| `classifications` | Classification values per org |
| `vault_folders` | Folder hierarchy — id, org_id, parent_id, name, path |
| `vault_content` | Master content record — id, org_id, doc_number, title, type_id, status, current_version_id |
| `vault_versions` | Immutable version records — id, content_id, version_number, file_path, s3_key, checksum, created_by, created_at |
| `vault_metadata` | Extended metadata — content_id, language, country, audience, confidentiality, regulated, effective_date, expiry_date |
| `checkout_locks` | Check-in/check-out locks — content_id, locked_by, locked_at, org_id |
| `doc_number_sequences` | Auto-numbering sequences per org per content type |
| `lifecycle_states` | Lifecycle states per content type per org |
| `lifecycle_transitions` | Allowed transitions between states |
| `vault_dossiers` | Dossier (binder) records — id, org_id, title, status |
| `dossier_items` | Documents within a dossier — dossier_id, content_id, position |
| `content_slots` | Placeholders for expected documents — id, org_id, folder_id, title, expected_type, due_date |
| `vault_audit_log` | Tamper-proof audit log — insert only. user_id, org_id, action, content_id, ip, timestamp, before_value, after_value |
| `content_channels` | Downstream app integration mappings — id, org_id, app_name, api_key, webhook_url, status |

---

## 9b. Services and Scripts Reference

> To be completed as services are built in Sprint 1.

| Service | Purpose |
|---------|---------|
| `auditService.js` | Centralised audit logging — reusable by QMS and Safety apps |
| `numberingService.js` | Auto-document number generation |
| `storageService.js` | S3/MinIO abstraction layer |
| `lifecycleService.js` | State machine for content lifecycle transitions |
| `watermarkService.js` | PDF watermarking at render time |

---

## 10. Sprint History

| Sprint | Status | Key Deliverables |
|--------|--------|-----------------|
| Sprint 1 | READY — not started | Foundation: auth, orgs, users, content upload, versioning, check-in/check-out, lifecycle, search, audit trail, SuperAdmin, inline viewer, auto-numbering, dossiers, content slots, expiry dashboard, watermarking, admin console, QA suite |

---

## 11. Current Sprint

**Sprint 1 — NOT STARTED**
Awaiting Gate 1 approval from Rohith.

**Sprint 1 scope — 20 features (P1: 15 / P2: 5):**

| # | Feature | Description | Priority | Effort | Owner |
|---|---------|-------------|----------|--------|-------|
| 1 | Project Setup & Auth | App scaffold, login/logout, JWT, org-scoped session | P1 | M | Varun Karne, Bhavya Bobba |
| 2 | Org & User Management | User CRUD, 5 roles (Admin/Author/Reviewer/Approver/Viewer), role middleware | P1 | M | Bhavya Bobba |
| 3 | Content Type & Taxonomy | Org-configurable content types, sub-types, classifications | P1 | M | Bhavya Bobba |
| 4 | Folder Structure | Hierarchical folders, folder tree UI, org-scoped | P1 | S | Bhavya Bobba |
| 5 | Document Upload & Storage | Upload PDF/Word/Excel/images, metadata capture, AWS S3 storage | P1 | L | Bhavya Bobba |
| 6 | Auto-Numbering | Auto-generate document numbers e.g. PHX-SOP-2026-00142 per org per type | P1 | S | Bhavya Bobba |
| 7 | Version Control | New version on every upload, all versions immutable and retained | P1 | M | Bhavya Bobba |
| 8 | Check-in / Check-out | Server-side document locking, HTTP 423 on bypass, admin force-release | P1 | M | Bhavya Bobba |
| 9 | Content Lifecycle | Draft → In Review → Approved → Published → Archived, role-enforced transitions | P1 | L | Bhavya Bobba |
| 10 | Content Metadata | Language, country, audience, confidentiality, regulated flag, effective/expiry dates | P1 | M | Bhavya Bobba |
| 11 | Inline Document Viewer | PDF.js in-browser viewer, no forced download, view logged to audit trail | P1 | M | Bhavya Bobba |
| 12 | Full-text & Metadata Search | Search by title, doc number, type, classification, status, date range | P1 | M | Bhavya Bobba |
| 13 | Audit Trail | Insert-only tamper-proof log, every action captured, reusable service | P1 | M | Bhavya Bobba |
| 14 | Admin Console | Org Admin panel — users, taxonomy, lifecycle rules, retention, audit viewer | P1 | L | Bhavya Bobba |
| 15 | SuperAdmin Module | Pharaxis-only portal, org creation/management, system-wide dashboard | P1 | M | Bhavya Bobba |
| 16 | Watermarking | Auto-stamp by lifecycle status at render time, source file never modified | P1 | M | Bhavya Bobba |
| 17 | Content Slots | Placeholders for expected documents, due date tracking, fill with upload | P2 | S | Bhavya Bobba |
| 18 | Dossiers | Group documents into regulatory submission packages, table of contents view | P2 | M | Bhavya Bobba |
| 19 | Expiry Intelligence Dashboard | 30/60/90 day expiry view, email alerts to document owners | P2 | M | Bhavya Bobba |
| 20 | QA — Test Suite + Playwright e2e | Full regression, negative paths, e2e suite at sprint close | P1 | L | Bhavya Bobba |

---

## 12. Known Issues and Technical Debt

> None yet — app not started.

---

## 13. Critical Technical Rules (Must Know)

| Rule | Detail |
|------|--------|
| **org_id everywhere** | Every single table must have org_id. No exceptions. Enforced by Bhavya at schema review. |
| **Immutable versions** | vault_versions rows are NEVER updated. Insert only. |
| **Audit trail insert-only** | vault_audit_log rows are NEVER updated or deleted. |
| **SuperAdmin JWT prefix** | `vault_superadmin_` — separate from org user JWTs |
| **Org user JWT prefix** | `vault_` |
| **Check-out lock is server-side** | Lock enforced at API level — not just UI. Direct API calls return 423 Locked. |
| **Watermark at render time** | Source file NEVER modified. Watermark applied on-the-fly. |
| **Codex mandatory** | ALL code writes, edits, test scripts via codex:codex-rescue. Never Claude Code Edit/Write tools on app code. |
| **No hard deletes** | Content uses status flags only — active/inactive/archived. |
| **Schema owner** | Bhavya. No schema changes without Bhavya sign-off. |

---

## 14. Process Reference

> Full gate flow, browser verification protocol, and team communication rules in:
> - `memory/protocols.md` — gate approvals, dev standards, QA standards
> - `memory/feedback.md` — Codex workflow, git push disabled, browser-first verification
> - `TEAM_OPERATING_SOP.md` — role boundaries, escalation SOP

---

## 15. How to Update This File

Only Bala updates this file, on Rohith's explicit instruction.

Format: Rohith says → "Bala, update the Vault Memory SOP — [what changed]"
Bala updates the relevant section and adds a version history entry.
