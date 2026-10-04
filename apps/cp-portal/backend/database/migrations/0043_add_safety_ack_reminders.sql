-- CPPM-137 (approved by Rohith 4 Oct 2026; rules set by Saad, compliance owner): a
-- doctor who has not confirmed a high or critical safety letter three days after it
-- went live gets one reminder email. One row per doctor per letter records when it
-- went and which outbox message carried it. The unique key is what makes it "once".
CREATE TABLE IF NOT EXISTS cp_safety_ack_reminders (
  id               INT      NOT NULL AUTO_INCREMENT,
  client_id        INT      NOT NULL,
  alert_id         INT      NOT NULL,
  portal_user_id   INT      NOT NULL,
  reminded_at      DATETIME NOT NULL,
  outbox_id        INT      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_safety_reminder (alert_id, portal_user_id),
  KEY idx_safety_reminder_user (portal_user_id),
  CONSTRAINT fk_safety_reminder_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_safety_reminder_alert  FOREIGN KEY (alert_id) REFERENCES cp_safety_alerts(id) ON DELETE CASCADE,
  CONSTRAINT fk_safety_reminder_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
