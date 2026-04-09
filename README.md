# Pharaxis-One

Pharaxis-One is a multi-application monorepo for medical-affairs and platform products.
It currently includes MIMS, CP Portal, AI-Agent, and Vault with shared operating standards and MySQL-backed services.

## What This Repository Contains

- Production/active application code
- Sprint and SOP context documents
- CI/CD workflows and dependency automation
- Multi-service local development setup

## Application Landscape

| App | Path | Purpose | Runtime |
|---|---|---|---|
| MIMS | `apps/medical-affairs/mims` | Medical Information Management System for case operations, inbox, admin, reporting | Backend: Node/Express + MySQL, Frontend: React/Vite |
| CP Portal | `apps/medical-affairs/cp-portal` | Admin + public portal experience for external submissions/content | Backend: Node/Express + MySQL, Frontend: React/Vite |
| AI-Agent | `apps/ai-agent` | Provider-agnostic AI query service and admin controls | Backend: Node/Express + MySQL, Frontend: React/Vite |
| Vault | `apps/vault` | Content/document vault foundations with auth + superadmin flows | Backend: Node/Express + MySQL, Frontend: React/Vite |
| QMS | `apps/qms` | Scaffold placeholder | Not yet implemented |
| Safety | `apps/safety` | Scaffold placeholder | Not yet implemented |

## Repository Structure

```text
apps/
  ai-agent/
  medical-affairs/
    cp-portal/
    ieg/
    mims/
    publications/
  qms/
  safety/
  vault/
.github/
docs/
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
cd apps/medical-affairs/mims && npm install
cd apps/medical-affairs/cp-portal/backend && npm install
cd apps/medical-affairs/cp-portal/frontend && npm install
cd apps/ai-agent && npm install
cd apps/vault && npm install
```

### 2) Configure Environment Variables

Copy sample env files where provided:

- `apps/medical-affairs/mims/.env.example`
- `apps/medical-affairs/cp-portal/backend/.env.example`
- `apps/ai-agent/.env.example`
- `apps/vault/.env.example`

### 3) Create Databases

Default local DB names used by the code:

- `pharaxis_mims_dev`
- `pharaxis_cp_portal_dev`
- `pharaxis_ai_agent_dev`
- `pharaxis_vault_dev`

### 4) Run Services

```bash
# MIMS
cd apps/medical-affairs/mims && npm run dev:all

# CP Portal
cd apps/medical-affairs/cp-portal/backend && npm run dev
cd apps/medical-affairs/cp-portal/frontend && npm run dev

# AI-Agent
cd apps/ai-agent && npm run dev:all

# Vault
cd apps/vault && npm run dev:all
```

## Default Local Ports

- MIMS backend: `3000`
- CP Portal backend: `4000`
- Vault backend: `5000`
- AI-Agent backend: `6000`
- CP Portal frontend: `5174` (explicit)
- Other Vite apps: Vite default unless overridden

## Health Endpoints

- MIMS: `GET /api/health` on port `3000`
- CP Portal: `GET /api/health` on port `4000`
- Vault: `GET /api/health` on port `5000`
- AI-Agent: `GET /api/v1/agent/health` on port `6000`

## CI/CD and Automation

- CI workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/release.yml`
- Dependency updates: `.github/dependabot.yml`

## Documentation Index

- Project overview: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Database details: [docs/DB_DETAILS.md](docs/DB_DETAILS.md)
- Team operating SOP: [TEAM_OPERATING_SOP.md](TEAM_OPERATING_SOP.md)
- Live communication format: [live-communication-use-and-format.md](live-communication-use-and-format.md)

## Security and Governance

- Security policy: [SECURITY.md](SECURITY.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code ownership: [CODEOWNERS](CODEOWNERS)

## Repository Rename Note

This repository was previously under `MIMS-CP-Portal` and is now maintained as `Pharaxis-One`.
