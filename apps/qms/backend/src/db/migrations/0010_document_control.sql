CREATE TABLE IF NOT EXISTS dc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_code TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (
    document_type IN ('SOP', 'Work Instruction', 'Policy', 'Form', 'Protocol')
  ),
  department TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  review_interval_days INT NOT NULL DEFAULT 365 CHECK (review_interval_days > 0),
  next_review_due_date DATE,
  controlled_preview_enabled BOOLEAN NOT NULL DEFAULT true,
  download_allowed BOOLEAN NOT NULL DEFAULT false,
  print_allowed BOOLEAN NOT NULL DEFAULT false,
  binder_includable BOOLEAN NOT NULL DEFAULT true,
  active_version_id UUID,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, document_code)
);

CREATE TABLE IF NOT EXISTS dc_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE RESTRICT,
  version_no INT NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Review', 'Approved', 'Effective', 'Retired')),
  content_summary TEXT,
  effective_date DATE,
  retired_at TIMESTAMPTZ,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);

ALTER TABLE dc_documents
  ADD CONSTRAINT dc_documents_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES dc_document_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dc_document_workflow_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL REFERENCES dc_document_versions(id) ON DELETE RESTRICT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  acted_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  notes TEXT,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dc_document_periodic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE RESTRICT,
  due_date DATE NOT NULL,
  alert_schedule_days INT[] NOT NULL DEFAULT ARRAY[90, 60, 30, 7],
  last_alert_sent_days INT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

CREATE TABLE IF NOT EXISTS dc_document_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL REFERENCES dc_document_versions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, user_id)
);

CREATE TABLE IF NOT EXISTS dc_document_access_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE RESTRICT,
  role_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_download BOOLEAN NOT NULL DEFAULT false,
  can_print BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, role_key)
);

CREATE TABLE IF NOT EXISTS dc_document_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL REFERENCES dc_document_versions(id) ON DELETE RESTRICT,
  binder_job_reference TEXT,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exported_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  export_format TEXT NOT NULL DEFAULT 'PDF'
);

CREATE INDEX IF NOT EXISTS idx_dc_documents_filters
  ON dc_documents (org_id, document_type, department, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_dc_documents_title
  ON dc_documents (org_id, lower(title));
CREATE INDEX IF NOT EXISTS idx_dc_versions_status
  ON dc_document_versions (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_workflow_events
  ON dc_document_workflow_events (org_id, document_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_ack_user
  ON dc_document_acknowledgements (org_id, user_id, acknowledged_at DESC);

ALTER TABLE dc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_periodic_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dc_documents_isolation ON dc_documents;
CREATE POLICY dc_documents_isolation ON dc_documents
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_versions_isolation ON dc_document_versions;
CREATE POLICY dc_document_versions_isolation ON dc_document_versions
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_workflow_events_isolation ON dc_document_workflow_events;
CREATE POLICY dc_document_workflow_events_isolation ON dc_document_workflow_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_periodic_reviews_isolation ON dc_document_periodic_reviews;
CREATE POLICY dc_document_periodic_reviews_isolation ON dc_document_periodic_reviews
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_acknowledgements_isolation ON dc_document_acknowledgements;
CREATE POLICY dc_document_acknowledgements_isolation ON dc_document_acknowledgements
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_access_policies_isolation ON dc_document_access_policies;
CREATE POLICY dc_document_access_policies_isolation ON dc_document_access_policies
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_exports_isolation ON dc_document_exports;
CREATE POLICY dc_document_exports_isolation ON dc_document_exports
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

