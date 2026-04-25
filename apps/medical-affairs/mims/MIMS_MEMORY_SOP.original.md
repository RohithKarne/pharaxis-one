# MIMS Memory SOP
> **Purpose:** Single source of truth for the MIMS project. Intended for any developer, QA engineer, or team member who needs to onboard or resume work without requiring verbal explanation.
> **Scope:** MIMS only. CP Portal is documented separately in `CP_MEMORY_SOP.md`.
> **Update Protocol:** This file is only updated when Rohith explicitly confirms. Rohith says "Bala, update the Memory SOP — [what changed]" and Bala updates it. No one else modifies this file. Each update adds a version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-03-27 | Bala | Initial creation — full Sprint 7 state |
| 2026-03-28 | Bala | Sprint 8 complete: session timeout, superadmin lockdown, org/site toggles, data cleanup, site uniqueness enforcement. Full DB, API, frontend, team state updated. |
| 2026-03-28 | Bala | Post-Sprint 8 update: org-controlled user 2FA, SuperAdmin 2FA Configuration, platform SMTP test actions, and latest QA status added. |
| 2026-03-28 | Bala | Password recovery and password-history update: forgot-password flow, in-app change-password flow, and backend enforcement preventing reuse of current + last 5 passwords. |
| 2026-03-28 | Bala | Reshape: audit + login-audit endpoints added to Section 7. Superadmin console pages table added to Section 8. Sprint 8 summary in Section 10 expanded. Section 11 deliverables, DB changes, and API endpoint list brought current with live code (2FA infra, SMTP, reset-2fa, audit endpoints). |
| 2026-03-28 | Bala | Section 11 trimmed — verbose sprint-scoped blocks removed (deliverables, DB changes, API list, live data, QA results). All content already in permanent sections 7–9 and 13. Section 11 now holds current sprint status only. |
| 2026-03-28 | Bala | Team promotions effective: Varun → Senior Director Engineering, Bhavya → Senior Architect, Vivek → Principal SWE, Karthik → QA Manager, Vanaja → Director Product Management, Vinay → Product Owner. Org chart and role descriptions updated in Section 5. |
| 2026-03-28 | Bala | Sprint 9 closed: SuperAdmin dashboard, advanced audit filters + CSV export, user lifecycle controls, alerts engine, in-app notifications, duplicate alert-rule fix, and latest sprint status updated across Sections 7–13. |
| 2026-03-28 | Bala | Sprint 9 DB reference enriched: superadmin_alert_rules, superadmin_alert_events, notifications descriptions expanded. Existing tables affected by Sprint 9 documented (users, login_audit, audit_logs, user_2fa_settings, organisations, sites, system_config, service_logs, email_accounts). |
| 2026-03-31 | Bala | Sprint 10 closed: org seed service (seedService.js), runtime linkage (GET /api/cases/form-config), Case Form UI dynamic rendering (AE 9 tabs / PC 7 tabs), Field Setup UI two-pane redesign + flex field CRUD. field_setup unique key fixed to include org_id. Backfill script for existing orgs. Codex workflow rule established. Sprint 11 integration roadmap locked (32 features, 3 phases). Version history, API map, DB reference, sprint history, technical rules, and test file list all updated. |
| 2026-04-05 | Bala | Sprints 11–13 closed. Sprint 14 active. Section 5 (Team) replaced with pointer — full org chart in TEAM_OPERATING_SOP.md. Section 14 (Process) replaced with pointer — gate flow and browser verification in memory/protocols.md. Section 13 trimmed — process rules (git push, Codex workflow) moved to memory/feedback.md. Sprint 11 integration scope removed from Section 11 — Section 11 now current sprint only. Sprint history table updated to Sprint 14. |
| 2026-04-07 | Bala | Sprint 14 closed. 13/14 items complete. G13-3 (client-facing demo environment full provisioning) deferred to Sprint 15. Gate 1 passed (exit code 0). Sprint history table updated. Section 11 updated to Sprint 15 READY. |

---

## 1. What Is MIMS

**MIMS — Medical Information Management System**
An enterprise platform for pharmaceutical companies to manage medical information inquiries and safety cases end-to-end.

MIMS handles:
- Incoming medical inquiries via email (inbox), triaged by agents
- Case creation and management across three case types: MI (Medical Information), AE (Adverse Events), PC (Product Complaints)
- Admin configuration per organisation — picklists, field setup, security groups, sites, workflows, case numbering, audit trails
- Content management — documents, FAQs, templates, merge reports with approval lifecycles
- Multi-organisation support — a single MIMS instance serves multiple pharma client organisations with full data isolation

**Relationship to CP Portal:**
CP Portal is a separate white-label HCP/patient-facing portal. Future integration planned — CP Portal will send submissions to MIMS via API, and MIMS will push outcomes back. No integration built yet.

**Current Focus:** MIMS is the sole active development priority. CP Portal receives hotfix support only if explicitly required by Rohith.

---

## 2. Full Tech Stack

### Backend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Runtime | Node.js | v18+ |
| Framework | Express | ^4.18.2 |
| Authentication | JSON Web Token (jsonwebtoken) | ^9.0.2 |
| Password hashing | bcrypt | ^6.0.0 |
| Database driver | mysql2 | ^3.20.0 |
| File upload | multer | ^2.1.1 |
| Email receiving | imapflow | ^1.2.13 |
| Email sending | nodemailer | ^8.0.2 |
| Email parsing | mailparser | ^3.9.4 |
| Scheduled jobs | node-cron | ^4.2.1 |
| CORS | cors | ^2.8.5 |
| Dev server | nodemon | ^3.0.3 |

### Frontend
| Component | Technology | Version / Detail |
|-----------|-----------|-----------------|
| Framework | React | ^19.2.0 |
| Build tool | Vite | ^7.3.1 |
| Routing | react-router-dom | ^7.13.1 |
| Rich text editor | TipTap | ^3.20.4 |
| PDF generation | jspdf | ^4.2.1 |
| Excel export | xlsx | ^0.18.5 |

### Database
| Component | Detail |
|-----------|--------|
| Engine | MySQL 8.0.45 (native install, NOT Docker) |
| Location | `/usr/local/mysql/` on Mac |
| Port | 3306 |
| Database name | `pharaxis_mims_dev` |
| User | `devuser` / `__SET_MYSQL_PASSWORD__` |
| Start | System Settings → MySQL → Start (or auto-starts on Mac boot via launchd) |
| CLI | `/usr/local/mysql/bin/mysql -u devuser -p__SET_MYSQL_PASSWORD__ pharaxis_mims_dev` |
| GUI | DBeaver — host: `localhost`, port: `3306`, allowPublicKeyRetrieval: true, useSSL: false |

### Infrastructure
| Component | Detail |
|-----------|--------|
| Backend port | 3000 |
| Frontend port | 5173 (Vite dev server) |
| API proxy | Vite proxies `/api` → `http://localhost:3000` |
| Git | Local only — push DISABLED since Sprint 3. No `git push` or `gh` commands unless Rohith explicitly re-enables. |
| Docker | Fully removed. MySQL runs natively. |

### Testing
| Component | Detail |
|-----------|--------|
| API + integration tests | Custom Node.js scripts using `curl` via `execSync` |
| Browser tests | puppeteer-core + Chrome |
| Test files | `sprint6-phase1a-test.js`, `sprint6-phase1b-test.js`, `sprint6-phase2-test.js`, `sprint7-qa-test.js`, `sprint8-session-timeout-test.js`, `mims/backend/tests/smoke-2fa.js`, `mims/backend/tests/smoke-sprint9.js` (26/27 PASS), `mims/backend/tests/smoke-sprint10-seeds.js` (9/9 PASS), `mims/backend/tests/smoke-sprint10-formconfig.js` (8/8 PASS), `mims/backend/tests/smoke-sprint10-caseformui.js` (10/10 PASS — static analysis), `mims/backend/tests/smoke-sprint10-fieldsetupui.js` (10/10 PASS — static analysis) |
| Backfill script | `mims/backend/scripts/backfill-existing-orgs.js` — one-time run to seed org defaults for orgs created before Sprint 10. Run with `node mims/backend/scripts/backfill-existing-orgs.js`. |
| Run command | `node <test-file>.js` from project root. Both servers + MySQL must be running. |
| Backend test libs | Jest ^30.3.0, Supertest ^7.2.2 |
| Frontend test libs | Vitest ^4.0.18, @testing-library/react ^16.3.2 |
| E2E | @playwright/test ^1.58.2 |

---

## 3. How to Start the App

```bash
# 1. Start MySQL (if not already running)
# System Settings → MySQL → Start
# OR it auto-starts on Mac boot

# 2. Start backend
cd /Users/rohithkarne/MIMS-CP\ Portal/mims
node backend/server.js

# 3. Start frontend (separate terminal)
cd /Users/rohithkarne/MIMS-CP\ Portal/mims/frontend
npm run dev
```

**Default Superadmin login:**
- Username: `superadmin`
- Password: `__SET_SMOKE_TEST_PASSWORD__`
- This is the **only** superadmin account. No other user can be assigned the superadmin role — blocked at both API and UI level.
- The login field on the login page is `type="text"` (not `type="email"`) to support the `superadmin` username which has no `@`.

---

## 4. System Architecture

### Entry Point (CRITICAL)
The real app entry point is:
```
index.html → src/modules/max/main.jsx → src/modules/max/App.jsx
```
The top-level `src/App.jsx` and `src/main.jsx` are **legacy files — do not edit them**. All route additions must go into `src/modules/max/App.jsx`.

### Auth Flow
1. User POSTs to `/api/auth/login` with email + password
2. Server verifies password (bcrypt), checks `user_org_access` for org assignment
3. Returns JWT containing `{ userId, email, role, orgId, siteId }`
4. JWT stored in localStorage as `mims_token`
5. All API calls include `Authorization: Bearer <token>` header
6. `requireAuth` middleware decodes JWT and attaches `req.user`
7. `requireOrg` middleware blocks non-superadmin users without `orgId` in JWT (403)

### JWT Decode Pattern
```js
// ALWAYS use req.user.userId — NEVER req.user.id
req.user = decoded  // { userId, email, role, orgId, siteId }
```

### Multi-Org Data Isolation Pattern
```js
// Applied on every data-scoped route since Sprint 7
if (req.user.role !== 'superadmin') {
  query += ' AND org_id = ?'
  params.push(req.user.orgId)
}
// Superadmin has orgId = null in JWT → bypasses all org filters
```

### Module Access
- Modules: `mims_core`, `admin_console`, `content_mgmt`, `data_visualization`
- Stored in `user_module_permissions` table per user
- Frontend enforces via `ModuleAccessGuard` component wrapping each route
- Superadmin bypasses all module checks
- Superadmin account is hidden from both User Management and Module Access screens — `WHERE role != 'superadmin'` applied to both `/api/superadmin/users` and `/api/superadmin/all-users`

### Session Timeout
- Per-org idle timeout configured by superadmin. Stored as `session_timeout_minutes` in `organisations` table.
- Superadmin has its own global timeout stored in `system_config` table (`key: superadmin_session_timeout_minutes`).
- Defaults: **30 minutes** per org, **60 minutes** for superadmin. Minimum enforced: **30 minutes**.
- Login and switch-org APIs both return `sessionTimeout` in their responses.
- Frontend: `useIdleTimer.js` hook tracks mouse/keyboard/scroll. Warning modal (`SessionTimeoutModal.jsx`) appears 2 minutes before logout. "Stay Logged In" resets the timer.
- `sessionTimeout` stored in localStorage as `mims_session_timeout`. Wired into `App.jsx` via `AppRoutes` component wrapping all routes.

### User 2FA Architecture
- 2FA applies to **MIMS users only**. Superadmin login does **not** use this flow.
- Superadmin controls 2FA per organisation from the dedicated `2FA Configuration` screen.
- Supported methods: `Email OTP` and `Authenticator App (TOTP)`.
- The login experience stays on the same login screen:
  1. user enters username/email + password
  2. if org 2FA is enabled and user is not enrolled, optional setup is shown inline
  3. user can choose Email OTP or Authenticator App, or skip if allowed
  4. once enrolled, login requires 2FA unless a remembered device is valid
- Backup codes are generated on enrollment.
- Remember-device is supported for the org-configured duration.
- Lock happens after **3** invalid attempts.
- Superadmin can reset a user's 2FA state from User Management.
- Platform SMTP used for user 2FA emails is stored in `system_config` and is separate from MIMS org-level Email Accounts used for operational mailboxes.
- Security challenge expiry must be generated from **DB time** (`NOW()` / `DATE_ADD`) rather than app-side JS timestamps. This was a real defect found during QA and fixed.

### Password Reset Flow
1. New users created with `password_reset_required = 1` and default password `__SET_SMOKE_TEST_PASSWORD__`
2. On login, if flag is set, server returns `{ passwordResetRequired: true, token: resetToken }`
3. Frontend redirects to `/reset-password` (NOT `/dashboard`)
4. After reset, flag cleared, user gets fresh JWT with modules and org context
5. User navigates to `/dashboard` normally

### CSS Namespace Convention
| Prefix | Used For |
|--------|----------|
| `mims-` | Shared layout components |
| `ac-` | Admin Console pages |
| `cm-` | Content Management pages |
| `cf-` | Case Form pages |

---

## 5. Team Structure

5 members. Full org chart and role descriptions: see `docs/TEAM_OPERATING_SOP.md`.

**Quick reference (restructured 2026-04-14):**

| Full Name | Role |
|-----------|------|
| Rohith Karne | CEO & Co-Founder |
| Varun Karne | CTO & Co-Founder |
| Saad Rahman | Chief Product Officer (CPO) |
| Bhavya Bobba | Engineering Manager + QA Manager |
| Bala Kaviti | Head of PMO, Business & Operations |

---

## 6. Frontend Route Map

All routes are in `mims/frontend/src/modules/max/App.jsx`.

| Route | Component | Module Guard |
|-------|-----------|-------------|
| `/login` | LoginPage | None (public) |
| `/reset-password` | ResetPasswordPage | None (public) |
| `/no-access` | NoAccessPage | None |
| `/dashboard` | DashboardPage | `mims_core` |
| `/inbox` | InboxPage | `mims_core` |
| `/cases` | CasesPage | `mims_core` |
| `/cases/:id` | CaseFormPage | `mims_core` |
| `/admin-console/*` | AdminConsoleRouter | `admin_console` |
| `/content` | ContentPage | `content_mgmt` |
| `/analytics` | AnalyticsPage | `data_visualization` |
| `*` | Redirect | → `/dashboard` |

---

## 7. Backend API Map

Backend runs on port 3000. All routes under `/api/`.

### Auth
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | Login — returns JWT + modules + org data |
| POST | `/api/auth/forgot-password/send-code` | Forgot-password: send email verification code |
| POST | `/api/auth/forgot-password/verify-code` | Forgot-password: verify email code and issue short reset token |
| POST | `/api/auth/forgot-password/reset` | Forgot-password: set new password after code verification |
| POST | `/api/auth/2fa/send-email-code` | Send Email OTP for login/setup |
| POST | `/api/auth/2fa/setup/totp` | Begin authenticator app setup and return secret/QR payload |
| POST | `/api/auth/2fa/verify` | Verify email OTP, TOTP, or backup code |
| POST | `/api/auth/2fa/skip-setup` | Skip optional 2FA setup and complete login |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/switch-org` | Re-issue JWT with different orgId |
| POST | `/api/auth/reset-password` | Mandatory first-login reset |
| POST | `/api/auth/change-password` | In-app authenticated password change using current password |
| POST | `/api/auth/logout` | Record logout in login_audit |

### Cases
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cases` | List with filters + pagination |
| GET | `/api/cases/my` | Cases owned by logged-in user |
| GET | `/api/cases/unassigned` | Unassigned cases |
| POST | `/api/cases` | Create case (org_id sourced from JWT only) |
| GET | `/api/cases/form-config` | Dynamic form config — merged sections + fields + picklist options for a given case_type and org. Auth only (no requireOrg). Superadmin passes `?org_id=`. Regular users resolved from JWT orgId. Returns `{ case_type, sections: [{ section_name, is_visible, fields: [{ ...field, options: [] }] }] }`. |
| GET | `/api/cases/:id` | Single case detail |
| PUT | `/api/cases/:id` | Update case (COALESCE pattern — partial update) |
| DELETE | `/api/cases/:id` | Soft delete |
| POST | `/api/cases/:id/assign-number` | Assign case number (idempotent) |
| GET/POST/PUT/DELETE | `/api/cases/:id/contacts/:cid` | Case contacts with DNUMD support |
| GET/POST/PUT/DELETE | `/api/cases/:id/mi/:tabId` | MI multi-tab management |
| GET/POST/PUT | `/api/cases/:id/ae/versions` | AE version control (locks on new version) |
| GET/POST/PUT | `/api/cases/:id/pc/versions` | PC version control |

### Inbox
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inbox` | List inquiries from DB (real emails only) |
| GET | `/api/inbox/users` | Users for assign dropdown |
| GET/POST/PATCH | `/api/inbox/templates/:tid` | Reply templates |

### Admin Console
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PUT/DELETE | `/api/admin/picklists` | Dropdown values per org |
| GET/POST/PUT/DELETE | `/api/admin/field-setup` | Case form field config — standard fields |
| POST | `/api/admin/field-setup/flex` | Add a flex field to a section. Body: `{ section_name, field_name, field_type, picklist_type, is_required, sort_order }` |
| DELETE | `/api/admin/field-setup/flex/:id` | Delete a flex field by id |
| GET/POST/PUT/DELETE | `/api/admin/security-groups` | RBAC groups + privilege matrix |
| GET/POST/PUT/DELETE | `/api/admin/contacts` | Case contacts repository |
| GET/POST/PUT/DELETE | `/api/admin/orgs` | Organisations |
| GET/POST/PUT/DELETE | `/api/admin/sites` | Sites with workflow states |
| GET/PUT | `/api/admin/sites/:id/email-purpose` | Site email purpose assignments (4 purposes) |
| GET/POST/PUT/DELETE | `/api/admin/product-families` | Product families + products |
| GET/PUT | `/api/admin/case-number-config` | Per-org/per-type number format |
| GET/PUT | `/api/admin/case-form-definition` | Per-org/per-type section visibility |
| GET/POST/PUT/DELETE | `/api/admin/workflow-activities` | Named case activities |
| GET/POST | `/api/admin/case-audit-trail/:caseId` | Field-level audit trail (F-09) |
| GET | `/api/admin/transmission-audit-trail` | Transmission audit trail (F-10) |
| GET | `/api/admin/service-logs` | Platform-wide service log |
| GET | `/api/admin/system-activity` | Email import activity log |

### Superadmin
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/superadmin/all-users` | Full user list with org assignments (excludes superadmin role) |
| GET | `/api/superadmin/users` | Users for module access screen (excludes superadmin role) |
| POST | `/api/superadmin/users/create` | Create user — roles: admin/agent/reviewer/content_manager only. superadmin blocked. |
| PUT | `/api/superadmin/users/:id` | Update user — superadmin role assignment blocked |
| POST | `/api/superadmin/users/:id/reset-2fa` | Reset user's 2FA enrollment, lock state, backup codes, and trusted devices |
| GET/POST/PUT/DELETE | `/api/superadmin/users/:id/org-access` | CRUD on org assignments |
| GET | `/api/superadmin/orgs-for-assignment` | Active orgs + sites for dropdown |
| PUT | `/api/superadmin/users/:id/modules` | Override user module access |
| GET | `/api/superadmin/orgs` | List all orgs with sites + session_timeout_minutes |
| POST | `/api/superadmin/orgs` | Create org |
| PUT | `/api/superadmin/orgs/:id` | Update org name / is_active / session_timeout_minutes / 2FA settings |
| POST | `/api/superadmin/orgs/:id/sites` | Create site — validates no duplicate name within org |
| PUT | `/api/superadmin/sites/:id` | Update site name / country / is_primary / is_active |
| GET | `/api/superadmin/config` | Get system config (superadmin timeout + platform SMTP) |
| PUT | `/api/superadmin/config` | Update system config (superadmin timeout + platform SMTP) |
| POST | `/api/superadmin/config/test-email` | Test SMTP connection or send a test email from SuperAdmin 2FA Configuration |
| GET | `/api/superadmin/dashboard` | SuperAdmin dashboard KPIs + recent audit/login activity |
| POST | `/api/superadmin/users/:id/force-password-reset` | Force selected user to reset password on next login |
| POST | `/api/superadmin/users/:id/unlock` | Clear user security lock state / 2FA failed-attempt lock |
| POST | `/api/superadmin/users/bulk-action` | Bulk activate, deactivate, or force password reset |
| GET | `/api/superadmin/audit` | Paginated general audit log — all entity changes. Params: `limit` (max 200), `offset` |
| GET | `/api/superadmin/login-audit` | Paginated login/logout event log. Params: `limit`, `offset`, `status` filter |
| GET/POST/PUT | `/api/superadmin/alerts/rules` | List, create, and update SuperAdmin alert rules |
| GET | `/api/superadmin/alerts/events` | Alert event history with delivery statuses |
| GET | `/api/superadmin/notifications` | SuperAdmin in-app notifications |
| POST | `/api/superadmin/notifications/:id/read` | Mark notification as read |

### Content Management
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cm/folders` | Active content folders |
| CRUD | `/api/cm/documents` | Documents — Draft → Published lifecycle |
| CRUD | `/api/cm/faqs` | FAQs with lifecycle |
| CRUD | `/api/cm/templates` | Email/response templates |
| CRUD | `/api/cm/merge-reports` | Merge report templates |
| GET/PUT | `/api/cm/reviews` | Review tasks for content reviewers |

### Misc
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Backend health check |
| GET | `/api/users` | Active users list (for case owner dropdown) |

---

## 8. Admin Console Sections

All accessible under `/admin-console/*` (requires `admin_console` module).

| Section Key | URL Slug | What It Manages |
|-------------|----------|----------------|
| picklists | picklists | Dropdown values for case form fields |
| field-setup | field-setup | Case form field types, required, hidden flags |
| user-security-groups | user-security-groups | RBAC security groups + privilege matrix |
| case-contacts | case-contacts | Case contacts / HCP / patient directory |
| company-reps | company-reps | Company representative directory |
| sites | sites | Site config — email, response templates, data retention, alerts |
| case-numbering | case-numbering | Auto-number format per org per case type |
| case-form-def | case-form-def | Section + field visibility per org per case type |
| audit-admin | audit-admin | Case field-level audit trail (F-09) |
| audit-login | audit-login | Login audit trail (21 CFR Part 11) |
| service-log | service-log | Platform-wide service event log |
| system-activity | system-activity | Email import log |
| orgs | orgs | Organisation management |
| products | products | Product families + drug names |
| workflow-setup | workflow-setup | Workflow state definitions |
| source-types | source-types | How inquiries arrive (email, phone, etc.) |
| email-accounts | email-accounts | IMAP/SMTP mailbox connectors |

**Important distinction:**
- `Admin Console -> Email Accounts` = org-specific MIMS mailboxes for application operations
- `SuperAdmin -> 2FA Configuration` = platform SMTP used for user 2FA email delivery and org-level 2FA controls

### Superadmin Console Pages

Accessible at `/superadmin` (requires `superadmin` role). Navigation is sidebar-based — no URL routing between pages.

| Page Key | Sidebar Label | What It Shows |
|----------|--------------|---------------|
| `dashboard` | Dashboard | Platform KPIs, failed logins, unread notifications, recent audit, recent login activity |
| `organizations` | Organizations | Org cards with site lists, active/inactive toggles, session timeout editor, add site form |
| `2fa-config` | 2FA Configuration | Platform SMTP config form + test/send buttons; per-org 2FA enable/methods/remember-days table |
| `users` | Users | User list with 2FA status, org assignments, Reset 2FA button; create user form; org assignment panel (Org / Site / Role tabs) |
| `module-access` | Module Access | Per-user module checkboxes (mims_core, admin_console, content_mgmt, data_visualization) |
| `alerts` | Alerts | Alert rule setup, enable/disable, thresholds, recipients, recent alert event history |
| `notifications` | Notifications | In-app notification inbox for SuperAdmin alerts with read/unread state |
| `audit` | Audit Trail | Paginated general audit log — entity changes across platform |
| `login-audit` | Login Audit | Paginated login/logout event log with status filter |

---

## 9. Database Tables Reference

### User & Access
| Table | Purpose |
|-------|---------|
| `users` | System users — email, role, password hash, active, password_reset_required |
| `sessions` | Active login session tracking |
| `login_audit` | Login/logout + auth event records for 21 CFR Part 11 compliance |
| `notifications` | In-app notifications for users. Created in Sprint 9. Stores SuperAdmin alert-triggered notifications with read/unread state. SuperAdmin notification inbox reads from this table. |
| `user_org_access` | Multi-org: maps user → org → site → role → permission (Sprint 7) |
| `user_module_permissions` | Per-user module access — overrides default role permissions |
| `user_password_history` | Previous password hashes per user. Used to block reuse of current + last 5 passwords |
| `user_2fa_settings` | Per-user, per-org 2FA enrollment, preferred method, TOTP secret, fail count, lock state |
| `user_2fa_backup_codes` | Hashed one-time backup codes per user/org |
| `user_2fa_trusted_devices` | Remembered devices with expiry per user/org |
| `user_2fa_challenges` | Active email OTP and TOTP setup challenges with expiry |
| `security_groups` | RBAC groups with privilege matrix |
| `security_group_users` | User → security group mappings |
| `role_permissions` | Default access per role per module |

### Organisation & Sites
| Table | Purpose |
|-------|---------|
| `organisations` | Pharma client organisations — name, is_active, `session_timeout_minutes` (default 30), `two_factor_enabled`, `two_factor_methods`, `two_factor_remember_days` |
| `sites` | Locations under each org — country, primary site flag, is_finalized, abbreviation. **UNIQUE constraint on (org_id, name)** — duplicate site names within an org are blocked at DB level and validated in API. |
| `system_config` | Key-value store for global platform config. Current uses: `superadmin_session_timeout_minutes`, platform SMTP host/port/encryption/username/password/from_email/from_name |
| `site_config` | Extended site config — GDPR, retry, alert settings |
| `site_email_accounts` | Email accounts linked to a site |
| `site_email_purpose` | Site → purpose (response / transmissions / correspondence / fax) → email_account |
| `site_response_templates` | Auto-acknowledgement templates per site |
| `site_data_retention` | GDPR right-to-forget rules per site |
| `site_alerts` | Threshold-based alert rules per site |

### Cases
| Table | Purpose |
|-------|---------|
| `cases` | Core case record — case_number, type (MI/AE/PC), org, site, status, owner, priority |
| `case_contacts` | Contact/requestor entries per case with DNUMD support |
| `case_mi` | Medical information tabs — category, product, question, response |
| `case_ae_versions` | AE version control — locking on new version creation |
| `case_ae_general` | AE general tab (one per version) |
| `case_ae_events` | AE events — 7 ICH E2B R3 seriousness boolean columns |
| `case_ae_patient_info` | AE patient demographics |
| `case_ae_lab_results` | AE lab results (multi-row per version) |
| `case_ae_lab_notes` | AE lab notes |
| `case_ae_medical_history` | AE medical history (multi-row) |
| `case_ae_medical_notes` | AE medical notes |
| `case_ae_product_info` | AE product information (multi-row) |
| `case_pc_versions` | PC version control — copy-forward on new version |
| `case_pc_general` | PC general tab |
| `case_pc_patient_info` | PC patient information |
| `case_pc_product_info` | PC product information |
| `case_pc_return_retrieval` | PC return/retrieval tab |
| `case_pc_replacement` | PC replacement tab |
| `case_pc_refund_credit` | PC refund/credit tab |

### Configuration
| Table | Purpose |
|-------|---------|
| `workflow_states` | Case status definitions |
| `workflow_rules` | Transitions between states — password / checklist / comment requirements |
| `workflow_activities` | Named case activities that trigger rules (F-12) |
| `workflow_activity_triggers` | If-activity-then-action rules |
| `source_types` | How inquiries arrive (email, phone, web form, etc.) |
| `field_setup` | Case form field config per section per org — type, required, hidden, picklist, help_text, max_length, default_value. **Sprint 10:** unique key changed from `uq_field_section_name (section_name, field_name)` to `uq_field_section_org (section_name, field_name, org_id)` — required for per-org seeding to work correctly via INSERT IGNORE. Seeds populated via `seedService.js` on org creation. |
| `picklists` | Dropdown values per category per org |
| `case_number_config` | Auto-number format per org per case type |
| `case_form_definition` | Section + field visibility per org per case type. Seeded for new orgs via `seedService.js`. |
| `products` | Drug/trade names per org |
| `product_families` | Product groupings with ingredients |
| `product_approvals` | Regulatory approvals per product (F-07) |
| `product_country_authorizations` | Country-level authorizations per product (F-07) |
| `contacts` | Case contacts directory — HCP, Patient, Other |
| `company_reps` | Company representative directory |

### Email & Inbox
| Table | Purpose |
|-------|---------|
| `email_accounts` | IMAP/SMTP mailbox connectors per org — polling settings |
| `inquiries` | Email-derived inquiries — status, lock state, color, attachments |
| `inquiry_notes` | Internal notes per inquiry |
| `inquiry_attachments` | Email attachment metadata |
| `reply_templates` | Global email reply templates |
| `email_retry_log` | Tracks retry attempts for failed notification emails |

### Content Management
| Table | Purpose |
|-------|---------|
| `cm_folders` | Top-level content folders |
| `cm_documents` | Documents — Draft → CheckedOut → Pending → Under Review → Approved → Published → Archived |
| `cm_faqs` | FAQs with lifecycle |
| `cm_templates` | Email/response/acknowledgment templates |
| `cm_merge_reports` | Merge report templates with lifecycle |
| `cm_reviews` | Review sessions |
| `cm_reviewers` | Individual reviewer assignments per review session |
| `cm_version_history` | Version tracking per document/FAQ/merge-report |

### Audit & Monitoring
| Table | Purpose |
|-------|---------|
| `audit_logs` | General audit — case operations and entity changes |
| `superadmin_alert_rules` | Created Sprint 9. Alert rule master data — event type, severity, delivery channels (email/in-app), recipients, threshold, time window, cooldown period, active/inactive state |
| `superadmin_alert_events` | Created Sprint 9. Each alert event that fires — includes per-channel delivery status (email delivered/failed, in-app created/failed) |
| `case_audit_trail` | Immutable field-level change log per case (F-09) |
| `transmission_audit_trail` | Immutable outbound transmission log per case (F-10) |
| `service_logs` | Platform-wide service events |

---

## 9b. Services and Scripts Reference

### `mims/backend/services/seedService.js` (NEW — Sprint 10)

Master org seed service. Called whenever a new org is created.

```js
const { seedNewOrg } = require('./services/seedService');
await seedNewOrg(orgId, userId);  // runs in a single transaction
```

Seeds three things in order:
1. **Field Setup** — 113 fields across 19 sections (General, MI, AE, PC) including: Prefix, Reporter Type, Source, Consent Status, Product Type, Product Category, Reported Causality, PC Classification, Frequency, Administration Route
2. **Picklists** — 33 default picklist groups
3. **Case Form Definition** — section visibility defaults for MI (5 sections), AE (10 sections), PC (8 sections)

All three run in a single MySQL transaction — if any fails, the whole seed rolls back.

**Wired into:** `mims/backend/routes/admin/orgs.js` POST `/` handler — called after INSERT INTO organisations and before SELECT created_at.

### `mims/backend/scripts/backfill-existing-orgs.js` (NEW — Sprint 10)

One-time script to seed defaults for orgs created before Sprint 10 was deployed.

```bash
node mims/backend/scripts/backfill-existing-orgs.js
```

Queries all active orgs, calls `seedNewOrg(org.id, 4)` for each, continues on error, prints summary. Run once. Already executed for org 1 (Novartis) and org 26 (Vanaja Review Co.).

---

## 10. Sprint History

| Sprint | Goal | Outcome | Key Features Delivered | Carryover |
|--------|------|---------|----------------------|-----------|
| Sprint 1 | Foundation | Stable base | Auth, login, dashboard, basic inbox, core navigation | Browser verification not enforced — lesson learned |
| Sprint 2 | Stability | Patch/hotfix only | Bug fixes, no new features | Client onboarding held pending stability |
| Sprint 3 | Operational Maturity | CLOSED — 27 stories done | 6 features + Sprint 2 tech debt cleared. GitHub sync disabled. | None |
| Sprint 4 | Admin Console Phase A + B | CLOSED — 10 stories done | Phase A: 7 admin console features. Phase B: 3 features | None |
| Sprint 5 | Platform completeness | CLOSED — 9 stories done | 850 frontend modules, 0 errors. Core platform stabilised. | None |
| Sprint 6 | Admin Console + Case Form | CLOSED — Gate 2 approved 2026-03-25 | Phase 1A: Admin Console redesign (165/166 QA). Phase 1B: Extended admin features. Phase 2: Full case form (F-13 to F-18, 195/195 QA). 6 bugs fixed during QA. | Phase 3 (Argus/Veeva integration) — deferred to future sprint |
| Sprint 7 | Multi-Org Architecture | CLOSED — 2026-03-27 | Multi-org DB, JWT org context, switch-org API, superadmin user+org management, password reset flow, data isolation on all routes, org switcher UI, 7 bugs fixed during product testing | None |
| Sprint 8 | Security + Data Integrity | CLOSED — 2026-03-28 | Session timeout per org + superadmin global timeout, 2FA infrastructure (user_2fa_settings, backup codes, trusted devices, challenges, password history), per-org 2FA config (on/off, email OTP + TOTP, remember-device days), platform SMTP config + test-email, superadmin audit + login-audit pages, superadmin lockdown, org/site toggles, site uniqueness, data cleanup. 20/20 QA tests passing. | None |
| Sprint 9 | SuperAdmin Control, Audit, and Alerts | CLOSED — 2026-03-28 | SuperAdmin dashboard, advanced audit/login-audit filters + CSV export, user lifecycle controls (force password reset, unlock, bulk actions), alerts engine, alert rules/events, in-app notifications, org/site deactivation alerts, duplicate alert-rule fix. QA substantially passed and product review accepted. | Small future polish only — clarify alert-rule activation/default behavior in UX copy |
| Sprint 10 | Case Form Foundation | CLOSED — 2026-03-31 | Org seed service (seedService.js), field_setup unique key fix (org_id added), runtime linkage (GET /api/cases/form-config), Case Form UI dynamic rendering (AE 9 tabs / PC 7 tabs, formConfig helpers, flex field tab panels), Field Setup UI two-pane redesign + flex field CRUD (add/delete), backfill script for existing orgs. 37/37 QA tests passing. All code written via Codex CLI. | None |
| Sprint 11 | Integration Foundation + Reports Backend | CLOSED | Integration screens (SuperAdmin + Admin Console), org_integrations DB table, API key auth layer, Integration Engine service, EMIR, Reports backend. | AdminConsolePage split — deferred to Sprint 13 |
| Sprint 12 | Admin Console + Workflow Gaps | CLOSED | Admin Console workflow engine, CM backend, security hardening. AdminConsolePage split attempted — deferred to Sprint 13. | AdminConsolePage split — carried to Sprint 13 |
| Sprint 13 | AdminConsolePage Refactor + Reports UI + CM Frontend + Admin Gaps + Security | CLOSED — 2026-04-05 | AdminConsolePage 6,395→763 lines (5 sub-components), Reports frontend (27 reports), CM frontend (Documents/FAQs/Merge/Templates), Admin Console FRD gaps (Expiry/Approvals/Dependencies/Diff/Workflow Rules/Security Groups), Case Workflow Engine fix, Security hardening, SuperAdmin Reports Access (DB+API+UI). 50/50 items. Gate 2 approved by Rohith. | Open defect: Security Groups deactivation — Sprint 14 |
| Sprint 14 | Case Management Gaps + UX + QA + Architecture | CLOSED — 2026-04-07 | G10: Global search, case comments (case_comments table), case reassignment UI, notifications (overlay + dashboard). G11: Home dashboard (stats/recent/alerts), session management UI (list, revoke, activity). G12: Full regression suite, inbox smoke, reports regression, Security Groups deactivation defect fix (409 + dependency payload), Playwright e2e gate hardened. G13: API versioning (/api/v1/* router, version headers), log aggregation endpoint (/api/admin/service-logs/aggregation). 13/14 items. Gate 1 passed (exit code 0, 8/13 Playwright pass, 2 flaky recovered, 3 skipped). | G13-3: Full client-facing demo environment provisioning — deferred to Sprint 15 (runbook + preflight delivered) |

---

## 11. Current Sprint

**Sprint 14 — CLOSED (2026-04-07). 13/14 items delivered. Gate 1 PASSED.**

Deferred to Sprint 15: G13-3 — full client-facing demo environment provisioning/hardening (runbook + preflight smoke delivered; full release-grade environment setup deferred).

**Sprint 15 — READY. Awaiting Rohith go-ahead.**

Carry-in from Sprint 14: G13-3 client-facing demo environment (HIGH — must complete before any client demo).

---

## 12. Known Issues and Technical Debt

| # | Item | Type | Priority | Owner |
|---|------|------|----------|-------|
| 1 | Multi-row AE tabs (lab results, medical history, product info) — row-level CRUD UI is placeholder note only | Feature gap | Medium | Varun |
| 2 | CSS for `cf-` namespace — CasesPage/CaseFormPage use `cf-` classes — no dedicated stylesheet yet | Visual debt | Medium | Vivek |
| 3 | `browser-test.js` (66 tests) — not re-run since Sprint 6 Phase 2 changes — may need selector updates | Test debt | Low | Karthik |
| 4 | CP Portal: `Unknown column 'client_code'` in `cp_clients` — low priority, CP Portal not in active scope | CP Portal bug | Low | Varun |
| 5 | Sprint 11 Phase 3 (Safety + CRM) — Argus/Veeva/TrackWise/Salesforce integration | Future sprint | Planned Sprint 11 | TBD |
| 6 | Analytics module (`/analytics`) — placeholder only | Future sprint | Deferred | TBD |
| 7 | Production deployment — Lightsail plan discussed and documented. Deferred by Rohith (2026-03-28). Plan: 2GB instance + Managed MySQL + Object Storage ~$29/mo. 9 non-cloud migrations identified before go-live. | Deployment | When ready | Varun |
| 8 | Email OTP live success path depends on correct SMTP encryption/port settings. Use `SuperAdmin -> 2FA Configuration -> Test SMTP Connection / Send Test Email` before calling email OTP fully signed off. | Config / QA dependency | High | Varun / Karthik |
| 9 | Forgot-password and change-password browser QA is still required after the password-history rule addition. Backend enforcement is implemented, but UI/browser evidence must be captured separately. | QA follow-up | High | Karthik |
| 10 | npm vulnerabilities — 19 flagged on GitHub (8 high, 9 moderate, 2 low). Flagged on commit 71b8a3a. Varun to review in Sprint 11. | Security | Medium | Varun |
| 11 | Sprint 11 Gate 1 pending — Bhavya must deliver pre-written Codex prompts before Gate 1 can be raised to Rohith. | Process blocker | High | Bhavya |

---

## 13. Critical Technical Rules (Must Know)

These are non-negotiable. Ignoring them causes bugs.

| Rule | Detail |
|------|--------|
| Real entry point | `index.html` → `src/modules/max/main.jsx` → `src/modules/max/App.jsx`. NOT `src/App.jsx`. |
| JWT field | Always use `req.user.userId`. Never `req.user.id`. |
| MySQL LIMIT/OFFSET | NEVER use `?` placeholders. Always inline: `` LIMIT ${parseInt(limit,10)} OFFSET ${offset} `` |
| MySQL reserved words | Backtick reserved words in template literals: `` \`separator\` `` |
| MySQL NULL + UNIQUE | NULL != NULL — `ON DUPLICATE KEY UPDATE` won't fire with NULL values |
| Field setup seeding | Use `INSERT IGNORE`. Unique key is `uq_field_section_org (section_name, field_name, org_id)` — always includes org_id. The old `uq_field_section_name` key (no org_id) was dropped in Sprint 10. Without org_id in the key, INSERT IGNORE silently blocks per-org seeds when global rows already exist. |
| Org seed on creation | `seedNewOrg(orgId, userId)` in `seedService.js` must be called after every new org INSERT. Already wired into `POST /api/admin/orgs`. If orgs were created before Sprint 10, run `backfill-existing-orgs.js` once. |
| form-config org resolution | `GET /api/cases/form-config` uses `authenticate` only — not `requireOrg`. Superadmin has orgId=null in JWT; org resolved inline: `superadmin ? parseInt(query.org_id) || 1 : req.user.orgId`. Never apply requireOrg to this route. |
| Auth header | `Authorization: Bearer <token>`. Token from `mims_token` in localStorage. |
| Git push | Disabled since Sprint 3. Never run `git push` or `gh` commands. |
| New case org_id | Always sourced from JWT (`req.user.orgId`) — never from request body. |
| Superadmin role | Cannot be assigned to any user via API or UI. Only ID 4 (`superadmin`) carries this role. Never add hardcoded role resets to `db.js` init. |
| Site names | Unique per org. `UNIQUE KEY uq_site_org_name (org_id, name)`. Always pre-validate in API with a 409 before INSERT. |
| Login input type | Login field is `type="text"` NOT `type="email"` — required to allow `superadmin` username (no @ symbol). |
| Session timeout | Login + switch-org responses must always include `sessionTimeout`. AuthContext must always store it in `mims_session_timeout` localStorage key. |
| User 2FA scope | 2FA applies to MIMS users only. Superadmin login does not use 2FA. |
| Platform SMTP vs MIMS Email Accounts | Platform SMTP in Superadmin is for user 2FA emails. Admin Console Email Accounts remain org-specific operational mailboxes. Do not mix them. |
| Platform SMTP reuse | The same platform SMTP is currently used for user 2FA, forgot-password emails, and SuperAdmin alert emails. There is no separate alert SMTP config in Sprint 9. |
| 2FA expiry handling | Use DB-time expiry (`NOW()` / `DATE_ADD`) for challenges and trusted devices. Do not rely on JS Date values written directly into MySQL DATETIME for auth expiry logic. |
| Password reuse policy | Backend must block reuse of the current password and previous 5 passwords across first-login reset, forgot-password reset, and in-app change password. This is hardcoded server behavior, not a UI setting. |
| SuperAdmin alerts | Alert rules are configurable and can be enabled/disabled. If a rule is inactive, the related alert event and notification will not fire. |

---

## 14. Process Reference

Full SOP: `TEAM_OPERATING_SOP.md`. Gate flow, browser verification checklist, and communication standards: see `memory/protocols.md`.

---

## 15. How to Update This File

- This file is only updated when Rohith explicitly confirms and asks Bala to update it
- Rohith says: *"Bala, update the Memory SOP — [summary of what changed]"*
- Bala updates the relevant sections and adds a row to the Version History table at the top
- No one else modifies this file
- After a sprint closes, the sprint row in Section 10 is updated to CLOSED and Section 11 is updated with the new current sprint
- Known issues in Section 12 are updated when items are resolved or new debt is identified
