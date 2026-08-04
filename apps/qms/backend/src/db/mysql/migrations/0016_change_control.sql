CREATE TABLE IF NOT EXISTS cc_change_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  change_code VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  change_type VARCHAR(100) NOT NULL CHECK (change_type IN ('Standard', 'Major', 'Emergency')),
  reason TEXT NOT NULL,
  -- END-STATE value list. Postgres widens this in 0021 via
  -- `DROP CONSTRAINT cc_change_records_status_check` + re-ADD; MySQL cannot drop
  -- an auto-named inline CHECK, so the widened list is declared here.
  -- 'CabReview' and 'Reopened' are written by src/routes/changeControl.js and
  -- would be rejected without this.
  status VARCHAR(100) NOT NULL CHECK (
    status IN (
      'Draft',
      'ImpactAssessment',
      'PendingApproval',
      'CabReview',
      'Approved',
      'Implementation',
      'Closed',
      'Rejected',
      'Reopened'
    )
  ),
  risk_level VARCHAR(255) NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('High', 'Medium', 'Low')),
  owner_user_id CHAR(36) NOT NULL,
  requested_by_user_id CHAR(36),
  linked_document_id CHAR(36),
  planned_start_date DATE,
  planned_end_date DATE,
  approved_at DATETIME(3),
  closed_at DATETIME(3),
  closure_summary TEXT,
  effectiveness_result VARCHAR(100) CHECK (
    effectiveness_result IN ('Effective', 'PartiallyEffective', 'NotEffective')
  ),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, change_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES qms_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_user_id) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_document_id) REFERENCES dc_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cc_impact_assessments (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  change_id CHAR(36) NOT NULL,
  assessment_summary TEXT NOT NULL,
  impacted_modules JSON NOT NULL DEFAULT (JSON_ARRAY()),
  risk_level VARCHAR(255) NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
  assessed_by CHAR(36),
  assessed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (change_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (change_id) REFERENCES cc_change_records(id) ON DELETE CASCADE,
  FOREIGN KEY (assessed_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cc_approval_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  change_id CHAR(36) NOT NULL,
  approver_user_id CHAR(36),
  decision VARCHAR(255) NOT NULL CHECK (decision IN ('Approve', 'Reject')),
  comments TEXT,
  decided_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (change_id) REFERENCES cc_change_records(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cc_implementation_steps (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  change_id CHAR(36) NOT NULL,
  step_no INT NOT NULL CHECK (step_no > 0),
  step_title TEXT NOT NULL,
  step_status VARCHAR(100) NOT NULL CHECK (step_status IN ('Planned', 'InProgress', 'Completed', 'Blocked')),
  due_date DATE,
  completed_at DATETIME(3),
  evidence_ref TEXT,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (change_id, step_no),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (change_id) REFERENCES cc_change_records(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_cc_records_status ON cc_change_records (org_id, status, updated_at DESC);
CREATE INDEX idx_cc_records_risk ON cc_change_records (org_id, risk_level, updated_at DESC);
CREATE INDEX idx_cc_steps_status ON cc_implementation_steps (org_id, step_status, updated_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
