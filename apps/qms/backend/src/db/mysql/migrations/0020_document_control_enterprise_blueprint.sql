ALTER TABLE dc_documents
  ADD COLUMN document_subtype VARCHAR(100),
  ADD COLUMN site_code VARCHAR(100),
  ADD COLUMN criticality VARCHAR(255) NOT NULL DEFAULT 'Medium'
    CHECK (criticality IN ('Low', 'Medium', 'High', 'Critical')),
  ADD COLUMN training_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN controlled_copy_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN effective_from DATE,
  ADD COLUMN effective_to DATE,
  ADD COLUMN change_control_ref_id CHAR(36),
  ADD COLUMN metadata_json JSON NOT NULL DEFAULT (JSON_OBJECT());

ALTER TABLE dc_document_versions
  ADD COLUMN reason_for_change TEXT,
  ADD COLUMN supersedes_version_id CHAR(36),
  ADD COLUMN approved_by CHAR(36),
  ADD COLUMN approved_at DATETIME(3),
  ADD COLUMN effective_by CHAR(36),
  ADD COLUMN retired_by CHAR(36);

ALTER TABLE dc_document_versions
  ADD FOREIGN KEY (supersedes_version_id) REFERENCES dc_document_versions(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (approved_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (effective_by) REFERENCES qms_users(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (retired_by) REFERENCES qms_users(id) ON DELETE SET NULL;

ALTER TABLE dc_document_periodic_reviews
  ADD COLUMN status VARCHAR(100) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Completed', 'Overdue')),
  ADD COLUMN completed_at DATETIME(3),
  ADD COLUMN completed_by CHAR(36),
  ADD COLUMN completion_notes TEXT;

ALTER TABLE dc_document_periodic_reviews
  ADD FOREIGN KEY (completed_by) REFERENCES qms_users(id) ON DELETE SET NULL;

-- PostgreSQL: ALTER TABLE dc_document_periodic_reviews
--   DROP CONSTRAINT IF EXISTS dc_document_periodic_reviews_document_id_key;
-- MySQL implements UNIQUE (document_id) from 0010 as an index auto-named
-- `document_id`, so the equivalent statement is DROP INDEX. That index is also
-- the one backing the document_id foreign key from 0010, and InnoDB refuses to
-- drop the last index a foreign key depends on (errno 1553), so a non-unique
-- index is added first to take over that role. PostgreSQL needs no equivalent:
-- there a foreign key on the referencing side requires no index at all.
ALTER TABLE dc_document_periodic_reviews
  ADD INDEX idx_dc_periodic_reviews_document (document_id);

ALTER TABLE dc_document_periodic_reviews
  DROP INDEX document_id;

CREATE TABLE IF NOT EXISTS dc_document_distribution_targets (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  target_type VARCHAR(100) NOT NULL CHECK (target_type IN ('Role', 'User', 'Department')),
  target_value VARCHAR(255) NOT NULL,
  acknowledgement_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (document_id, target_type, target_value),
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dc_document_review_history (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  periodic_review_id CHAR(36),
  due_date DATE,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_by CHAR(36),
  result VARCHAR(100) NOT NULL CHECK (result IN ('Completed', 'Deferred', 'Escalated')),
  notes TEXT,
  FOREIGN KEY (org_id) REFERENCES qms_orgs(id) ON DELETE RESTRICT,
  FOREIGN KEY (document_id) REFERENCES dc_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (periodic_review_id) REFERENCES dc_document_periodic_reviews(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by) REFERENCES qms_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_dc_documents_criticality
  ON dc_documents (org_id, criticality, updated_at DESC);
CREATE INDEX idx_dc_versions_supersede
  ON dc_document_versions (document_id, supersedes_version_id);
CREATE INDEX idx_dc_reviews_status_due
  ON dc_document_periodic_reviews (org_id, status, due_date);
CREATE INDEX idx_dc_distribution_targets
  ON dc_document_distribution_targets (org_id, document_id, target_type, target_value);
CREATE INDEX idx_dc_review_history
  ON dc_document_review_history (org_id, document_id, completed_at DESC);

-- RLS removed: tenant isolation is enforced in the application layer (Phase 0).
