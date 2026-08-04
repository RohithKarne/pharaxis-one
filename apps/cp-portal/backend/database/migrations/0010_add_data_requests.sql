-- CP-63: GDPR data-subject-rights requests (export + erasure). One row per request,
-- giving admins a queue and an auditable record of requester, timestamp, and outcome.
CREATE TABLE IF NOT EXISTS cp_data_requests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  client_id      INT NOT NULL,
  portal_user_id INT NULL,                 -- nullable: kept for the record even after the user row is anonymized
  request_type   VARCHAR(20) NOT NULL,     -- 'export' | 'erasure'
  status         VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'fulfilled' | 'rejected'
  requester_email VARCHAR(255) NULL,       -- snapshot at request time (survives anonymization)
  requester_name  VARCHAR(255) NULL,
  notes          TEXT NULL,                -- admin note / retention-hold explanation
  requested_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at   DATETIME NULL,
  fulfilled_by   VARCHAR(255) NULL,        -- admin who actioned it
  KEY idx_dr_client_status (client_id, status),
  KEY idx_dr_user (portal_user_id)
);
