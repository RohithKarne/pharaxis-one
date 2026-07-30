# QMS Memory SOP
> **Purpose:** Single source of truth for the Pharaxis QMS application. Intended for any developer, QA engineer, or team member who needs to onboard or resume work without requiring verbal explanation.
> **Scope:** QMS app only. Other apps documented separately in their own SOP files.
> **Update Protocol:** This file is only updated when Rohith explicitly confirms. Rohith says "Bala, update the QMS Memory SOP — [what changed]" and Bala updates it. No one else modifies this file. Each update adds a version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-04-06 | Bala | Initial creation — skeleton. QMS not started. Placeholder for future development. |
| 2026-04-28 | Bala | Sprint 1 complete. Status updated from skeleton to active. Tech stack confirmed. Sprint history, local start command, ports, and DB details updated. |

---

## 1. What Is QMS

**QMS — Quality Management System**
A Pharaxis One application for managing SOPs, validation documents, quality events, and compliance workflows across regulated industries.

**Status:** Sprint 1 complete — active in repo. Next sprint pending Rohith go-ahead.

**Industries:** Life sciences, pharma, healthcare.

**Relationship to other apps:** Will consume content from Pharaxis Vault via Content Channels API.

---

## 2. Full Tech Stack

### Backend
| Component | Technology | Detail |
|-----------|-----------|--------|
| Runtime | Node.js | v20+ |
| Framework | Express | Latest stable |
| Database | PostgreSQL 14+ | via `pg` pool |
| Config | `DATABASE_URL` | env var — no MYSQL_* |
| Schema management | SQL migration scripts | `apps/qms/backend/src/db/migrations/*.sql` |
| Migration command | `npm run db:migrate` | Run once on fresh DB |

### Frontend
| Component | Technology | Detail |
|-----------|-----------|--------|
| Framework | Vue | Latest stable |
| Build tool | Vite | Latest stable |
| Styling | Tailwind CSS | Latest stable |

---

## 3. How to Start the App

```bash
# Backend
cd apps/qms/backend
node --env-file=.env server.js

# Frontend
cd apps/qms/frontend
npm run dev
```

**Local ports:**
- Backend: `3145`
- Frontend: `3146`

**DB bootstrap:**
```bash
cd apps/qms/backend && npm run db:migrate
```

---

## 4. System Architecture

- PostgreSQL — single database `qms_dev` (or configured via `DATABASE_URL`)
- `org_id` on every table — multi-tenant, no schema-per-org
- SQL migration files manage schema (not auto-create at startup like MySQL apps)
- Backend uses ESM — requires `--env-file=.env` flag (not dotenv package)

---

## 5. Team Structure

Full org chart in `docs/TEAM_OPERATING_SOP.md`. Restructured 2026-04-14 — 5-member team. See `memory/team.md` for full names and roles.

---

## 6. Frontend Route Map

> Defined in Sprint 1. Full route map in `apps/qms/QMS_SPRINT1_COMPLETED_VIEW.md`.

---

## 7. Backend API Map

> Defined in Sprint 1. Full API map in `apps/qms/QMS_SPRINT1_COMPLETED_VIEW.md`.

---

## 8. Admin Console Sections

> Defined in Sprint 1. Reference `apps/qms/QMS_SPRINT1_COMPLETED_VIEW.md`.

---

## 9. Database Tables Reference

| Detail | Value |
|--------|-------|
| Database name | `qms_dev` (local default via `DATABASE_URL`) |
| Engine | PostgreSQL 14+ |
| Multi-tenancy | `org_id` on every table — no exceptions |
| Schema source | `apps/qms/backend/src/db/migrations/*.sql` |

---

## 10. Sprint History

| Sprint | Status | Key Deliverables |
|--------|--------|-----------------|
| Sprint 1 | ✅ COMPLETE (2026-04-09) | Auth/superadmin, document control, CAPA, deviations, audits, validation, platform shared services. 31/31 QA pass. Browser verified. Rohith signed off. |

---

## 11. Current Sprint

**Status: PAUSED — awaiting Rohith go-ahead for Sprint 2.**

Sprint 2 scope not yet defined. Build sequence priority: Pharaxis Vault first.

---

## 12. Known Issues and Technical Debt

- None carried from Sprint 1.

---

## 13. Critical Technical Rules (Must Know)

| Rule | Detail |
|------|--------|
| **org_id everywhere** | Every table must have `org_id`. No exceptions. |
| **Claude Code writes all code** | ALL code, edits and test scripts via Claude Code's own Edit/Write tools. |
| **No hard deletes** | Status flags only. |
| **ESM backend** | Must use `node --env-file=.env server.js` — not `node server.js` alone. |
| **Migrations only** | Schema changes via migration files — never manual ALTER TABLE on dev DB without a migration file. |

---

## 14. Process Reference

Full gate flow and protocols in:
- `memory/protocols.md`
- `memory/feedback.md`
- `docs/TEAM_OPERATING_SOP.md`

---

## 15. How to Update This File

Only Bala updates this file, on Rohith's explicit instruction.

Format: Rohith says → "Bala, update the QMS Memory SOP — [what changed]"
