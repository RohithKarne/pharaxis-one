CREATE TABLE IF NOT EXISTS ieg_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_user_modules (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES ieg_users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'eap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_key)
);

CREATE TABLE IF NOT EXISTS ieg_external_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('grants_applicant', 'iit_investigator', 'institution')),
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_workflows (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN ('foundation', 'grants', 'iit', 'eap')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  current_state TEXT NOT NULL,
  warning_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  state_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(module_key, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS ieg_workflow_events (
  id BIGSERIAL PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES ieg_workflows(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('internal', 'external', 'system')),
  actor_id TEXT,
  actor_label TEXT,
  note TEXT,
  warning_required BOOLEAN NOT NULL DEFAULT FALSE,
  warning_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_tasks (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'eap')),
  assigned_user_id BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('internal', 'external', 'system')),
  actor_id TEXT,
  actor_label TEXT,
  module_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ieg_documents (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'eap')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'external', 'mixed')),
  current_version INT NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_document_versions (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES ieg_documents(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  storage_path TEXT NOT NULL,
  file_sha256 TEXT,
  signature_status TEXT NOT NULL DEFAULT 'unsigned' CHECK (signature_status IN ('unsigned', 'signed')),
  signature_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, version_no)
);

CREATE TABLE IF NOT EXISTS ieg_notifications (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  recipient_user_id BIGINT REFERENCES ieg_users(id) ON DELETE CASCADE,
  recipient_external_user_id BIGINT REFERENCES ieg_external_users(id) ON DELETE CASCADE,
  template_key TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'read')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  CHECK (
    (recipient_user_id IS NOT NULL AND recipient_external_user_id IS NULL)
    OR (recipient_user_id IS NULL AND recipient_external_user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS ieg_approval_matrix (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'eap')),
  request_type TEXT NOT NULL,
  geography TEXT NOT NULL DEFAULT 'US',
  min_value NUMERIC(14,2),
  max_value NUMERIC(14,2),
  approver_chain JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_compliance_rules (
  id BIGSERIAL PRIMARY KEY,
  jurisdiction TEXT NOT NULL DEFAULT 'US',
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'shared')),
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  threshold JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(jurisdiction, module_key, rule_key)
);

CREATE TABLE IF NOT EXISTS ieg_warning_acknowledgements (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'eap')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged_by BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ieg_disbursements (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN ('grants', 'iit', 'eap')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  milestone_name TEXT,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'processed', 'on_hold', 'rejected')),
  external_reference TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_evidence_taxonomy (
  id BIGSERIAL PRIMARY KEY,
  taxonomy_type TEXT NOT NULL CHECK (taxonomy_type IN ('therapeutic_area', 'indication', 'study_objective')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(taxonomy_type, code)
);

CREATE TABLE IF NOT EXISTS ieg_grant_programs (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  cycle_name TEXT NOT NULL,
  therapeutic_scope TEXT,
  required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_grant_applications (
  id BIGSERIAL PRIMARY KEY,
  external_user_id BIGINT REFERENCES ieg_external_users(id) ON DELETE SET NULL,
  program_id BIGINT REFERENCES ieg_grant_programs(id) ON DELETE SET NULL,
  application_code TEXT NOT NULL UNIQUE,
  applicant_type TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'US',
  requested_amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  current_stage TEXT NOT NULL DEFAULT 'administrative_check',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  coi_flag BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_grant_reviews (
  id BIGSERIAL PRIMARY KEY,
  grant_application_id BIGINT NOT NULL REFERENCES ieg_grant_applications(id) ON DELETE CASCADE,
  reviewer_user_id BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  scientific_score NUMERIC(5,2),
  strategic_score NUMERIC(5,2),
  comments TEXT,
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ieg_grant_decisions (
  id BIGSERIAL PRIMARY KEY,
  grant_application_id BIGINT NOT NULL REFERENCES ieg_grant_applications(id) ON DELETE CASCADE,
  committee_user_id BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'partially_funded')),
  approved_amount NUMERIC(14,2),
  rationale TEXT NOT NULL,
  signed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_grant_milestones (
  id BIGSERIAL PRIMARY KEY,
  grant_application_id BIGINT NOT NULL REFERENCES ieg_grant_applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  deliverable TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'submitted', 'accepted', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_iit_proposals (
  id BIGSERIAL PRIMARY KEY,
  external_user_id BIGINT REFERENCES ieg_external_users(id) ON DELETE SET NULL,
  proposal_code TEXT NOT NULL UNIQUE,
  investigator_name TEXT NOT NULL,
  institution_name TEXT,
  support_type TEXT NOT NULL CHECK (support_type IN ('funding', 'drug_supply', 'both')),
  requested_amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  current_stage TEXT NOT NULL DEFAULT 'scientific_triage',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  fmv_reference_value NUMERIC(14,2),
  fmv_warning BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_iit_reviews (
  id BIGSERIAL PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  reviewer_user_id BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  triage_decision TEXT NOT NULL CHECK (triage_decision IN ('proceed', 'defer', 'reject')),
  scientific_score NUMERIC(5,2),
  strategic_score NUMERIC(5,2),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_iit_committee_votes (
  id BIGSERIAL PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  voter_user_id BIGINT REFERENCES ieg_users(id) ON DELETE SET NULL,
  function_role TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject', 'conditional_approve')),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_iit_contracts (
  id BIGSERIAL PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('full_approval', 'conditional_approval')),
  pending_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  publication_rights TEXT,
  data_rights TEXT,
  signed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_iit_milestones (
  id BIGSERIAL PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  progress_report_url TEXT,
  protocol_deviation_notes TEXT,
  budget_utilization NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ieg_iit_publications (
  id BIGSERIAL PRIMARY KEY,
  iit_proposal_id BIGINT NOT NULL REFERENCES ieg_iit_proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  milestone_status TEXT NOT NULL CHECK (milestone_status IN ('submitted', 'accepted', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION ieg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ieg_users_updated_at ON ieg_users;
CREATE TRIGGER trg_ieg_users_updated_at BEFORE UPDATE ON ieg_users
FOR EACH ROW EXECUTE FUNCTION ieg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ieg_tasks_updated_at ON ieg_tasks;
CREATE TRIGGER trg_ieg_tasks_updated_at BEFORE UPDATE ON ieg_tasks
FOR EACH ROW EXECUTE FUNCTION ieg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ieg_disbursements_updated_at ON ieg_disbursements;
CREATE TRIGGER trg_ieg_disbursements_updated_at BEFORE UPDATE ON ieg_disbursements
FOR EACH ROW EXECUTE FUNCTION ieg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ieg_grant_applications_updated_at ON ieg_grant_applications;
CREATE TRIGGER trg_ieg_grant_applications_updated_at BEFORE UPDATE ON ieg_grant_applications
FOR EACH ROW EXECUTE FUNCTION ieg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ieg_iit_proposals_updated_at ON ieg_iit_proposals;
CREATE TRIGGER trg_ieg_iit_proposals_updated_at BEFORE UPDATE ON ieg_iit_proposals
FOR EACH ROW EXECUTE FUNCTION ieg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ieg_iit_milestones_updated_at ON ieg_iit_milestones;
CREATE TRIGGER trg_ieg_iit_milestones_updated_at BEFORE UPDATE ON ieg_iit_milestones
FOR EACH ROW EXECUTE FUNCTION ieg_set_updated_at();

CREATE OR REPLACE FUNCTION ieg_block_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ieg_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ieg_audit_no_update ON ieg_audit_log;
CREATE TRIGGER trg_ieg_audit_no_update BEFORE UPDATE ON ieg_audit_log
FOR EACH ROW EXECUTE FUNCTION ieg_block_audit_mutation();

DROP TRIGGER IF EXISTS trg_ieg_audit_no_delete ON ieg_audit_log;
CREATE TRIGGER trg_ieg_audit_no_delete BEFORE DELETE ON ieg_audit_log
FOR EACH ROW EXECUTE FUNCTION ieg_block_audit_mutation();

CREATE INDEX IF NOT EXISTS idx_ieg_audit_module_entity ON ieg_audit_log(module_key, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ieg_tasks_assignee_status ON ieg_tasks(assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ieg_grant_applications_status ON ieg_grant_applications(status, current_stage);
CREATE INDEX IF NOT EXISTS idx_ieg_iit_proposals_status ON ieg_iit_proposals(status, current_stage);
CREATE INDEX IF NOT EXISTS idx_ieg_notifications_recipient ON ieg_notifications(recipient_user_id, recipient_external_user_id, status);
