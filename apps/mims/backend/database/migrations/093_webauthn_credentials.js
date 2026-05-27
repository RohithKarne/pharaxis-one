'use strict';

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      user_id         INT           NOT NULL,
      credential_id   VARCHAR(512)  NOT NULL,
      public_key      TEXT          NOT NULL,
      counter         BIGINT        NOT NULL DEFAULT 0,
      aaguid          VARCHAR(36)   NULL,
      device_name     VARCHAR(255)  NULL,
      transports      VARCHAR(100)  NULL,
      created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at    DATETIME      NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_webauthn_credential_id (credential_id),
      KEY idx_webauthn_user (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
