# Pharaxis-One

Monorepo for Pharaxis product applications.

## Active Apps

- `apps/medical-affairs/mims` - Medical Information Management System (MIMS)
- `apps/medical-affairs/cp-portal` - CP Portal (admin + public portal)
- `apps/ai-agent` - AI-Agent service and UI
- `apps/vault` - Vault service and UI
- `apps/qms` - Reserved scaffold (`.gitkeep`)
- `apps/safety` - Reserved scaffold (`.gitkeep`)

## Repository Structure

```text
apps/
  ai-agent/
  medical-affairs/
    cp-portal/
    mims/
    ieg/
    publications/
  qms/
  safety/
  vault/
```

## Prerequisites

- Node.js 20+
- npm 10+
- MySQL 8+

## Quick Start

### 1) Install dependencies

Run `npm install` in each app you want to start:

- `apps/medical-affairs/mims`
- `apps/medical-affairs/cp-portal/backend`
- `apps/medical-affairs/cp-portal/frontend`
- `apps/ai-agent`
- `apps/vault`

### 2) Configure environment variables

- Copy each app's `.env.example` to `.env` where available.
- MIMS already includes `apps/medical-affairs/mims/.env.example`.

### 3) Start apps

- MIMS (backend): `cd apps/medical-affairs/mims && npm run dev`
- MIMS (backend + frontend): `cd apps/medical-affairs/mims && npm run dev:all`
- CP Portal backend: `cd apps/medical-affairs/cp-portal/backend && npm run dev`
- CP Portal frontend: `cd apps/medical-affairs/cp-portal/frontend && npm run dev`
- AI-Agent (backend + frontend): `cd apps/ai-agent && npm run dev:all`
- Vault (backend + frontend): `cd apps/vault && npm run dev:all`

## Database Details

Database configuration is environment-driven and defaults to MySQL on `localhost:3306`.

See full details in [docs/DB_DETAILS.md](docs/DB_DETAILS.md).

## Notes

- This repo is renamed to `Pharaxis-One` (previous GitHub name: `MIMS-CP-Portal`).
- SQL backup files are intentionally excluded from version control.
