ALTER TABLE dc_documents
  ADD COLUMN IF NOT EXISTS document_subtype TEXT,
  ADD COLUMN IF NOT EXISTS site_code TEXT,
  ADD COLUMN IF NOT EXISTS criticality TEXT NOT NULL DEFAULT 'Medium'
    CHECK (criticality IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN IF NOT EXISTS training_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controlled_copy_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS change_control_ref_id UUID,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dc_document_versions
  ADD COLUMN IF NOT EXISTS reason_for_change TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_version_id UUID REFERENCES dc_document_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effective_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES qms_users(id) ON DELETE SET NULL;

ALTER TABLE dc_document_periodic_reviews
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Completed', 'Overdue')),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT;

ALTER TABLE dc_document_periodic_reviews
  DROP CONSTRAINT IF EXISTS dc_document_periodic_reviews_document_id_key;

CREATE TABLE IF NOT EXISTS dc_document_distribution_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('Role', 'User', 'Department')),
  target_value TEXT NOT NULL,
  acknowledgement_required BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, target_type, target_value)
);

CREATE TABLE IF NOT EXISTS dc_document_review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL REFERENCES dc_documents(id) ON DELETE CASCADE,
  periodic_review_id UUID REFERENCES dc_document_periodic_reviews(id) ON DELETE SET NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('Completed', 'Deferred', 'Escalated')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dc_documents_criticality
  ON dc_documents (org_id, criticality, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_versions_supersede
  ON dc_document_versions (document_id, supersedes_version_id);
CREATE INDEX IF NOT EXISTS idx_dc_reviews_status_due
  ON dc_document_periodic_reviews (org_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_dc_distribution_targets
  ON dc_document_distribution_targets (org_id, document_id, target_type, target_value);
CREATE INDEX IF NOT EXISTS idx_dc_review_history
  ON dc_document_review_history (org_id, document_id, completed_at DESC);

ALTER TABLE dc_document_distribution_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE dc_document_review_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dc_document_distribution_targets_isolation ON dc_document_distribution_targets;
CREATE POLICY dc_document_distribution_targets_isolation ON dc_document_distribution_targets
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS dc_document_review_history_isolation ON dc_document_review_history;
CREATE POLICY dc_document_review_history_isolation ON dc_document_review_history
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);
