CREATE TABLE IF NOT EXISTS dv_deviation_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  deviation_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  deviation_type VARCHAR(100) NOT NULL CHECK (
    deviation_type IN ('Product', 'Process', 'System', 'Environmental')
  ),
  classification VARCHAR(100) NOT NULL CHECK (classification IN ('Critical', 'Major', 'Minor')),
  -- END-STATE value list. Postgres widens this in 0021 via
  -- `DROP CONSTRAINT dv_deviation_records_status_check` + re-ADD; MySQL cannot
  -- drop an auto-named inline CHECK, so the widened list is declared here.
  status VARCHAR(100) NOT NULL CHECK (
    status IN (
      'Open', 'Triage', 'Containment', 'Investigation',
      'QAReview', 'CapaLinked', 'Closed', 'Reopened'
    )
  ),
  date_of_occurrence DATE NOT NULL,
  department VARCHAR(255) NOT NULL,
  detected_by CHAR(36),
  root_cause TEXT,
  reportability_status VARCHAR(100) NOT NULL DEFAULT 'Under Review' CHECK (
    reportability_status IN ('Yes', 'No', 'Under Review')
  ),
  reportability_reason TEXT,
  closed_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, deviation_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (detected_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dv_containment_actions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  deviation_id CHAR(36) NOT NULL,
  action_text TEXT NOT NULL,
  recorded_by CHAR(36),
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (deviation_id) REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dv_investigations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  deviation_id CHAR(36) NOT NULL,
  investigator_user_id CHAR(36),
  due_date DATE,
  findings TEXT,
  evidence_ref VARCHAR(255),
  status VARCHAR(100) NOT NULL DEFAULT 'Assigned' CHECK (
    status IN ('Assigned', 'InProgress', 'Completed')
  ),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (deviation_id) REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  FOREIGN KEY (investigator_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dv_deviation_capa_links (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  deviation_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (deviation_id, capa_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (deviation_id) REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
