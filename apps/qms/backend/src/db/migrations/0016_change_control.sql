CREATE TABLE IF NOT EXISTS cc_change_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  change_code TEXT NOT NULL,
  title TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('Standard', 'Major', 'Emergency')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'Draft',
      'ImpactAssessment',
      'PendingApproval',
      'Approved',
      'Implementation',
      'Closed',
      'Rejected'
    )
  ),
  risk_level TEXT NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('High', 'Medium', 'Low')),
  owner_user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  requested_by_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  linked_document_id UUID REFERENCES dc_documents(id) ON DELETE SET NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  approved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closure_summary TEXT,
  effectiveness_result TEXT CHECK (
    effectiveness_result IN ('Effective', 'PartiallyEffective', 'NotEffective')
  ),
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, change_code)
);

CREATE TABLE IF NOT EXISTS cc_impact_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  change_id UUID NOT NULL REFERENCES cc_change_records(id) ON DELETE CASCADE,
  assessment_summary TEXT NOT NULL,
  impacted_modules TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  risk_level TEXT NOT NULL CHECK (risk_level IN ('High', 'Medium', 'Low')),
  assessed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (change_id)
);

CREATE TABLE IF NOT EXISTS cc_approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  change_id UUID NOT NULL REFERENCES cc_change_records(id) ON DELETE CASCADE,
  approver_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('Approve', 'Reject')),
  comments TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cc_implementation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  change_id UUID NOT NULL REFERENCES cc_change_records(id) ON DELETE CASCADE,
  step_no INT NOT NULL CHECK (step_no > 0),
  step_title TEXT NOT NULL,
  step_status TEXT NOT NULL CHECK (step_status IN ('Planned', 'InProgress', 'Completed', 'Blocked')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  evidence_ref TEXT,
  updated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (change_id, step_no)
);

CREATE INDEX IF NOT EXISTS idx_cc_records_status ON cc_change_records (org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_records_risk ON cc_change_records (org_id, risk_level, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_steps_status ON cc_implementation_steps (org_id, step_status, updated_at DESC);

ALTER TABLE cc_change_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_impact_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_implementation_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cc_change_records_isolation ON cc_change_records;
CREATE POLICY cc_change_records_isolation ON cc_change_records
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS cc_impact_assessments_isolation ON cc_impact_assessments;
CREATE POLICY cc_impact_assessments_isolation ON cc_impact_assessments
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS cc_approval_records_isolation ON cc_approval_records;
CREATE POLICY cc_approval_records_isolation ON cc_approval_records
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS cc_implementation_steps_isolation ON cc_implementation_steps;
CREATE POLICY cc_implementation_steps_isolation ON cc_implementation_steps
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);
