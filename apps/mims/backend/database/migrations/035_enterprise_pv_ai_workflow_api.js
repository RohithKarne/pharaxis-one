'use strict';
// Migration 035 — Enterprise PV, AI assistant, workflow engine, public API, compliance hardening.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS icsr_reports (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      case_id INT NOT NULL,
      sender_safety_report_id VARCHAR(80) NULL,
      receiver_id ENUM('FDA','EMA','PMDA','MHRA') NOT NULL DEFAULT 'FDA',
      receive_date DATE NULL,
      primary_source_country VARCHAR(10) NULL,
      report_type ENUM('expedited','periodic','solicited','spontaneous') NOT NULL DEFAULT 'spontaneous',
      seriousness_classification JSON NULL,
      causality_per_drug JSON NULL,
      narrative LONGTEXT NULL,
      status ENUM('draft','validated','submitted','acknowledged','rejected','superseded') NOT NULL DEFAULT 'draft',
      submission_count INT NOT NULL DEFAULT 0,
      last_submitted_at DATETIME NULL,
      last_ack_at DATETIME NULL,
      parent_report_id INT NULL,
      locked TINYINT(1) NOT NULL DEFAULT 0,
      locked_at DATETIME NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_icsr_sender (org_id, sender_safety_report_id),
      KEY idx_icsr_case (case_id),
      KEY idx_icsr_status (org_id, status, created_at),
      KEY idx_icsr_parent (parent_report_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS icsr_drugs (
      id INT NOT NULL AUTO_INCREMENT,
      icsr_id INT NOT NULL,
      drug_role ENUM('suspect','concomitant','interacting','treatment','past') NOT NULL DEFAULT 'suspect',
      active_substance VARCHAR(255) NULL,
      medicinal_product_name VARCHAR(255) NULL,
      batch_no VARCHAR(100) NULL,
      dose_amount VARCHAR(100) NULL,
      dose_unit VARCHAR(50) NULL,
      dose_form VARCHAR(100) NULL,
      route_of_admin VARCHAR(100) NULL,
      indication VARCHAR(255) NULL,
      indication_meddra VARCHAR(80) NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      action_taken VARCHAR(100) NULL,
      dechallenge ENUM('y','n','u','na') NULL,
      rechallenge ENUM('y','n','u','na') NULL,
      reaction_recurred ENUM('y','n','u','na') NULL,
      PRIMARY KEY (id),
      KEY idx_icsr_drugs_report (icsr_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS icsr_reactions (
      id INT NOT NULL AUTO_INCREMENT,
      icsr_id INT NOT NULL,
      meddra_pt VARCHAR(80) NULL,
      meddra_pt_name VARCHAR(255) NULL,
      meddra_llt VARCHAR(80) NULL,
      meddra_soc VARCHAR(255) NULL,
      onset_date DATE NULL,
      end_date DATE NULL,
      outcome VARCHAR(100) NULL,
      intensity VARCHAR(100) NULL,
      term_highlighted ENUM('y','n') NULL DEFAULT 'n',
      PRIMARY KEY (id),
      KEY idx_icsr_reactions_report (icsr_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS icsr_test_results (
      id INT NOT NULL AUTO_INCREMENT,
      icsr_id INT NOT NULL,
      test_name VARCHAR(255) NULL,
      test_date DATE NULL,
      result_text VARCHAR(500) NULL,
      result_unstructured TEXT NULL,
      test_normal_low VARCHAR(100) NULL,
      test_normal_high VARCHAR(100) NULL,
      PRIMARY KEY (id),
      KEY idx_icsr_tests_report (icsr_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS icsr_medical_history (
      id INT NOT NULL AUTO_INCREMENT,
      icsr_id INT NOT NULL,
      structure ENUM('disease','procedure','allergy') NOT NULL DEFAULT 'disease',
      start_date DATE NULL,
      end_date DATE NULL,
      comments TEXT NULL,
      meddra_code VARCHAR(80) NULL,
      PRIMARY KEY (id),
      KEY idx_icsr_history_report (icsr_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS icsr_e2b_acknowledgements (
      id INT NOT NULL AUTO_INCREMENT,
      icsr_id INT NOT NULL,
      ack_xml LONGTEXT NULL,
      ack_status VARCHAR(50) NULL,
      ack_received_at DATETIME NULL,
      ack_validation_errors JSON NULL,
      gateway VARCHAR(50) NULL,
      PRIMARY KEY (id),
      KEY idx_icsr_ack_report (icsr_id, ack_received_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const table of ['dictionary_meddra','dictionary_whodrug']) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(80) NOT NULL,
        term VARCHAR(500) NOT NULL,
        level VARCHAR(50) NULL,
        parent_id INT NULL,
        version VARCHAR(50) NULL,
        PRIMARY KEY (id),
        KEY idx_${table}_code (code),
        KEY idx_${table}_term (term(120))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ai_provider_configs (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      provider_key ENUM('openai','anthropic','azure_openai','on_prem') NOT NULL DEFAULT 'openai',
      api_endpoint VARCHAR(500) NULL,
      api_key_encrypted TEXT NULL,
      model_name VARCHAR(120) NULL,
      allow_phi_external TINYINT(1) NOT NULL DEFAULT 0,
      block_on_quality_fail TINYINT(1) NOT NULL DEFAULT 0,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      daily_token_budget INT NOT NULL DEFAULT 100000,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ai_provider_org (org_id, provider_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ai_embeddings (
      id INT NOT NULL AUTO_INCREMENT,
      source_type ENUM('case','document','faq','response_template') NOT NULL,
      source_id INT NOT NULL,
      org_id INT NOT NULL,
      content_text TEXT NULL,
      embedding JSON NULL,
      model VARCHAR(50) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ai_embeddings_org_source (org_id, source_type, source_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id INT NOT NULL AUTO_INCREMENT,
      case_id INT NOT NULL,
      suggestion_type ENUM('classification','extraction','response','summary','similar_cases') NOT NULL,
      prompt_hash VARCHAR(80) NULL,
      suggestion_payload JSON NULL,
      accepted TINYINT(1) NULL,
      accepted_by INT NULL,
      accepted_at DATETIME NULL,
      model VARCHAR(120) NULL,
      tokens_in INT NOT NULL DEFAULT 0,
      tokens_out INT NOT NULL DEFAULT 0,
      latency_ms INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ai_suggestions_case (case_id, suggestion_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ai_quality_checks (
      id INT NOT NULL AUTO_INCREMENT,
      case_id INT NOT NULL,
      check_name VARCHAR(120) NOT NULL,
      severity ENUM('info','warn','block') NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      resolved TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ai_quality_case (case_id, resolved, severity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try { await conn.execute(`ALTER TABLE inquiries ADD COLUMN ai_suggested_type VARCHAR(20) NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE inquiries ADD COLUMN ai_suggested_payload JSON NULL`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_definitions (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      scope ENUM('case','transmission','document','other') NOT NULL DEFAULT 'case',
      graph_json JSON NOT NULL,
      version INT NOT NULL DEFAULT 1,
      status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
      published_at DATETIME NULL,
      published_by INT NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_workflow_defs_org (org_id, scope, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_instances (
      id INT NOT NULL AUTO_INCREMENT,
      definition_id INT NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT NOT NULL,
      current_node_id VARCHAR(120) NULL,
      status ENUM('running','completed','cancelled','error') NOT NULL DEFAULT 'running',
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      context_json JSON NULL,
      PRIMARY KEY (id),
      KEY idx_workflow_instances_entity (entity_type, entity_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id INT NOT NULL AUTO_INCREMENT,
      instance_id INT NOT NULL,
      node_id VARCHAR(120) NULL,
      action ENUM('entered','exited','timer_fired','condition_evaluated','error') NOT NULL,
      details JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_workflow_exec_instance (instance_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_sla_timers (
      id INT NOT NULL AUTO_INCREMENT,
      instance_id INT NOT NULL,
      node_id VARCHAR(120) NOT NULL,
      deadline DATETIME NOT NULL,
      fired TINYINT(1) NOT NULL DEFAULT 0,
      action_on_breach JSON NULL,
      PRIMARY KEY (id),
      KEY idx_workflow_sla_due (fired, deadline)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS api_clients (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      client_id VARCHAR(64) NOT NULL,
      client_secret_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      scopes JSON NOT NULL,
      rate_limit_per_min INT NOT NULL DEFAULT 60,
      status ENUM('active','revoked') NOT NULL DEFAULT 'active',
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_api_client_id (client_id),
      KEY idx_api_clients_org (org_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id INT NOT NULL AUTO_INCREMENT,
      client_id INT NOT NULL,
      access_token_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_api_token_hash (access_token_hash),
      KEY idx_api_tokens_client (client_id, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS api_call_log (
      id INT NOT NULL AUTO_INCREMENT,
      client_id INT NULL,
      method VARCHAR(12) NOT NULL,
      path VARCHAR(500) NOT NULL,
      status_code INT NULL,
      duration_ms INT NULL,
      request_id VARCHAR(80) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_api_call_client_created (client_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS webhook_subscriptions (
      id INT NOT NULL AUTO_INCREMENT,
      client_id INT NOT NULL,
      url VARCHAR(1000) NOT NULL,
      events JSON NOT NULL,
      signing_secret VARCHAR(255) NOT NULL,
      status ENUM('active','paused','revoked') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_webhook_client (client_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INT NOT NULL AUTO_INCREMENT,
      subscription_id INT NOT NULL,
      event VARCHAR(120) NOT NULL,
      payload JSON NOT NULL,
      response_status INT NULL,
      response_body LONGTEXT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      next_retry_at DATETIME NULL,
      delivered_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_webhook_delivery_sub (subscription_id, id),
      KEY idx_webhook_delivery_retry (next_retry_at, delivered_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS e_sign_manifests (
      id INT NOT NULL AUTO_INCREMENT,
      manifest_id VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id INT NOT NULL,
      signer_user_id INT NOT NULL,
      signer_email VARCHAR(255) NULL,
      signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      intent_string VARCHAR(500) NOT NULL,
      content_hash VARCHAR(128) NOT NULL,
      signature_value LONGTEXT NOT NULL,
      public_key_fingerprint VARCHAR(128) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_esign_manifest (manifest_id),
      KEY idx_esign_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try { await conn.execute(`ALTER TABLE organisations ADD COLUMN data_region ENUM('us-east','us-west','eu-west','ap-south') NOT NULL DEFAULT 'us-east'`); } catch (_) {}
}

async function down(conn) {
  const tables = [
    'e_sign_manifests','webhook_deliveries','webhook_subscriptions','api_call_log','api_tokens','api_clients',
    'workflow_sla_timers','workflow_executions','workflow_instances','workflow_definitions',
    'ai_quality_checks','ai_suggestions','ai_embeddings','ai_provider_configs',
    'dictionary_whodrug','dictionary_meddra','icsr_e2b_acknowledgements','icsr_medical_history','icsr_test_results','icsr_reactions','icsr_drugs','icsr_reports',
  ];
  for (const table of tables) { try { await conn.execute(`DROP TABLE IF EXISTS ${table}`); } catch (_) {} }
  try { await conn.execute(`ALTER TABLE organisations DROP COLUMN data_region`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE inquiries DROP COLUMN ai_suggested_payload`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE inquiries DROP COLUMN ai_suggested_type`); } catch (_) {}
}

module.exports = { up, down };
