# AI-Agent

AI-Agent is the provider-integrated AI service in Pharaxis-One.

## Purpose

- Route AI requests through provider adapters
- Store org-level provider configuration
- Track AI usage and operational metrics

## Tech Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: MySQL (`pharaxis_ai_agent_dev` by default)

## Paths

- Backend entry: `backend/server.js`
- Frontend app: `frontend/`
- DB init/schema: `backend/database/db.js`

## Run Locally

```bash
cd apps/ai-agent
npm install
npm run dev:all
```

Backend-only:

```bash
npm run dev
```

## Default Runtime

- Backend port: `6000`
- Health endpoint: `GET /api/v1/agent/health`

## Environment

Copy and configure:

- `.env.example` -> `.env`

Important env keys include `AI_AGENT_ENCRYPTION_KEY` and `MYSQL_*`.
