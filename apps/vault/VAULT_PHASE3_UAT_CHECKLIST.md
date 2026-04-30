# Vault Phase 3 UAT Checklist

## Scope
- Workflow template lifecycle (create/edit/activate/deactivate)
- Task reassignment + escalation routing
- Task comments thread
- Signature manifest traceability
- MIMS-style login + yellow Vault theme continuity
- Backend hardening (rate limit + request ID + structured logs)

## Environment
| Item | Value |
|---|---|
| Frontend | `http://localhost:5176/vault/` |
| Backend | `http://localhost:5100` |
| Seed command | `npm run seed:phase3` (run from `apps/vault`) |
| Test org slug | `novartis` (default) |

## Seeded UAT Users
| Role | Email | Password |
|---|---|---|
| Admin | `admin@novartis.local` | `Admin@123` |
| Author | `author@novartis.local` | `Author@123` |
| Reviewer | `reviewer@novartis.local` | `Reviewer@123` |
| Approver | `approver@novartis.local` | `Approver@123` |
| Viewer | `viewer@novartis.local` | `Viewer@123` |

## Phase 3 Functional Tests
| ID | Area | Steps | Expected Result | Status |
|---|---|---|---|---|
| P3-UAT-01 | Org login | Login using `admin@novartis.local` + org slug `novartis` | Login success, routed to Vault dashboard | Complete (Automated, 2026-04-28) |
| P3-UAT-02 | Template create | Admin opens `/admin/workflows`, creates template with 2+ steps | Template appears in Configured Templates table | Complete (Automated, 2026-04-28) |
| P3-UAT-03 | Template edit | Click `Edit`, modify name/description/steps, save | Updated values persist after refresh | Complete (Automated, 2026-04-28) |
| P3-UAT-04 | Template activate/deactivate | Toggle template status using `Activate`/`Deactivate` | Status updates immediately and persists | Complete (Automated, 2026-04-28) |
| P3-UAT-05 | My Tasks visibility | Login as reviewer and open `/vault/tasks` | Pending ready task visible with due/escalation fields | Complete (Manual UI + Playwright, 2026-04-28) |
| P3-UAT-06 | Task comments | Add a comment in task panel | Comment appears in thread with user + timestamp | Complete (Automated, 2026-04-28) |
| P3-UAT-07 | Reassign | Reassign pending task to approver/admin | Assignee changes; reassignment metadata and comment captured | Complete (Automated, 2026-04-28) |
| P3-UAT-08 | Signature | Complete ready task with password re-verification | Task moves completed and signature manifest is available | Complete (Manual UI + Playwright, 2026-04-28) |
| P3-UAT-09 | Admin queue | Admin opens `/admin/workflows` queue table | Escalation owner/reassignment columns populated | Complete (Automated, 2026-04-28) |
| P3-UAT-10 | Escalation cron | Wait for overdue ready task cycle or trigger job manually | Escalated task has escalation owner; optional reassignment to admin | Complete (Timed/Manual verification, 2026-04-28) |
| P3-UAT-11 | RBAC | Viewer attempts admin pages/APIs | Access denied (`403`) | Complete (Automated, 2026-04-28) |
| P3-UAT-12 | Audit trace | Validate workflow reassignment/comment/signature events in audit | Audit events present with before/after payloads | Complete (Automated, 2026-04-28) |

## Hardening Validation
| ID | Check | How to Validate | Expected Result |
|---|---|---|---|
| P3-OPS-01 | Request ID header | Call any API and inspect response headers | `X-Request-Id` present (Verified 2026-04-28) |
| P3-OPS-02 | Auth rate limit | Hit `/api/auth/login` repeatedly with wrong password | `429` with retry guidance after threshold (Verified 2026-04-28) |
| P3-OPS-03 | Superadmin rate limit | Hit `/api/superadmin/login` repeatedly | `429` after threshold (Verified 2026-04-28) |
| P3-OPS-04 | General API rate gate | Burst calls to authenticated API | `429` observed at burst threshold (Verified 2026-04-28) |
| P3-OPS-05 | Structured logs | Inspect backend console output | JSON logs with `event`, `request_id`, `duration_ms`, `status_code` (Verified 2026-04-28) |

## Sign-Off
| Role | Name | Date | Decision |
|---|---|---|---|
| Product |  |  |  |
| QA |  |  |  |
| Engineering |  |  |  |
