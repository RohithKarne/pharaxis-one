CREATE TABLE IF NOT EXISTS au_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  audit_code TEXT NOT NULL,
  audit_title TEXT NOT NULL,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('Internal', 'External', 'RegulatoryInspection')),
  scope TEXT NOT NULL,
  planned_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('Planned', 'InProgress', 'FindingsCaptured', 'Closed')
  ),
  lead_auditor_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, audit_code)
);

CREATE TABLE IF NOT EXISTS au_audit_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  audit_id UUID NOT NULL REFERENCES au_audits(id) ON DELETE CASCADE,
  auditor_user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('Lead', 'CoAuditor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audit_id, auditor_user_id)
);

CREATE TABLE IF NOT EXISTS au_pre_audit_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  audit_id UUID NOT NULL REFERENCES au_audits(id) ON DELETE CASCADE,
  checklist_key TEXT NOT NULL,
  item_text TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS au_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  audit_id UUID NOT NULL REFERENCES au_audits(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (
    finding_type IN ('Observation', 'Minor', 'Major', 'Critical')
  ),
  department TEXT,
  process_area TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS au_finding_capa_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  finding_id UUID NOT NULL REFERENCES au_findings(id) ON DELETE CASCADE,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finding_id, capa_id)
);

CREATE TABLE IF NOT EXISTS au_auditee_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  finding_id UUID NOT NULL REFERENCES au_findings(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  proposed_action TEXT,
  responded_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS au_audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  audit_id UUID NOT NULL REFERENCES au_audits(id) ON DELETE CASCADE,
  file_object_id UUID,
  generated_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS au_binder_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  job_status TEXT NOT NULL CHECK (job_status IN ('Queued', 'Processing', 'Completed', 'Failed')),
  total_records INT NOT NULL DEFAULT 0,
  duration_ms INT,
  file_object_id UUID,
  error_message TEXT,
  requested_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS au_binder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  binder_job_id UUID NOT NULL REFERENCES au_binder_jobs(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE au_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_audit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_pre_audit_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_finding_capa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_auditee_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_audit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_binder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE au_binder_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS au_audits_isolation ON au_audits;
CREATE POLICY au_audits_isolation ON au_audits
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_audit_assignments_isolation ON au_audit_assignments;
CREATE POLICY au_audit_assignments_isolation ON au_audit_assignments
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_pre_audit_checklists_isolation ON au_pre_audit_checklists;
CREATE POLICY au_pre_audit_checklists_isolation ON au_pre_audit_checklists
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_findings_isolation ON au_findings;
CREATE POLICY au_findings_isolation ON au_findings
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_finding_capa_links_isolation ON au_finding_capa_links;
CREATE POLICY au_finding_capa_links_isolation ON au_finding_capa_links
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_auditee_responses_isolation ON au_auditee_responses;
CREATE POLICY au_auditee_responses_isolation ON au_auditee_responses
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_audit_reports_isolation ON au_audit_reports;
CREATE POLICY au_audit_reports_isolation ON au_audit_reports
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_binder_jobs_isolation ON au_binder_jobs;
CREATE POLICY au_binder_jobs_isolation ON au_binder_jobs
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS au_binder_items_isolation ON au_binder_items;
CREATE POLICY au_binder_items_isolation ON au_binder_items
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

