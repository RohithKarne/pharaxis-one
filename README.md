# Pharaxis-One

Pharaxis-One is a multi-application monorepo for medical-affairs and platform products.
It currently includes MIMS, CP Portal, AI-Agent, Vault, and QMS with shared operating standards across MySQL and PostgreSQL services.

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
| AI-Agent | `apps/ai-agent` | Provider-agnostic AI query service and admin controls | Backend: Node/Express + MySQL, Frontend: React/Vite |
| Vault | `apps/vault` | Content/document vault foundations with auth + superadmin flows | Backend: Node/Express + MySQL, Frontend: React/Vite |
| QMS | `apps/qms` | Quality Management System baseline (auth/superadmin, document control, CAPA, deviations, audits, validation) | Backend: Node/Express + PostgreSQL, Frontend: Vue/Vite + Tailwind |

## Repository Structure

```text
apps/
  mims/
  cp-portal/
  ai-agent/
  vault/
  qms/
.github/
docs/
```

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL 8+
- PostgreSQL 14+
- macOS/Linux shell (examples use `zsh`/`bash`)

## Quick Start

### 1) Install Dependencies

Install per app:

```bash
cd apps/mims && npm install
cd apps/cp-portal/backend && npm install
cd apps/cp-portal/frontend && npm install
cd apps/ai-agent && npm install
cd apps/vault && npm install
cd apps/qms/backend && npm install
cd apps/qms/frontend && npm install
```

### 2) Configure Environment Variables

Copy sample env files where provided:

- `apps/mims/.env.example`
- `apps/cp-portal/backend/.env.example`
- `apps/ai-agent/.env.example`
- `apps/vault/.env.example`
- `apps/qms/backend/.env.example`

### 3) Create Databases

Default local DBs used by the code:

MySQL:
- `pharaxis_mims_dev`
- `pharaxis_cp_portal_dev`
- `pharaxis_ai_agent_dev`
- `pharaxis_vault_dev`

PostgreSQL:
- `qms_dev` (QMS default from `DATABASE_URL`)

### 4) Run Services

```bash
# MIMS
cd apps/mims && npm run dev:all

# CP Portal
cd apps/cp-portal/backend && npm run dev
cd apps/cp-portal/frontend && npm run dev

# AI-Agent
cd apps/ai-agent && npm run dev:all

# Vault
cd apps/vault && npm run dev:all

# QMS
cd apps/qms/backend && npm run dev
cd apps/qms/frontend && npm run dev
```

## Default Local Ports

- MIMS backend: `3000`
- CP Portal backend: `4000`
- Vault backend: `5100`
- AI-Agent backend: `6000`
- QMS backend: `3145`
- CP Portal frontend: `5174`
- MIMS frontend: `5173`
- Vault frontend: `5176`
- AI-Agent frontend: `5175`
- QMS frontend: `3146`

## Health Endpoints

- MIMS: `GET /api/health` on port `3000`
- CP Portal: `GET /api/health` on port `4000`
- Vault: `GET /api/health` on port `5100`
- AI-Agent: `GET /api/v1/agent/health` on port `6000`
- QMS: `GET /api/health` on port `3145`

## GitHub Automation

- Reusable CI workflow: `.github/workflows/_app-ci.yml`
- Per-app CI workflows: `ci-mims.yml`, `ci-qms.yml`, `ci-vault.yml`, `ci-cp-portal.yml`, `ci-ai-agent.yml`
- Per-app release workflows: `release-mims.yml`, `release-qms.yml`, `release-vault.yml`, `release-cp-portal.yml`, `release-ai-agent.yml`
- Dependency updates: `.github/dependabot.yml`

Remote deploy workflows are intentionally disabled for automatic pushes and fail intentionally if run manually. The AWS/EC2 instance that previously hosted Pharaxis apps has been deleted, so GitHub Actions is now used for CI, labels, dependency automation, and release artifact validation only. Runtime verification should be done against local app services.

## Documentation Index

- Project overview: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Database details: [docs/DB_DETAILS.md](docs/DB_DETAILS.md)
- GitHub product ops: [docs/GITHUB_PRODUCT_OPERATIONS_SETUP.md](docs/GITHUB_PRODUCT_OPERATIONS_SETUP.md)
- Branch protection: [docs/BRANCH_PROTECTION_POLICY.md](docs/BRANCH_PROTECTION_POLICY.md)
- Monitoring and backup baseline: [docs/MONITORING_AND_BACKUP_BASELINE.md](docs/MONITORING_AND_BACKUP_BASELINE.md)
- Product runbooks: [docs/runbooks/](docs/runbooks)

## Security and Governance

- Security policy: [SECURITY.md](SECURITY.md)
