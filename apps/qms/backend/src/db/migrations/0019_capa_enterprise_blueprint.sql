DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ca_capa_records'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE ca_capa_records
      DROP CONSTRAINT IF EXISTS ca_capa_records_status_check;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ca_capa_records'
      AND column_name = 'source_type'
  ) THEN
    ALTER TABLE ca_capa_records
      DROP CONSTRAINT IF EXISTS ca_capa_records_source_type_check;
  END IF;
END $$;

ALTER TABLE ca_capa_records
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS batch_lot_no TEXT,
  ADD COLUMN IF NOT EXISTS severity INT CHECK (severity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS occurrence INT CHECK (occurrence BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS detectability INT CHECK (detectability BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS risk_score INT,
  ADD COLUMN IF NOT EXISTS risk_band TEXT CHECK (risk_band IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN IF NOT EXISTS triage_summary TEXT,
  ADD COLUMN IF NOT EXISTS investigation_summary TEXT,
  ADD COLUMN IF NOT EXISTS closure_summary TEXT,
  ADD COLUMN IF NOT EXISTS reopened_reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_plan_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES qms_users(id) ON DELETE SET NULL;

ALTER TABLE ca_capa_records
  ADD CONSTRAINT ca_capa_records_source_type_check CHECK (
    source_type IN ('Deviation', 'AuditFinding', 'Manual', 'Complaint', 'ChangeControl', 'DocumentControl', 'Validation')
  );

ALTER TABLE ca_capa_records
  ADD CONSTRAINT ca_capa_records_status_check CHECK (
    status IN (
      'Draft',
      'Submitted',
      'Triage',
      'Investigation',
      'ActionPlanApproval',
      'ActionPlanApproved',
      'InExecution',
      'EffectivenessReview',
      'EffectivenessPending',
      'Closed',
      'Reopened',
      'PlanApproval',
      'InProgress'
    )
  );

ALTER TABLE ca_action_items
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'Corrective'
    CHECK (action_type IN ('Corrective', 'Preventive')),
  ADD COLUMN IF NOT EXISTS completion_evidence_ref TEXT,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT;

CREATE TABLE IF NOT EXISTS ca_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('ActionPlan', 'Closure')),
  decision TEXT NOT NULL CHECK (decision IN ('Approve', 'Reject')),
  comments TEXT,
  approver_user_id UUID NOT NULL REFERENCES qms_users(id) ON DELETE RESTRICT,
  signature_id UUID REFERENCES qms_e_signatures(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ca_history_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  capa_id UUID NOT NULL REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  actor_user_id UUID REFERENCES qms_users(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_records_status_risk
  ON ca_capa_records (org_id, status, risk_band, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_approvals_capa
  ON ca_approvals (org_id, capa_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_history_capa
  ON ca_history_events (org_id, capa_id, occurred_at DESC);

ALTER TABLE ca_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_history_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ca_approvals_isolation ON ca_approvals;
CREATE POLICY ca_approvals_isolation ON ca_approvals
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS ca_history_events_isolation ON ca_history_events;
CREATE POLICY ca_history_events_isolation ON ca_history_events
USING (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (qms_is_superadmin() OR org_id = current_setting('app.current_org_id', true)::uuid);
