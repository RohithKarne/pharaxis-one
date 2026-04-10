CREATE TABLE IF NOT EXISTS dv_deviation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  deviation_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deviation_type TEXT NOT NULL CHECK (
    deviation_type IN ('Product', 'Process', 'System', 'Environmental')
  ),
  classification TEXT NOT NULL CHECK (classification IN ('Critical', 'Major', 'Minor')),
  status TEXT NOT NULL CHECK (
    status IN ('Open', 'Investigation', 'CapaLinked', 'Closed')
  ),
  date_of_occurrence DATE NOT NULL,
  department TEXT NOT NULL,
  detected_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  root_cause TEXT,
  reportability_status TEXT NOT NULL DEFAULT 'Under Review' CHECK (
    reportability_status IN ('Yes', 'No', 'Under Review')
  ),
  reportability_reason TEXT,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, deviation_code)
);

CREATE TABLE IF NOT EXISTS dv_containment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  deviation_id UUID NOT NULL REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  action_text TEXT NOT NULL,
  recorded_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dv_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  deviation_id UUID NOT NULL REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  investigator_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  due_date DATE,
  findings TEXT,
  evidence_ref TEXT,
  status TEXT NOT NULL DEFAULT 'Assigned' CHECK (
    status IN ('Assigned', 'InProgress', 'Completed')
  ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dv_deviation_capa_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  deviation_id UUID NOT NULL REFERENCES dv_deviation_records(id) ON DELETE CASCADE,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deviation_id, capa_id)
);

ALTER TABLE dv_deviation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE dv_containment_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dv_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dv_deviation_capa_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dv_deviation_records_isolation ON dv_deviation_records;
CREATE POLICY dv_deviation_records_isolation ON dv_deviation_records
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dv_containment_actions_isolation ON dv_containment_actions;
CREATE POLICY dv_containment_actions_isolation ON dv_containment_actions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dv_investigations_isolation ON dv_investigations;
CREATE POLICY dv_investigations_isolation ON dv_investigations
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dv_deviation_capa_links_isolation ON dv_deviation_capa_links;
CREATE POLICY dv_deviation_capa_links_isolation ON dv_deviation_capa_links
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

