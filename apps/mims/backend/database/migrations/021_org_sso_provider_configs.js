'use strict';

async function up(conn) {
  const dbName = conn.config?.database || process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

  async function columnExists(tableName, columnName) {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME
         FROM information_schema.columns
        WHERE table_schema = ?
          AND table_name = ?
          AND column_name = ?
        LIMIT 1`,
      [dbName, tableName, columnName]
    );
    return rows.length > 0;
  }

  async function addColumn(tableName, columnName, definitionSql) {
    if (!await columnExists(tableName, columnName)) {
      await conn.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    }
  }

  await addColumn('organisations', 'login_mode', "VARCHAR(30) NOT NULL DEFAULT 'local_only'");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_sso_provider_configs (
      id                      INT NOT NULL AUTO_INCREMENT,
      org_id                  INT NOT NULL,
      provider_key            VARCHAR(30) NOT NULL,
      provider_type           VARCHAR(30) NOT NULL DEFAULT 'oidc',
      client_id               VARCHAR(500) NULL,
      client_secret_encrypted TEXT NULL,
      tenant_id               VARCHAR(255) NULL,
      allowed_domains         JSON NULL,
      is_active               TINYINT(1) NOT NULL DEFAULT 0,
      updated_by              INT NULL,
      created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_access_sso_provider_org (org_id, provider_key),
      KEY idx_access_sso_provider_org (org_id),
      KEY idx_access_sso_provider_key (provider_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(
    `UPDATE organisations
        SET login_mode = CASE
          WHEN COALESCE(two_factor_enabled, 0) = 1 THEN 'local_only'
          ELSE 'local_only'
        END
      WHERE login_mode IS NULL OR login_mode = ''`
  ).catch(() => {});
}

module.exports = { up };
