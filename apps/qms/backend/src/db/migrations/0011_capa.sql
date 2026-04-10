CREATE TABLE IF NOT EXISTS ca_capa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_code TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('Deviation', 'AuditFinding', 'Manual')),
  source_ref_id UUID,
  classification TEXT NOT NULL CHECK (classification IN ('Corrective', 'Preventive', 'Both')),
  status TEXT NOT NULL CHECK (
    status IN ('Draft', 'PlanApproval', 'InProgress', 'EffectivenessPending', 'Closed')
  ),
  root_cause_summary TEXT,
  owner_user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  due_date DATE,
  effectiveness_result TEXT CHECK (effectiveness_result IN ('Pass', 'Fail')),
  effective_verified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, capa_code)
);

CREATE TABLE IF NOT EXISTS ca_root_cause_5why (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  why_level INT NOT NULL CHECK (why_level BETWEEN 1 AND 5),
  answer TEXT NOT NULL,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (capa_id, why_level)
);

CREATE TABLE IF NOT EXISTS ca_root_cause_fishbone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  cause TEXT NOT NULL,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ca_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assigned_owner_user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  due_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NotStarted', 'InProgress', 'Complete')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ca_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  action_item_id UUID REFERENCES ca_action_items(id) ON DELETE SET NULL,
  escalated_to_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ca_effectiveness_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  criteria TEXT NOT NULL,
  evidence_ref TEXT,
  result TEXT NOT NULL CHECK (result IN ('Pass', 'Fail')),
  signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  checked_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_records_status ON ca_capa_records (org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_actions_due ON ca_action_items (org_id, due_date, status);

ALTER TABLE ca_capa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_root_cause_5why ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_root_cause_fishbone ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_effectiveness_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ca_capa_records_isolation ON ca_capa_records;
CREATE POLICY ca_capa_records_isolation ON ca_capa_records
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ca_root_cause_5why_isolation ON ca_root_cause_5why;
CREATE POLICY ca_root_cause_5why_isolation ON ca_root_cause_5why
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ca_root_cause_fishbone_isolation ON ca_root_cause_fishbone;
CREATE POLICY ca_root_cause_fishbone_isolation ON ca_root_cause_fishbone
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ca_action_items_isolation ON ca_action_items;
CREATE POLICY ca_action_items_isolation ON ca_action_items
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ca_escalations_isolation ON ca_escalations;
CREATE POLICY ca_escalations_isolation ON ca_escalations
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ca_effectiveness_checks_isolation ON ca_effectiveness_checks;
CREATE POLICY ca_effectiveness_checks_isolation ON ca_effectiveness_checks
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

