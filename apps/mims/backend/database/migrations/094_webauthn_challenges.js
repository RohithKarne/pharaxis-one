'use strict';

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id          INT           NOT NULL AUTO_INCREMENT,
      user_id     INT           NOT NULL,
      challenge   VARCHAR(512)  NOT NULL,
      type        VARCHAR(10)   NOT NULL,
      expires_at  DATETIME      NOT NULL,
      PRIMARY KEY (id),
      KEY idx_webauthn_challenge_user_type (user_id, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
