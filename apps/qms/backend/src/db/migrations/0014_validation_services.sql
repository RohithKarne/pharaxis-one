CREATE TABLE IF NOT EXISTS vs_system_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_name TEXT NOT NULL,
  vendor TEXT,
  version TEXT,
  system_owner_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  gamp_category TEXT NOT NULL CHECK (gamp_category IN ('1', '3', '4', '5')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
  validation_status TEXT NOT NULL CHECK (
    validation_status IN ('Planned', 'InProgress', 'Validated', 'OverdueReview', 'Retired')
  ),
  next_review_due_date DATE,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_validation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  approach TEXT,
  responsibilities TEXT,
  protocol_types TEXT[] NOT NULL DEFAULT ARRAY['IQ','OQ','PQ','UAT'],
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Approved', 'Execution', 'Completed')),
  approved_signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_protocol_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  template_type TEXT NOT NULL CHECK (template_type IN ('IQ', 'OQ', 'PQ', 'UAT')),
  template_name TEXT NOT NULL,
  template_body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_protocol_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES vs_validation_plans(id) ON DELETE CASCADE,
  template_id UUID REFERENCES vs_protocol_templates(id) ON DELETE SET NULL,
  protocol_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Approved', 'Execution', 'Complete')),
  approved_signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_test_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  protocol_instance_id UUID NOT NULL REFERENCES vs_protocol_instances(id) ON DELETE CASCADE,
  script_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_test_script_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  script_id UUID NOT NULL REFERENCES vs_test_scripts(id) ON DELETE CASCADE,
  step_no INT NOT NULL CHECK (step_no > 0),
  expected_result TEXT NOT NULL,
  actual_result TEXT,
  outcome TEXT NOT NULL DEFAULT 'N/A' CHECK (outcome IN ('Pass', 'Fail', 'N/A')),
  evidence_ref TEXT,
  executed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  UNIQUE (script_id, step_no)
);

CREATE TABLE IF NOT EXISTS vs_validation_deviations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  protocol_step_id UUID REFERENCES vs_test_script_steps(id) ON DELETE SET NULL,
  deviation_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Investigating', 'Closed')),
  linked_deviation_id UUID REFERENCES dv_deviation_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_validation_summary_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES vs_validation_plans(id) ON DELETE SET NULL,
  file_object_id UUID,
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Generated', 'Approved')),
  approved_signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_revalidation_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  is_revalidation_required BOOLEAN NOT NULL,
  reason TEXT,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vs_periodic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  system_id UUID NOT NULL REFERENCES vs_system_inventory(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  alert_schedule_days INT[] NOT NULL DEFAULT ARRAY[90, 60, 30, 7],
  last_alert_sent_days INT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (system_id)
);

ALTER TABLE vs_system_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_validation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_protocol_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_protocol_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_test_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_test_script_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_validation_deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_validation_summary_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_revalidation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE vs_periodic_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vs_system_inventory_isolation ON vs_system_inventory;
CREATE POLICY vs_system_inventory_isolation ON vs_system_inventory
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_validation_plans_isolation ON vs_validation_plans;
CREATE POLICY vs_validation_plans_isolation ON vs_validation_plans
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_protocol_templates_isolation ON vs_protocol_templates;
CREATE POLICY vs_protocol_templates_isolation ON vs_protocol_templates
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_protocol_instances_isolation ON vs_protocol_instances;
CREATE POLICY vs_protocol_instances_isolation ON vs_protocol_instances
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_test_scripts_isolation ON vs_test_scripts;
CREATE POLICY vs_test_scripts_isolation ON vs_test_scripts
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_test_script_steps_isolation ON vs_test_script_steps;
CREATE POLICY vs_test_script_steps_isolation ON vs_test_script_steps
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_validation_deviations_isolation ON vs_validation_deviations;
CREATE POLICY vs_validation_deviations_isolation ON vs_validation_deviations
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_validation_summary_reports_isolation ON vs_validation_summary_reports;
CREATE POLICY vs_validation_summary_reports_isolation ON vs_validation_summary_reports
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_revalidation_flags_isolation ON vs_revalidation_flags;
CREATE POLICY vs_revalidation_flags_isolation ON vs_revalidation_flags
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS vs_periodic_reviews_isolation ON vs_periodic_reviews;
CREATE POLICY vs_periodic_reviews_isolation ON vs_periodic_reviews
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

