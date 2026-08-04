CREATE TABLE IF NOT EXISTS vs_system_inventory (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_name VARCHAR(255) NOT NULL,
  vendor VARCHAR(255),
  version VARCHAR(255),
  system_owner_user_id CHAR(36),
  gamp_category VARCHAR(100) NOT NULL CHECK (gamp_category IN ('1', '3', '4', '5')),
  risk_level VARCHAR(100) NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
  validation_status VARCHAR(100) NOT NULL CHECK (
    validation_status IN ('Planned', 'InProgress', 'Validated', 'OverdueReview', 'Retired')
  ),
  next_review_due_date DATE,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_owner_user_id) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_validation_plans (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  scope TEXT NOT NULL,
  approach TEXT,
  responsibilities TEXT,
  protocol_types JSON NOT NULL DEFAULT (JSON_ARRAY('IQ','OQ','PQ','UAT')),
  status VARCHAR(100) NOT NULL CHECK (status IN ('Draft', 'Approved', 'Execution', 'Completed')),
  approved_signature_id CHAR(36),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_protocol_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  template_type VARCHAR(100) NOT NULL CHECK (template_type IN ('IQ', 'OQ', 'PQ', 'UAT')),
  template_name VARCHAR(255) NOT NULL,
  template_body_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS vs_protocol_instances (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  template_id CHAR(36),
  protocol_name VARCHAR(255) NOT NULL,
  status VARCHAR(100) NOT NULL CHECK (status IN ('Draft', 'Approved', 'Execution', 'Complete')),
  approved_signature_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (plan_id) REFERENCES vs_validation_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES vs_protocol_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_test_scripts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  protocol_instance_id CHAR(36) NOT NULL,
  script_name VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (protocol_instance_id) REFERENCES vs_protocol_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vs_test_script_steps (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  script_id CHAR(36) NOT NULL,
  step_no INT NOT NULL CHECK (step_no > 0),
  -- TEXT, not VARCHAR(100): these hold free-form test-step prose, not an enum.
  -- The `_result` suffix rule in the conversion spec was wrong for these two
  -- columns and would have truncated validation evidence (strict mode errors,
  -- non-strict silently cuts). Postgres source declares both as TEXT.
  expected_result TEXT NOT NULL,
  actual_result TEXT,
  outcome VARCHAR(100) NOT NULL DEFAULT 'N/A' CHECK (outcome IN ('Pass', 'Fail', 'N/A')),
  evidence_ref VARCHAR(255),
  executed_by CHAR(36),
  executed_at DATETIME(3),
  signature_id CHAR(36),
  UNIQUE (script_id, step_no),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (script_id) REFERENCES vs_test_scripts(id) ON DELETE CASCADE,
  FOREIGN KEY (executed_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_validation_deviations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  protocol_step_id CHAR(36),
  deviation_text TEXT NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Investigating', 'Closed')),
  linked_deviation_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (protocol_step_id) REFERENCES vs_test_script_steps(id) ON DELETE SET NULL,
  FOREIGN KEY (linked_deviation_id) REFERENCES dv_deviation_records(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_validation_summary_reports (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  plan_id CHAR(36),
  file_object_id CHAR(36),
  status VARCHAR(100) NOT NULL CHECK (status IN ('Draft', 'Generated', 'Approved')),
  approved_signature_id CHAR(36),
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES vs_validation_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_revalidation_flags (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  change_type VARCHAR(100) NOT NULL,
  is_revalidation_required BOOLEAN NOT NULL,
  reason TEXT,
  flagged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vs_periodic_reviews (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  due_date DATE NOT NULL,
  alert_schedule_days JSON NOT NULL DEFAULT (JSON_ARRAY(90, 60, 30, 7)),
  last_alert_sent_days JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (system_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE
);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
