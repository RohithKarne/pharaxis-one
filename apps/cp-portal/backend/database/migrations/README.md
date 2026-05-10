# CP Portal Database Migrations

This folder is the forward migration home for CP Portal schema changes.

App startup now runs SQL migrations first, then keeps the legacy bootstrap as a compatibility fallback for environments created before migration-first rollout. New structural/schema changes should be added here as numbered SQL migrations and applied with:

```bash
npm run db:migrate
```

Rules:
- Use monotonic filenames like `0002_add_request_context.sql`.
- Keep migrations additive and reversible where possible.
- Do not place seed data or local credentials in migration files.
