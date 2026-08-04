-- 0002_rls_policies.sql — MySQL: intentionally empty.
--
-- The PostgreSQL original (src/db/migrations/0002_rls_policies.sql) contained
-- only Row Level Security: 9 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
-- statements and the matching `CREATE POLICY` isolation rules, each of the form
--
--   USING (org_id = current_setting('app.current_org_id')::uuid)
--
-- MySQL has no equivalent feature. Tenant isolation is now enforced in the
-- application layer instead: every tenant-scoped query carries its own
-- `org_id` predicate, verified by tests/tenant-scope-audit.mjs (which fails the
-- build if any query relies on the database to filter) and by the end-to-end
-- test in tests/tenant-isolation.mjs.
--
-- This file is kept rather than deleted so the migration sequence stays
-- contiguous and a reader comparing the two directories can see that 0002 was
-- considered and deliberately dropped, not lost.

SELECT 1;
