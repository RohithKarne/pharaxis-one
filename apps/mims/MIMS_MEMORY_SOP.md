# MIMS Memory SOP
> **Purpose:** Single source of truth for MIMS project. For any dev, QA, or team member onboarding/resuming without verbal explanation.
> **Scope:** MIMS only. CP Portal documented separately in `CP_MEMORY_SOP.md`.
> **Update Protocol:** Updated only when Rohith explicitly confirms. Rohith says "Bala, update the Memory SOP — [what changed]" and Bala updates. No one else modifies. Each update adds version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-03-27 | Bala | Initial creation — full Sprint 7 state |
| 2026-03-28 | Bala | Sprint 8 complete: session timeout, platform admin lockdown, org/site toggles, data cleanup, site uniqueness. DB, API, frontend, team updated. |
| 2026-03-28 | Bala | Post-Sprint 8: org-controlled user 2FA, Platform Admin 2FA Config, platform SMTP test, QA status added. |
| 2026-03-28 | Bala | Password recovery + history: forgot-password, in-app change-password, backend blocks reuse of current + last 5 passwords. |
| 2026-03-28 | Bala | Reshape: audit + login-audit endpoints → Section 7. Platform Admin pages table → Section 8. Sprint 8 summary expanded. Section 11 updated (2FA infra, SMTP, reset-2fa, audit). |
| 2026-03-28 | Bala | Section 11 trimmed — verbose sprint blocks removed. Content already in sections 7–9, 13. Section 11 = current sprint only. |
| 2026-03-28 | Bala | Team promotions: Varun → Senior Director Engineering, Bhavya → Senior Architect, Vivek → Principal SWE, Karthik → QA Manager, Vanaja → Director Product Management, Vinay → Product Owner. Section 5 updated. |
| 2026-03-28 | Bala | Sprint 9 closed: Platform Admin dashboard, audit filters + CSV export, user lifecycle controls, alerts engine, in-app notifications, duplicate alert-rule fix. Sections 7–13 updated. |
| 2026-03-28 | Bala | Sprint 9 DB enriched: platform_admin_alert_rules, platform_admin_alert_events, notifications expanded. Sprint 9 affected tables documented. |
| 2026-03-31 | Bala | Sprint 10 closed: org seed service (`seedService.js`), GET /api/cases/form-config, Case Form UI dynamic rendering (AE 9 tabs / PC 7 tabs), Field Setup UI two-pane + flex field CRUD. field_setup unique key fixed (org_id). Backfill script. Codex workflow rule. Sprint 11 roadmap locked. All sections updated. |
| 2026-04-05 | Bala | Sprints 11–13 closed. Sprint 14 active. Section 5 → pointer to `TEAM_OPERATING_SOP.md`. Section 14 → pointer to `memory/protocols.md`. Section 13 trimmed (rules → `memory/feedback.md`). Section 11 = current sprint only. Sprint history updated to Sprint 14. |
| 2026-04-07 | Bala | Sprint 14 closed. 13/14 items complete. G13-3 (client-facing demo env) deferred to Sprint 15. Gate 1 passed (exit code 0). Sprint history + Section 11 updated to Sprint 15 READY. |
| 2026-04-18 | Bala | Sprint 15 active changes: CM Phase 4 (4 new document tabs), Regression Testing Suite built, navbar restructured (Utilities dropdown), auth infinite-loop fixed, ExceptionToast silenced, regression mi-categories self-heal fix. Sections 6, 7, 9, 9b, 11, 12, 13 updated. |
| 2026-04-22 | Bala | Sprints 16-18 closed. MI Full Approval Workflow (DRAFT→READY→APPROVED→SENT + e-sign), AE multi-row tab CRUD, Transmissions page, Browse Content page, Impact Preview, npm audit fix, MI bypass fix, DB DEFAULT fix. All sections updated. |
| 2026-04-23 | Bala | Sprint 19 closed. MI email delivery on SENT transition, Response Log page, SLA badge on case list, Dashboard MI KPIs, Inbox→Case context carry, Case Audit Trail diff UI + per-case CSV. Sections 6, 7, 9b, 10, 11, 12, 13 updated. |
| 2026-04-26 | Bala | Sprint 21 (Sprints A+B+C combined) in progress. Sprint A: shared apiClient.js created, regression tests co-located, Joi validation added. Sprint B: db.js split into 001-015 migrations. Sprint C: ContentPage.jsx 3950→68 lines (14 sub-components extracted to content/components/), CaseFormPage 2856→2273 lines (5 components extracted), AdminMiscSection 1782→23 lines (6 panels extracted to AdminProductsPanel, AdminAuditPanel, AdminEmailAccountsPanel, AdminContactMasterPanel, AdminCaseNumberingPanel + AdminShared.jsx created, duplicates removed from AdminWorkflowSection + AdminAccessSection). Total −6,000+ lines from monoliths, 30+ focused files created. |
| 2026-04-28 | Bala | Sprint 21 closed (mims). Sprint A complete in app code: frontend raw `fetch()` migrated to shared `httpFetch` wrapper across 83 files (448→1 wrapper-only call), backend integration services (`mirService`, `crmService`, `vaultService`, `oauth2Service`) moved to backend `httpFetch` wrapper. Sprint B close validation complete: new Jest suite `backend/tests/migrationRunner.test.js` covers fresh DB / legacy bootstrap / already-applied paths (3/3 PASS). Sprint C QA regression close: `Sprint21SplitRegression.test.jsx` added for `CaseFormPage` + `ContentPage` split behavior (4/4 PASS), full frontend tests green (10/10), frontend build PASS. Deferred item unchanged: `authRateLimiter` left as-is. |
| 2026-04-28 | Bala | Sprint 21 final closure. Platform AdminPage.jsx (3456 lines) split into 13 files: `platform-admin/utils/guardedFetch.js` + 12 view components (`DashboardView`, `OrganisationsView`, `TwoFactorConfigView`, `UsersView`, `AlertsView`, `NotificationsView`, `AuditView`, `LoginAuditView`, `IntegrationsView`, `ReportsAccessView`, `HelpContentView`, `CopyDivisionView`). Shell reduced to 107 lines. Global 401 session-expiry handler wired into `shared/api/httpFetch.js` — all 84 `httpFetch` call sites now auto-logout on 401. `createModuleApp.jsx` registers handler for all non-platform-admin modules. `guardedFetch.js` simplified to re-export from shared. Build PASS (246 modules). All code work for Sprint 21 complete. Remaining: QA regression browser pass (human) + MIMS_MEMORY_SOP Sprint 21 docs. |
| 2026-05-12 | Varun | System Design Sprint complete (16 fixes), Architecture fixes complete (A1+A2), Code Review fixes complete (10 issues). UAT/QA system built and wired. `production` git branch created. All sections updated. |
| 2026-05-12 | Bala | UAT server live on Rohith's MacBook (port 4001). Full UAT setup documented in Section 15 (new): PM2 process, DB, credentials, push-to-UAT workflow, feedback widget, QA dashboard, deploy script. |
| 2026-05-12 | Bala | Section 15 expanded — Local vs UAT app purpose, audience, data, workflow fully documented so any team member can understand the difference without verbal explanation. |
| 2026-05-20 | Varun | Local MIMS UAT environment retired and removed from repo/machine. No PM2 `mims-uat`, port `4001`, or `pharaxis_mims_uat` database should be assumed active. |
| 2026-07-15 | Bala | CP Portal↔MIMS integration LIVE (approved by Rohith, browser-verified). API platform: `POST /oauth/token` (client credentials, 1h tokens — CP auto-refreshes), `POST/GET /api/v1/cases`, `POST /api/v1/cases/:id/attachments`; case writes now populate the UI-read structures (`case_contacts`, versioned `case_ae_*`/`case_pc_*`, `case_mi`); idempotent on CP reference (= `case_number`). Fixes shipped: tokenIssuer scope double-parse (mysql2 JSON column, sibling of the apiKeyAuth bug); infinite `/api/auth/me`+security-groups fetch loop in AuthContext (root cause of "Too many authentication requests" lockouts); ProtectedRoute now waits for cookie-session restore instead of bouncing to /login on refresh; auth rate limiter no longer counts successful requests; dev `JWT_SECRET` fixed in `.env` (sessions survive nodemon restarts); `FeatureFlagsProvider` mounted in Max app — it never was, so ALL `cf.*` tenant flags rendered OFF app-wide. `cf.theme6_documents` enabled for Novartis (org 1): Case Attachments workspace now visible (Communications → Attachments). |

---

## 1. What Is MIMS

**MIMS — Medical Information Management System**
Enterprise platform for pharma companies to manage medical information inquiries and safety cases end-to-end.

MIMS handles:
- Incoming medical inquiries via email (inbox), triaged by agents
- Case creation + management across 3 case types: MI (Medical Information), AE (Adverse Events), PC (Product Complaints)
- Admin config per org — picklists, field setup, security groups, sites, workflows, case numbering, audit trails
- Content management — documents, FAQs, templates, merge reports with approval lifecycles
- Multi-org support — single MIMS instance serves multiple pharma client orgs with full data isolation

**Relationship to CP Portal:**
CP Portal: separate white-label HCP/patient portal. Future: CP Portal → MIMS via API, MIMS pushes outcomes back. Not built yet.

**Current Focus:** MIMS sole active dev priority. CP Portal: hotfix only if Rohith requires.

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

**Default Platform Admin login:**
- Username: `platform_admin`
- Password: `__SET_SMOKE_TEST_PASSWORD__`
- Only platform admin account. No other user can be assigned platform admin role — blocked at API + UI level.
- Login field is `type="text"` (not `type="email"`) to support `platform_admin` username (no `@`).

---

## 4. System Architecture

### Entry Point (CRITICAL)
Real app entry point:
```
index.html → src/modules/max/main.jsx → src/modules/max/App.jsx
```
Top-level `src/App.jsx` and `src/main.jsx` are **legacy files — do not edit**. All route additions go into `src/modules/max/App.jsx`.

### Auth Flow
1. User POSTs `/api/auth/login` with email + password
2. Server verifies password (bcrypt), checks `user_org_access` for org assignment
3. Returns JWT: `{ userId, email, role, orgId, siteId }`
4. JWT stored in localStorage as `mims_token`
5. All API calls include `Authorization: Bearer <token>` header
6. `requireAuth` middleware decodes JWT, attaches `req.user`
7. `requireOrg` blocks non-platform-admin users without `orgId` in JWT (403)

### JWT Decode Pattern
```js
// ALWAYS use req.user.userId — NEVER req.user.id
req.user = decoded  // { userId, email, role, orgId, siteId }
```

### Multi-Org Data Isolation Pattern
```js
// Applied on every data-scoped route since Sprint 7
if (req.user.role !== 'platform_admin') {
  query += ' AND org_id = ?'
  params.push(req.user.orgId)
}
// Platform Admin has orgId = null in JWT → bypasses all org filters
```

### Module Access
- Modules: `mims_core`, `admin_console`, `content_mgmt`, `data_visualization`
- Stored in `user_module_permissions` table per user
- Frontend enforces via `ModuleAccessGuard` component wrapping each route
- Platform Admin bypasses all module checks
- Platform Admin hidden from User Management + Module Access screens — `WHERE role != 'platform_admin'` on both `/api/admin/platform/users` and `/api/admin/platform/all-users`

### Session Timeout
- Per-org idle timeout set by platform admin. Stored as `session_timeout_minutes` in `organisations` table.
- Platform Admin global timeout in `system_config` (`key: platform_admin_session_timeout_minutes`).
- Defaults: **30 min** per org, **60 min** platform admin. Min enforced: **30 min**.
- Login + switch-org APIs return `sessionTimeout`.
- Frontend: `useIdleTimer.js` tracks mouse/keyboard/scroll. `SessionTimeoutModal.jsx` warns 2 min before logout. "Stay Logged In" resets timer.
- `sessionTimeout` stored in localStorage as `mims_session_timeout`. Wired into `App.jsx` via `AppRoutes`.

### User 2FA Architecture
- 2FA applies to **MIMS users only**. Platform Admin login does **not** use this flow.
- Platform Admin controls 2FA per org from `2FA Configuration` screen.
- Supported methods: `Email OTP` and `Authenticator App (TOTP)`.
- Login flow (same screen):
  1. User enters username/email + password
  2. If org 2FA enabled + user not enrolled, optional setup shown inline
  3. User chooses Email OTP or Authenticator App, or skips if allowed
  4. Once enrolled, 2FA required unless remembered device valid
- Backup codes generated on enrollment. Remember-device supported for org-configured duration. Lock after **3** invalid attempts.
- Platform Admin can reset user 2FA from User Management.
- Platform SMTP for 2FA emails in `system_config` — separate from org-level Email Accounts.
- Security challenge expiry must use **DB time** (`NOW()` / `DATE_ADD`), not JS timestamps. Real QA defect — fixed.

### Password Reset Flow
1. New users created with `password_reset_required = 1` and default password `__SET_SMOKE_TEST_PASSWORD__`
2. On login, if flag set, server returns `{ passwordResetRequired: true, token: resetToken }`
3. Frontend redirects to `/reset-password` (NOT `/dashboard`)
4. After reset, flag cleared, user gets fresh JWT with modules + org context
5. User navigates to `/dashboard` normally

### CSS Namespace Convention
| Prefix | Used For |
|--------|----------|
| `mims-` | Shared layout components |
| `ac-` | Admin Console pages |
| `cm-` | Content Management pages |
| `cf-` | Case Form pages |
| `tx-` | Transmissions page |
| `bc-` | Browse Content page |

---

## 5. Team Structure

5 members. Full org chart + role descriptions: see `docs/TEAM_OPERATING_SOP.md`.

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

All routes in `mims/frontend/src/modules/max/App.jsx`.

| Route | Component | Module Guard |
|-------|-----------|-------------|
| `/login` | LoginPage | None (public) |
| `/reset-password` | ResetPasswordPage | None (public) |
| `/no-access` | NoAccessPage | None |
| `/dashboard` | DashboardPage | `mims_core` |
| `/inbox` | InboxPage | `mims_core` |
| `/cases` | CasesPage | `mims_core` |
| `/cases/:id` | CaseFormPage | `mims_core` |
| `/case-query` | CaseQueryPage | `mims_core` |
| `/session-management` | SessionManagementPage | `mims_core` |
| `/exceptions` | ExceptionLogsPage | `mims_core` |
| `/process-explorer` | ProcessExplorerPage | `mims_core` |
| `/regression` | RegressionPage | ProtectedRoute only (admin/platform-admin) |
| `/admin-console/*` | AdminConsoleRouter | `admin_console` |
| `/content` | ContentPage | `content_mgmt` |
| `/analytics` | AnalyticsPage | `data_visualization` |
| `/reports` | ReportsPage | `reports` |
| `/transmissions` | TransmissionsPage | `mims_core` |
| `/browse-content` | BrowseContentPage | `content_mgmt` |
| `/response-log` | ResponseLogPage | `mims_core` |
| `*` | Redirect | → `/dashboard` |

### Navbar Structure (MIMSNavbar.jsx)
Main bar: Home · Inbox · Case Management ▾ · Case Query · **Utilities ▾** · Transmissions · Browse Content · Reports

**Utilities dropdown** (all in one menu):
- Exception Log (`/exceptions`) — all users
- Session Management (`/session-management`) — all users
- 📋 Response Log (`/response-log`) — all users (Sprint 19)
- Process Explorer (`/process-explorer`) — admin/platform-admin, org-config gated (shows "Off" if disabled)
- 🧪 Regression Testing (`/regression`) — admin/platform-admin only
- ─── divider ───
- CDR Log, Schedule CDR, Case Audit Trail, Transmission Audit Trail, Non Relevant Emails — all "Soon"

**Removed from main bar:** Analytics (deferred by Rohith 2026-04-22)

Utilities tab highlights active (orange) when on any sub-page.

---

## 7. Backend API Map

Backend on port 3000. All routes under `/api/`.

### Auth
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | Login — returns JWT + modules + org data |
| POST | `/api/auth/forgot-password/send-code` | Forgot-password: send email verification code |
| POST | `/api/auth/forgot-password/verify-code` | Forgot-password: verify email code, issue short reset token |
| POST | `/api/auth/forgot-password/reset` | Forgot-password: set new password after code verification |
| POST | `/api/auth/2fa/send-email-code` | Send Email OTP for login/setup |
| POST | `/api/auth/2fa/setup/totp` | Begin authenticator app setup, return secret/QR payload |
| POST | `/api/auth/2fa/verify` | Verify email OTP, TOTP, or backup code |
| POST | `/api/auth/2fa/skip-setup` | Skip optional 2FA setup, complete login |
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
| POST | `/api/cases` | Create case (org_id from JWT only) |
| GET | `/api/cases/form-config` | Dynamic form config — merged sections + fields + picklist options for given case_type + org. Auth only (no requireOrg). Platform Admin passes `?org_id=`, regular users from JWT orgId. Returns `{ case_type, sections: [{ section_name, is_visible, fields: [{ ...field, options: [] }] }] }`. |
| GET | `/api/cases/:id` | Single case detail |
| PUT | `/api/cases/:id` | Update case (COALESCE pattern — partial update) |
| DELETE | `/api/cases/:id` | Soft delete |
| POST | `/api/cases/:id/assign-number` | Assign case number (idempotent) |
| GET/POST/PUT/DELETE | `/api/cases/:id/contacts/:cid` | Case contacts with DNUMD support |
| GET/POST/PUT/DELETE | `/api/cases/:id/mi/:tabId` | MI multi-tab management |
| GET/POST/PUT | `/api/cases/:id/ae/versions` | AE version control (locks on new version) |
| GET/POST/DELETE | `/api/cases/ae/versions/:versionId/lab-results` | AE lab results multi-row CRUD |
| GET/POST/DELETE | `/api/cases/ae/versions/:versionId/medical-history` | AE medical history multi-row CRUD |
| GET/POST/DELETE | `/api/cases/ae/versions/:versionId/product-info` | AE product info multi-row CRUD |
| GET/POST/PUT | `/api/cases/:id/pc/versions` | PC version control |
| GET | `/api/cases/mi-responses/log` | Response Log — all MI responses cross-case, filterable by status/date/search (Sprint 19) |
| GET | `/api/cases/dashboard-summary` | Dashboard stats + MI KPIs (pending, pending_approval, sent_today, sla_breached) + recent cases + alerts |
| GET | `/api/cases/:id/mi-responses` | List MI responses with workflow status |
| POST | `/api/cases/:id/mi-responses` | Create MI response (always DRAFT — 21 CFR Part 11) |
| PATCH | `/api/cases/:id/mi-responses/:rid/status` | Transition MI response status with e-sign (DRAFT→READY→APPROVED→SENT). SENT triggers nodemailer delivery + transmission_audit_trail log. |
| PATCH | `/api/cases/:id/mi-responses/:rid/discard` | Void a DRAFT response (VOIDED terminal state) |
| POST | `/api/admin/impact-preview` | Blast-radius impact preview for workflow/field/taxonomy changes (5-min TTL cache) |

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
| POST | `/api/admin/field-setup/flex` | Add flex field to section. Body: `{ section_name, field_name, field_type, picklist_type, is_required, sort_order }` |
| DELETE | `/api/admin/field-setup/flex/:id` | Delete flex field by id |
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

### Platform Admin
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/platform/all-users` | Full user list with org assignments (excludes platform admin role) |
| GET | `/api/admin/platform/users` | Users for module access screen (excludes platform admin role) |
| POST | `/api/admin/platform/users/create` | Create user — roles: admin/agent/reviewer/content_manager only. platform admin blocked. |
| PUT | `/api/admin/platform/users/:id` | Update user — platform admin role blocked |
| POST | `/api/admin/platform/users/:id/reset-2fa` | Reset user 2FA enrollment, lock state, backup codes, trusted devices |
| GET/POST/PUT/DELETE | `/api/admin/platform/users/:id/org-access` | CRUD org assignments |
| GET | `/api/admin/platform/orgs-for-assignment` | Active orgs + sites for dropdown |
| PUT | `/api/admin/platform/users/:id/modules` | Override user module access |
| GET | `/api/admin/platform/orgs` | List all orgs with sites + session_timeout_minutes |
| POST | `/api/admin/platform/orgs` | Create org |
| PUT | `/api/admin/platform/orgs/:id` | Update org name / is_active / session_timeout_minutes / 2FA settings |
| POST | `/api/admin/platform/orgs/:id/sites` | Create site — validates no duplicate name within org |
| PUT | `/api/admin/platform/sites/:id` | Update site name / country / is_primary / is_active |
| GET | `/api/admin/platform/config` | Get system config (platform-admin timeout + platform SMTP) |
| PUT | `/api/admin/platform/config` | Update system config (platform-admin timeout + platform SMTP) |
| POST | `/api/admin/platform/config/test-email` | Test SMTP connection or send test email from Platform Admin 2FA Configuration |
| GET | `/api/admin/platform/dashboard` | Platform Admin dashboard KPIs + recent audit/login activity |
| POST | `/api/admin/platform/users/:id/force-password-reset` | Force user to reset password on next login |
| POST | `/api/admin/platform/users/:id/unlock` | Clear user security lock / 2FA failed-attempt lock |
| POST | `/api/admin/platform/users/bulk-action` | Bulk activate, deactivate, or force password reset |
| GET | `/api/admin/platform/audit` | Paginated general audit log — all entity changes. Params: `limit` (max 200), `offset` |
| GET | `/api/admin/platform/login-audit` | Paginated login/logout event log. Params: `limit`, `offset`, `status` filter |
| GET/POST/PUT | `/api/admin/platform/alerts/rules` | List, create, update platform-admin alert rules |
| GET | `/api/admin/platform/alerts/events` | Alert event history with delivery statuses |
| GET | `/api/admin/platform/notifications` | Platform Admin in-app notifications |
| POST | `/api/admin/platform/notifications/:id/read` | Mark notification as read |

### Content Management
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cm/folders` | Active content folders |
| CRUD | `/api/cm/documents` | Documents — Draft → Published lifecycle |
| POST | `/api/cm/documents/:id/checkin` | Check in with version bump (bump_type: major/minor). Auto-sets owner_user_id on first checkin. |
| POST | `/api/cm/documents/:id/publish` | Publish — enforces owner lock (only owner can publish). Sets publisher as owner_user_id. |
| POST | `/api/cm/documents/:id/release` | Release owner lock — resets document to Draft, clears owner_user_id |
| GET/POST/DELETE | `/api/cm/documents/:id/relations` | Associated documents — link/unlink, relation types |
| GET/PUT | `/api/cm/documents/:id/alert-config` | Per-document version alert config (alert_days JSON, alert_email_account_id) |
| POST/DELETE | `/api/cm/documents/:id/alert-subs` | Per-document alert subscribers (users to notify) |
| GET/PUT | `/api/cm/settings` | Org-level CM default settings (upsert via ON DUPLICATE KEY) |
| CRUD | `/api/cm/faqs` | FAQs with lifecycle |
| CRUD | `/api/cm/templates` | Email/response templates |
| CRUD | `/api/cm/merge-reports` | Merge report templates |
| GET/PUT | `/api/cm/reviews` | Review tasks for content reviewers |
| CRUD | `/api/cm/picklists` | CM document category values (mounted at `/api/cm`, paths are `/picklists` not `/cm/picklists`) |

### Regression Testing Suite
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/regression/run` | Run full test suite (rate-limited: 5 min per user) |
| GET | `/api/admin/regression/history` | Last 50 run summaries |
| GET | `/api/admin/regression/history/:id` | Single run full results with module grouping |
| GET | `/api/admin/regression/db-health` | Live DB table health (row counts, column names) |
| GET | `/api/admin/regression/api-catalog` | All registered Express routes |
| GET | `/api/admin/regression/coverage` | Uncovered routes vs tests |

### Admin (additional)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/mi-categories` | MI categories (org-scoped; platform admin needs `?org_id=`) |
| GET | `/api/admin/audit-logs` | Audit log entries (plural — NOT `/audit-log`) |
| GET | `/api/admin/email-accounts` | Email accounts for SMTP dropdown |
| GET | `/api/admin/products-full` | Full products list |
| GET | `/api/admin/security-groups` | Security groups |
| GET | `/api/admin/field-setup` | Field setup |

### Misc
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Backend health check |
| GET | `/api/users` | Active users list (for case owner dropdown) |

---

## 8. Admin Console Sections

All under `/admin-console/*` (requires `admin_console` module).

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
- `Admin Console -> Email Accounts` = org-specific MIMS mailboxes for app operations
- `Platform Admin -> 2FA Configuration` = platform SMTP for user 2FA email delivery + org-level 2FA controls

### Platform Admin Console Pages

Accessible at `/mims-admin?standalone=1` with legacy `/admin/platform` alias compatibility. Sidebar-based nav — no URL routing between pages.

| Page Key | Sidebar Label | What It Shows |
|----------|--------------|---------------|
| `dashboard` | Dashboard | Platform KPIs, failed logins, unread notifications, recent audit + login activity |
| `organizations` | Organizations | Org cards with site lists, active/inactive toggles, session timeout editor, add site form |
| `2fa-config` | 2FA Configuration | Platform SMTP config + test/send buttons; per-org 2FA enable/methods/remember-days table |
| `users` | Users | User list with 2FA status, org assignments, Reset 2FA button; create user form; org assignment panel (Org / Site / Role tabs) |
| `module-access` | Module Access | Per-user module checkboxes (mims_core, admin_console, content_mgmt, data_visualization) |
| `alerts` | Alerts | Alert rule setup, enable/disable, thresholds, recipients, recent alert event history |
| `notifications` | Notifications | In-app notification inbox for platform-admin alerts with read/unread state |
| `audit` | Audit Trail | Paginated general audit log — entity changes across platform |
| `login-audit` | Login Audit | Paginated login/logout event log with status filter |

---

## 9. Database Tables Reference

### User & Access
| Table | Purpose |
|-------|---------|
| `users` | System users — email, role, password hash, active, password_reset_required |
| `sessions` | Active login session tracking |
| `login_audit` | Login/logout + auth event records for 21 CFR Part 11 |
| `notifications` | In-app notifications. Sprint 9. Platform-admin alert-triggered, read/unread state. Platform-admin inbox reads this table. |
| `user_org_access` | Multi-org: maps user → org → site → role → permission (Sprint 7) |
| `user_module_permissions` | Per-user module access — overrides default role permissions |
| `user_password_history` | Previous password hashes. Blocks reuse of current + last 5. |
| `user_2fa_settings` | Per-user, per-org 2FA enrollment, method, TOTP secret, fail count, lock state |
| `user_2fa_backup_codes` | Hashed one-time backup codes per user/org |
| `user_2fa_trusted_devices` | Remembered devices with expiry per user/org |
| `user_2fa_challenges` | Active email OTP + TOTP setup challenges with expiry |
| `security_groups` | RBAC groups with privilege matrix |
| `security_group_users` | User → security group mappings |
| `role_permissions` | Default access per role per module |

### Organisation & Sites
| Table | Purpose |
|-------|---------|
| `organisations` | Pharma client orgs — name, is_active, `session_timeout_minutes` (default 30), `two_factor_enabled`, `two_factor_methods`, `two_factor_remember_days` |
| `sites` | Locations per org — country, primary flag, is_finalized, abbreviation. **UNIQUE constraint on (org_id, name)** — duplicate site names within org blocked at DB + API. |
| `system_config` | Key-value global platform config. Uses: `platform_admin_session_timeout_minutes`, platform SMTP settings |
| `site_config` | Extended site config — GDPR, retry, alert settings |
| `site_email_accounts` | Email accounts linked to site |
| `site_email_purpose` | Site → purpose (response / transmissions / correspondence / fax) → email_account |
| `site_response_templates` | Auto-acknowledgement templates per site |
| `site_data_retention` | GDPR right-to-forget rules per site |
| `site_alerts` | Threshold-based alert rules per site |

### Cases
| Table | Purpose |
|-------|---------|
| `cases` | Core case record — case_number, type (MI/AE/PC), org, site, status, owner, priority |
| `case_contacts` | Contact/requestor entries per case with DNUMD support |
| `case_mi` | MI tabs — category, product, question, response |
| `case_ae_versions` | AE version control — locking on new version |
| `case_ae_general` | AE general tab (one per version) |
| `case_ae_events` | AE events — 7 ICH E2B R3 seriousness boolean columns |
| `case_ae_patient_info` | AE patient demographics |
| `case_ae_lab_results` | AE lab results (multi-row per version) |
| `case_ae_lab_notes` | AE lab notes |
| `case_ae_medical_history` | AE medical history (multi-row) |
| `case_ae_medical_notes` | AE medical notes |
| `case_ae_product_info` | AE product information (multi-row) |
| `case_mi_responses` | MI response records — `response_status` ENUM: DRAFT/READY/APPROVED/SENT/VOIDED. `DEFAULT 'DRAFT'` enforced. SENT = immutable. VOIDED = terminal discard. Each status transition records e-sign password + reason. 21 CFR Part 11 compliant. |
| `case_mi_response_transitions` | Immutable audit log of each MI response status change — who, when, target_status, e-sign reason |
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
| `workflow_activities` | Named case activities triggering rules (F-12) |
| `workflow_activity_triggers` | If-activity-then-action rules |
| `source_types` | How inquiries arrive (email, phone, web form, etc.) |
| `field_setup` | Case form field config per section per org — type, required, hidden, picklist, help_text, max_length, default_value. **Sprint 10:** unique key changed from `uq_field_section_name (section_name, field_name)` to `uq_field_section_org (section_name, field_name, org_id)` — required for per-org seeding via INSERT IGNORE. Seeds via `seedService.js` on org creation. |
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
| `email_retry_log` | Retry attempts for failed notification emails |

### Content Management
| Table | Purpose |
|-------|---------|
| `cm_folders` | Top-level content folders |
| `cm_documents` | Documents — Draft → CheckedOut → Pending → Under Review → Approved → Published → Archived. **Phase 4 columns:** `owner_user_id`, `review_cycle_days`, `regulatory_ref`, `custom_attributes` (JSON), `version_notes`, `alert_days` (JSON), `alert_email_account_id` |
| `cm_document_relations` | Associated document links — `doc_id`, `related_doc_id`, `relation_type`, `created_by` |
| `cm_document_alert_subs` | Per-document alert subscribers — `document_id`, `user_id`, `created_by` |
| `cm_org_settings` | Org-level CM default settings — key/value JSON store. Keys: `default_alert_days`, `default_alert_email_account_id`, `default_alert_roles` |
| `cm_faqs` | FAQs with lifecycle |
| `cm_templates` | Email/response/acknowledgment templates |
| `cm_merge_reports` | Merge report templates with lifecycle |
| `cm_reviews` | Review sessions |
| `cm_reviewers` | Individual reviewer assignments per review session |
| `cm_version_history` | Version tracking per document/FAQ/merge-report |

### Regression & Monitoring
| Table | Purpose |
|-------|---------|
| `regression_runs` | Regression test run history — `run_by`, `started_at`, `completed_at`, `total_tests`, `passed`, `failed`, `skipped`, `health_score`, `results` (LONGTEXT — full JSON report) |

### Audit & Monitoring
| Table | Purpose |
|-------|---------|
| `audit_logs` | General audit — case operations + entity changes |
| `platform_admin_alert_rules` | Sprint 9. Alert rule master data — event type, severity, delivery channels (email/in-app), recipients, threshold, time window, cooldown, active/inactive |
| `platform_admin_alert_events` | Sprint 9. Each fired alert event — per-channel delivery status (email delivered/failed, in-app created/failed) |
| `case_audit_trail` | Immutable field-level change log per case (F-09) |
| `transmission_audit_trail` | Immutable outbound transmission log per case (F-10) |
| `service_logs` | Platform-wide service events |

---

## 9b. Services and Scripts Reference

### `mims/backend/services/regressionRunner.js` (NEW — Sprint 15)

Full regression test engine. Auto-discovers `*.tests.js` files from `mims/backend/regression-tests/`, runs them sequentially (50ms gaps), stores full JSON report in `regression_runs` table.

Key functions:
- `runRegressionSuite({ runByUserId, app })` — runs all discovered tests, returns structured report
- `getToken()` — reads `REGRESSION_EMAIL`/`REGRESSION_PASSWORD` from `process.env` (set in `backend/.env`). Handles 2FA orgs via challengeToken→skip-setup flow. Dev-mode fallback to `vanaja_admin@reviewco.com` if env vars missing. Falls back to `REGRESSION_FALLBACK_EMAIL` if primary fails.
- `ensureRegressionUserOrgAccess()` — directly INSERTs `user_org_access` row for regression user using first active org. Called automatically on `noOrgAccess` during test run.
- `getDbHealth()` — SHOW TABLES + DESCRIBE per table + row counts
- `getApiCatalog(app)` — traverses `app._router.stack` recursively to list all registered routes
- `discoverTests()` — fs.readdirSync scans `regression-tests/` for `*.tests.js` files. New test files auto-detected without config changes.

**Regression credentials:** Set in `mims/backend/.env` (NOT the top-level `mims/.env`). Server CWD is `backend/` so `--env-file=.env` loads `backend/.env`. Missing credentials = token null = 170 tests fail with 401. Current: `REGRESSION_EMAIL=vanaja_admin@reviewco.com` / `REGRESSION_PASSWORD=Test@1234`.

**Test files location:** `mims/backend/regression-tests/*.tests.js`

**Rate limit:** 5 minutes per user (in-memory, resets on backend restart).

### `mims/backend/services/cmExpiryAlertService.js` (NEW — Sprint 15)

Daily cron at 07:00 UTC. Checks `cm_documents` for expiring documents. Per-doc config (`alert_days` JSON + `alert_email_account_id`) with org-level default fallback from `cm_org_settings`. Sends via nodemailer using stored SMTP account. Always fires on day 1 of expiry.

### `mims/backend/routes/admin/impactPreview.js` (NEW — Sprint 17)

POST `/api/admin/impact-preview` with 5-min in-memory TTL cache (Map-based).

Supports 3 `change_type` values:
- `workflow_rule` — affected cases by workflow state + case type
- `field_definition` — affected case versions with field changes
- `taxonomy` — affected cases referencing a picklist value

Returns: `{ affected_cases, risk_level (LOW/MEDIUM/HIGH), breakdown_by_case_type[], warnings[], ... }`. Used by AdminWorkflowSection.jsx and AdminPicklistsSection.jsx to show blast-radius before admin changes.

### `mims/backend/services/seedService.js` (NEW — Sprint 10)

Master org seed service. Called when new org created.

```js
const { seedNewOrg } = require('./services/seedService');
await seedNewOrg(orgId, userId);  // runs in a single transaction
```

Seeds 3 things in order:
1. **Field Setup** — 113 fields across 19 sections (General, MI, AE, PC) including: Prefix, Reporter Type, Source, Consent Status, Product Type, Product Category, Reported Causality, PC Classification, Frequency, Administration Route
2. **Picklists** — 33 default picklist groups
3. **Case Form Definition** — section visibility defaults for MI (5 sections), AE (10 sections), PC (8 sections)

All 3 run in single MySQL transaction — any failure rolls back all.

**Wired into:** `mims/backend/routes/admin/orgs.js` POST `/` handler — called after INSERT INTO organisations, before SELECT created_at.

### `mims/backend/scripts/backfill-existing-orgs.js` (NEW — Sprint 10)

One-time script to seed defaults for orgs created before Sprint 10.

```bash
node mims/backend/scripts/backfill-existing-orgs.js
```

Queries all active orgs, calls `seedNewOrg(org.id, 4)` for each, continues on error, prints summary. Run once. Already run for org 1 (Novartis) + org 26 (Vanaja Review Co.).

---

## 10. Sprint History

| Sprint | Goal | Outcome | Key Features Delivered | Carryover |
|--------|------|---------|----------------------|-----------|
| Sprint 1 | Foundation | Stable base | Auth, login, dashboard, basic inbox, core navigation | Browser verification not enforced — lesson learned |
| Sprint 2 | Stability | Patch/hotfix only | Bug fixes, no new features | Client onboarding held pending stability |
| Sprint 3 | Operational Maturity | CLOSED — 27 stories done | 6 features + Sprint 2 tech debt cleared. GitHub sync disabled. | None |
| Sprint 4 | Admin Console Phase A + B | CLOSED — 10 stories done | Phase A: 7 admin features. Phase B: 3 features | None |
| Sprint 5 | Platform completeness | CLOSED — 9 stories done | 850 frontend modules, 0 errors. Core platform stabilised. | None |
| Sprint 6 | Admin Console + Case Form | CLOSED — Gate 2 approved 2026-03-25 | Phase 1A: Admin Console redesign (165/166 QA). Phase 1B: Extended admin features. Phase 2: Full case form (F-13 to F-18, 195/195 QA). 6 bugs fixed. | Phase 3 (Argus/Veeva integration) — deferred |
| Sprint 7 | Multi-Org Architecture | CLOSED — 2026-03-27 | Multi-org DB, JWT org context, switch-org API, platform admin user+org management, password reset flow, data isolation on all routes, org switcher UI, 7 bugs fixed | None |
| Sprint 8 | Security + Data Integrity | CLOSED — 2026-03-28 | Session timeout (per org + platform admin global), 2FA infra, per-org 2FA config, platform SMTP + test-email, audit + login-audit pages, platform admin lockdown, org/site toggles, site uniqueness, data cleanup. 20/20 QA passing. | None |
| Sprint 9 | Platform Admin Control, Audit, and Alerts | CLOSED — 2026-03-28 | Platform Admin dashboard, audit/login-audit filters + CSV export, user lifecycle controls, alerts engine, alert rules/events, in-app notifications, org/site deactivation alerts, duplicate alert-rule fix. QA passed. | Small future polish only |
| Sprint 10 | Case Form Foundation | CLOSED — 2026-03-31 | Org seed service (`seedService.js`), field_setup unique key fix, GET /api/cases/form-config, Case Form UI dynamic rendering (AE 9 tabs / PC 7 tabs), Field Setup UI two-pane + flex field CRUD, backfill script. 37/37 QA passing. | None |
| Sprint 11 | Integration Foundation + Reports Backend | CLOSED | Integration screens, org_integrations DB, API key auth layer, Integration Engine service, EMIR, Reports backend. | AdminConsolePage split — deferred to Sprint 13 |
| Sprint 12 | Admin Console + Workflow Gaps | CLOSED | Admin Console workflow engine, CM backend, security hardening. | AdminConsolePage split — carried to Sprint 13 |
| Sprint 13 | AdminConsolePage Refactor + Reports UI + CM Frontend + Admin Gaps + Security | CLOSED — 2026-04-05 | AdminConsolePage 6,395→763 lines (5 sub-components), Reports frontend (27 reports), CM frontend, Admin Console FRD gaps, Case Workflow Engine fix, Security hardening, Platform Admin Reports Access. 50/50 items. Gate 2 approved. | Security Groups deactivation — Sprint 14 |
| Sprint 14 | Case Management Gaps + UX + QA + Architecture | CLOSED — 2026-04-07 | G10: Global search, case comments, case reassignment, notifications. G11: Home dashboard, session management UI. G12: Full regression suite, Security Groups deactivation fix. G13: API versioning (/api/v1/*), log aggregation endpoint. 13/14 items. Gate 1 passed. | G13-3: Demo env provisioning — Sprint 15 |
| Sprint 15 | CM Phase 4 + Regression Suite + UX Fixes | CLOSED — 2026-04-18 | CM 4-tab extension (Other Attributes, Associated Docs, Usage Instructions, Version Alerts), Owner lock model, CM picklists fix, Regression Testing Suite (dashboard + history + self-healing test user), Auth infinite loop fix, Navbar restructure (Utilities dropdown), ExceptionToast silenced. | G13-3 demo env carry-in |
| Sprint 16 | MI Full Approval Workflow (D1) | CLOSED — 2026-04-22 | D1: MI response lifecycle DRAFT→READY→APPROVED→SENT with 21 CFR Part 11 e-sign. VOIDED terminal state. `case_mi_responses` + `case_mi_response_transitions` tables. MI e-sign modal in CaseFormPage. C1 fix: removed direct SENT bypass. T4: DB DEFAULT 'SENT'→'DRAFT'. T1: npm audit fix (DOMPurify + lockfile). | None |
| Sprint 17 | Master-data Impact Preview (D2) | CLOSED — 2026-04-22 | D2: POST `/api/admin/impact-preview` — blast-radius for workflow/field/taxonomy changes. 5-min TTL cache. "Preview Impact" buttons in AdminWorkflowSection and AdminPicklistsSection. ImpactPreviewModal with risk_level badge + breakdown table. | None |
| Sprint 18 | UX Completions — AE Multi-row, Transmissions, Browse Content | CLOSED — 2026-04-22 | C2: AEMultiRowTab component — inline CRUD for Lab Results, Medical History, Product Info (frontend only; backend was already complete). H1: TransmissionsPage `/transmissions` — filtered log with stats strip. H2: BrowseContentPage `/browse-content` — card grid + folder sidebar + detail sidebar. Both wired into App.jsx + existing navbar links activated. | None |
| Sprint 19 | P0/P1 Completions — Email delivery, Response Log, SLA, Dashboard KPIs, Audit Trail UX | CLOSED — 2026-04-23 | P0: MI SENT transition now sends nodemailer email to primary case contact (SMTP from site_email_purpose/fallback), logs to transmission_audit_trail. P0: ResponseLogPage `/response-log` — full filtered MI response log with detail modal. P0: SLA badge on case list (green/amber/red from response_required_by). P1: Dashboard MI KPI section (pending/approval/sent today/SLA breached). P1: Inbox→Case carries email subject+body+sender into description+internal_notes. P1: Audit Trail UI rebuilt — per-case field audit (before/after diff in red/green + CSV export) + system audit log "Diff" modal per row. | None |
| Sprint 20 | DPPR + Audit Trail Redesign + Copy Division Fix | CLOSED — 2026-04-25 | F-CopyDiv: Copy Division org dropdown fixed (removed `subdomain` column that doesn't exist in organisations table). F-7 DPPR: tenant-level data privacy rules — `dppr_rules`, `dppr_execution_log`, `case_dppr_overrides` tables; 9-route backend (`/api/admin/dppr/*`); DPPRPage.jsx with Privacy Rules + Execution History tabs, Run Now, scheduler at 02:00 UTC (`dpprScheduler.js`). F-8 Individual DPPR: "Privacy (DPPR)" tab added to CaseFormPage — per-domain override UI (action/retention_days/reason), enforces ≥ restrictive constraint vs tenant rule. Audit Trail Redesign: all 3 audit pages rebuilt as two-panel versioned UI — left = summary list, right = click-to-expand version history with before/after diff (Case: red/green field-level; CM: entity changelog with details col; Transmission: numbered records with payload/response detail). CM audit trail `entity_id` filter added to backend. | None |

---

## 11. Current Sprint

**Sprint 21 — ALL CODE COMPLETE (2026-04-28). QA browser pass pending (human).**

| Item | Status | Detail |
|------|--------|--------|
| Sprint A: shared `httpFetch` wrapper (83 files) | ✅ DONE | Raw fetch migrated. 401 global session-expiry handler now live in `httpFetch.js`. All modules auto-logout on expired token. |
| Sprint A: `createModuleApp.jsx` session handler | ✅ DONE | All non-platform-admin modules (Admin, Content, DV) register session-expiry handler on mount via `setSessionExpiryHandler`. |
| Sprint B: `db.js` → migrations 001–015 | ✅ DONE | Migration runner with fresh DB + legacy bootstrap + already-applied path coverage (3/3 tests PASS). |
| Sprint C: `CaseFormPage.jsx` split + `useCaseForm` hook | ✅ DONE | Shell 2856→2273 lines. 5 tab components extracted. |
| Sprint C: `ContentPage.jsx` split | ✅ DONE | Shell 3950→68 lines. 14 sub-components in `content/components/`. |
| Sprint C: `Platform AdminPage.jsx` split | ✅ DONE | 3456→107 lines. 12 view components + shared `guardedFetch` utility. Build PASS. |
| Sprint C: `AdminMiscSection.jsx` split | ✅ DONE | 1782→23 lines. 6 panels extracted. |
| QA regression browser pass | ⏳ PENDING | Human click-through — CaseForm tabs, Content sections, Platform Admin 12 sections. ~1 hr. |
| `authRateLimiter` review | ⏳ DEFERRED | Left as-is by Rohith decision. |

**Sprints 15-18 — ALL CLOSED (2026-04-22). Gate 1 PASSED.**

**Summary of Sprints 16-18 (one-shot delivery):**

| Item | ID | Status | Detail |
|------|----|--------|--------|
| MI Full Approval Workflow | D1 | ✅ DONE | DRAFT→READY→APPROVED→SENT lifecycle. E-sign modal (password + reason) for APPROVED and SENT transitions. VOIDED terminal state. Backend: `case_mi_responses`, `case_mi_response_transitions` tables + transition API. |
| MI "Send Response" bypass fix | C1 | ✅ DONE | Removed button that directly created SENT records. Creation modal now only has "Save as Draft". Info notice explains full workflow. |
| DB response_status DEFAULT fix | T4 | ✅ DONE | `case_mi_responses.response_status` DEFAULT changed from 'SENT' to 'DRAFT'. MODIFY COLUMN statement added to fix existing running DBs. |
| npm audit fix | T1 | ✅ DONE | DOMPurify ≤3.3.3 vuln fixed via `npm audit fix`. Backend `package-lock.json` created via `npm install --package-lock-only` (0 vulns). |
| Impact Preview (blast-radius) | D2 | ✅ DONE | POST `/api/admin/impact-preview` — 3 change_types (workflow_rule/field_definition/taxonomy), 5-min TTL cache. "⚠ Preview Impact" buttons in AdminWorkflowSection + AdminPicklistsSection. ImpactPreviewModal with risk_level badge + breakdown. |
| AE multi-row tab CRUD | C2 | ✅ DONE | `AEMultiRowTab` component in CaseFormPage: Lab Results, Medical History, Product Info — inline add/delete rows, API calls to existing backend routes. `.cf-multirow-*` CSS added. |
| Transmissions page | H1 | ✅ DONE | `/transmissions` → TransmissionsPage.jsx. Filter by system/status/date, search, pagination, stats strip. Uses `/api/admin/transmission-audit-trail`. CSS namespace: `tx-`. |
| Browse Content page | H2 | ✅ DONE | `/browse-content` → BrowseContentPage.jsx. Folder sidebar + card grid + detail sidebar. Uses `/api/cm/documents` + `/api/cm/folders`. CSS namespace: `bc-`. |
| MIMS SOP update | T2 | ✅ DONE | Sprints 16-18 documented in all relevant sections. |

**Sprint 19 — CLOSED (2026-04-23). All 6 items delivered.**

| Item | ID | Status | Detail |
|------|----|--------|--------|
| MI email delivery on SENT | P0-1 | ✅ DONE | nodemailer fires when response transitions to SENT. Primary case contact email fetched from case_contacts. SMTP resolved via site_email_purpose (purpose='response') → any active account fallback. Success + failure both logged to transmission_audit_trail. Non-fatal: SENT status not rolled back on email failure. |
| Response Log page | P0-2 | ✅ DONE | `/response-log` → ResponseLogPage.jsx. Cross-case MI response log, filterable by status/date/search. Detail modal per row with full response text. Added to Utilities dropdown. CSS namespace: `rl-`. |
| SLA badge on case list | P0-3 | ✅ DONE | `SlaBadge` component in CasesPage.jsx reads `sla_due` (SQL subquery: MIN(response_required_by) from case_mi). Green ✓ (>48h), Amber ⚠ (<48h), Red ✕ (breached). Added to My Cases + Unassigned Cases columns. |
| Dashboard MI KPIs | P1-4 | ✅ DONE | dashboard-summary backend now returns `mi_stats` object. DashboardPage shows "MI Response Activity" section: In Progress / Pending Approval / Sent Today / SLA Breached (red if > 0). Links to /response-log. |
| Inbox→Case context carry | P1-5 | ✅ DONE | createCaseFromInquiry() now passes `description` (email body, first 1000 chars) and `internal_notes` (sender + subject + received timestamp) into POST /api/cases. Agent no longer has to retype inquiry content. |
| Case Audit Trail UI rebuild | P1-7 | ✅ DONE | AdminMiscSection audit-admin section replaced with AuditAdminPanel component: (1) Case Field Audit — enter case ID → before/after diff table (red = old, green = new) + CSV export; (2) System Audit Log — "Diff" button per row → modal showing parsed change details. |

**Sprint 20 — CLOSED (2026-04-25). All items delivered.**

| Item | ID | Status | Detail |
|------|----|--------|--------|
| Copy Division dropdown fix | BUG-1 | ✅ DONE | `copyDivision.js` queried non-existent `subdomain` column. Fixed: query now `SELECT id, name FROM organisations`. Frontend option label stripped subdomain suffix. |
| Feature 7: DPPR (tenant-level) | F-7 | ✅ DONE | 3 new DB tables (`dppr_rules`, `dppr_execution_log`, `case_dppr_overrides`). 9-route backend at `/api/admin/dppr/*`. `DPPRPage.jsx` — Privacy Rules tab (CRUD, toggle, Run Now) + Execution History tab. `dpprScheduler.js` — node-cron at 02:00 UTC. Navbar link added. ACTION_RANK enforces Delete > Anonymize > None ordering. |
| Feature 8: Individual DPPR | F-8 | ✅ DONE | "Privacy (DPPR)" tab in CaseFormPage (8th tab). Per-domain override form: action (filtered to ≥ tenant rule), retention_days (capped at tenant minimum), override_reason. Set/Update/Remove per domain. Badge shows active override count. Wired to `PUT/DELETE /api/admin/dppr/cases/:caseId/overrides`. |
| Audit Trail Redesign — Case | AT-1 | ✅ DONE | `CaseAuditTrailPage.jsx` rebuilt: left panel = case summary list (search, pagination); right panel = entries grouped into versions (30s window, same user), each version expandable to field-by-field before/after diff table. New backend endpoint `GET /case-audit-trail/cases-summary`. CSS namespace: `cat-`. |
| Audit Trail Redesign — CM | AT-2 | ✅ DONE | `CMAuditTrailPage.jsx` rebuilt: left = entity list (filter by type); right = versioned changelog per entity. Backend: `entity_id` filter added to `GET /cm-audit-trail`. New `GET /cm-audit-trail/entities-summary` endpoint. CSS namespace: `cmat-`. |
| Audit Trail Redesign — Transmission | AT-3 | ✅ DONE | `TransmissionAuditTrailPage.jsx` rebuilt: left = cases with transmissions (sent/failed counts); right = numbered transmission records (#1 oldest→#N newest), each expandable to show target system, status, response code, sent by, payload summary. New `GET /transmission-audit-trail/cases-summary` endpoint. CSS namespace: `tat-`. |

**Next sprint planning:** TBD by Rohith.

---

## 12. Known Issues and Technical Debt

| # | Item | Type | Priority | Owner |
|---|------|------|----------|-------|
| 1 | ~~Multi-row AE tabs (lab results, medical history, product info) — row-level CRUD UI is placeholder only~~ | **RESOLVED Sprint 18** — AEMultiRowTab component built. | — | — |
| 2 | CSS for `cf-` namespace — CasesPage/CaseFormPage use `cf-` classes, no dedicated stylesheet | Visual debt | Medium | Vivek |
| 3 | `browser-test.js` (66 tests) — not re-run since Sprint 6 Phase 2 — may need selector updates | Test debt | Low | Karthik |
| 4 | CP Portal: `Unknown column 'client_code'` in `cp_clients` — CP Portal not in active scope | CP Portal bug | Low | Varun |
| 5 | Sprint 11 Phase 3 (Safety + CRM) — Argus/Veeva/TrackWise/Salesforce integration | Future sprint | Planned | TBD |
| 6 | Analytics module (`/analytics`) — placeholder only. Rohith deferred (2026-04-22). | Future sprint | Deferred | TBD |
| 7 | Production deployment — Lightsail plan: 2GB instance + Managed MySQL + Object Storage ~$29/mo. Deferred by Rohith. | Deployment | When ready | Varun |
| 8 | Email OTP live success depends on correct SMTP encryption/port. Use `Platform Admin -> 2FA Configuration -> Test SMTP Connection / Send Test Email` before signing off. | Config / QA dependency | High | Varun / Karthik |
| 9 | Forgot-password + change-password browser QA needed after password-history rule addition. Backend done, UI/browser evidence pending. | QA follow-up | High | Karthik |
| 10 | ~~npm vulnerabilities — 19 flagged (8 high, 9 moderate, 2 low).~~ | **RESOLVED Sprint 16** — `npm audit fix` run. DOMPurify patched. Backend lockfile created. 0 vulnerabilities. | — | — |
| 11 | Chunk size warning in Vite build — main bundle ~1.2MB. Not an error; no action needed unless performance is flagged. | Build debt | Low | Varun |
| 12 | ~~PC Case — no end-to-end QA walkthrough done since backend was built.~~ | **RESOLVED Sprint 20 QA** — 6 bugs found and fixed: (1) `pc-flex-fields` tab had no backend route — added GET/PUT + `case_pc_flex_fields` table. (2) General tab `pc_status`/`pc_classification` fields not saved — added columns + backend support. (3) Patient-info `gender` key mismatch with DB column `sex` — fixed frontend key. (4) Patient-info `injury_experienced` not saved — added column + backend support. (5) `return_requested` rendered as picklist select but DB is TINYINT boolean — changed to checkbox. (6) `replacement_approved` and `refund_approved` same issue — changed to checkboxes. | — | — |
| 13 | MI email delivery depends on SMTP being configured in Admin Console → Email Accounts with `site_email_purpose` = 'response'. If not configured, email is silently skipped (SENT status is still committed). | Config dependency | High | Varun / Karthik |
| 14 | DPPR scheduler runs at 02:00 UTC daily. Requires server restart after first deploy to register cron. DPPR Privacy (DPPR) tab in CaseFormPage visible to admin/platform-admin only — non-admin users will see 401 on load (handled silently). | Config / deploy | High | Varun |
| 15 | After any backend route file change (e.g. `cmAuditTrail.js` entity_id filter), server must be restarted — nodemon or manual `node --env-file=.env backend/server.js`. | Ops | Medium | Varun |

---

## 13. Critical Technical Rules (Must Know)

Non-negotiable. Ignoring causes bugs.

| Rule | Detail |
|------|--------|
| Real entry point | `index.html` → `src/modules/max/main.jsx` → `src/modules/max/App.jsx`. NOT `src/App.jsx`. |
| JWT field | Always use `req.user.userId`. Never `req.user.id`. |
| MySQL LIMIT/OFFSET | NEVER use `?` placeholders. Always inline: `` LIMIT ${parseInt(limit,10)} OFFSET ${offset} `` |
| MySQL reserved words | Backtick reserved words in template literals: `` \`separator\` `` |
| MySQL NULL + UNIQUE | NULL != NULL — `ON DUPLICATE KEY UPDATE` won't fire with NULL values |
| Field setup seeding | Use `INSERT IGNORE`. Unique key is `uq_field_section_org (section_name, field_name, org_id)` — always includes org_id. Old `uq_field_section_name` (no org_id) dropped in Sprint 10. Without org_id, INSERT IGNORE silently blocks per-org seeds when global rows exist. |
| Org seed on creation | `seedNewOrg(orgId, userId)` in `seedService.js` must be called after every new org INSERT. Wired into `POST /api/admin/orgs`. For orgs created before Sprint 10, run `backfill-existing-orgs.js` once. |
| form-config org resolution | `GET /api/cases/form-config` uses `authenticate` only — not `requireOrg`. Platform Admin has orgId=null; org resolved inline: `platform_admin ? parseInt(query.org_id) || 1 : req.user.orgId`. Never apply requireOrg to this route. |
| Auth header | `Authorization: Bearer <token>`. Token from `mims_token` in localStorage. |
| Git push | Disabled since Sprint 3. Never run `git push` or `gh` commands. |
| New case org_id | Always from JWT (`req.user.orgId`) — never from request body. |
| Platform Admin role | Cannot be assigned to any user via API or UI. Only ID 4 (`platform_admin`) has this role. Never add hardcoded role resets to `db.js` init. |
| Site names | Unique per org. `UNIQUE KEY uq_site_org_name (org_id, name)`. Pre-validate in API with 409 before INSERT. |
| Login input type | Login field is `type="text"` NOT `type="email"` — allows `platform_admin` username (no @). |
| Session timeout | Login + switch-org responses must include `sessionTimeout`. AuthContext must store in `mims_session_timeout` localStorage key. |
| User 2FA scope | 2FA for MIMS users only. Platform Admin login has no 2FA. |
| Platform SMTP vs MIMS Email Accounts | Platform SMTP (Platform Admin) = user 2FA emails. Admin Console Email Accounts = org-specific operational mailboxes. Do not mix. |
| Platform SMTP reuse | Same platform SMTP used for user 2FA, forgot-password, and platform-admin alert emails. No separate alert SMTP config in Sprint 9. |
| 2FA expiry handling | Use DB-time expiry (`NOW()` / `DATE_ADD`). Do not use JS Date values in MySQL DATETIME for auth expiry. |
| Password reuse policy | Block reuse of current + previous 5 passwords across first-login reset, forgot-password, and in-app change. Hardcoded server behavior. |
| Platform-admin alerts | Alert rules configurable, can be enabled/disabled. Inactive rule = no alert event or notification fired. |
| CM route paths | CM router mounted at `/api/cm`. Route paths inside must NOT repeat the prefix. Use `/picklists` NOT `/cm/picklists`. Duplication = double path bug. |
| CM owner lock | `owner_user_id` set on first checkin. Only owner can publish. Others must request release (resets to Draft, clears owner). Publisher overwrites as new owner. |
| Regression test user | `regression@system` / `__SET_REGRESSION_PASSWORD__`, role=`admin`. Must have `user_org_access` row for orgId in JWT. `regressionRunner.getToken()` self-heals via `ensureRegressionUserOrgAccess()` if missing — no manual fix needed. |
| Regression test paths | New test files: drop a `*.tests.js` file in `mims/backend/regression-tests/`. Auto-discovered — no config changes. Audit-log endpoint is `/api/admin/audit-logs` (PLURAL). |
| AuthContext useCallback | `refreshOrgAccess` is wrapped in `useCallback([KEY, user?.role])`. Any new async function added to AuthContext used in a useEffect dep array MUST also be `useCallback` to prevent infinite render loops. |
| ExceptionToast | Silenced — returns null. All API exceptions logged to `console.warn('[MIMS Exception]', ...)` only. Do not re-add visual popup without Rohith approval. |
| Navbar Utilities | Exception Log, Session Mgmt, Process Explorer, Regression Testing all live in Utilities dropdown. Do NOT add them back to the main nav bar. |
| MI response creation | MI responses must ALWAYS be created as DRAFT. Never POST with `response_status = 'SENT'` or `'APPROVED'` directly — 21 CFR Part 11 violation. Use the transition endpoint with e-sign for every status advance. |
| MI response immutability | SENT status = immutable. No edits to content. VOIDED = terminal discard state. Transitions from SENT and VOIDED are blocked at API level. |
| MI e-sign requirement | Transitions to APPROVED and SENT require password verification + reason via `/transition` endpoint. Password verified via bcrypt against current user record. |
| case_mi_responses DEFAULT | `response_status` column DEFAULT must be `'DRAFT'` — never `'SENT'`. DB MODIFY COLUMN statement ensures this on both new and existing databases. |
| Impact Preview cache | `/api/admin/impact-preview` uses a 5-min in-memory Map cache keyed by `change_type:entity_id`. Cache cleared after 5 min. Not Redis — resets on server restart. |
| MI email delivery — non-fatal | SENT transition in `PATCH /cases/:id/mi-responses/:rid/status` sends email in a try-catch. If nodemailer fails, status remains SENT (already committed), failure is logged to `transmission_audit_trail` with status='Failed'. Never throw from email block. |
| MI email SMTP resolution | Priority: (1) site_email_purpose where purpose='response' for the case's site_id; (2) any active email_account with smtp configured. If neither found, email is skipped silently. |
| SLA badge data source | `sla_due` field added to /cases/my and /cases/unassigned queries via SQL subquery: `(SELECT MIN(mi.response_required_by) FROM case_mi mi WHERE mi.case_id = c.id)`. NOT on the general /cases list — only My Cases and Unassigned tabs. |
| Inbox→Case description | `createCaseFromInquiry()` in InboxPage.jsx passes `description` (email body, max 1000 chars) and `internal_notes` (from/subject/received metadata) when creating a case. These fields are COALESCE'd in PUT /cases/:id — safe to pre-populate. |
| Response Log route | `GET /api/cases/mi-responses/log` must be declared BEFORE `GET /api/cases/:id` in cases.js route order, otherwise Express will try to match "mi-responses" as a case `:id`. Already correct as of Sprint 19. |
| Audit Trail UI | `AuditAdminPanel` is a standalone component defined in `AdminMiscSection.jsx` (not a separate file). It uses the existing `fmtDateIST` and `H` (auth headers) props passed from the parent. Case field audit calls `GET /api/admin/case-audit-trail/:caseId` (admin/platform-admin only). |
| `httpFetch` 401 handler | `shared/api/httpFetch.js` intercepts all 401 responses and calls the registered `_onSessionExpiry` handler. Auth endpoints (`/api/auth/*`) are excluded to prevent login-page 401s triggering logout. `createModuleApp.jsx` registers the handler for all non-platform-admin modules. `Platform AdminPage.jsx` registers via `setSessionExpiryHandler` re-exported from `platform-admin/utils/guardedFetch.js`. Do NOT add manual 401 checks in individual components — the wrapper handles it globally. |
| `guardedFetch` (platform-admin) | `platform-admin/utils/guardedFetch.js` is now a thin re-export layer over `shared/api/httpFetch.js`. `guardedFetch === httpFetch`. `setSessionExpiryHandler` re-exported from shared. Do not add duplicate 401 logic here. |

---

## 14. Process Reference

Full SOP: `TEAM_OPERATING_SOP.md`. Gate flow, browser verification checklist, communication standards: see `memory/protocols.md`.

---

## 15. UAT Server — Setup, Access & Workflow

---

Local MIMS UAT has been retired.

Current assumption:

- local development uses the normal dev environment
- production/live access uses the deployed `/mims/` app
- no PM2 `mims-uat`, no port `4001`, and no `pharaxis_mims_uat` database should be expected on this machine

The in-app **UAT & QA** admin features remain product features. Only the separate local UAT runtime was removed.

---

## 16. How to Update This File

- Updated only when Rohith explicitly confirms and asks Bala to update
- Rohith says: *"Bala, update the Memory SOP — [summary of what changed]"*
- Bala updates relevant sections + adds row to Version History
- No one else modifies this file
- After sprint closes: update sprint row in Section 10 to CLOSED, update Section 11 with new current sprint
- Known issues in Section 12 updated when resolved or new debt identified
