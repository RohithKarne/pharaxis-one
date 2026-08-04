import mysql from 'mysql2/promise';
import { asPgClient } from './pgCompat.js';

/**
 * MySQL connection pool for QMS.
 *
 * Mirrors the shape of src/db/pool.js (getDbPool) so the Phase 2 driver swap is
 * a change of import, not a change of call sites.
 *
 * Connection settings follow the house pattern already used by CP Portal, MIMS,
 * and Vault (see apps/cp-portal/backend/database/db.js):
 *   - timezone 'Z' so DATETIME values are read and written as UTC and the API
 *     emits ISO-8601 with a trailing Z
 *   - every pooled connection pins its session time zone to +00:00, so
 *     CURRENT_TIMESTAMP does not follow the server's local zone (this dev host
 *     runs on IST)
 */

let pool;

export function getMysqlPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'devuser',
      password: process.env.MYSQL_PASSWORD || 'devpass',
      database: process.env.MYSQL_DATABASE || 'pharaxis_qms_dev',
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z'
    });

    pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }

  return pool;
}

/**
 * Check out a connection already wrapped in the pg-compatible interface.
 *
 * The auth routes (src/routes/auth.js) run BEFORE withRlsTransaction exists —
 * login has no org context yet — so they take their own connection with
 * `const client = await pool.connect()`. This is the MySQL counterpart, so those
 * call sites change by one line each rather than being restructured, and they
 * keep using `const { rows } = await client.query(sql, [$1, ...])` unchanged.
 *
 * The returned object exposes `release()`, so the existing try/finally blocks
 * still return the connection to the pool correctly.
 */
export async function getMysqlClient() {
  const connection = await getMysqlPool().getConnection();
  return asPgClient(connection);
}
