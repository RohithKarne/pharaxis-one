# MIMS-CP Portal - Shared Context (Keep <= 60 lines)
Read at session start. If chat is deleted, this is the memory.

Project
- Product: MIMS-CP Portal (pharma/medical info); compliance target: 21 CFR Part 11
- Stack: React 19 + Node/Express + SQLite (Postgres pre-deploy); monorepo: `mims/` + `cp-portal/`
- Frontend MPA modules: MIMS (main), Admin Console, Content Mgmt, Data Visualization, Superadmin (permission-gated)
- Superadmin assigns per-user module access via `/api/superadmin/*` (source of truth for module access)
- Superadmin is a separate MPA at `/superadmin.html` with isolated login (no shared session with other modules)
- MIMS uses module gating via `mims_core`
- Default Superadmin account enforced at startup: user `Superadmin` / password `Manager@123`
- Admin Console APIs allow `admin` and `superadmin`
- Email accounts delete now removes related inquiries/attachments and credentials

Run (local)
- Backend: `cd mims && npm run dev` -> `http://127.0.0.1:3000`
- Frontend: `cd mims/frontend && npm run dev` -> `http://localhost:5173`
- Port fix: `lsof -nP -iTCP:3000 -sTCP:LISTEN` then `kill PID` (do NOT type `<PID>`)

Companies / Operating Model
- Scimax (Rohith + Varun) and Virtusa (Codex) can both implement + QA + PMO now.
- Rule: record changes in logs; avoid sharing credentials in chat; use secure channel.

Comms Protocol (AI bridge)
- `SHARED_CONTEXT.md` = source of truth.
- Claude writes `CLAUDE_LOG.md` for code changes; Codex writes `CODEX_LOG.md` for PMO/QA/ops changes.
- Each AI reads the other's log via subagent at session start.

Team (delivery)
- Product: Rohith (CPO/PO), Vinay (PM), Dhrithi (BA)
- Scrum: Srihitha (SM)
- Architecture: Varun (CTO), Anirudh (SA)
- QA: Narasimha (Test Mgr), Sandeep (Manual), Tharun (SDET), Claude (AI Test Lead)
- Release: Bala; Sales/CS: Pavan, Joe Pierce
- Board: Saad (CEO), Vasu (CRO), Richard (CCO), Varun (CTO), Rohith (CPO)

Sprint 4 (active; 2-week sprint; MVP target sprints 4-7)
- F1 Email Accounts (Admin Console) delivered + patched:
  - DB: `email_accounts`, `inquiries`, `inquiry_attachments`
  - API: CRUD + toggle + `test-imap`, `test-smtp`, `send-test`; `/api/inbox` reads DB first (`source=db|seed`)
  - Poller: IMAP ingest + optional attachment download; mail body parsing via `mailparser`; caps per-run fetch; stable shutdown
  - Inbox UI: background server sync + `Sync from Server` button (prevents seed localStorage hiding ingested emails)
  - QA: Gmail inbound import + attachments verified; SMTP outbound pending if not yet executed
- F2 Case Queues skeleton: pending
- F3 New Case Form scaffold: pending

Known Ops Notes
- If backend crashes, check terminal: IMAP/poller errors vs `EADDRINUSE` (duplicate server).
