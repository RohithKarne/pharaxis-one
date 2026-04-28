'use strict';
// Migration 013 — Content Intelligence: policy graph, evidence chain, contradiction radar,
//                digital twin, adaptive risk

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS policy_nodes (
      id         INT NOT NULL AUTO_INCREMENT,
      org_id     INT NOT NULL,
      node_scope ENUM('actor','content','context') NOT NULL,
      node_key   VARCHAR(120) NOT NULL,
      match_json JSON,
      is_active  TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT,
      updated_by INT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_policy_node_scope_key (org_id, node_scope, node_key),
      KEY idx_policy_nodes_scope_active (org_id, node_scope, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS policy_edges (
      id             INT NOT NULL AUTO_INCREMENT,
      org_id         INT NOT NULL,
      from_node_id   INT NOT NULL,
      to_node_id     INT NOT NULL,
      relation_type  VARCHAR(60) NOT NULL DEFAULT 'applies_to',
      effect         ENUM('allow','deny') NOT NULL DEFAULT 'allow',
      priority       INT NOT NULL DEFAULT 100,
      condition_json JSON,
      is_active      TINYINT(1) NOT NULL DEFAULT 1,
      created_by     INT,
      updated_by     INT,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_policy_edges_scope_active (org_id, is_active),
      KEY idx_policy_edges_nodes (org_id, from_node_id, to_node_id),
      KEY idx_policy_edges_priority (org_id, priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS policy_decision_logs (
      id               INT NOT NULL AUTO_INCREMENT,
      org_id           INT NOT NULL,
      actor_user_id    INT,
      action           VARCHAR(60) NOT NULL DEFAULT 'view',
      content_type     VARCHAR(60),
      content_id       INT,
      result           ENUM('allow','deny','error') NOT NULL DEFAULT 'deny',
      matched_edge_ids JSON,
      reason_json      JSON,
      request_json     JSON,
      latency_ms       INT,
      evaluated_by     INT,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_policy_logs_org_created (org_id, created_at),
      KEY idx_policy_logs_result (org_id, result, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS evidence_chain_rules (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      rule_name     VARCHAR(255) NOT NULL,
      applies_to    ENUM('all','document','faq','template','module') NOT NULL DEFAULT 'all',
      mode_scope    ENUM('publish','response','release','both') NOT NULL DEFAULT 'both',
      check_type    VARCHAR(60) NOT NULL,
      check_config  JSON,
      severity      ENUM('block','warning') NOT NULL DEFAULT 'block',
      priority      INT NOT NULL DEFAULT 100,
      is_active     TINYINT(1) NOT NULL DEFAULT 1,
      created_by    INT,
      updated_by    INT,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_evidence_rules_scope (org_id, applies_to, mode_scope, is_active),
      KEY idx_evidence_rules_priority (org_id, priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS evidence_chain_runs (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      content_type  ENUM('document','faq','template','module') NOT NULL,
      content_id    INT NOT NULL,
      mode          ENUM('publish','response','release') NOT NULL DEFAULT 'publish',
      result        ENUM('allow','block') NOT NULL DEFAULT 'block',
      risk_score    INT NOT NULL DEFAULT 0,
      blockers_json JSON,
      warnings_json JSON,
      evidence_json JSON,
      request_json  JSON,
      requested_by  INT,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_evidence_runs_scope (org_id, content_type, content_id, created_at),
      KEY idx_evidence_runs_result (org_id, result, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS contradiction_radar_findings (
      id                 INT NOT NULL AUTO_INCREMENT,
      org_id             INT NOT NULL,
      left_source_type   ENUM('document','faq','template','module') NOT NULL,
      left_source_id     INT NOT NULL,
      right_source_type  ENUM('document','faq','template','module') NOT NULL,
      right_source_id    INT NOT NULL,
      contradiction_type VARCHAR(60) NOT NULL,
      anchor_key         VARCHAR(190) NOT NULL,
      overlap_score      DECIMAL(5,2) NOT NULL DEFAULT 0,
      confidence_score   DECIMAL(5,2) NOT NULL DEFAULT 0,
      left_snippet       TEXT,
      right_snippet      TEXT,
      rationale          TEXT,
      status             ENUM('open','acknowledged','dismissed','resolved') NOT NULL DEFAULT 'open',
      detected_by        INT,
      detected_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_by        INT,
      resolved_at        DATETIME,
      resolution_note    TEXT,
      PRIMARY KEY (id),
      UNIQUE KEY uq_contradiction_anchor (org_id, left_source_type, left_source_id, right_source_type, right_source_id, contradiction_type, anchor_key),
      KEY idx_contradiction_status (org_id, status, detected_at),
      KEY idx_contradiction_left (org_id, left_source_type, left_source_id),
      KEY idx_contradiction_right (org_id, right_source_type, right_source_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS digital_twin_runs (
      id               INT NOT NULL AUTO_INCREMENT,
      org_id           INT NOT NULL,
      scenario_name    VARCHAR(255) NOT NULL,
      request_json     JSON,
      metrics_json     JSON,
      risk_score       INT NOT NULL DEFAULT 0,
      risk_band        ENUM('low','medium','high') NOT NULL DEFAULT 'low',
      recommended_gate ENUM('go','review','hold') NOT NULL DEFAULT 'review',
      simulation_ms    INT NOT NULL DEFAULT 0,
      simulated_by     INT,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_digital_twin_scope (org_id, created_at),
      KEY idx_digital_twin_risk (org_id, risk_band, risk_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS adaptive_risk_rules (
      id              INT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      rule_name       VARCHAR(255) NOT NULL,
      min_score       INT NOT NULL DEFAULT 0,
      max_score       INT NOT NULL DEFAULT 100,
      decision_action ENUM('auto_approve','manager_review','medical_review','compliance_escalation','block_release') NOT NULL,
      escalation_role VARCHAR(120) NOT NULL DEFAULT 'manager',
      sla_hours       INT NOT NULL DEFAULT 12,
      priority        INT NOT NULL DEFAULT 100,
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_by      INT,
      updated_by      INT,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_adaptive_risk_rules_scope (org_id, is_active, priority),
      KEY idx_adaptive_risk_rules_band (org_id, min_score, max_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS adaptive_risk_decisions (
      id              INT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      context_type    VARCHAR(60) NOT NULL DEFAULT 'release',
      context_id      INT,
      context_json    JSON,
      computed_score  INT NOT NULL DEFAULT 0,
      decision_action ENUM('auto_approve','manager_review','medical_review','compliance_escalation','block_release') NOT NULL,
      escalation_role VARCHAR(120) NOT NULL DEFAULT 'manager',
      sla_hours       INT NOT NULL DEFAULT 12,
      matched_rule_id INT,
      decision_reason TEXT,
      decided_by      INT,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_adaptive_risk_decisions_scope (org_id, created_at),
      KEY idx_adaptive_risk_decisions_action (org_id, decision_action, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
