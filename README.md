# Pharaxis-One

Pharaxis-One is a multi-application monorepo for medical-affairs and platform products.
It holds two products — MIMS and CP Portal — with shared operating standards on MySQL.

## What This Repository Contains

- Production/active application code
- Sprint and SOP context documents
- CI/CD workflows and dependency automation
- Multi-service local development setup

## Application Landscape

| App | Path | Purpose | Runtime |
|---|---|---|---|
| MIMS | `apps/mims` | Medical Information Management System for case operations, inbox, admin, reporting | Backend: Node/Express + MySQL, Frontend: React/Vite |
| CP Portal | `apps/cp-portal` | Admin + public portal experience for external submissions/content | Backend: Node/Express + MySQL, Frontend: React/Vite |

## Repository Structure

```text
apps/
  mims/
  cp-portal/
.github/
docs/        all project documentation lives here
ops/
scripts/
```

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL 8+
- macOS/Linux shell (examples use `zsh`/`bash`)

## Quick Start

### 1) Install Dependencies

Install per app:

```bash
cd apps/mims && npm install
cd apps/cp-portal/backend && npm install
cd apps/cp-portal/frontend && npm install
```

### 2) Configure Environment Variables

Copy sample env files where provided:

- `apps/mims/.env.example`
- `apps/cp-portal/backend/.env.example`

### 3) Create Databases

Default local DBs used by the code:

MySQL:
- `pharaxis_mims_dev`
- `pharaxis_cp_portal_dev`

### 4) Run Services

Both products, one command (MySQL must already be running):

```bash
./scripts/dev-all.sh
```

Ctrl-C stops everything it started. To run just one product:

```bash
# MIMS
cd apps/mims && npm run dev:all

# CP Portal
cd apps/cp-portal/backend && npm run dev
cd apps/cp-portal/frontend && npm run dev
```

## Default Local Ports

- MIMS backend: `3000`
- CP Portal backend: `4000`
- CP Portal frontend: `5174`
- MIMS frontend: `5173`

## Health Endpoints

- MIMS: `GET /api/health` on port `3000`
- CP Portal: `GET /api/health` on port `4000`

## GitHub Automation

- Reusable CI workflow: `.github/workflows/_app-ci.yml`
- Per-app CI workflows: `ci-mims.yml`, `ci-cp-portal.yml`
- Per-app release workflows: `release-mims.yml`, `release-cp-portal.yml`
- Dependency updates: `.github/dependabot.yml`

Remote deploy workflows are intentionally disabled for automatic pushes and fail intentionally if run manually. The AWS/EC2 instance that previously hosted Pharaxis apps has been deleted, so GitHub Actions is now used for CI, labels, dependency automation, and release artifact validation only. Runtime verification should be done against local app services.

## Documentation Index

- Project overview: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Database details: [docs/DB_DETAILS.md](docs/DB_DETAILS.md)
- GitHub product ops: [docs/GITHUB_PRODUCT_OPERATIONS_SETUP.md](docs/GITHUB_PRODUCT_OPERATIONS_SETUP.md)
- Branch protection, pull requests, releases: [docs/TEAM_OPERATING_SOP.md](docs/TEAM_OPERATING_SOP.md) §38
- Monitoring and backup baseline: [docs/MONITORING_AND_BACKUP_BASELINE.md](docs/MONITORING_AND_BACKUP_BASELINE.md)
- Product runbooks: [docs/runbooks/](docs/runbooks)

## Security and Governance

- Security policy: [SECURITY.md](SECURITY.md)
