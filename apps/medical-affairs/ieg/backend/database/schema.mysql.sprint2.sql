CREATE TABLE IF NOT EXISTS ieg_eap_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(191) NOT NULL UNIQUE,
  external_user_id BIGINT NULL,
  physician_name VARCHAR(255) NOT NULL,
  physician_email VARCHAR(191) NOT NULL,
  institution_name VARCHAR(255) NULL,
  requested_drug VARCHAR(255) NOT NULL,
  condition_category VARCHAR(191) NOT NULL,
  urgency_level VARCHAR(64) NOT NULL DEFAULT 'standard',
  emergency_flag TINYINT(1) NOT NULL DEFAULT 0,
  regulatory_pathway VARCHAR(64) NOT NULL DEFAULT 'individual_patient_ind',
  status VARCHAR(64) NOT NULL DEFAULT 'submitted',
  current_stage VARCHAR(128) NOT NULL DEFAULT 'intake_review',
  ai_summary TEXT NULL,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_ieg_eap_requests_status_stage (status, current_stage),
  KEY idx_ieg_eap_requests_emergency (emergency_flag, created_at),
  CONSTRAINT fk_ieg_eap_requests_external_user FOREIGN KEY (external_user_id) REFERENCES ieg_external_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_eap_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eap_request_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NULL,
  review_type VARCHAR(64) NOT NULL,
  decision VARCHAR(64) NOT NULL,
  comments TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_eap_reviews_request (eap_request_id, created_at),
  CONSTRAINT fk_ieg_eap_reviews_request FOREIGN KEY (eap_request_id) REFERENCES ieg_eap_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_eap_reviews_user FOREIGN KEY (reviewer_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_eap_supply_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eap_request_id BIGINT NOT NULL,
  actor_user_id BIGINT NULL,
  supply_state VARCHAR(64) NOT NULL,
  quantity VARCHAR(64) NULL,
  notes TEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_eap_supply_events_request (eap_request_id, created_at),
  CONSTRAINT fk_ieg_eap_supply_request FOREIGN KEY (eap_request_id) REFERENCES ieg_eap_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_eap_supply_user FOREIGN KEY (actor_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_eap_sla_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eap_request_id BIGINT NOT NULL,
  sla_type VARCHAR(64) NOT NULL,
  target_minutes INT NOT NULL,
  breach_flag TINYINT(1) NOT NULL DEFAULT 0,
  breached_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_eap_sla_request (eap_request_id, breach_flag),
  CONSTRAINT fk_ieg_eap_sla_request FOREIGN KEY (eap_request_id) REFERENCES ieg_eap_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_eap_safety_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eap_request_id BIGINT NOT NULL,
  reporter_user_id BIGINT NULL,
  event_type VARCHAR(64) NOT NULL,
  seriousness VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'open',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_eap_safety_request (eap_request_id, created_at),
  CONSTRAINT fk_ieg_eap_safety_request FOREIGN KEY (eap_request_id) REFERENCES ieg_eap_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_eap_safety_user FOREIGN KEY (reporter_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_eap_safety_reports (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  safety_event_id BIGINT NOT NULL,
  report_reference VARCHAR(191) NOT NULL UNIQUE,
  report_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_eap_safety_reports_event (safety_event_id),
  CONSTRAINT fk_ieg_eap_safety_reports_event FOREIGN KEY (safety_event_id) REFERENCES ieg_eap_safety_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_dms_sync_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  direction VARCHAR(32) NOT NULL DEFAULT 'export',
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  mapping_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  error_message TEXT NULL,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_ieg_dms_sync_jobs_provider_status (provider, status, created_at),
  CONSTRAINT fk_ieg_dms_sync_jobs_user FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_dms_sync_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sync_job_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  message TEXT NULL,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_dms_sync_log_job (sync_job_id, occurred_at),
  CONSTRAINT fk_ieg_dms_sync_log_job FOREIGN KEY (sync_job_id) REFERENCES ieg_dms_sync_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_registry_links (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL,
  nct_id VARCHAR(64) NOT NULL,
  registry_url TEXT NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'linked',
  linked_by BIGINT NULL,
  linked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_iit_registry_link (iit_proposal_id, nct_id),
  KEY idx_ieg_iit_registry_nct (nct_id),
  CONSTRAINT fk_ieg_iit_registry_proposal FOREIGN KEY (iit_proposal_id) REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_iit_registry_user FOREIGN KEY (linked_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_registry_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  registry_link_id BIGINT NOT NULL,
  snapshot_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  fetched_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_iit_registry_snapshots_link (registry_link_id, fetched_at),
  CONSTRAINT fk_ieg_iit_registry_snapshots_link FOREIGN KEY (registry_link_id) REFERENCES ieg_iit_registry_links(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_request_conversions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_module VARCHAR(32) NOT NULL,
  source_entity_type VARCHAR(128) NOT NULL,
  source_entity_id VARCHAR(128) NOT NULL,
  target_module VARCHAR(32) NOT NULL,
  target_entity_type VARCHAR(128) NOT NULL,
  target_entity_id VARCHAR(128) NOT NULL,
  reason TEXT NOT NULL,
  converted_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_request_conversions_source (source_module, source_entity_type, source_entity_id),
  KEY idx_ieg_request_conversions_target (target_module, target_entity_type, target_entity_id),
  CONSTRAINT fk_ieg_request_conversions_user FOREIGN KEY (converted_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_ai_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  request_type VARCHAR(64) NOT NULL,
  prompt_version VARCHAR(64) NOT NULL DEFAULT 'v1',
  requested_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_ai_requests_entity (module_key, entity_type, entity_id, request_type),
  CONSTRAINT fk_ieg_ai_requests_user FOREIGN KEY (requested_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_ai_summaries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ai_request_id BIGINT NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  summary_text TEXT NOT NULL,
  confidence_score DECIMAL(5,2) NULL,
  model_label VARCHAR(128) NOT NULL DEFAULT 'local-rule-model',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_ai_summaries_entity (module_key, entity_type, entity_id),
  CONSTRAINT fk_ieg_ai_summaries_request FOREIGN KEY (ai_request_id) REFERENCES ieg_ai_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_ai_scores (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ai_request_id BIGINT NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  recommendation_score DECIMAL(5,2) NOT NULL,
  confidence_score DECIMAL(5,2) NULL,
  rationale TEXT NOT NULL,
  human_override_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_ai_scores_entity (module_key, entity_type, entity_id),
  CONSTRAINT fk_ieg_ai_scores_request FOREIGN KEY (ai_request_id) REFERENCES ieg_ai_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_erp_export_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_code VARCHAR(64) NOT NULL,
  export_format VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  filter_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  output_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_ieg_erp_export_jobs_status (status, created_at),
  CONSTRAINT fk_ieg_erp_export_jobs_user FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_erp_export_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  export_job_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL,
  message TEXT NULL,
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_erp_export_logs_job (export_job_id, occurred_at),
  CONSTRAINT fk_ieg_erp_export_logs_job FOREIGN KEY (export_job_id) REFERENCES ieg_erp_export_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_compliance_overlay_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jurisdiction VARCHAR(32) NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  rule_key VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  threshold JSON NOT NULL DEFAULT (JSON_OBJECT()),
  message TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_compliance_overlay_rules (jurisdiction, module_key, rule_key),
  CONSTRAINT fk_ieg_compliance_overlay_user FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_kpi_definitions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kpi_key VARCHAR(128) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  module_scope VARCHAR(32) NOT NULL DEFAULT 'portfolio',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_analytics_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  snapshot_type VARCHAR(64) NOT NULL DEFAULT 'portfolio',
  period_from DATE NULL,
  period_to DATE NULL,
  metric_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  generated_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_analytics_snapshots_type (snapshot_type, created_at),
  CONSTRAINT fk_ieg_analytics_snapshots_user FOREIGN KEY (generated_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_policy_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  policy_type VARCHAR(64) NOT NULL,
  policy_key VARCHAR(128) NOT NULL,
  config_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_policy_rules (module_key, policy_type, policy_key),
  CONSTRAINT fk_ieg_policy_rules_user FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_policy_actions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  policy_rule_id BIGINT NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  action_payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_policy_actions_rule (policy_rule_id),
  CONSTRAINT fk_ieg_policy_actions_rule FOREIGN KEY (policy_rule_id) REFERENCES ieg_policy_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_policy_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  policy_rule_id BIGINT NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  event_status VARCHAR(32) NOT NULL,
  details JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_ieg_policy_events_entity (module_key, entity_type, entity_id, occurred_at),
  CONSTRAINT fk_ieg_policy_events_rule FOREIGN KEY (policy_rule_id) REFERENCES ieg_policy_rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_integration_settings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope_key VARCHAR(64) NOT NULL UNIQUE,
  public_config JSON NOT NULL DEFAULT (JSON_OBJECT()),
  encrypted_secret TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_integration_settings_user FOREIGN KEY (updated_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
