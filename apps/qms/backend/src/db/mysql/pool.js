import mysql from 'mysql2/promise';

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
