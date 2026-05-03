'use strict';
// Migration 017 - Reports roadmap maturity: favorites, sharing, versions, governance, analytics

async function addColumn(conn, table, ddl) {
  try { await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); } catch (_) {}
}

async function addIndex(conn, table, ddl) {
  try { await conn.execute(`ALTER TABLE ${table} ADD ${ddl}`); } catch (_) {}
}

async function up(conn) {
  await addColumn(conn, 'report_definitions', "owner_id INT NULL AFTER updated_by");
  await addColumn(conn, 'report_definitions', "lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'published' AFTER visibility_scope");
  await addColumn(conn, 'report_definitions', "draft_json JSON NULL AFTER lifecycle_status");
  await addColumn(conn, 'report_definitions', "sensitivity_level VARCHAR(30) NOT NULL DEFAULT 'standard' AFTER draft_json");
  await addColumn(conn, 'report_definitions', "certified_by INT NULL AFTER sensitivity_level");
  await addColumn(conn, 'report_definitions', "certified_at DATETIME NULL AFTER certified_by");
  await addColumn(conn, 'report_definitions', "certification_expires_at DATETIME NULL AFTER certified_at");
  await addColumn(conn, 'report_definitions', "formula_fields JSON NULL AFTER selected_columns");
  await addIndex(conn, 'report_definitions', "INDEX idx_report_definitions_owner (org_id, owner_id)");
  await addIndex(conn, 'report_definitions', "INDEX idx_report_definitions_governance (org_id, lifecycle_status, sensitivity_level)");

  await addColumn(conn, 'report_dashboards', "owner_id INT NULL AFTER updated_by");
  await addColumn(conn, 'report_dashboards', "lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'published' AFTER visibility_scope");
  await addColumn(conn, 'report_dashboards', "draft_json JSON NULL AFTER lifecycle_status");
  await addColumn(conn, 'report_dashboards', "sensitivity_level VARCHAR(30) NOT NULL DEFAULT 'standard' AFTER draft_json");
  await addColumn(conn, 'report_dashboards', "is_template TINYINT(1) NOT NULL DEFAULT 0 AFTER sensitivity_level");
  await addIndex(conn, 'report_dashboards', "INDEX idx_report_dashboards_owner (org_id, owner_id)");
  await addIndex(conn, 'report_dashboards', "INDEX idx_report_dashboards_governance (org_id, lifecycle_status, sensitivity_level)");

  await addColumn(conn, 'scheduled_export_configs', 'paused_at DATETIME NULL AFTER is_active');
  await addColumn(conn, 'scheduled_export_configs', 'paused_by INT NULL AFTER paused_at');
  await addColumn(conn, 'scheduled_export_configs', "validation_status VARCHAR(30) NULL AFTER paused_by");
  await addColumn(conn, 'scheduled_export_configs', 'validation_errors JSON NULL AFTER validation_status');

  await addColumn(conn, 'report_run_ledger', 'retry_of_run_id INT NULL AFTER run_mode');
  await addColumn(conn, 'report_run_ledger', 'diagnostics_json JSON NULL AFTER error_message');
  await addColumn(conn, 'report_run_ledger', 'duration_ms INT NULL AFTER row_count');
  await addIndex(conn, 'report_run_ledger', 'INDEX idx_report_run_retry (retry_of_run_id)');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_favorites (
      id          INT NOT NULL AUTO_INCREMENT,
      org_id      INT NOT NULL,
      user_id     INT NOT NULL,
      target_type VARCHAR(30) NOT NULL,
      target_id   INT NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_favorite (org_id, user_id, target_type, target_id),
      KEY idx_report_favorites_user (org_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_user_preferences (
      id                   INT NOT NULL AUTO_INCREMENT,
      org_id               INT NOT NULL,
      user_id              INT NOT NULL,
      pinned_dashboard_id  INT NULL,
      default_filters_json JSON NULL,
      created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_user_preferences (org_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_dashboard_shares (
      id           INT NOT NULL AUTO_INCREMENT,
      org_id       INT NOT NULL,
      dashboard_id INT NOT NULL,
      share_type   VARCHAR(30) NOT NULL,
      share_value  VARCHAR(100) NOT NULL,
      created_by   INT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_dashboard_share (org_id, dashboard_id, share_type, share_value),
      KEY idx_report_dashboard_shares_dashboard (dashboard_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_entity_versions (
      id             INT NOT NULL AUTO_INCREMENT,
      org_id         INT NOT NULL,
      entity_type    VARCHAR(30) NOT NULL,
      entity_id      INT NOT NULL,
      version_number INT NOT NULL,
      snapshot_json  JSON NOT NULL,
      change_summary VARCHAR(255) NULL,
      created_by     INT NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_entity_version (org_id, entity_type, entity_id, version_number),
      KEY idx_report_entity_versions_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_dashboard_templates (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,
      template_key  VARCHAR(120) NOT NULL,
      name          VARCHAR(255) NOT NULL,
      description   TEXT NULL,
      layout_json   JSON NULL,
      widgets_json  JSON NULL,
      is_system     TINYINT(1) NOT NULL DEFAULT 0,
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_dashboard_template_key (template_key),
      KEY idx_report_dashboard_templates_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_role_default_dashboards (
      id           INT NOT NULL AUTO_INCREMENT,
      org_id       INT NOT NULL,
      role_key     VARCHAR(50) NOT NULL,
      dashboard_id INT NOT NULL,
      updated_by   INT NULL,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_role_default_dashboard (org_id, role_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_usage_events (
      id          INT NOT NULL AUTO_INCREMENT,
      org_id      INT NOT NULL,
      user_id     INT NULL,
      event_type  VARCHAR(50) NOT NULL,
      target_type VARCHAR(30) NOT NULL,
      target_id   INT NULL,
      metadata    JSON NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_report_usage_org_event (org_id, event_type),
      KEY idx_report_usage_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_delivery_rules (
      id                INT NOT NULL AUTO_INCREMENT,
      org_id            INT NOT NULL,
      rule_name         VARCHAR(255) NOT NULL,
      sensitivity_level VARCHAR(30) NOT NULL DEFAULT 'standard',
      allowed_domains   JSON NULL,
      blocked_domains   JSON NULL,
      max_frequency     VARCHAR(20) NULL,
      is_active         TINYINT(1) NOT NULL DEFAULT 1,
      created_by        INT NULL,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_report_delivery_rules_org (org_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_anomaly_flags (
      id           INT NOT NULL AUTO_INCREMENT,
      org_id       INT NOT NULL,
      run_id       INT NULL,
      target_type  VARCHAR(30) NOT NULL,
      target_id    INT NULL,
      anomaly_type VARCHAR(50) NOT NULL,
      severity     VARCHAR(20) NOT NULL DEFAULT 'warning',
      message      TEXT NOT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_report_anomaly_org (org_id, created_at),
      KEY idx_report_anomaly_run (run_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
