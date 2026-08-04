CREATE TABLE IF NOT EXISTS au_audits (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  audit_code VARCHAR(100) NOT NULL,
  audit_title VARCHAR(255) NOT NULL,
  audit_type VARCHAR(100) NOT NULL CHECK (audit_type IN ('Internal', 'External', 'RegulatoryInspection')),
  scope TEXT NOT NULL,
  planned_date DATE NOT NULL,
  -- END-STATE value list. Postgres widens this in 0021 via
  -- `DROP CONSTRAINT au_audits_status_check` + re-ADD; MySQL cannot drop an
  -- auto-named inline CHECK, so the widened list is declared here.
  status VARCHAR(100) NOT NULL CHECK (
    status IN (
      'Planned', 'InProgress', 'FindingsCaptured',
      'ResponseInProgress', 'QAReview', 'Closed'
    )
  ),
  lead_auditor_user_id CHAR(36),
  closed_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, audit_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (lead_auditor_user_id) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS au_audit_assignments (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  audit_id CHAR(36) NOT NULL,
  auditor_user_id CHAR(36) NOT NULL,
  assignment_role VARCHAR(100) NOT NULL CHECK (assignment_role IN ('Lead', 'CoAuditor')),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (audit_id, auditor_user_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_id) REFERENCES au_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (auditor_user_id) REFERENCES qms_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS au_pre_audit_checklists (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  audit_id CHAR(36) NOT NULL,
  checklist_key VARCHAR(100) NOT NULL,
  item_text TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by CHAR(36),
  completed_at DATETIME(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_id) REFERENCES au_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS au_findings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  audit_id CHAR(36) NOT NULL,
  description TEXT NOT NULL,
  finding_type VARCHAR(100) NOT NULL CHECK (
    finding_type IN ('Observation', 'Minor', 'Major', 'Critical')
  ),
  department VARCHAR(255),
  process_area VARCHAR(255),
  status VARCHAR(100) NOT NULL DEFAULT 'Open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_id) REFERENCES au_audits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS au_finding_capa_links (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  finding_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (finding_id, capa_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (finding_id) REFERENCES au_findings(id) ON DELETE CASCADE,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS au_auditee_responses (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  finding_id CHAR(36) NOT NULL,
  response_text TEXT NOT NULL,
  proposed_action TEXT,
  responded_by CHAR(36),
  responded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (finding_id) REFERENCES au_findings(id) ON DELETE CASCADE,
  FOREIGN KEY (responded_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS au_audit_reports (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  audit_id CHAR(36) NOT NULL,
  file_object_id CHAR(36),
  generated_by CHAR(36),
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_id) REFERENCES au_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS au_binder_jobs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  job_status VARCHAR(100) NOT NULL CHECK (job_status IN ('Queued', 'Processing', 'Completed', 'Failed')),
  total_records INT NOT NULL DEFAULT 0,
  duration_ms INT,
  file_object_id CHAR(36),
  error_message TEXT,
  requested_by CHAR(36),
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (requested_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS au_binder_items (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  binder_job_id CHAR(36) NOT NULL,
  source_module VARCHAR(255) NOT NULL,
  source_table VARCHAR(255) NOT NULL,
  source_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (binder_job_id) REFERENCES au_binder_jobs(id) ON DELETE CASCADE
);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
