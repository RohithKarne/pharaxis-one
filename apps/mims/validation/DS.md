# MIMS Design Specification

## Architecture
MIMS remains a Node.js Express and React Vite application backed by MySQL. Enterprise extensions are isolated in service directories: `services/pv`, `services/ai`, `services/workflow`, and `services/api-platform`.

## Data Model
Migration 035 adds PV, AI, workflow, API, webhook, data residency, and e-sign tables. Existing case and AE tables are read by the ICSR layer but not mutated.

## Security Design
Admin-only features use existing JWT middleware and role guards. Public APIs use OAuth2 client credentials, hashed secrets, hashed access tokens, scope checks, and call logs.

## Audit Design
Every regulated action writes to `audit_logs`, `transmission_audit_trail`, workflow execution logs, API logs, or e-sign manifest tables. Audit completeness is checked by script.
