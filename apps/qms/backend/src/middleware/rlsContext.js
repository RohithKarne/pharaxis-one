import { getDbPool } from '../db/pool.js';

export function withRlsContext(req, _res, next) {
  req.withRlsTransaction = async (handler) => {
    const orgId = req.authContext?.orgId;
    const isSuperadmin = req.authContext?.isSuperadmin ? 'true' : 'false';
    if (!orgId) {
      const error = new Error('orgId is required for tenant-scoped access');
      error.statusCode = 400;
      throw error;
    }

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
      await client.query("SELECT set_config('app.is_superadmin', $1, true)", [isSuperadmin]);

      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  return next();
}
