CREATE TABLE IF NOT EXISTS dc_documents (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  document_type VARCHAR(100) NOT NULL CHECK (
    document_type IN ('SOP', 'Work Instruction', 'Policy', 'Form', 'Protocol')
  ),
  department VARCHAR(255) NOT NULL,
  owner_user_id CHAR(36) NOT NULL,
  review_interval_days INT NOT NULL DEFAULT 365 CHECK (review_interval_days > 0),
  next_review_due_date DATE,
  controlled_preview_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  download_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  print_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  binder_includable BOOLEAN NOT NULL DEFAULT TRUE,
  active_version_id CHAR(36),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, document_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES qms_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dc_document_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  version_no INT NOT NULL CHECK (version_no > 0),
  status VARCHAR(100) NOT NULL CHECK (status IN ('Draft', 'Review', 'Approved', 'Effective', 'Retired')),
  content_summary TEXT,
  effective_date DATE,
  retired_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (document_id, version_no),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

ALTER TABLE dc_documents
  ADD CONSTRAINT dc_documents_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES dc_document_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dc_document_workflow_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  from_status VARCHAR(100),
  to_status VARCHAR(100) NOT NULL,
  acted_by CHAR(36),
  signature_id CHAR(36),
  notes TEXT,
  acted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id) REFERENCES dc_document_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (acted_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dc_document_periodic_reviews (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  due_date DATE NOT NULL,
  alert_schedule_days JSON NOT NULL DEFAULT (JSON_ARRAY(90, 60, 30, 7)),
  last_alert_sent_days JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (document_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS dc_document_acknowledgements (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  acknowledged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (version_id, user_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id) REFERENCES dc_document_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS dc_document_access_policies (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  role_key VARCHAR(100) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_download BOOLEAN NOT NULL DEFAULT FALSE,
  can_print BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (document_id, role_key),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS dc_document_exports (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  binder_job_reference VARCHAR(255),
  exported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  exported_by CHAR(36),
  export_format VARCHAR(255) NOT NULL DEFAULT 'PDF',
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id) REFERENCES dc_document_versions(id) ON DELETE RESTRICT,
  FOREIGN KEY (exported_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_dc_documents_filters
  ON dc_documents (org_id, document_type, department, owner_user_id);
CREATE INDEX idx_dc_documents_title
  ON dc_documents (org_id, (lower(title)));
CREATE INDEX idx_dc_versions_status
  ON dc_document_versions (org_id, status, created_at DESC);
CREATE INDEX idx_dc_workflow_events
  ON dc_document_workflow_events (org_id, document_id, acted_at DESC);
CREATE INDEX idx_dc_ack_user
  ON dc_document_acknowledgements (org_id, user_id, acknowledged_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
