CREATE TABLE IF NOT EXISTS pub_tenants (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(191) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(64) NOT NULL,
  is_superadmin TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  invited_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_pub_users_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_users_invited_by FOREIGN KEY (invited_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_publications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  publication_type VARCHAR(64) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'concept',
  drug_name VARCHAR(255) NULL,
  therapeutic_area VARCHAR(255) NULL,
  target_venue VARCHAR(255) NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_publications_tenant_status (tenant_id, status),
  INDEX idx_pub_publications_tenant_type (tenant_id, publication_type),
  INDEX idx_pub_publications_title (title),
  CONSTRAINT fk_pub_publications_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_publications_created_by FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_publications_updated_by FOREIGN KEY (updated_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_publication_status_history (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  from_status VARCHAR(64) NULL,
  to_status VARCHAR(64) NOT NULL,
  changed_by BIGINT NULL,
  note TEXT NULL,
  changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_pub_status_history_pub (publication_id, changed_at),
  CONSTRAINT fk_pub_status_history_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_status_history_pub FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_status_history_user FOREIGN KEY (changed_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_authors (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(191) NULL,
  affiliation VARCHAR(255) NULL,
  disclosure_status VARCHAR(32) NOT NULL DEFAULT 'incomplete',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_authors_tenant_email (tenant_id, email),
  CONSTRAINT fk_pub_authors_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_publication_authors (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  author_order INT NOT NULL DEFAULT 1,
  icmje_categories JSON NOT NULL DEFAULT (JSON_ARRAY()),
  is_corresponding TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_publication_author (publication_id, author_id),
  UNIQUE KEY uq_pub_publication_author_order (publication_id, author_order),
  CONSTRAINT fk_pub_publication_authors_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_publication_authors_pub FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_publication_authors_author FOREIGN KEY (author_id) REFERENCES pub_authors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_milestones (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  milestone_name VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  owner_user_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  completed_at DATETIME(6) NULL,
  overdue_notified_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_milestones_due (tenant_id, due_date),
  CONSTRAINT fk_pub_milestones_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_milestones_pub FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_milestones_owner FOREIGN KEY (owner_user_id) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_documents (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  current_version INT NOT NULL DEFAULT 0,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_pub_documents_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_documents_pub FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_documents_created_by FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_document_versions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  document_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NULL,
  file_size BIGINT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by BIGINT NULL,
  uploaded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_doc_versions (document_id, version_no),
  CONSTRAINT fk_pub_doc_versions_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_doc_versions_doc FOREIGN KEY (document_id) REFERENCES pub_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_doc_versions_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NOT NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  comments TEXT NULL,
  reviewed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_reviews_pub_reviewer (publication_id, reviewer_user_id),
  CONSTRAINT fk_pub_reviews_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_reviews_pub FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_reviews_user FOREIGN KEY (reviewer_user_id) REFERENCES pub_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_gpp_checklist_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  item_text VARCHAR(500) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  is_checked TINYINT(1) NOT NULL DEFAULT 0,
  checked_by BIGINT NULL,
  checked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_gpp_item (publication_id, item_key),
  CONSTRAINT fk_pub_gpp_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_gpp_pub FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_gpp_checked_by FOREIGN KEY (checked_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_tenant_gpp_defaults (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  item_text VARCHAR(500) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_tenant_gpp_item (tenant_id, item_key),
  CONSTRAINT fk_pub_tenant_gpp_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_author_disclosures (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  signoff_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  financial_interests TEXT NULL,
  company_relationships TEXT NULL,
  coi_declaration TEXT NULL,
  request_note TEXT NULL,
  requested_at DATETIME(6) NULL,
  requested_by BIGINT NULL,
  signed_at DATETIME(6) NULL,
  waived_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_author_disclosure (publication_id, author_id),
  INDEX idx_pub_disclosure_status (tenant_id, signoff_status),
  CONSTRAINT fk_pub_disclosure_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_disclosure_publication FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_disclosure_author FOREIGN KEY (author_id) REFERENCES pub_authors(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_disclosure_requested_by FOREIGN KEY (requested_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_submission_records (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  submission_type VARCHAR(32) NOT NULL,
  attempt_no INT NOT NULL DEFAULT 1,
  venue_name VARCHAR(255) NOT NULL,
  reference_id VARCHAR(255) NULL,
  submission_date DATE NOT NULL,
  peer_review_status VARCHAR(64) NULL,
  revision_round INT NOT NULL DEFAULT 0,
  congress_decision VARCHAR(64) NULL,
  notes TEXT NULL,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_submissions_pub (publication_id, created_at),
  INDEX idx_pub_submissions_type (tenant_id, submission_type),
  CONSTRAINT fk_pub_submissions_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_submissions_publication FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_submissions_creator FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_milestone_deadline_alerts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  milestone_id BIGINT NOT NULL,
  alert_days INT NOT NULL,
  alerted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_milestone_alert (milestone_id, alert_days),
  CONSTRAINT fk_pub_milestone_alert_milestone FOREIGN KEY (milestone_id) REFERENCES pub_milestones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_document_comments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  document_version_id BIGINT NOT NULL,
  parent_comment_id BIGINT NULL,
  page_number INT NOT NULL DEFAULT 1,
  comment_text TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_doc_comments_version (document_version_id, created_at),
  CONSTRAINT fk_pub_doc_comments_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_doc_comments_publication FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_doc_comments_version FOREIGN KEY (document_version_id) REFERENCES pub_document_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_doc_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES pub_document_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_doc_comments_user FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_publication_templates (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  publication_type VARCHAR(64) NOT NULL,
  default_target_venue VARCHAR(255) NULL,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_templates_tenant_type (tenant_id, publication_type),
  CONSTRAINT fk_pub_templates_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_templates_user FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_template_milestones (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT NOT NULL,
  milestone_name VARCHAR(255) NOT NULL,
  due_offset_days INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_pub_template_milestones_template FOREIGN KEY (template_id) REFERENCES pub_publication_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_template_checklist_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  item_text VARCHAR(500) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_template_checklist_item (template_id, item_key),
  CONSTRAINT fk_pub_template_checklist_template FOREIGN KEY (template_id) REFERENCES pub_publication_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_template_reviewers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT NOT NULL,
  reviewer_user_id BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_template_reviewer (template_id, reviewer_user_id),
  CONSTRAINT fk_pub_template_reviewers_template FOREIGN KEY (template_id) REFERENCES pub_publication_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_template_reviewers_user FOREIGN KEY (reviewer_user_id) REFERENCES pub_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_conferences (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  conference_name VARCHAR(255) NOT NULL,
  therapeutic_area VARCHAR(255) NULL,
  abstract_deadline DATE NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_conferences_dates (tenant_id, start_date),
  CONSTRAINT fk_pub_conferences_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_conferences_user FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_publication_conferences (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  conference_id BIGINT NOT NULL,
  linked_by BIGINT NULL,
  linked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_publication_conference (publication_id, conference_id),
  CONSTRAINT fk_pub_pubconf_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_pubconf_publication FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_pubconf_conference FOREIGN KEY (conference_id) REFERENCES pub_conferences(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_pubconf_user FOREIGN KEY (linked_by) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_publication_integrations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  mims_drug_id VARCHAR(128) NULL,
  mims_drug_name VARCHAR(255) NULL,
  safety_related TINYINT(1) NOT NULL DEFAULT 0,
  safety_case_reference VARCHAR(255) NULL,
  safety_event_status VARCHAR(64) NULL,
  safety_event_last_sent_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_integrations_publication (publication_id),
  CONSTRAINT fk_pub_integrations_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_integrations_publication FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_safety_event_queue (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  publication_id BIGINT NOT NULL,
  payload_json JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  next_attempt_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_pub_safety_queue_status (status, next_attempt_at),
  CONSTRAINT fk_pub_safety_queue_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_safety_queue_publication FOREIGN KEY (publication_id) REFERENCES pub_publications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NULL,
  actor_user_id BIGINT NULL,
  action_type VARCHAR(128) NOT NULL,
  entity_type VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NULL,
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_pub_audit_tenant_time (tenant_id, occurred_at),
  CONSTRAINT fk_pub_audit_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_audit_user FOREIGN KEY (actor_user_id) REFERENCES pub_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  recipient_user_id BIGINT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'email',
  template_key VARCHAR(128) NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  sent_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_pub_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES pub_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_user_notification_preferences (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  event_key VARCHAR(128) NOT NULL,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_pub_user_event_pref (user_id, event_key),
  CONSTRAINT fk_pub_notif_pref_user FOREIGN KEY (user_id) REFERENCES pub_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_user_invites (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  email VARCHAR(191) NOT NULL,
  full_name VARCHAR(255) NULL,
  role VARCHAR(64) NOT NULL,
  invite_token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  accepted_at DATETIME(6) NULL,
  created_by BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_pub_invites_token (invite_token_hash),
  INDEX idx_pub_invites_email (tenant_id, email),
  CONSTRAINT fk_pub_invites_tenant FOREIGN KEY (tenant_id) REFERENCES pub_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pub_invites_creator FOREIGN KEY (created_by) REFERENCES pub_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pub_password_reset_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_pub_reset_token (token_hash),
  CONSTRAINT fk_pub_reset_user FOREIGN KEY (user_id) REFERENCES pub_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
