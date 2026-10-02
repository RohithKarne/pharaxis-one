-- Bridge row 2: alerts to the client's own team. Until now every email the portal
-- sent went to the visitor; a report MIMS never received, a safety task nobody had
-- opened, or an erasure that never reached MIMS told no one.
--
-- cp_admin_alerts    one row per problem, raised once (dedupe_key) and closed when the
--                    problem clears or an admin marks it resolved. What admins see on
--                    the client Overview; the email is a copy of it.
-- cp_alert_settings  who is emailed, per client: integration problems and safety work
--                    separately. Empty means the client's own admins (and, for safety,
--                    anyone holding the safety reviewer role).
-- Times are UTC.
CREATE TABLE IF NOT EXISTS cp_admin_alerts (
  id            INT          NOT NULL AUTO_INCREMENT,
  client_id     INT          NOT NULL,
  kind          VARCHAR(50)  NOT NULL,
  audience      VARCHAR(20)  NOT NULL,
  title         VARCHAR(255) NOT NULL,
  body          TEXT         NULL,
  link_path     VARCHAR(255) NULL,
  related_type  VARCHAR(50)  NULL,
  related_id    INT          NULL,
  dedupe_key    VARCHAR(191) NOT NULL,
  emailed_to    TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME     NULL,
  resolved_by   VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_alert_dedupe (client_id, dedupe_key),
  KEY idx_admin_alert_open (client_id, resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cp_alert_settings (
  client_id            INT      NOT NULL,
  integration_emails   TEXT     NULL,
  safety_emails        TEXT     NULL,
  safety_wait_hours    INT      NOT NULL DEFAULT 4,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
