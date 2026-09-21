-- CPPM-36: durable outbox for transactional email.
--
-- Confirmation, booking, verification, reset and invite emails used to sit in
-- an in-memory queue: a restart lost them, and after three failures they were
-- dropped with one log line and no trace on the submission. Every such email
-- is now written here before sending, retried by the scheduler, and left
-- visible as 'failed' for an administrator when it finally cannot be sent.
--
-- Definition matches database/db.js exactly so the two paths cannot drift.
CREATE TABLE IF NOT EXISTS cp_email_outbox (
  id               INT          NOT NULL AUTO_INCREMENT,
  client_id        INT          NOT NULL,
  kind             VARCHAR(50)  NOT NULL,
  to_email         VARCHAR(255) NOT NULL,
  subject          VARCHAR(500) NOT NULL,
  html             MEDIUMTEXT   NULL,
  text_body        MEDIUMTEXT   NULL,
  attachments_json MEDIUMTEXT   NULL,
  related_type     VARCHAR(50)  NULL,
  related_id       INT          NULL,
  is_sensitive     TINYINT(1)   NOT NULL DEFAULT 0,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  attempts         INT          NOT NULL DEFAULT 0,
  last_error       TEXT         NULL,
  next_attempt_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at          DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_outbox_due (status, next_attempt_at),
  KEY idx_outbox_client (client_id, status),
  CONSTRAINT fk_outbox_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
