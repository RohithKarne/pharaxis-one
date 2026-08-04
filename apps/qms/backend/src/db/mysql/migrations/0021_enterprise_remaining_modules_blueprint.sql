-- Deviation enterprise lifecycle enhancements
-- Postgres dropped the auto-named CHECK constraint dv_deviation_records_status_check
-- and re-added it with a wider status list. MySQL has no DROP CONSTRAINT IF EXISTS,
-- and the inline CHECK created by 0012 is auto-named dv_deviation_records_chk_N, so
-- the Postgres constraint name cannot be targeted here. Status-value enforcement for
-- the widened list is left to the application layer.
-- Original: ALTER TABLE dv_deviation_records DROP CONSTRAINT IF EXISTS dv_deviation_records_status_check;

-- ADD COLUMN IF NOT EXISTS -> plain ADD COLUMN (MySQL has no IF NOT EXISTS for ADD COLUMN).
ALTER TABLE dv_deviation_records
  ADD COLUMN impact_level VARCHAR(100) CHECK (impact_level IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN triage_summary TEXT,
  ADD COLUMN assigned_qa_reviewer_user_id CHAR(36),
  ADD COLUMN triaged_at DATETIME(3),
  ADD COLUMN qa_reviewed_at DATETIME(3),
  ADD COLUMN closure_summary TEXT,
  ADD COLUMN closed_by CHAR(36),
  ADD COLUMN reopened_at DATETIME(3),
  ADD COLUMN reopened_reason TEXT,
  ADD COLUMN due_date DATE;

ALTER TABLE dv_deviation_records
  ADD FOREIGN KEY (assigned_qa_reviewer_user_id) REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL;

-- Original: ALTER TABLE dv_deviation_records
--   ADD CONSTRAINT dv_deviation_records_status_check CHECK (
--     status IN ('Open', 'Triage', 'Containment', 'Investigation', 'QAReview', 'CapaLinked', 'Closed', 'Reopened')
--   );
-- Not emitted: the narrower CHECK from 0012 cannot be dropped by name in MySQL, so
-- adding this one would AND with it and still reject the new statuses.

CREATE TABLE IF NOT EXISTS dv_history_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  deviation_id CHAR(36) NOT NULL,
  action_key VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (deviation_id) REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_dv_records_status_due
  ON dv_deviation_records (org_id, status, due_date, updated_at DESC);
CREATE INDEX idx_dv_history_deviation
  ON dv_history_events (org_id, deviation_id, occurred_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).

-- Audit enterprise lifecycle enhancements
-- Original: ALTER TABLE au_audits DROP CONSTRAINT IF EXISTS au_audits_status_check;

ALTER TABLE au_audits
  ADD COLUMN started_at DATETIME(3),
  ADD COLUMN actual_end_date DATE,
  ADD COLUMN closure_summary TEXT,
  ADD COLUMN closed_by CHAR(36);

ALTER TABLE au_audits
  ADD FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL;

-- Original: ALTER TABLE au_audits
--   ADD CONSTRAINT au_audits_status_check CHECK (
--     status IN ('Planned', 'InProgress', 'FindingsCaptured', 'ResponseInProgress', 'QAReview', 'Closed')
--   );
-- Not emitted: see the dv_deviation_records note above.

ALTER TABLE au_findings
  ADD COLUMN finding_code VARCHAR(100),
  ADD COLUMN due_date DATE,
  ADD COLUMN response_due_date DATE,
  ADD COLUMN closure_summary TEXT,
  ADD COLUMN closed_by CHAR(36),
  ADD COLUMN closed_at DATETIME(3),
  ADD COLUMN effectiveness_result VARCHAR(100) CHECK (effectiveness_result IN ('Effective', 'PartiallyEffective', 'NotEffective'));

ALTER TABLE au_findings
  ADD FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS au_history_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  audit_id CHAR(36) NOT NULL,
  finding_id CHAR(36),
  action_key VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_id) REFERENCES au_audits(id) ON DELETE CASCADE,
  FOREIGN KEY (finding_id) REFERENCES au_findings(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_au_findings_status_due
  ON au_findings (org_id, status, due_date, created_at DESC);
CREATE INDEX idx_au_history_audit
  ON au_history_events (org_id, audit_id, occurred_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).

-- Validation enterprise blueprint enhancements
ALTER TABLE vs_system_inventory
  ADD COLUMN validation_scope VARCHAR(255),
  ADD COLUMN compliance_impact VARCHAR(255),
  ADD COLUMN retired_at DATETIME(3),
  ADD COLUMN validated_at DATETIME(3),
  ADD COLUMN validated_by CHAR(36);

ALTER TABLE vs_system_inventory
  ADD FOREIGN KEY (validated_by) REFERENCES qms_users(id) ON DELETE SET NULL;

-- Original: ALTER TABLE vs_periodic_reviews DROP CONSTRAINT IF EXISTS vs_periodic_reviews_system_id_key;
-- MySQL has no DROP CONSTRAINT IF EXISTS. The Postgres UNIQUE (system_id) becomes an
-- index named `system_id` in MySQL; dropping it unconditionally would abort this whole
-- file if 0014 did not emit that UNIQUE. Left in place — flagged for the orchestrator.

CREATE TABLE IF NOT EXISTS vs_requirement_specs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  requirement_code VARCHAR(100) NOT NULL,
  requirement_type VARCHAR(100) NOT NULL CHECK (requirement_type IN ('URS', 'FS', 'DS', 'CS')),
  description TEXT NOT NULL,
  risk_level VARCHAR(100) NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (system_id, requirement_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_trace_matrix_entries (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  requirement_id CHAR(36) NOT NULL,
  plan_id CHAR(36),
  protocol_instance_id CHAR(36),
  script_id CHAR(36),
  step_id CHAR(36),
  trace_status VARCHAR(100) NOT NULL DEFAULT 'Pending' CHECK (trace_status IN ('Pending', 'InProgress', 'Pass', 'Fail')),
  notes TEXT,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (requirement_id) REFERENCES vs_requirement_specs(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES vs_validation_plans(id) ON DELETE SET NULL,
  FOREIGN KEY (protocol_instance_id) REFERENCES vs_protocol_instances(id) ON DELETE SET NULL,
  FOREIGN KEY (script_id) REFERENCES vs_test_scripts(id) ON DELETE SET NULL,
  FOREIGN KEY (step_id) REFERENCES vs_test_script_steps(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS vs_history_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  system_id CHAR(36) NOT NULL,
  action_key VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (system_id) REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_vs_requirements_system
  ON vs_requirement_specs (org_id, system_id, requirement_type, created_at DESC);
CREATE INDEX idx_vs_trace_system
  ON vs_trace_matrix_entries (org_id, system_id, trace_status, updated_at DESC);
CREATE INDEX idx_vs_history_system
  ON vs_history_events (org_id, system_id, occurred_at DESC);
CREATE UNIQUE INDEX uq_vs_trace_requirement_step_norm
  ON vs_trace_matrix_entries (requirement_id, (COALESCE(step_id, '00000000-0000-0000-0000-000000000000')));

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).

-- Change control enterprise lifecycle enhancements
-- Original: ALTER TABLE cc_change_records DROP CONSTRAINT IF EXISTS cc_change_records_status_check;

ALTER TABLE cc_change_records
  ADD COLUMN cab_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN cab_decision VARCHAR(100) CHECK (cab_decision IN ('Approve', 'Reject', 'ConditionalApprove')),
  ADD COLUMN cab_reviewed_by CHAR(36),
  ADD COLUMN cab_reviewed_at DATETIME(3),
  ADD COLUMN reopened_at DATETIME(3),
  ADD COLUMN reopened_reason TEXT;

ALTER TABLE cc_change_records
  ADD FOREIGN KEY (cab_reviewed_by) REFERENCES qms_users(id) ON DELETE SET NULL;

-- Original: ALTER TABLE cc_change_records
--   ADD CONSTRAINT cc_change_records_status_check CHECK (
--     status IN ('Draft', 'ImpactAssessment', 'PendingApproval', 'CabReview', 'Approved', 'Implementation', 'Closed', 'Rejected', 'Reopened')
--   );
-- Not emitted: see the dv_deviation_records note above.

CREATE TABLE IF NOT EXISTS cc_history_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  change_id CHAR(36) NOT NULL,
  action_key VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (change_id) REFERENCES cc_change_records(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_cc_history_change
  ON cc_history_events (org_id, change_id, occurred_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).

-- Cross-module traceability + training foundation
CREATE TABLE IF NOT EXISTS qms_trace_links (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  source_module VARCHAR(100) NOT NULL,
  source_table VARCHAR(100) NOT NULL,
  source_id CHAR(36) NOT NULL,
  target_module VARCHAR(100) NOT NULL,
  target_table VARCHAR(100) NOT NULL,
  target_id CHAR(36) NOT NULL,
  link_type VARCHAR(100) NOT NULL DEFAULT 'Reference',
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (source_module, source_table, source_id, target_module, target_table, target_id, link_type),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_training_catalog (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  training_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source_module VARCHAR(100),
  source_table VARCHAR(100),
  source_id CHAR(36),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (org_id, training_code),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_training_assignments (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  training_id CHAR(36) NOT NULL,
  assigned_user_id CHAR(36),
  assigned_role_key VARCHAR(100),
  due_date DATE,
  status VARCHAR(100) NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned', 'InProgress', 'Completed', 'Overdue')),
  assigned_by CHAR(36),
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (training_id) REFERENCES qms_training_catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_user_id) REFERENCES qms_users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qms_training_completions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  assignment_id CHAR(36) NOT NULL,
  user_id CHAR(36),
  completion_notes TEXT,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (assignment_id, user_id),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (assignment_id) REFERENCES qms_training_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_qms_trace_links_source
  ON qms_trace_links (org_id, source_module, source_table, source_id, created_at DESC);
CREATE INDEX idx_qms_trace_links_target
  ON qms_trace_links (org_id, target_module, target_table, target_id, created_at DESC);
CREATE INDEX idx_qms_training_assignments_due
  ON qms_training_assignments (org_id, status, due_date, assigned_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
