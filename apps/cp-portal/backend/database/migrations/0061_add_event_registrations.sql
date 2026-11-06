-- Rohith, 27 Oct 2026 (enhancement F2). "Register" showed only when an event had an
-- outside registration link, and none of Calder's events had one, so no doctor could
-- sign up. A signed-in doctor can now register in the portal; the client's admins see
-- who did. An outside link, where one is set, still takes precedence.
-- One row per doctor and event; cancelling keeps the row with cancelled_at set, so the
-- admin list can show who withdrew.
CREATE TABLE IF NOT EXISTS cp_event_registrations (
  id             INT       NOT NULL AUTO_INCREMENT,
  client_id      INT       NOT NULL,
  event_id       INT       NOT NULL,
  portal_user_id INT       NOT NULL,
  registered_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at   DATETIME  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cp_event_registration (event_id, portal_user_id),
  KEY idx_cp_event_registrations_client (client_id, event_id),
  CONSTRAINT fk_cp_event_reg_event FOREIGN KEY (event_id) REFERENCES cp_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_event_reg_user  FOREIGN KEY (portal_user_id) REFERENCES cp_portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
