-- Password history for CP Portal admins and portal users (Rohith's sign-in Tier 1,
-- 12 Oct 2026). A new password is refused if it matches any of the person's last
-- five. subject_type is 'admin' (cp_admin_users) or 'portal' (cp_portal_users);
-- the hash is the same bcrypt hash the account used, never the password.
CREATE TABLE IF NOT EXISTS cp_password_history (
  id            INT          NOT NULL AUTO_INCREMENT,
  subject_type  VARCHAR(10)  NOT NULL,
  subject_id    INT          NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cp_password_history_subject (subject_type, subject_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
