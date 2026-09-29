-- CPPM-49: wrong-password counts for the account lock on both sign-ins.
--
-- Five wrong passwords in a row lock that sign-in for 30 minutes, as MIMS does;
-- the right password is refused until the lock ends or an admin unlocks it.
--
-- One row per sign-in identity, keyed by a SHA-256 fingerprint of
-- "<portal|admin>:<client id>:<lower-cased email>" (utils/loginLockout.js). No
-- typed email is stored, and an address with no account counts and locks exactly
-- like one that has an account, so the lock cannot reveal who is registered.
-- A success or an unlock deletes the row. Times are UTC.
CREATE TABLE IF NOT EXISTS cp_login_attempts (
  login_key      CHAR(64) NOT NULL,
  failed_count   INT      NOT NULL DEFAULT 0,
  last_failed_at DATETIME NOT NULL,
  locked_until   DATETIME NULL,
  PRIMARY KEY (login_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
