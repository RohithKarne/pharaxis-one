# Installation Qualification Protocol

1. Install Node.js 20 and MySQL 8.
2. Configure `.env` with database, JWT, SMTP, and signing key paths.
3. Run `npm install` in `apps/mims` and `apps/mims/frontend`.
4. Start backend once and verify migration 035 applies.
5. Run `node backend/scripts/verify-audit-completeness.js`.
6. Run `node backend/scripts/build-traceability.js`.
7. Verify `/api/health`, `/api/openapi.yaml`, and `/mims` respond.
