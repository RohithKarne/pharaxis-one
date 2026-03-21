# Sprint 4 Phase B — Implementation Plan
> Written by Rajeev, 2026-03-20. Awaiting Rohith sign-off before build starts.

---

## Process Explorer UI Tweaks — Plan (2026-03-21)
> Awaiting Rohith sign-off before implementation.

### Scope
- Make Admin sidebar collapsible (compact ↔ full) with an explicit open option (default compact).
- Process Explorer left panel width to 285px (already set).
- Right detail panel always visible; show placeholder until a step is selected.
- Sticky top actor header while diagram scrolls.
- Remove JSON/Speed/Play/PNG controls; keep Reset/Prev/Next.
- Reduce actor box size and reduce step spacing (approx 20–25%).
- Right panel header sticky (Step # + Step name).
- Make file chips clickable to open in VS Code (`vscode://file/...`).

### Implementation Tasks
- [x] AdminLayout: add compact/full toggle control; default compact; keep collapse option.
- [x] FlowDiagram: keep top actor header sticky while SVG body scrolls.
- [x] FlowDiagram: right drawer always rendered with placeholder message when no step selected.
- [x] FlowDiagram: remove JSON/Speed/Play/PNG controls; keep Reset/Prev/Next.
- [x] FlowDiagram: reduce BOX_W/BOX_H and STEP_H/TOP_STEP_GAP by ~20–25%.
- [x] FlowDiagram: make right panel header (step # + step name) sticky.
- [x] FlowDiagram: make file chips clickable to open VS Code (top FILES row + step file chip).

### Test Plan (QA Protocol)
- [ ] UI: Verify Admin sidebar toggles compact ↔ full; default compact on load.
- [ ] UI: Process Explorer left panel width ~285px; diagram area adjusts.
- [ ] UI: Right panel shows placeholder before step click; populates on click.
- [ ] UI: Sticky actor header remains visible while scrolling diagram body.
- [ ] UI: Step spacing reduced; no overlap; labels readable.
- [ ] UI: Right panel scroll reaches Common Mistake content.
- [ ] UI: Clicking file chip opens VS Code (if protocol handler available).
- [ ] Regression: Reset/Prev/Next still work; step highlight still correct.

### Review / Evidence
- [ ] Capture screenshots: header sticky, placeholder, common mistake visible.
- [x] Build: `npm run build` (cp-portal/frontend) — success with chunk size warning.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after scroll fix.

---

## Process Explorer — Multi-View Diagrams (2026-03-21)
> Awaiting Rohith sign-off before implementation.

### Scope
- Add 3 diagram modes: Sequence (default), Flow (node/box), Component (system view).
- Add view switcher in the controls bar (next to Reset/Prev/Next).
- Preserve all existing step details, right panel, file links, and sticky headers.

### Implementation Tasks
- [x] Add `viewMode` state + segmented control in Process Explorer controls.
- [x] Extract diagram renderer into view-specific components (Sequence/Flow/Component).
- [x] Reuse same step click handler + right panel across all views.
- [x] Ensure step data mapping works for Flow/Component views (no loss of detail).

### Test Plan (QA Protocol)
- [ ] UI: Default view is Sequence.
- [ ] UI: Switching views updates diagram without losing selected step.
- [ ] UI: Right panel details identical across all views.
- [ ] Regression: Reset/Prev/Next still work in all views.

### Review / Evidence
- [ ] Capture screenshots of all three views.
- [x] Build: `npm run build` (cp-portal/frontend) — success with chunk size warning.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after blank-screen fix.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after defensive guards.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after svgH reference fix.

---

## Process Explorer — Revert to Single Diagram (2026-03-21)
> Approved by Rohith. Proceed with revert to single Sequence diagram.

### Scope
- Remove multi-view switcher and alternate diagram renderers.
- Keep all recent UX fixes (sticky header, spacing, right panel behavior, file links).

### Implementation Tasks
- [x] Remove `viewMode` state and view switcher.
- [x] Remove Flow/Component renderers; keep Sequence only.
- [x] Clean unused helpers/constants after removal.

### Test Plan (QA Protocol)
- [ ] UI: Sequence diagram renders correctly on log click.
- [ ] Regression: Right panel details + sticky headers + file links still work.

### Review / Evidence
- [ ] Screenshot of sequence view after revert.
- [x] Build: `npm run build` (cp-portal/frontend) — success with chunk size warning.

---

## Process Explorer — Two-Flow Lane/Content Enrichment (2026-03-21)
> Awaiting Rohith sign-off before implementation.

### Scope
- Apply **Option 1 (real lanes)** only to `ADMIN Error — 401 Unauthorized`.
- Apply **Option 2 (virtual lanes)** only to `ADMIN Admin Login`.
- Add all on-diagram enrichments **only for these two flows**.

### Implementation Tasks
- [x] Define lane order and mapping for Option 1 in `flowTemplates.js` (real lanes).
- [x] Implement virtual lane rendering for Option 2 in `FlowDiagram.jsx`.
- [x] Add on-diagram enrichment badges (latency, status, type icon, request/response chips, DB snippet, failure tag, step type tag) for these two flows only (derived values when missing).

### Test Plan (QA Protocol)
- [ ] UI: Error 401 flow shows real added lanes and enriched badges.
- [ ] UI: Admin Login flow shows virtual lanes and enriched badges.
- [ ] Regression: Other flows remain unchanged.

### Review / Evidence
- [ ] Screenshots of both enriched flows.
- [x] Build: `npm run build` (cp-portal/frontend) — success with chunk size warning.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after horizontal scroll fix.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after compact lane mapping.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after font/box size reduction.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after dynamic step layout.
- [x] Build: `npm run build` (cp-portal/frontend) — rerun after showEnrich fix.

---

## Process Explorer — Option 1 Lanes for All Logs (2026-03-21)
> Approved by Rohith. Proceed with Option 1 applied to all logs in Live Feed + Flow Library.

### Scope
- Use standard lane order for all flows (Option 1 real lanes).
- Map existing flow swimlanes into standard lanes by name.
- Keep automatic removal of unused lanes per flow.

### Implementation Tasks
- [x] Add STANDARD_LANES and lane-name mapping.
- [x] Remap step indices to STANDARD_LANES for all flows at render time.
- [x] Ensure narrative and header labels use remapped lane names.

### Test Plan (QA Protocol)
- [ ] UI: Various flows map to standard lanes without blank screen.
- [ ] UI: Unused lanes removed; used lanes aligned with steps.
- [ ] Regression: Existing right panel content unchanged.

### Review / Evidence
- [ ] Screenshots from Live Feed and Flow Library after mapping.
- [x] Build: `npm run build` (cp-portal/frontend) — success with chunk size warning.

---

## Process Explorer — Manual step.file Mapping (All Flows) (2026-03-21)
> Awaiting Rohith sign-off before implementation.

### Scope
- Add `step.file` + `step.line` for every step in every flow (admin + portal + error + generic).
- Use precise mapping by reading actual routes/components.

### Implementation Tasks
- [ ] Build per-flow step→file:line mapping list.
- [ ] Update `flowTemplates.js` steps with file + line.
- [ ] Spot-check mappings for accuracy.

### Test Plan (QA Protocol)
- [ ] UI: Step file chips show for multiple admin/portal flows.
- [ ] UI: Clicking file opens correct file/line in VS Code.
- [ ] Regression: No runtime errors.

### Review / Evidence
- [ ] Screenshots showing step file chips.

---

## Build Order: S4-10 → S4-8 → S4-9

**Why this order:**
- S4-10 (roles) adds `requireRole` middleware + fixes the Sprint 2 `client_id` gap — both are foundational
- S4-8 (approval workflow) uses role checks to gate approve/reject transitions
- S4-9 (personalization) is fully independent — portal-facing, no admin dependencies

---

## S4-10 — Role-Based Admin Access

### What's changing
New roles: `content_manager`, `reviewer`, `viewer` added alongside existing `superadmin` / `admin`.

**Permission matrix:**

| Action              | superadmin | admin | content_manager | reviewer | viewer |
|---------------------|-----------|-------|-----------------|----------|--------|
| View all sections   | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create content      | ✓ | ✓ | ✓ | ✗ | ✗ |
| Edit content        | ✓ | ✓ | ✓ | ✗ | ✗ |
| Submit for review   | ✓ | ✓ | ✓ | ✗ | ✗ |
| Approve / Reject    | ✓ | ✓ | ✗ | ✓ | ✗ |
| Publish             | ✓ | ✓ | ✗ | ✗ | ✗ |
| Delete / Archive    | ✓ | ✓ | ✗ | ✗ | ✗ |
| Portal Users        | ✓ | ✓ | ✗ | ✗ | ✗ |
| Config / Branding   | ✓ | ✓ | ✗ | ✗ | ✗ |
| Analytics           | ✓ | ✓ | ✗ | ✗ | ✓ |
| Manage Admin Users  | ✓ (all) | ✓ (client) | ✗ | ✗ | ✗ |

### Schema (db.js)
- Safe migration: `ALTER TABLE cp_admin_users ADD COLUMN client_id INTEGER REFERENCES cp_clients(id) ON DELETE SET NULL`
- Fixes Sprint 2 gap documented in auth.js line 71

### Backend files
1. `db.js` — safe migration to add `client_id` to `cp_admin_users`
2. `middleware/auth.js` — add `requireRole(...roles)` middleware
3. `routes/admin/auth.js` — embed `clientId: user.client_id` in JWT at login; return in `/me`
4. `routes/admin/adminUsers.js` (NEW) — CRUD: list, create, update, deactivate admin users
5. `server.js` — register `/api/admin/admin-users`

### Frontend files
1. `context/AdminAuthContext.jsx` — add `hasRole(...roles)` helper; include `clientId` from admin object
2. `admin/pages/AdminUsersPage.jsx` (NEW) — list + create/edit modal; role dropdown; client picker (superadmin only)
3. `admin/components/AdminLayout.jsx` — add "Admin Users" nav item (visible to admin+)
4. `App.jsx` — add route `/admin/clients/:clientId/admin-users`
5. `admin/pages/NewsPage.jsx` — hide Publish/Delete for content_manager/reviewer/viewer
6. `admin/pages/DocumentsPage.jsx` — same
7. `admin/pages/SafetyPage.jsx` — same

---

## S4-8 — Content Approval Workflow

### What's changing
Add `review` and `approved` statuses to news and documents.

**New status flow:**
- News: `draft → review → approved → published / scheduled → archived`
- Documents: `draft → review → approved → published → archived`
- Safety alerts: **excluded** (has different status model: active/resolved/archived with CHECK constraint)

**Transition rules (enforced in backend):**

| From      | To                          | Who can do it           |
|-----------|-----------------------------|-------------------------|
| draft     | review                      | content_manager, admin, superadmin |
| review    | approved                    | reviewer, admin, superadmin |
| review    | draft (reject)              | reviewer, admin, superadmin |
| approved  | published / scheduled       | admin, superadmin       |
| approved  | draft (un-approve)          | admin, superadmin       |
| published | archived                    | admin, superadmin       |
| scheduled | published / archived        | admin, superadmin       |
| archived  | draft (restore)             | admin, superadmin       |

### Backend files
1. `routes/admin/news.js` — add transition validation to PUT handler; block illegal jumps
2. `routes/admin/documents.js` — same pattern

### Frontend files
1. `admin/pages/NewsPage.jsx` — add `review` (amber) and `approved` (teal) status badges; "Submit for Review" btn (draft, for content_manager+); "Approve"/"Reject" btns (review, for reviewer+); hide Publish for content_manager+
2. `admin/pages/DocumentsPage.jsx` — same patterns
3. `admin/components/AdminLayout.jsx` — "Review Queue" badge showing count of items in `review` state

---

## S4-9 — Personalized Portal Experience

### What's already done
Portal news and documents routes ALREADY filter by `user_type` (confirmed in portal/news.js and portal/documents.js).

### What's new
1. Personalized greeting: "Welcome back, [firstName]!" on portal home
2. "For You" section on portal home: top 3 news + top 3 docs filtered to user's type
3. User notification preferences: toggle news / documents / safety notifications on/off

### Schema (db.js)
- Safe migration: `ALTER TABLE cp_portal_users ADD COLUMN notif_prefs_json TEXT NOT NULL DEFAULT '{"news":true,"documents":true,"safety":true}'`

### Backend files
1. `db.js` — safe migration for `notif_prefs_json`
2. `routes/portal/preferences.js` (NEW) — `GET` and `PATCH` user notification preferences
3. `routes/portal/auth.js` (check) — ensure `firstName`, `lastName`, `user_type` are in portal JWT
4. `utils/notify.js` — check user `notif_prefs_json` before inserting notification
5. `server.js` — register `/api/portal/preferences`

### Frontend files
1. `portal/pages/PortalHomePage.jsx` — personalized greeting + "For You" section (fetch news + docs)
2. `portal/pages/PreferencesPage.jsx` (NEW) — notification preference toggles
3. `portal/components/PortalLayout.jsx` — add "Preferences" link in nav/profile
4. `App.jsx` — add `/portal/:clientCode/preferences` route

---

## Checklist

### S4-10
- [ ] db.js — add client_id to cp_admin_users (safe migration)
- [ ] auth.js middleware — add requireRole()
- [ ] admin/auth.js — embed clientId in JWT; return in /me
- [ ] admin/adminUsers.js (new backend route)
- [ ] server.js — register admin-users route
- [ ] AdminAuthContext.jsx — hasRole helper + clientId
- [ ] AdminUsersPage.jsx (new)
- [ ] AdminLayout.jsx — Admin Users nav
- [ ] App.jsx — admin-users route
- [ ] NewsPage, DocumentsPage, SafetyPage — hide write actions by role

### S4-8
- [ ] admin/news.js — transition validation
- [ ] admin/documents.js — transition validation
- [ ] NewsPage.jsx — review/approved badges + workflow buttons
- [ ] DocumentsPage.jsx — review/approved badges + workflow buttons
- [ ] AdminLayout.jsx — Review Queue badge count

### S4-9
- [ ] db.js — notif_prefs_json migration
- [ ] portal/auth.js — confirm JWT fields
- [ ] portal/preferences.js (new)
- [ ] notify.js — respect notif_prefs
- [ ] server.js — register preferences route
- [ ] PortalHomePage.jsx — greeting + For You section
- [ ] PreferencesPage.jsx (new)
- [ ] PortalLayout.jsx — Preferences link
- [ ] App.jsx — preferences route

---

## Risks to watch

| Risk | Mitigation |
|------|------------|
| client_id migration on existing admins | All existing admins are superadmin — client_id NULL means superadmin. Safe. |
| Existing content in draft status gets stuck | No — content_manager can still create and submit for review. Admin can bypass workflow. |
| Safety alerts untouched by approval | Correct by design — safety alerts have a different status model (active/resolved/archived). |
| Portal JWT missing firstName | Check portal/auth.js at implementation time; add if missing. |
| notif_prefs check in notify.js adds latency | Synchronous DB read per user is acceptable (SQLite is local). |
