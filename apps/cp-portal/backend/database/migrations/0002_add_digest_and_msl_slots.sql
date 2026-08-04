-- Adds tables introduced after the legacy bootstrap: weekly-digest state and MSL
-- availability slots. The bootstrap in db.js early-returns on existing databases,
-- so new tables must be created via a tracked migration. CREATE TABLE IF NOT EXISTS
-- keeps this idempotent alongside the db.js definitions used for fresh installs.

CREATE TABLE IF NOT EXISTS cp_digest_state (
  client_id      INT          NOT NULL,
  last_sent_week VARCHAR(12)  NULL,
  last_sent_at   DATETIME     NULL,
  PRIMARY KEY (client_id),
  CONSTRAINT fk_digest_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cp_msl_slots (
  id         INT       NOT NULL AUTO_INCREMENT,
  client_id  INT       NOT NULL,
  msl_id     INT       NOT NULL,
  starts_at  DATETIME  NOT NULL,
  ends_at    DATETIME  NOT NULL,
  is_booked  TINYINT(1) NOT NULL DEFAULT 0,
  booking_id INT       NULL,
  created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_slots_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_slots_msl    FOREIGN KEY (msl_id)    REFERENCES cp_msls(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
