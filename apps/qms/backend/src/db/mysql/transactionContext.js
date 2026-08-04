import { getMysqlPool } from './pool.js';
import { asPgClient } from './pgCompat.js';

/**
 * MySQL replacement for src/middleware/rlsContext.js.
 *
 * The Postgres original opened a transaction and then set two session
 * variables:
 *
 *   SELECT set_config('app.current_org_id', $1, true)
 *   SELECT set_config('app.is_superadmin',  $1, true)
 *
 * Row Level Security policies read those to filter every tenant table. MySQL
 * has neither set_config nor RLS, so there is nothing to translate — the
 * filtering itself moved into the queries during Phase 0, where every
 * tenant-scoped statement now carries its own `org_id` predicate (enforced by
 * tests/tenant-scope-audit.mjs, which fails the build if one does not).
 *
 * What remains here is therefore just the transaction, plus the org-context
 * precondition. That precondition is deliberately KEPT even though no session
 * variable depends on it any more: it is the check that fails a request which
 * somehow reached a tenant route without an org, and dropping it would remove
 * the last guard that does not rely on every individual query being correct.
 *
 * The handler still receives a pg-shaped client (via asPgClient) so the ~440
 * `const { rows } = await client.query(sql, [$1...])` call sites in the routes
 * need no change.
 *
 * NOTE — a real difference, not a translation gap: MySQL DDL is not
 * transactional. Nothing in the request path issues DDL, so this does not
 * affect routes, but it does mean a migration cannot be rolled back the way the
 * Postgres runner could. See src/db/mysql/migrate.js.
 */
export function withMysqlTransaction(req, _res, next) {
  req.withRlsTransaction = async (handler) => {
    const orgId = req.authContext?.orgId;
    if (!orgId) {
      const error = new Error('orgId is required for tenant-scoped access');
      error.statusCode = 400;
      throw error;
    }

    const pool = getMysqlPool();
    const connection = await pool.getConnection();
    const client = asPgClient(connection);

    try {
      await connection.beginTransaction();
      const result = await handler(client);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  };

  return next();
}
