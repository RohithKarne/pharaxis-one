-- Rohith, 27 Oct 2026 (enhancement E5). With the doctor sign-in code switched on, a
-- doctor typed a code at every sign-in; admins may skip it on a browser they ask to be
-- remembered for 7 days. Doctors now can too. Only a hash of the browser's token is
-- kept. A password change or reset forgets every remembered browser.
CREATE TABLE IF NOT EXISTS cp_portal_trusted_devices (
  id                INT          NOT NULL AUTO_INCREMENT,
  portal_user_id    INT          NOT NULL,
  device_token_hash CHAR(64)     NOT NULL,
  user_agent        VARCHAR(500) NULL,
  expires_at        DATETIME     NOT NULL,
  last_used_at      DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cp_portal_trusted_device (portal_user_id, device_token_hash),
  CONSTRAINT fk_cp_portal_trusted_user FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
