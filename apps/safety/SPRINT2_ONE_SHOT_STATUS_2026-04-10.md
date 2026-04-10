# Pharaxis Safety — Sprint 2 One-Shot Status
Date: 2026-04-10
Owner: Bala + Varun
Execution Mode: One-shot (no approval pauses)

## Completion Table

| Area | Scope Item | Status | Evidence |
|---|---|---|---|
| Case Intake | Reporter/patient/AE/product capture | Completed | `POST /api/cases`, `PATCH /api/cases/:id/intake` |
| Case Intake | Attachments and richer intake metadata | Completed | `POST /api/cases/:id/attachments` |
| Case Intake | Autosave drafts (save/load/delete) | Completed | `PUT/GET/DELETE /api/cases/drafts/:draftKey` |
| Duplicate Management | Duplicate precheck before intake | Completed | `POST /api/cases/precheck/duplicates` |
| Triage | Seriousness/causality/priority with rule elevation | Completed | `PATCH /api/cases/:id/triage` |
| Workflow | Status progression and workflow history | Completed | `POST /api/cases/:id/status`, `GET /api/cases/:id/workflow` |
| Workflow | Exception queue and reason capture | Completed | `POST /api/cases/:id/exception` |
| Reviewer Ops | Medical reviewer assignment | Completed | `PATCH /api/cases/:id/assign-reviewer` |
| Regulatory | Clock recalculation and timezone update | Completed | `PATCH /api/cases/:id/regulatory-clock` |
| Regulatory | Pause/resume/stop/start controls | Completed | `POST /api/cases/:id/regulatory-clock/action` |
| Regulatory | Alert generation + alert list | Completed | `POST /api/cases/regulatory/alerts/run`, `GET /api/cases/regulatory/alerts` |
| Narrative | Generate/edit/approve narrative | Completed | `POST /api/cases/:id/narrative/generate`, `PATCH /api/cases/:id/narrative/:narrativeId` |
| Medical Assessment | Listedness/expectedness capture | Completed | `POST /api/cases/:id/listedness`, `GET /api/cases/:id/listedness` |
| Dashboards | Summary by status/priority/client + overdue buckets | Completed | `GET /api/cases/dashboard/summary` |
| Dashboards | Saved dashboard filters | Completed | `GET/POST/DELETE /api/cases/dashboard/filters` |
| Audit | Case-level audit + org-wide audit + CSV export | Completed | `GET /api/cases/:id/audit`, `GET /api/cases/audit`, `GET /api/cases/audit/export` |
| Security | Client-scope filtering for alert/audit operations | Completed | Tenant-scope checks added in `backend/routes/cases.js` |
| UI | Expanded Case Management workspace (dashboard/intake/list/deep view/audit) | Completed | `frontend/src/App.jsx`, `frontend/src/styles.css` |
| Testing | Sprint 2 full smoke suite | Completed | `npm run test:smoke:sprint2:kickoff` passed |
| Regression | Sprint 1 smoke after Sprint 2 changes | Completed | `npm run test:smoke:sprint1` passed |

## Pending Table

| Item | Status | Notes |
|---|---|---|
| Sprint 2 scoped items from current plan | None pending | Ready for product/UAT review |

## Validation Results

| Command | Result |
|---|---|
| `npm run build` (frontend) | Passed |
| `npm run test:smoke:sprint2:kickoff` | Passed |
| `npm run test:smoke:sprint1` | Passed |

