-- Deviation enterprise lifecycle enhancements
ALTER TABLE dv_deviation_records
  DROP CONSTRAINT IF EXISTS dv_deviation_records_status_check;

ALTER TABLE dv_deviation_records
  ADD COLUMN IF NOT EXISTS impact_level TEXT CHECK (impact_level IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN IF NOT EXISTS triage_summary TEXT,
  ADD COLUMN IF NOT EXISTS assigned_qa_reviewer_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qa_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closure_summary TEXT,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_reason TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE dv_deviation_records
  ADD CONSTRAINT dv_deviation_records_status_check CHECK (
    status IN ('Open', 'Triage', 'Containment', 'Investigation', 'QAReview', 'CapaLinked', 'Closed', 'Reopened')
  );

CREATE TABLE IF NOT EXISTS dv_history_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  deviation_id UUID NOT NULL REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dv_records_status_due
  ON dv_deviation_records (org_id, status, due_date, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dv_history_deviation
  ON dv_history_events (org_id, deviation_id, occurred_at DESC);

ALTER TABLE dv_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dv_history_events_isolation ON dv_history_events;
CREATE POLICY dv_history_events_isolation ON dv_history_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

-- Audit enterprise lifecycle enhancements
ALTER TABLE au_audits
  DROP CONSTRAINT IF EXISTS au_audits_status_check;

ALTER TABLE au_audits
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE,
  ADD COLUMN IF NOT EXISTS closure_summary TEXT,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL;

ALTER TABLE au_audits
  ADD CONSTRAINT au_audits_status_check CHECK (
    status IN ('Planned', 'InProgress', 'FindingsCaptured', 'ResponseInProgress', 'QAReview', 'Closed')
  );

ALTER TABLE au_findings
  ADD COLUMN IF NOT EXISTS finding_code TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS response_due_date DATE,
  ADD COLUMN IF NOT EXISTS closure_summary TEXT,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effectiveness_result TEXT CHECK (effectiveness_result IN ('Effective', 'PartiallyEffective', 'NotEffective'));

CREATE TABLE IF NOT EXISTS au_history_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  audit_id UUID NOT NULL REFERENCES au_audits(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES au_findings(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_au_findings_status_due
  ON au_findings (org_id, status, due_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_au_history_audit
  ON au_history_events (org_id, audit_id, occurred_at DESC);

ALTER TABLE au_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS au_history_events_isolation ON au_history_events;
CREATE POLICY au_history_events_isolation ON au_history_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

-- Validation enterprise blueprint enhancements
ALTER TABLE vs_system_inventory
  ADD COLUMN IF NOT EXISTS validation_scope TEXT,
  ADD COLUMN IF NOT EXISTS compliance_impact TEXT,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL;

ALTER TABLE vs_periodic_reviews
  DROP CONSTRAINT IF EXISTS vs_periodic_reviews_system_id_key;

CREATE TABLE IF NOT EXISTS vs_requirement_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  requirement_code TEXT NOT NULL,
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('URS', 'FS', 'DS', 'CS')),
  description TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (system_id, requirement_code)
);

CREATE TABLE IF NOT EXISTS vs_trace_matrix_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES vs_requirement_specs(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES vs_validation_plans(id) ON DELETE SET NULL,
  protocol_instance_id UUID REFERENCES vs_protocol_instances(id) ON DELETE SET NULL,
  script_id UUID REFERENCES vs_test_scripts(id) ON DELETE SET NULL,
  step_id UUID REFERENCES vs_test_script_steps(id) ON DELETE SET NULL,
  trace_status TEXT NOT NULL DEFAULT 'Pending' CHECK (trace_status IN ('Pending', 'InProgress', 'Pass', 'Fail')),
  notes TEXT,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_history_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vs_requirements_system
  ON vs_requirement_specs (org_id, system_id, requirement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_trace_system
  ON vs_trace_matrix_entries (org_id, system_id, trace_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_history_system
  ON vs_history_events (org_id, system_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vs_trace_requirement_step_norm
  ON vs_trace_matrix_entries (requirement_id, COALESCE(step_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE vs_requirement_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_trace_matrix_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vs_requirement_specs_isolation ON vs_requirement_specs;
CREATE POLICY vs_requirement_specs_isolation ON vs_requirement_specs
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_trace_matrix_entries_isolation ON vs_trace_matrix_entries;
CREATE POLICY vs_trace_matrix_entries_isolation ON vs_trace_matrix_entries
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_history_events_isolation ON vs_history_events;
CREATE POLICY vs_history_events_isolation ON vs_history_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

-- Change control enterprise lifecycle enhancements
ALTER TABLE cc_change_records
  DROP CONSTRAINT IF EXISTS cc_change_records_status_check;

ALTER TABLE cc_change_records
  ADD COLUMN IF NOT EXISTS cab_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cab_decision TEXT CHECK (cab_decision IN ('Approve', 'Reject', 'ConditionalApprove')),
  ADD COLUMN IF NOT EXISTS cab_reviewed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cab_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_reason TEXT;

ALTER TABLE cc_change_records
  ADD CONSTRAINT cc_change_records_status_check CHECK (
    status IN ('Draft', 'ImpactAssessment', 'PendingApproval', 'CabReview', 'Approved', 'Implementation', 'Closed', 'Rejected', 'Reopened')
  );

CREATE TABLE IF NOT EXISTS cc_history_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  change_id UUID NOT NULL REFERENCES cc_change_records(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_history_change
  ON cc_history_events (org_id, change_id, occurred_at DESC);

ALTER TABLE cc_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cc_history_events_isolation ON cc_history_events;
CREATE POLICY cc_history_events_isolation ON cc_history_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

-- Cross-module traceability + training foundation
CREATE TABLE IF NOT EXISTS qms_trace_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  source_module TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  target_module TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'Reference',
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_module, source_table, source_id, target_module, target_table, target_id, link_type)
);

CREATE TABLE IF NOT EXISTS qms_training_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  training_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_module TEXT,
  source_table TEXT,
  source_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, training_code)
);

CREATE TABLE IF NOT EXISTS qms_training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  training_id UUID NOT NULL REFERENCES qms_training_catalog(id) ON DELETE CASCADE,
  assigned_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  assigned_role_key TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned', 'InProgress', 'Completed', 'Overdue')),
  assigned_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qms_training_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES qms_training_assignments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  completion_notes TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_qms_trace_links_source
  ON qms_trace_links (org_id, source_module, source_table, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qms_trace_links_target
  ON qms_trace_links (org_id, target_module, target_table, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qms_training_assignments_due
  ON qms_training_assignments (org_id, status, due_date, assigned_at DESC);

ALTER TABLE qms_trace_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_training_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_training_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qms_trace_links_isolation ON qms_trace_links;
CREATE POLICY qms_trace_links_isolation ON qms_trace_links
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_training_catalog_isolation ON qms_training_catalog;
CREATE POLICY qms_training_catalog_isolation ON qms_training_catalog
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_training_assignments_isolation ON qms_training_assignments;
CREATE POLICY qms_training_assignments_isolation ON qms_training_assignments
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_training_completions_isolation ON qms_training_completions;
CREATE POLICY qms_training_completions_isolation ON qms_training_completions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);
