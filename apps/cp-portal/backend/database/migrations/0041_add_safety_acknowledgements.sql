-- CPPM-114 (Doctor Review E5, approved by Rohith 3 Oct 2026): a signed-in doctor
-- confirms "I have read this" on a high or critical safety letter. One row per
-- doctor per letter: who confirmed, and when (UTC). The row is never updated or
-- deleted by the portal; a second confirmation changes nothing.
CREATE TABLE IF NOT EXISTS cp_safety_acknowledgements (
  id               INT      NOT NULL AUTO_INCREMENT,
  client_id        INT      NOT NULL,
  alert_id         INT      NOT NULL,
  portal_user_id   INT      NOT NULL,
  acknowledged_at  DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_safety_ack (alert_id, portal_user_id),
  KEY idx_safety_ack_user (portal_user_id),
  CONSTRAINT fk_safety_ack_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_safety_ack_alert  FOREIGN KEY (alert_id) REFERENCES cp_safety_alerts(id) ON DELETE CASCADE,
  CONSTRAINT fk_safety_ack_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
