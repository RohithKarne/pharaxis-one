-- Known devices (Rohith's sign-in Tier 2, 12 Oct 2026). Each browser a person
-- signs in from is remembered by a random token in a long-lived cookie, stored
-- hashed. A sign-in from a browser not seen before sends the person an email,
-- so a stolen password is noticed by its owner rather than by nobody.
CREATE TABLE IF NOT EXISTS cp_known_devices (
  id            INT          NOT NULL AUTO_INCREMENT,
  subject_type  VARCHAR(10)  NOT NULL,
  subject_id    INT          NOT NULL,
  token_hash    CHAR(64)     NOT NULL,
  user_agent    VARCHAR(500) NULL,
  first_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cp_known_device (subject_type, subject_id, token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
