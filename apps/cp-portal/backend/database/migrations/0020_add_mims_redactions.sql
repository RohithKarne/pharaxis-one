-- CPPM-11: outstanding MIMS reporter redactions.
--
-- An erasure request used to stop at the CP Portal boundary: an AE/PC submission
-- already sent to MIMS kept the person's identity over there. The erasure now
-- reaches MIMS, and every case it has to reach is recorded here first — so if
-- MIMS is down the redaction is queued and retried rather than quietly skipped,
-- and an administrator can see what is still outstanding.
--
-- One row per submission (the unique key), so re-running an erasure or retrying
-- a sweep cannot queue the same case twice.
CREATE TABLE IF NOT EXISTS cp_mims_redactions (
  id              INT          NOT NULL AUTO_INCREMENT,
  client_id       INT          NOT NULL,
  submission_id   INT          NOT NULL,
  external_ref    VARCHAR(100) NOT NULL,   -- the MIMS case id
  portal_user_id  INT          NULL,       -- who asked, for the audit trail
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  attempts        INT          NOT NULL DEFAULT 0,
  last_error      TEXT         NULL,
  next_attempt_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requested_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mims_redaction_submission (submission_id),
  KEY idx_mims_redaction_due (status, next_attempt_at),
  KEY idx_mims_redaction_client (client_id, status),
  CONSTRAINT fk_mims_redaction_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
