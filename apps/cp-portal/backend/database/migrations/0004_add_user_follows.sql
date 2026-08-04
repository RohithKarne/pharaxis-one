-- Personalization: HCPs follow therapeutic areas (and other content) to get a
-- tailored home feed. One row per (user, item_type, item_id).

CREATE TABLE IF NOT EXISTS cp_user_follows (
  id             INT         NOT NULL AUTO_INCREMENT,
  portal_user_id INT         NOT NULL,
  client_id      INT         NOT NULL,
  item_type      VARCHAR(40) NOT NULL,
  item_id        INT         NOT NULL,
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_follow (portal_user_id, item_type, item_id),
  CONSTRAINT fk_follow_user   FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_client FOREIGN KEY (client_id)      REFERENCES cp_clients(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
