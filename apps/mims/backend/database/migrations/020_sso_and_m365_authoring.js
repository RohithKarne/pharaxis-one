'use strict';

async function up(conn) {
  const MYSQL_DATABASE = conn.config?.database || process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

  async function ensureColumn(tableName, columnName, definitionSql) {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME
         FROM information_schema.columns
        WHERE table_schema = ?
          AND table_name = ?
          AND column_name = ?
        LIMIT 1`,
      [MYSQL_DATABASE, tableName, columnName]
    );
    if (!rows.length) {
      await conn.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    }
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_external_identities (
      id                   INT NOT NULL AUTO_INCREMENT,
      user_id              INT NOT NULL,
      provider_key         VARCHAR(30) NOT NULL,
      provider_subject     VARCHAR(255) NOT NULL,
      provider_tenant_id   VARCHAR(255) NULL,
      provider_email       VARCHAR(255) NULL,
      provider_name        VARCHAR(255) NULL,
      profile_json         JSON NULL,
      linked_by            INT NULL,
      created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_external_identity_provider_subject (provider_key, provider_subject),
      UNIQUE KEY uq_external_identity_user_provider (user_id, provider_key),
      KEY idx_external_identity_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn('cm_documents', 'authoring_source', "VARCHAR(30) NOT NULL DEFAULT 'upload'");
  await ensureColumn('cm_documents', 'external_provider', 'VARCHAR(30) NULL');
  await ensureColumn('cm_documents', 'external_document_url', 'TEXT NULL');
  await ensureColumn('cm_documents', 'external_share_url', 'TEXT NULL');
  await ensureColumn('cm_documents', 'external_document_id', 'VARCHAR(255) NULL');
  await ensureColumn('cm_documents', 'external_drive_id', 'VARCHAR(255) NULL');
  await ensureColumn('cm_documents', 'external_account_email', 'VARCHAR(255) NULL');
  await ensureColumn('cm_documents', 'external_api_endpoint', 'VARCHAR(500) NULL');
}

module.exports = { up };
