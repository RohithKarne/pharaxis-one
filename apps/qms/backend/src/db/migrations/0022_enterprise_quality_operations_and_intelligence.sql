CREATE TABLE IF NOT EXISTS qc_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  complaint_code TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('Customer', 'Regulatory', 'Internal', 'Partner')),
  customer_name TEXT,
  product_name TEXT,
  batch_lot_no TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Investigation', 'CapaLinked', 'Closed', 'Escalated')),
  summary TEXT NOT NULL,
  details TEXT,
  assigned_to UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  due_date DATE,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, complaint_code)
);

CREATE TABLE IF NOT EXISTS qc_complaint_capa_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  complaint_id UUID NOT NULL REFERENCES qc_complaints(id) ON DELETE CASCADE,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  linked_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (complaint_id, capa_id)
);

CREATE TABLE IF NOT EXISTS qn_nonconformance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  nc_code TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('Manufacturing', 'Supplier', 'Audit', 'IncomingInspection', 'Warehouse', 'Laboratory')),
  item_reference TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  disposition TEXT CHECK (disposition IN ('UseAsIs', 'Rework', 'Reject', 'ReturnToSupplier', 'Scrap')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Containment', 'Dispositioned', 'CapaLinked', 'Closed')),
  summary TEXT NOT NULL,
  details TEXT,
  assigned_to UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  due_date DATE,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, nc_code)
);

CREATE TABLE IF NOT EXISTS qn_nonconformance_capa_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  nonconformance_id UUID NOT NULL REFERENCES qn_nonconformance_records(id) ON DELETE CASCADE,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  linked_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nonconformance_id, capa_id)
);

CREATE TABLE IF NOT EXISTS sq_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  supplier_code TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_type TEXT NOT NULL CHECK (supplier_type IN ('RawMaterial', 'ContractManufacturer', 'ServiceProvider', 'Laboratory', 'Distributor')),
  contact_email TEXT,
  qualification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (qualification_status IN ('Pending', 'Qualified', 'Conditional', 'Disqualified')),
  risk_level TEXT NOT NULL DEFAULT 'Medium' CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  scorecard_rating NUMERIC(5,2),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, supplier_code)
);

CREATE TABLE IF NOT EXISTS sq_supplier_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES sq_suppliers(id) ON DELETE CASCADE,
  audit_code TEXT NOT NULL,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('Onsite', 'Remote', 'DocumentReview')),
  planned_date DATE,
  outcome TEXT CHECK (outcome IN ('Pass', 'Conditional', 'Fail', 'InProgress')),
  findings_count INT NOT NULL DEFAULT 0,
  summary TEXT,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, audit_code)
);

CREATE TABLE IF NOT EXISTS sq_scar_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES sq_suppliers(id) ON DELETE CASCADE,
  scar_code TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'SupplierResponse', 'Implementation', 'Effectiveness', 'Closed')),
  due_date DATE,
  effectiveness_result TEXT CHECK (effectiveness_result IN ('Effective', 'PartiallyEffective', 'NotEffective')),
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, scar_code)
);

CREATE TABLE IF NOT EXISTS rm_risk_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  risk_code TEXT NOT NULL,
  risk_title TEXT NOT NULL,
  risk_domain TEXT NOT NULL CHECK (risk_domain IN ('Product', 'Process', 'Supplier', 'Compliance', 'Cyber', 'Clinical')),
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  occurrence INT NOT NULL CHECK (occurrence BETWEEN 1 AND 5),
  detectability INT NOT NULL CHECK (detectability BETWEEN 1 AND 5),
  risk_score INT NOT NULL,
  risk_band TEXT NOT NULL CHECK (risk_band IN ('Low', 'Medium', 'High', 'Critical')),
  mitigation_plan TEXT,
  owner_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Mitigating', 'Accepted', 'Closed')),
  review_due_date DATE,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, risk_code)
);

CREATE TABLE IF NOT EXISTS rm_risk_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  risk_id UUID NOT NULL REFERENCES rm_risk_register(id) ON DELETE CASCADE,
  review_notes TEXT NOT NULL,
  residual_score INT,
  reviewed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mr_management_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  review_code TEXT NOT NULL,
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  chairperson TEXT,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'InReview', 'Approved', 'Closed')),
  summary TEXT,
  decisions TEXT,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, review_code)
);

CREATE TABLE IF NOT EXISTS mr_review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  review_id UUID NOT NULL REFERENCES mr_management_reviews(id) ON DELETE CASCADE,
  action_title TEXT NOT NULL,
  owner_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'InProgress', 'Closed')),
  closure_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_quality_insights_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  insight_key TEXT NOT NULL,
  insight_payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  UNIQUE (org_id, insight_key)
);

CREATE TABLE IF NOT EXISTS qms_integration_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  adapter_key TEXT NOT NULL CHECK (adapter_key IN ('PLM', 'ERP', 'LIMS', 'DMS')),
  endpoint_url TEXT,
  auth_mode TEXT NOT NULL DEFAULT 'None' CHECK (auth_mode IN ('None', 'ApiKey', 'Basic', 'OAuth2')),
  status TEXT NOT NULL DEFAULT 'Disconnected' CHECK (status IN ('Disconnected', 'Connected', 'Error')),
  last_sync_at TIMESTAMPTZ,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, adapter_key)
);

CREATE TABLE IF NOT EXISTS qms_integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  adapter_id UUID NOT NULL REFERENCES qms_integration_adapters(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued', 'Running', 'Success', 'Failed')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_complaints_status_due ON qc_complaints (org_id, status, due_date, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_qn_nonconformance_status_due ON qn_nonconformance_records (org_id, status, due_date, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sq_suppliers_status_risk ON sq_suppliers (org_id, qualification_status, risk_level, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sq_scar_status_due ON sq_scar_records (org_id, status, due_date, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rm_risk_status_due ON rm_risk_register (org_id, status, review_due_date, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mr_reviews_status_period ON mr_management_reviews (org_id, status, review_period_end DESC);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_status ON qms_integration_sync_jobs (org_id, status, created_at DESC);

ALTER TABLE qc_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_complaint_capa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE qn_nonconformance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE qn_nonconformance_capa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sq_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sq_supplier_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sq_scar_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_risk_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE rm_risk_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_management_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mr_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_insights_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_integration_adapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_integration_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qc_complaints_isolation ON qc_complaints;
CREATE POLICY qc_complaints_isolation ON qc_complaints
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qc_complaint_capa_links_isolation ON qc_complaint_capa_links;
CREATE POLICY qc_complaint_capa_links_isolation ON qc_complaint_capa_links
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qn_nonconformance_records_isolation ON qn_nonconformance_records;
CREATE POLICY qn_nonconformance_records_isolation ON qn_nonconformance_records
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qn_nonconformance_capa_links_isolation ON qn_nonconformance_capa_links;
CREATE POLICY qn_nonconformance_capa_links_isolation ON qn_nonconformance_capa_links
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sq_suppliers_isolation ON sq_suppliers;
CREATE POLICY sq_suppliers_isolation ON sq_suppliers
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sq_supplier_audits_isolation ON sq_supplier_audits;
CREATE POLICY sq_supplier_audits_isolation ON sq_supplier_audits
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS sq_scar_records_isolation ON sq_scar_records;
CREATE POLICY sq_scar_records_isolation ON sq_scar_records
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS rm_risk_register_isolation ON rm_risk_register;
CREATE POLICY rm_risk_register_isolation ON rm_risk_register
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS rm_risk_reviews_isolation ON rm_risk_reviews;
CREATE POLICY rm_risk_reviews_isolation ON rm_risk_reviews
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS mr_management_reviews_isolation ON mr_management_reviews;
CREATE POLICY mr_management_reviews_isolation ON mr_management_reviews
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS mr_review_actions_isolation ON mr_review_actions;
CREATE POLICY mr_review_actions_isolation ON mr_review_actions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ai_quality_insights_cache_isolation ON ai_quality_insights_cache;
CREATE POLICY ai_quality_insights_cache_isolation ON ai_quality_insights_cache
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_integration_adapters_isolation ON qms_integration_adapters;
CREATE POLICY qms_integration_adapters_isolation ON qms_integration_adapters
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS qms_integration_sync_jobs_isolation ON qms_integration_sync_jobs;
CREATE POLICY qms_integration_sync_jobs_isolation ON qms_integration_sync_jobs
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);
