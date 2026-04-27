CREATE TABLE IF NOT EXISTS ieg_users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(64) NOT NULL,
  is_superadmin TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_external_users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  user_type VARCHAR(64) NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_user_modules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_user_modules_user_module (user_id, module_key),
  CONSTRAINT fk_ieg_user_modules_user FOREIGN KEY (user_id) REFERENCES ieg_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_workflows (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  current_state VARCHAR(128) NOT NULL,
  warning_blocked TINYINT(1) NOT NULL DEFAULT 0,
  state_updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_workflows_entity (module_key, entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_workflow_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_id BIGINT NOT NULL,
  from_state VARCHAR(128),
  to_state VARCHAR(128) NOT NULL,
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128),
  actor_label VARCHAR(255),
  note TEXT,
  warning_required TINYINT(1) NOT NULL DEFAULT 0,
  warning_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_workflow_events_workflow FOREIGN KEY (workflow_id) REFERENCES ieg_workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_tasks (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  assigned_user_id BIGINT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  action_type VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  due_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_tasks_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128),
  actor_label VARCHAR(255),
  module_key VARCHAR(32),
  entity_type VARCHAR(128),
  entity_id VARCHAR(128),
  action VARCHAR(128) NOT NULL,
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_documents (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'internal',
  current_version INT NOT NULL DEFAULT 0,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_documents_created_by FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_document_versions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128),
  file_size BIGINT,
  storage_path TEXT NOT NULL,
  file_sha256 VARCHAR(255),
  signature_status VARCHAR(32) NOT NULL DEFAULT 'unsigned',
  signature_data JSON NOT NULL DEFAULT (JSON_OBJECT()),
  uploaded_by BIGINT NULL,
  uploaded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_document_versions_doc_ver (document_id, version_no),
  CONSTRAINT fk_ieg_document_versions_document FOREIGN KEY (document_id) REFERENCES ieg_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_document_versions_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel VARCHAR(16) NOT NULL,
  recipient_user_id BIGINT NULL,
  recipient_external_user_id BIGINT NULL,
  template_key VARCHAR(128),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  context JSON NOT NULL DEFAULT (JSON_OBJECT()),
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  sent_at DATETIME(6) NULL,
  CONSTRAINT fk_ieg_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES ieg_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_notifications_external_user FOREIGN KEY (recipient_external_user_id) REFERENCES ieg_external_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_approval_matrix (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  request_type VARCHAR(128) NOT NULL,
  geography VARCHAR(32) NOT NULL DEFAULT 'US',
  min_value DECIMAL(14,2),
  max_value DECIMAL(14,2),
  approver_chain JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_approval_matrix_created_by FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_compliance_rules (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  jurisdiction VARCHAR(32) NOT NULL DEFAULT 'US',
  module_key VARCHAR(32) NOT NULL,
  rule_key VARCHAR(128) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  threshold JSON NOT NULL DEFAULT (JSON_OBJECT()),
  message TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_compliance_rules (jurisdiction, module_key, rule_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_warning_acknowledgements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  rule_key VARCHAR(128) NOT NULL,
  message TEXT NOT NULL,
  acknowledged_by BIGINT NULL,
  acknowledged_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  notes TEXT,
  CONSTRAINT fk_ieg_warning_ack_user FOREIGN KEY (acknowledged_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_disbursements (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  milestone_name VARCHAR(255),
  amount DECIMAL(14,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  external_reference VARCHAR(255),
  payload JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_evidence_taxonomy (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  taxonomy_type VARCHAR(64) NOT NULL,
  code VARCHAR(128) NOT NULL,
  label VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_ieg_evidence_taxonomy (taxonomy_type, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_grant_programs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(128) NOT NULL,
  cycle_name VARCHAR(128) NOT NULL,
  therapeutic_scope VARCHAR(255),
  required_documents JSON NOT NULL DEFAULT (JSON_ARRAY()),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_grant_programs_created_by FOREIGN KEY (created_by) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_grant_applications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  external_user_id BIGINT NULL,
  program_id BIGINT NULL,
  application_code VARCHAR(191) NOT NULL UNIQUE,
  applicant_type VARCHAR(64) NOT NULL,
  applicant_name VARCHAR(255) NOT NULL,
  country_code VARCHAR(8) NOT NULL DEFAULT 'US',
  requested_amount DECIMAL(14,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  current_stage VARCHAR(64) NOT NULL DEFAULT 'administrative_check',
  data JSON NOT NULL DEFAULT (JSON_OBJECT()),
  coi_flag TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_grant_apps_external_user FOREIGN KEY (external_user_id) REFERENCES ieg_external_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ieg_grant_apps_program FOREIGN KEY (program_id) REFERENCES ieg_grant_programs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_grant_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grant_application_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NULL,
  scientific_score DECIMAL(5,2),
  strategic_score DECIMAL(5,2),
  comments TEXT,
  submitted_at DATETIME(6) NULL,
  CONSTRAINT fk_ieg_grant_reviews_app FOREIGN KEY (grant_application_id) REFERENCES ieg_grant_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_grant_reviews_user FOREIGN KEY (reviewer_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_grant_decisions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grant_application_id BIGINT NOT NULL,
  committee_user_id BIGINT NULL,
  decision VARCHAR(64) NOT NULL,
  approved_amount DECIMAL(14,2),
  rationale TEXT NOT NULL,
  signed TINYINT(1) NOT NULL DEFAULT 0,
  signed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_grant_decisions_app FOREIGN KEY (grant_application_id) REFERENCES ieg_grant_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_grant_decisions_user FOREIGN KEY (committee_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_grant_milestones (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grant_application_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  due_date DATE NULL,
  deliverable TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'planned',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_grant_milestones_app FOREIGN KEY (grant_application_id) REFERENCES ieg_grant_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_proposals (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  external_user_id BIGINT NULL,
  proposal_code VARCHAR(191) NOT NULL UNIQUE,
  investigator_name VARCHAR(255) NOT NULL,
  institution_name VARCHAR(255),
  support_type VARCHAR(32) NOT NULL,
  requested_amount DECIMAL(14,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  current_stage VARCHAR(64) NOT NULL DEFAULT 'scientific_triage',
  data JSON NOT NULL DEFAULT (JSON_OBJECT()),
  fmv_reference_value DECIMAL(14,2) NULL,
  fmv_warning TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_iit_proposals_external_user FOREIGN KEY (external_user_id) REFERENCES ieg_external_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NULL,
  triage_decision VARCHAR(32) NOT NULL,
  scientific_score DECIMAL(5,2),
  strategic_score DECIMAL(5,2),
  comments TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_iit_reviews_proposal FOREIGN KEY (iit_proposal_id) REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_iit_reviews_user FOREIGN KEY (reviewer_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_committee_votes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL,
  voter_user_id BIGINT NULL,
  function_role VARCHAR(64) NOT NULL,
  vote VARCHAR(64) NOT NULL,
  comments TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_iit_votes_proposal FOREIGN KEY (iit_proposal_id) REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_ieg_iit_votes_user FOREIGN KEY (voter_user_id) REFERENCES ieg_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_contracts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL,
  decision VARCHAR(64) NOT NULL,
  pending_requirements JSON NOT NULL DEFAULT (JSON_ARRAY()),
  publication_rights TEXT,
  data_rights TEXT,
  signed TINYINT(1) NOT NULL DEFAULT 0,
  signed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_iit_contracts_proposal FOREIGN KEY (iit_proposal_id) REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_milestones (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  progress_report_url TEXT,
  protocol_deviation_notes TEXT,
  budget_utilization DECIMAL(14,2),
  status VARCHAR(32) NOT NULL DEFAULT 'planned',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_iit_milestones_proposal FOREIGN KEY (iit_proposal_id) REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ieg_iit_publications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  milestone_status VARCHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_ieg_iit_publications_proposal FOREIGN KEY (iit_proposal_id) REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_ieg_audit_module_entity ON ieg_audit_log(module_key, entity_type, entity_id);
CREATE INDEX idx_ieg_tasks_assignee_status ON ieg_tasks(assigned_user_id, status);
CREATE INDEX idx_ieg_grant_applications_status ON ieg_grant_applications(status, current_stage);
CREATE INDEX idx_ieg_iit_proposals_status ON ieg_iit_proposals(status, current_stage);
CREATE INDEX idx_ieg_notifications_recipient ON ieg_notifications(recipient_user_id, recipient_external_user_id, status);
