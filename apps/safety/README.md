# Pharaxis Safety

Sprint 1 foundation implementation for Pharaxis Safety (Auth + Admin & Configuration).

## Scope Covered (Sprint 1 start)

- Authentication and session management
- RBAC enforcement at API level
- Organisation and CRO client hierarchy management
- Organisation-level settings with audited updates
- User invitation, activation, status/role assignment
- Product and study configuration
- Case ID configuration and sequence generation
- System configuration (SMTP, session, retention, notifications)
- Read-only admin audit trail
- Tenant isolation guardrails (`org_id` + `client_id`) at API and DB trigger layers

## Sprint 2 Core Case Management (Implemented)

- Advanced case intake (reporter/patient/AE/product sections, attachments, autosave drafts)
- Duplicate precheck and candidate match scoring
- Triage automation + role-aware status workflow (including exception handling)
- Reviewer assignment and deep case actions
- Regulatory clock controls (update days/timezone + pause/resume/start/stop)
- Regulatory due/overdue alert generation and alert listing
- Narrative generation/edit/approval workflow
- Listedness/expectedness assessment
- Case dashboard summaries with overdue buckets and saved filters
- Case and organisation-level audit endpoints with CSV export

## Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: MySQL (`pharaxis_safety_dev`)

## Local Run

1. Configure env:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
cd frontend && npm install
```

3. Start backend + frontend:

```bash
npm run dev:all
```

- Backend: `http://localhost:5200`
- Frontend: `http://localhost:5177`
- Health: `GET /api/health`

## Default Seed Login

- Org slug: `pharaxis-platform`
- Email: `safety.superadmin@pharaxis.one`
- Password: `SafetyAdmin@123`

## Smoke Test

```bash
npm run test:smoke:sprint1
```

## Gate 2 UAT

```bash
npm run test:uat:sprint1:gate2
```

## Sprint 2 Full Smoke

```bash
npm run test:smoke:sprint2:kickoff
```

## Sprint 2 Focused UAT

```bash
npm run test:uat:sprint2:focused
```
