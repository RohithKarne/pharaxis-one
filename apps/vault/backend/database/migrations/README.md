# Vault Database Migrations

This folder is the forward migration home for Vault schema changes.

Current app startup still bootstraps the legacy schema from `backend/database/db.js`. New structural/schema changes should be added here as numbered SQL migrations and applied with:

```bash
npm run db:migrate
```

Rules:
- Use monotonic filenames like `0002_add_content_policy.sql`.
- Keep migrations additive and safe for existing local data.
- Do not place seed data or local credentials in migration files.
