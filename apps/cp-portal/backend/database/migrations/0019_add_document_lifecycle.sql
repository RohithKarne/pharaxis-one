-- CPPM-31: the certified life of a published medical document.
--
-- cp_documents already carried a status, an expiry date and a version string,
-- but nothing recorded WHO approved a document, WHEN, or when it must next be
-- reviewed. In a regulated library that is the control everything else rests
-- on, so from here a document cannot be published until those fields are set.
--
-- approved_by_name is stored next to approved_by on purpose. The admin row can
-- be renamed or deactivated later; the name that certified a published document
-- must not change with it.
--
-- cp_document_versions keeps a superseded version readable after the live
-- document has moved on. A row is written when a certified version is retired
-- or replaced by a new approval, and is never edited afterwards.
--
-- Definitions match database/db.js exactly so the two paths cannot drift.
ALTER TABLE cp_documents
  ADD COLUMN approved_by      INT          NULL AFTER status,
  ADD COLUMN approved_by_name VARCHAR(255) NULL AFTER approved_by,
  ADD COLUMN approved_at      DATETIME     NULL AFTER approved_by_name,
  ADD COLUMN review_due_at    DATETIME     NULL AFTER approved_at,
  ADD COLUMN retired_at       DATETIME     NULL AFTER review_due_at,
  ADD KEY idx_cp_docs_review_due (client_id, review_due_at);

CREATE TABLE IF NOT EXISTS cp_document_versions (
  id                 INT          NOT NULL AUTO_INCREMENT,
  document_id        INT          NOT NULL,
  client_id          INT          NOT NULL,
  version            VARCHAR(50)  NULL,
  title              VARCHAR(500) NOT NULL,
  file_path          TEXT         NULL,
  file_name          VARCHAR(500) NULL,
  status             VARCHAR(50)  NOT NULL,
  approved_by        INT          NULL,
  approved_by_name   VARCHAR(255) NULL,
  approved_at        DATETIME     NULL,
  review_due_at      DATETIME     NULL,
  expires_at         DATETIME     NULL,
  superseded_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_by_name VARCHAR(255) NULL,
  reason             VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_docver_document (document_id, id),
  KEY idx_docver_client (client_id, superseded_at),
  CONSTRAINT fk_docver_document FOREIGN KEY (document_id) REFERENCES cp_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
