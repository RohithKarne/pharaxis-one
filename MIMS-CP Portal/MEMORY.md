# Project Memory

## Purpose
Track ongoing context and handoff notes between chat threads. Update this file at the end of each thread or when the user says: "starting a new chat".

## Current Snapshot (YYYY-MM-DD)
- Date: 2026-03-15
- Summary: Added System Activity tab (email import summary), Service Log IST fix, manual fetch logging, inquiry audit logging, audit filters (entity/entity_id), and global frontend/backend status viewer.
- Known issue(s):
  - User reported Chrome error: "Cannot connect to server" when visiting http://localhost:5173/dashboard. Comet browser works.
- Next steps:
  - Verify Chrome localhost issue if still relevant.
  - Backend restart required after latest changes.

## Build / Run Commands
- Unknown (please add when confirmed).

## Repos / Paths
- Workspace root: /Users/rohithkarne/MIMS-CP Portal
- Top-level folders observed: cp-portal, mims

## Environment
- OS: unknown
- Browser: Chrome (issue), Comet (works)
- URL: http://localhost:5173/dashboard

## Open Questions
- Which app (cp-portal or mims) corresponds to the frontend on port 5173?
- What is the backend/API URL and status?
- What exact Chrome error code appears?

## Team Structure / Operating Model
- Source of truth: `TEAM_STRUCTURE.md` and `TEAM_COMMUNICATION_PROTOCOL.md` (must read before work).
- Product Owner: User (provides requirements, fixes, asks, priorities).
- Development Team:
  - Rajeev (Director, 25 years experience) — primary technical lead, coordinates team; reports to Product Owner.
  - Varun (Manager, 20 years experience) — domain + technical, team handling; reports to Rajeev.
  - Bhavya (Principal Software Engineer, 15 years experience) — senior technical execution.
  - Vivek (Senior Software Engineer, 10 years experience).
  - Srikar (Junior Software Engineer, 5 years experience).
- Testing Team:
  - Narasimha (Testing Director, 25 years experience) — automation + manual; reports to Product Owner.
  - Bindu (Testing Manager, 15 years experience).
  - Krishnapriya (Lead Test Engineer, 10 years experience).
  - Ramya (Senior Test Engineer, 5 years experience).
  - Tharun (Test Engineer, 2 years experience).
- Product/BA Team:
  - Vanaja (Product Manager, 20 years experience) — domain + product guidance; reports to Product Owner.
  - Principal BA (15 years experience).
  - Senior BA (10 years experience).
  - BA (5 years experience).
- All teams have pharma + software domain knowledge.
- Operating model:
  - No sprints; work is continuous as per Product Owner instructions.
  - All teammates communicate visibly in chat; cross-team collaboration required.
  - QA team handles testing; development supports as needed.
