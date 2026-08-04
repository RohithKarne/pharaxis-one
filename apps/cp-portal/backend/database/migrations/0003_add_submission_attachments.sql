-- File attachments on portal submissions. Files are stored under
-- uploads/private/submissions/<clientCode>/ and streamed via authenticated
-- endpoints (never served from the public /uploads path).

CREATE TABLE IF NOT EXISTS cp_submission_attachments (
  id            INT          NOT NULL AUTO_INCREMENT,
  submission_id INT          NOT NULL,
  client_id     INT          NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  file_size     INT          NULL,
  mime_type     VARCHAR(120) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_subatt_submission (submission_id),
  CONSTRAINT fk_subatt_sub    FOREIGN KEY (submission_id) REFERENCES cp_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_subatt_client FOREIGN KEY (client_id)     REFERENCES cp_clients(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
