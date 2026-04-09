# Project Overview

## Mission

Pharaxis-One groups medical-affairs and platform products into a single operational monorepo so teams can ship faster with shared standards, CI visibility, and consistent architecture practices.

## Product Domains

### 1) Medical Affairs
- **MIMS**: Core system for inquiry/case lifecycle, admin workflows, process telemetry, and operational reporting.
- **CP Portal**: Client/public interaction layer for submissions, documents, and content delivery.

### 2) Platform Services
- **AI-Agent**: Provider-integrated AI service layer (OpenAI/Claude/Gemini adapters) with usage/config administration.
- **Vault**: Document/content vault foundations with authentication and superadmin controls.

### 3) Future Expansion
- **QMS** and **Safety** are currently scaffolds and reserved for future implementation.

## Current State Snapshot

| Area | Status |
|---|---|
| MIMS | Active and extensive implementation |
| CP Portal | Implemented and maintained |
| AI-Agent | Implemented and evolving |
| Vault | Implemented foundational modules |
| QMS / Safety | Placeholder scaffolds |

## Technical Baseline

- Backend stack: Node.js + Express
- Frontend stack: React + Vite
- Database: MySQL (service-specific DB per app)
- CI: GitHub Actions
- Dependency management: npm + Dependabot

## Team and Process Artifacts

- `TEAM_OPERATING_SOP.md` defines cross-functional operating rules, gates, and responsibilities.
- `live-communication-use-and-format.md` defines live collaboration communication behavior.
- Domain memory SOP docs capture app-specific context and continuity.

## How to Navigate This Repo

1. Start with root `README.md`.
2. Read `docs/ARCHITECTURE.md` and `docs/DB_DETAILS.md`.
3. Move to app-specific folders under `apps/`.
4. Use `.github/workflows/ci.yml` to understand CI quality gates.
