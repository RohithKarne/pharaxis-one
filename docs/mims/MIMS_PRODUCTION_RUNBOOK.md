# MIMS Production Runbook

> **Status, 2026-09-24: local only.** Both products run on a developer machine and
> nowhere else. Every deployment pipeline, container image and server template was
> removed — including the Google Cloud pipeline that had been live for CP Portal.
> A cloud will be chosen later and the path built for it then. See
> `TEAM_OPERATING_SOP.md` §38.12. **This runbook is the future bar, not a
> description of anything running today.**

## Product Summary

| Item | Value |
| --- | --- |
| Product | MIMS |
| App path | `apps/mims` |
| Deploy workflow | **None.** Removed 2026-09-24 (§38.12) |
| Release workflow | `.github/workflows/release-mims.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + MySQL + React/Vite |
| Process manager | **None.** The template was removed 2026-09-24 (§38.12) |
| Frontend path | `/mims/` |
| Health endpoint | `/mims/api/health` |

## Local Verification

1. Confirm `MIMS CI` passed.
2. Run backend and frontend locally.
3. Take MySQL backup for the local database before migration-heavy work.
4. If migrations or auth changes are included, confirm rollback path.

## Deploy

**No deploy workflow exists at all** — the disabled notices were removed along with the live Google Cloud pipeline on 2026-09-24. Nothing in GitHub Actions may deploy, SSH, publish to a server or restart a process manager until a hosting target is chosen and agreed with Rohith.

## Local Runtime Verification

- `GET /mims/api/health`
- frontend shell loads at `/mims/`
- protected barrier behaves as expected
- admin login critical path
- inbox or dashboard basic path

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local DB only if migration or data corruption is involved.
3. Re-run smoke validation locally.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Restore proof required before production sign-off

## Observability Focus

- auth failures
- 401/403 spikes
- worker failures
- exception log growth
- PC signal/trending failures if feature enabled
