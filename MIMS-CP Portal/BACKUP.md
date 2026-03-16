# MIMS-CP Portal — Archive Log
> Old entries archived by Fast protocol. Do not edit manually.

## 2026-03-13 — Fast Archive #2

### CODEX_LOG Archive
### 2026-03-12 — Inbox UI Sync Button
- Inbox page `Sync from Server` button added to force-refresh from `/api/inbox`.

### 2026-03-12 — QA Pass (Gmail Inbound + Attachments)
- Gmail inbound ingestion verified; 2 emails ingested; attachments stored under `storage/email_attachments/`.

### 2026-03-12 — Backend Crash Fix (IMAP Poller)
- Poller now uses `imap.end()` + timeout for graceful shutdown to prevent crash.

### 2026-03-12 — Email Accounts UI Error Handling
- Frontend handles non-JSON/404 gracefully instead of crashing.

---

---

## 2026-03-13 — Fast Archive (Pre-Compact Snapshots)

### SHARED_CONTEXT.md (before compact)
```md
# MIMS-CP Portal — Shared Context
> Single source of truth for both AI systems (Claude/Scimax + Codex/Virtusa).
> Read this at every session start. Keep this file under 60 lines.

## Project
- **Product:** MIMS-CP Portal (Medical Information Management System + Customer Portal)
- **Stack:** React 19 + Node.js/Express + SQLite → PostgreSQL (pre-deployment)
- **Repo:** /Users/rohithkarne/MIMS-CP Portal/
- **Run:** Backend → `node mims/backend/server.js` (port 3000) | Frontend → `npm run dev` in mims/frontend (port 5173)

## Companies & Access
| Company | Role | Code Access |
|---------|------|-------------|
| Scimax (Rohith + Varun) | Product & Engineering | Full read/write/delete |
| Virtusa (Codex AI) | PMO — scrum, delivery, testing mgmt, sales | Read-only |

## Team
- **Scimax:** Rohith (CPO), Varun (CTO), Claude (AI Testing Lead)
- **Virtusa:** Vinay (PM), Dhrithi (BA), Srihitha (SM), Anirudh (Architect), Narasimha (QA Mgr), Sandeep (QA), Tharun (SDET), Bala (Release), Pavan (Sales), Joe Pierce (CS), 2× React + 1× Node + 1× FS engineers

## Current Sprint
- **Active:** Sprint 4 — New Case Form + Case Management Queues
- **Status:** Scope definition in progress — awaiting CPO (Rohith) sign-off

## Sprint Roadmap
| Sprint | Scope | Status |
|--------|-------|--------|
| 0–1 | Scaffold + UI overhaul | ✅ Done |
| 2 | React migration + Inbox UI | ✅ Closed 11-Mar-2026 |
| 3 | Admin Console | ✅ Closed 11-Mar-2026 |
| 4 | New Case Form + Case Mgmt Queues | 🔄 In Progress |
| 5–9 | Case Query, Fulfillment, Analytics, CP Portal, Integrations | 📋 Backlog |

## Locked Architecture Decisions
- Auth: JWT (8hr expiry) + bcrypt (10 rounds)
- DB: SQLite now → PostgreSQL pre-deployment
- RBAC: 4 roles (admin, agent, reviewer, content_manager) × 9 modules
- Compliance: 21 CFR Part 11 (audit_logs + login_audit + ESIG modal)
- Frontend owned by Rohith | Backend owned by Varun

## Open Items
- Sprint 4 scope: final field list for New Case Form (Rohith to confirm)
- 3rd Case Management sub-tab name: "Team Cases" (placeholder — Rohith to confirm)
- Sprint closure requires explicit Rohith (CPO) approval

## AI Communication Protocol
- **Claude** updates `CLAUDE_LOG.md` when code changes are made
- **Codex** updates `CODEX_LOG.md` when sprint/backlog/team/release info changes
- Each AI reads the other's log via **subagent** at session start (not in main context)
```

### CODEX_LOG.md (before compact)
```md
# CODEX_LOG — PMO & Engineering Updates
> Codex writes here on changes. Claude reads via Explore subagent (never directly).
> Old entries → BACKUP.md

---

## Entries (Newest First)

### 2026-03-13 — Inbox Hardening (Body + Poller + Auto-Sync)
- **Type:** Fix
- **What:** Poller parses email bodies via `mailparser` (better readable content), caps messages per run, and runs work off the cron tick to reduce missed executions. Inbox API now returns `source` (db/seed) and orders by `received_at`. Inbox UI does a background server sync so seed cache won’t hide ingested emails.
- **Action:** Restart backend + frontend dev servers.

### 2026-03-12 — Inbox UI Sync Button
- **Type:** Fix
- **What:** Inbox page now has `Sync from Server` button to force-refresh from `/api/inbox` (overrides localStorage cache) so ingested emails appear immediately.
- **Action:** Restart frontend dev server to pick up change.

### 2026-03-12 — QA Pass (Gmail Inbound + Attachments)
- **Type:** QA
- **What:** Verified Gmail inbound ingestion works with polling interval=1; 2 new emails ingested; attachment email created `inquiry_attachments` row and file stored under `mims/backend/storage/email_attachments/`.
- **Action:** Proceed with remaining QA (SMTP outbound + UI visibility checks) when ready

### 2026-03-12 — Backend Crash Fix (IMAP Poller)
- **Type:** Fix
- **What:** Poller now shuts IMAP down gracefully (`imap.end()` + timeout) to avoid crash in `imap/lib/Connection.js` during polling
- **Action:** Restart backend (`npm run dev`) and watch poller logs

### 2026-03-12 — Email Accounts UI Error Handling
- **Type:** Fix
- **What:** Frontend now handles non-JSON/404 gracefully instead of crashing with `Unexpected token '<'`
- **Action:** Restart frontend dev server; ensure backend on :3000

### 2026-03-12 — F1 Attachment Ingest + Blockers Fixed
- **Type:** Fix
- **What:** Real IMAP ingestion in emailPoller.js; `inquiries` table persisted; `/api/inbox` reads DB; `is_active` create bug fixed; attachment download with size cap working
- **Action:** QA retest with real IMAP/SMTP creds; verify O365 tenant settings if used
```

### CLAUDE_LOG.md (before compact)
```md
# CLAUDE_LOG — Scimax Engineering Changes
> Claude writes here on code changes. Codex reads via Explore subagent (never directly).
> Old entries → BACKUP.md

---

## Entries (Newest First)

### 2026-03-12 — Sprint 4 F1: Email Accounts
- **Files:** db.js, config.js, server.js, services/emailPoller.js (NEW), AdminConsolePage.jsx
- **What:** Full Email Accounts — DB schema, 7 API routes (CRUD + test-imap/smtp + send-test), node-cron poller, full UI (list + Add/Edit modal + Send Test modal)
- **Why:** Sprint 4 F1 per frozen FSD
- **Next:** Sprint 4 F2 — Case Management Queues skeleton
```

## CLAUDE_LOG Archive

### 2026-03-12 — Cross-System Log Test
- Files: mims/backend/routes/auth.js
- Added `(v1.0)` to file header — no functional impact. Testing Codex read capacity.

### 2026-03-11 — Sprint 3 Close
- Files: AdminConsolePage.jsx, db.js, config.js, orgs.js
- Full Admin Console: Sites, Workflow, Source Types, Products, Users, Security Groups, Audit Trails, ESIG

---

## CODEX_LOG Archive

### 2026-03-12 — QA Findings (Sprint 4 F1)
- 2 blockers: emailPoller stub-only; `is_active ? 1 : 1` bug in POST route.

### 2026-03-12 — Sprint 4 F1 Frozen (Email Configuration)
- F1 fully frozen: IMAP-only inbound, polling 5 min, attachments optional, Gmail/O365 presets, ESIG deferred Sprint 10.

### 2026-03-12 — Sprint 4 Scope Approved
- F1 Email Config (13 pts), F2 Case Queues (8 pts), F3 New Case Form (13 pts). Total ~34 pts.

### 2026-03-12 — Initialization
- CODEX_LOG initialized. Virtusa (Codex) maintains this file.

---

## Closed Sprints

### Sprints 0–3 — ALL CLOSED ✅
- Sprint 0: Project scaffold
- Sprint 1: UI overhaul
- Sprint 2: React migration + Inbox UI (closed 11-Mar-2026)
- Sprint 3: Admin Console — Sites, Workflow, Source Types, Products, Users, Security Groups, Audit Trails, ESIG (closed 11-Mar-2026)
