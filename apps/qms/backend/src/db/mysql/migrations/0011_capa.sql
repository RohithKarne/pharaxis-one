CREATE TABLE IF NOT EXISTS ca_capa_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  -- CHECK lists below are the END-STATE values, not this file's original narrow
  -- ones. In Postgres, 0019_capa_enterprise_blueprint.sql widens both by
  -- `DROP CONSTRAINT ca_capa_records_status_check` + re-ADD. MySQL auto-names an
  -- inline CHECK `ca_capa_records_chk_N`, so the Postgres name does not exist to
  -- drop and the narrow constraint would survive — rejecting Submitted,
  -- Investigation, ActionPlanApproval, InExecution and Reopened, which are 5 of
  -- the 8 statuses src/routes/capa.js actually writes. The composed schema is
  -- what must match Postgres, so the widened list is declared here directly.
  source_type VARCHAR(100) NOT NULL CHECK (
    source_type IN (
      'Deviation', 'AuditFinding', 'Manual', 'Complaint',
      'ChangeControl', 'DocumentControl', 'Validation'
    )
  ),
  source_ref_id CHAR(36),
  classification VARCHAR(100) NOT NULL CHECK (classification IN ('Corrective', 'Preventive', 'Both')),
  status VARCHAR(100) NOT NULL CHECK (
    status IN (
      'Draft', 'Submitted', 'Triage', 'Investigation', 'ActionPlanApproval',
      'ActionPlanApproved', 'InExecution', 'EffectivenessReview',
      'EffectivenessPending', 'Closed', 'Reopened', 'PlanApproval', 'InProgress'
    )
  ),
  root_cause_summary TEXT,
  owner_user_id CHAR(36) NOT NULL,
  due_date DATE,
  effectiveness_result VARCHAR(100) CHECK (effectiveness_result IN ('Pass', 'Fail')),
  effective_verified_at DATETIME(3),
  closed_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, capa_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES qms_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ca_root_cause_5why (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  why_level INT NOT NULL CHECK (why_level BETWEEN 1 AND 5),
  answer TEXT NOT NULL,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (capa_id, why_level),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ca_root_cause_fishbone (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  category VARCHAR(100) NOT NULL,
  cause TEXT NOT NULL,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ca_action_items (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  description TEXT NOT NULL,
  assigned_owner_user_id CHAR(36) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(100) NOT NULL CHECK (status IN ('NotStarted', 'InProgress', 'Complete')),
  completed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_owner_user_id) REFERENCES qms_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ca_escalations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  action_item_id CHAR(36),
  escalated_to_user_id CHAR(36),
  reason TEXT NOT NULL,
  escalated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (action_item_id) REFERENCES ca_action_items(id) ON DELETE SET NULL,
  FOREIGN KEY (escalated_to_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ca_effectiveness_checks (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  criteria TEXT NOT NULL,
  evidence_ref VARCHAR(255),
  result VARCHAR(100) NOT NULL CHECK (result IN ('Pass', 'Fail')),
  signature_id CHAR(36),
  checked_by CHAR(36),
  checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  FOREIGN KEY (checked_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_ca_records_status ON ca_capa_records (org_id, status, updated_at DESC);
CREATE INDEX idx_ca_actions_due ON ca_action_items (org_id, due_date, status);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
