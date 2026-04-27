'use strict';
// Migration 015 — AI QA Engine: org_qa_rules, qa_knowledge_base, ai_qa_responses, qa_reports, qa_report_items

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS org_qa_rules (
      id             INT           NOT NULL AUTO_INCREMENT,
      org_id         INT           NOT NULL,
      rule_key       VARCHAR(100)  NOT NULL,
      rule_name      VARCHAR(255)  NOT NULL,
      rule_type      ENUM('field_check','narrative_check','timeliness_check','regulatory_flag','duplicate_signal') NOT NULL,
      case_types     VARCHAR(50)   NOT NULL DEFAULT 'ALL',
      target_field   VARCHAR(100)  NULL,
      condition_json JSON          NOT NULL,
      severity       ENUM('warning','critical') NOT NULL DEFAULT 'warning',
      is_active      TINYINT(1)    NOT NULL DEFAULT 1,
      created_by     INT           NULL,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_org_rule_key (org_id, rule_key),
      KEY idx_qa_rules_org (org_id),
      KEY idx_qa_rules_active (org_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS qa_knowledge_base (
      id             INT           NOT NULL AUTO_INCREMENT,
      kb_key         VARCHAR(100)  NOT NULL UNIQUE,
      category       VARCHAR(100)  NOT NULL,
      case_type      VARCHAR(10)   NULL,
      title          VARCHAR(255)  NOT NULL,
      description    TEXT          NOT NULL,
      rule_type      VARCHAR(50)   NOT NULL,
      target_field   VARCHAR(100)  NULL,
      severity       ENUM('warning','critical') NOT NULL DEFAULT 'warning',
      condition_json JSON          NOT NULL,
      flag_message   TEXT          NOT NULL,
      regulatory_ref VARCHAR(255)  NULL,
      is_seed        TINYINT(1)    NOT NULL DEFAULT 1,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_kb_category (category),
      KEY idx_kb_case_type (case_type),
      KEY idx_kb_rule_type (rule_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ai_qa_responses (
      id               INT           NOT NULL AUTO_INCREMENT,
      case_id          INT           NOT NULL,
      org_id           INT           NOT NULL,
      evaluation_type  ENUM('realtime','retrospective') NOT NULL DEFAULT 'realtime',
      triggered_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      triggered_by     INT           NULL,
      ai_model_version VARCHAR(50)   NOT NULL DEFAULT 'rules-engine-v1',
      input_snapshot   JSON          NOT NULL,
      output_response  JSON          NOT NULL,
      flags_count      INT           NOT NULL DEFAULT 0,
      critical_count   INT           NOT NULL DEFAULT 0,
      warning_count    INT           NOT NULL DEFAULT 0,
      quality_score    INT           NOT NULL DEFAULT 100,
      override_by      INT           NULL,
      override_reason  TEXT          NULL,
      override_at      DATETIME      NULL,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_qa_resp_case (case_id),
      KEY idx_qa_resp_org (org_id),
      KEY idx_qa_resp_type (evaluation_type),
      KEY idx_qa_resp_triggered (triggered_at),
      KEY idx_qa_resp_override (override_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS qa_reports (
      id                INT           NOT NULL AUTO_INCREMENT,
      org_id            INT           NOT NULL,
      created_by        INT           NOT NULL,
      report_name       VARCHAR(255)  NOT NULL,
      date_range_start  DATE          NULL,
      date_range_end    DATE          NULL,
      case_type_filter  VARCHAR(20)   NULL,
      case_count        INT           NOT NULL DEFAULT 0,
      flagged_count     INT           NOT NULL DEFAULT 0,
      avg_quality_score DECIMAL(5,2)  NULL,
      status            ENUM('queued','processing','complete','failed') NOT NULL DEFAULT 'queued',
      report_data       JSON          NULL,
      error_message     TEXT          NULL,
      started_at        DATETIME      NULL,
      completed_at      DATETIME      NULL,
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_qa_reports_org (org_id),
      KEY idx_qa_reports_status (status),
      KEY idx_qa_reports_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS qa_report_items (
      id                INT           NOT NULL AUTO_INCREMENT,
      report_id         INT           NOT NULL,
      case_id           INT           NOT NULL,
      ai_qa_response_id INT           NULL,
      quality_score     INT           NOT NULL DEFAULT 100,
      flags_count       INT           NOT NULL DEFAULT 0,
      critical_count    INT           NOT NULL DEFAULT 0,
      warning_count     INT           NOT NULL DEFAULT 0,
      flags_json        JSON          NULL,
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_qa_items_report (report_id),
      KEY idx_qa_items_case (case_id),
      KEY idx_qa_items_response (ai_qa_response_id),
      KEY idx_qa_items_score (quality_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
