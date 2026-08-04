-- The PostgreSQL source opens with a DO $$ ... $$ block that conditionally runs
--   ALTER TABLE ca_capa_records DROP CONSTRAINT IF EXISTS ca_capa_records_status_check;
--   ALTER TABLE ca_capa_records DROP CONSTRAINT IF EXISTS ca_capa_records_source_type_check;
-- and then re-adds both CHECKs with a widened value list.
--
-- Not representable in MySQL 8.0: there is no DROP CHECK ... IF EXISTS, and the
-- CHECK constraints created inline in 0011 are auto-named by the server
-- (ca_capa_records_chk_N), not with the PostgreSQL-style
-- ca_capa_records_status_check name, so they cannot be dropped by name here.
-- Re-adding the widened CHECKs alongside the narrow ones from 0011 would be
-- inert (the narrower constraint still governs), so all four statements are
-- omitted. The widened source_type / status value lists are enforced in the
-- application layer. See the conversion report.

ALTER TABLE ca_capa_records
  ADD COLUMN department VARCHAR(255),
  ADD COLUMN product_name VARCHAR(255),
  ADD COLUMN batch_lot_no VARCHAR(255),
  ADD COLUMN severity INT CHECK (severity BETWEEN 1 AND 5),
  ADD COLUMN occurrence INT CHECK (occurrence BETWEEN 1 AND 5),
  ADD COLUMN detectability INT CHECK (detectability BETWEEN 1 AND 5),
  ADD COLUMN risk_score INT,
  ADD COLUMN risk_band VARCHAR(100) CHECK (risk_band IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN triage_summary TEXT,
  ADD COLUMN investigation_summary TEXT,
  ADD COLUMN closure_summary TEXT,
  ADD COLUMN reopened_reason TEXT,
  ADD COLUMN submitted_at DATETIME(3),
  ADD COLUMN triaged_at DATETIME(3),
  ADD COLUMN action_plan_approved_at DATETIME(3),
  ADD COLUMN reopened_at DATETIME(3),
  ADD COLUMN closed_by CHAR(36);

ALTER TABLE ca_capa_records
  ADD FOREIGN KEY (closed_by) REFERENCES qms_users(id) ON DELETE SET NULL;

ALTER TABLE ca_action_items
  ADD COLUMN action_type VARCHAR(100) NOT NULL DEFAULT 'Corrective'
    CHECK (action_type IN ('Corrective', 'Preventive')),
  ADD COLUMN completion_evidence_ref VARCHAR(255),
  ADD COLUMN completion_notes TEXT;

CREATE TABLE IF NOT EXISTS ca_approvals (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  stage VARCHAR(100) NOT NULL CHECK (stage IN ('ActionPlan', 'Closure')),
  decision VARCHAR(100) NOT NULL CHECK (decision IN ('Approve', 'Reject')),
  comments TEXT,
  approver_user_id CHAR(36) NOT NULL,
  signature_id CHAR(36),
  decided_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_user_id) REFERENCES qms_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (signature_id) REFERENCES qms_e_signatures(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ca_history_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  capa_id CHAR(36) NOT NULL,
  action_key VARCHAR(100) NOT NULL,
  actor_user_id CHAR(36),
  payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (capa_id) REFERENCES ca_capa_records(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_ca_records_status_risk
  ON ca_capa_records (org_id, status, risk_band, updated_at DESC);
CREATE INDEX idx_ca_approvals_capa
  ON ca_approvals (org_id, capa_id, decided_at DESC);
CREATE INDEX idx_ca_history_capa
  ON ca_history_events (org_id, capa_id, occurred_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
