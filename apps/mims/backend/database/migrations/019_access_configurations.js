'use strict';
// Migration 019 - Enterprise access configurations for tenant/site/group governance.

const ACTIVITY_PRIVILEGES = [
  ['case.create', 'Case Activities', 'Create Case', 'Create MI/AE/PC cases', 0, JSON.stringify(['admin', 'agent'])],
  ['case.update', 'Case Activities', 'Update Case', 'Edit case details and workflow fields', 0, JSON.stringify(['admin', 'agent'])],
  ['case.review', 'Case Activities', 'Review Case', 'Perform case review activities', 0, JSON.stringify(['admin', 'reviewer'])],
  ['case.close', 'Case Activities', 'Close Case', 'Close completed cases', 1, JSON.stringify(['admin', 'reviewer'])],
  ['case.reopen', 'Manager Activities', 'Reopen Case', 'Reopen closed cases', 1, JSON.stringify(['admin'])],
  ['case.assign', 'Manager Activities', 'Assign Case', 'Assign or reassign case ownership', 0, JSON.stringify(['admin'])],
  ['case.bulk_action', 'Manager Activities', 'Bulk Case Action', 'Run bulk case actions', 1, JSON.stringify(['admin'])],
  ['case.export', 'Data Controls', 'Export Cases', 'Export case listings and details', 1, JSON.stringify(['admin', 'reviewer'])],
  ['case.unmask', 'Data Controls', 'Unmask Sensitive Data', 'View masked requester/reporter data', 1, JSON.stringify(['admin'])],
  ['transmission.create', 'Transmissions', 'Create Transmission', 'Create outbound transmissions', 1, JSON.stringify(['admin', 'agent'])],
  ['transmission.approve', 'Transmissions', 'Approve Transmission', 'Approve controlled transmissions', 1, JSON.stringify(['admin', 'reviewer'])],
  ['content.author', 'Content Management', 'Author Content', 'Author content records', 0, JSON.stringify(['admin', 'content_manager'])],
  ['content.review', 'Content Management', 'Review Content', 'Review content before approval', 0, JSON.stringify(['admin', 'reviewer'])],
  ['content.approve', 'Content Management', 'Approve Content', 'Approve controlled content', 1, JSON.stringify(['admin'])],
  ['content.publish', 'Content Management', 'Publish Content', 'Publish controlled content', 1, JSON.stringify(['admin'])],
  ['reports.view', 'Reports', 'View Reports', 'View assigned reports and dashboards', 0, JSON.stringify(['admin', 'reviewer'])],
  ['reports.manage', 'Reports', 'Manage Reports', 'Create and manage report definitions', 1, JSON.stringify(['admin'])],
  ['reports.export', 'Reports', 'Export Reports', 'Export report outputs', 1, JSON.stringify(['admin', 'reviewer'])],
  ['admin.access.manage', 'Access Administration', 'Manage Access', 'Manage users, sites, groups, reports, and policies', 1, JSON.stringify(['admin'])],
  ['admin.access.approve', 'Access Administration', 'Approve Access Changes', 'Approve sensitive access requests', 1, JSON.stringify(['admin'])],
];

async function up(conn) {
  const dbName = conn.config?.database || process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

  async function columnExists(tableName, columnName) {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
      [dbName, tableName, columnName]
    );
    return rows.length > 0;
  }

  async function addColumn(tableName, columnName, definitionSql) {
    if (!await columnExists(tableName, columnName)) {
      await conn.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    }
  }

  await addColumn('security_groups', 'group_type', "VARCHAR(50) NOT NULL DEFAULT 'medinquirer_user'");
  await addColumn('security_groups', 'template_key', 'VARCHAR(100) NULL');
  await addColumn('security_groups', 'is_template', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('security_groups', 'applies_to_mobile', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('security_groups', 'requires_approval', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('security_groups', 'updated_by', 'INT NULL');

  await addColumn('user_org_access', 'site_access_scope', "VARCHAR(30) NOT NULL DEFAULT 'primary'");
  await addColumn('user_org_access', 'advanced_permissions', 'JSON NULL');
  await addColumn('user_org_access', 'access_reason', 'VARCHAR(500) NULL');
  await addColumn('user_org_access', 'approved_by', 'INT NULL');
  await addColumn('user_org_access', 'approved_at', 'DATETIME NULL');

  await addColumn('site_config', 'allowed_countries', 'JSON NULL');
  await addColumn('site_config', 'allowed_product_family_ids', 'JSON NULL');
  await addColumn('site_config', 'allowed_product_ids', 'JSON NULL');
  await addColumn('site_config', 'default_country_for_case', 'VARCHAR(100) NULL');
  await addColumn('site_config', 'contact_integration_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('site_config', 'dppr_disabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('site_config', 'right_to_forget_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('site_config', 'right_to_forget_countries', 'JSON NULL');

  try {
    await conn.execute("ALTER TABLE site_email_purpose MODIFY COLUMN purpose ENUM('response','transmissions','correspondence','fax','cdr') NOT NULL");
  } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_activity_privileges (
      id                    INT NOT NULL AUTO_INCREMENT,
      org_id                INT NULL,
      privilege_key          VARCHAR(120) NOT NULL,
      category              VARCHAR(100) NOT NULL,
      label                 VARCHAR(255) NOT NULL,
      description           TEXT,
      is_sensitive          TINYINT(1) NOT NULL DEFAULT 0,
      default_allowed_roles JSON NULL,
      is_active             TINYINT(1) NOT NULL DEFAULT 1,
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_access_privilege_org_key (org_id, privilege_key),
      KEY idx_access_privilege_key (privilege_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_group_privileges (
      id            INT NOT NULL AUTO_INCREMENT,
      group_id      INT NOT NULL,
      privilege_key VARCHAR(120) NOT NULL,
      is_allowed    TINYINT(1) NOT NULL DEFAULT 1,
      updated_by    INT NULL,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_access_group_privilege (group_id, privilege_key),
      KEY idx_access_group_privilege_key (privilege_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_site_access (
      id           INT NOT NULL AUTO_INCREMENT,
      org_id       INT NOT NULL,
      user_id      INT NOT NULL,
      site_id      INT NOT NULL,
      access_level VARCHAR(30) NOT NULL DEFAULT 'full',
      is_primary   TINYINT(1) NOT NULL DEFAULT 0,
      is_active    TINYINT(1) NOT NULL DEFAULT 1,
      created_by   INT NULL,
      updated_by   INT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_site_access (org_id, user_id, site_id),
      KEY idx_user_site_access_user (user_id),
      KEY idx_user_site_access_site (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_access_rules (
      id          INT NOT NULL AUTO_INCREMENT,
      org_id      INT NOT NULL,
      site_id     INT NOT NULL,
      rule_type   VARCHAR(50) NOT NULL,
      rule_value  VARCHAR(255) NOT NULL,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      metadata    JSON NULL,
      created_by  INT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_site_access_rule (site_id, rule_type, rule_value),
      KEY idx_site_access_rules_org (org_id, rule_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_change_requests (
      id                   INT NOT NULL AUTO_INCREMENT,
      org_id               INT NOT NULL,
      requested_by          INT NOT NULL,
      target_type           VARCHAR(50) NOT NULL,
      target_id             INT NULL,
      action                VARCHAR(100) NOT NULL,
      payload_json          JSON NULL,
      reason                TEXT NULL,
      status                VARCHAR(20) NOT NULL DEFAULT 'pending',
      e_signature_required  TINYINT(1) NOT NULL DEFAULT 0,
      reviewed_by           INT NULL,
      reviewed_at           DATETIME NULL,
      review_note           TEXT NULL,
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_access_requests_org_status (org_id, status),
      KEY idx_access_requests_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_review_snapshots (
      id             INT NOT NULL AUTO_INCREMENT,
      org_id         INT NOT NULL,
      snapshot_name  VARCHAR(255) NOT NULL,
      snapshot_json  JSON NOT NULL,
      created_by     INT NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_access_review_snapshots_org (org_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_sod_rules (
      id                   INT NOT NULL AUTO_INCREMENT,
      org_id               INT NULL,
      rule_key             VARCHAR(120) NOT NULL,
      first_privilege      VARCHAR(120) NOT NULL,
      conflicting_privilege VARCHAR(120) NOT NULL,
      severity             VARCHAR(20) NOT NULL DEFAULT 'warning',
      is_active            TINYINT(1) NOT NULL DEFAULT 1,
      created_by           INT NULL,
      created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_access_sod_rule (org_id, rule_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS access_sso_configs (
      id                      INT NOT NULL AUTO_INCREMENT,
      org_id                  INT NOT NULL,
      provider_type           VARCHAR(30) NOT NULL DEFAULT 'oidc',
      entity_id               VARCHAR(500) NULL,
      sso_url                 VARCHAR(1000) NULL,
      certificate_fingerprint VARCHAR(255) NULL,
      local_login_allowed     TINYINT(1) NOT NULL DEFAULT 1,
      is_active               TINYINT(1) NOT NULL DEFAULT 0,
      updated_by              INT NULL,
      created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_access_sso_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const item of ACTIVITY_PRIVILEGES) {
    await conn.execute(
      `INSERT IGNORE INTO access_activity_privileges
         (org_id, privilege_key, category, label, description, is_sensitive, default_allowed_roles)
       VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
      item
    );
  }

  for (const sql of [
    `INSERT IGNORE INTO access_sod_rules (org_id, rule_key, first_privilege, conflicting_privilege, severity)
     VALUES (NULL, 'author_cannot_approve_content', 'content.author', 'content.approve', 'critical')`,
    `INSERT IGNORE INTO access_sod_rules (org_id, rule_key, first_privilege, conflicting_privilege, severity)
     VALUES (NULL, 'requester_cannot_approve_access', 'admin.access.manage', 'admin.access.approve', 'warning')`,
    `INSERT IGNORE INTO access_sod_rules (org_id, rule_key, first_privilege, conflicting_privilege, severity)
     VALUES (NULL, 'case_agent_cannot_close_without_review', 'case.update', 'case.close', 'warning')`,
  ]) { try { await conn.execute(sql); } catch (_) {} }
}

module.exports = { up };
