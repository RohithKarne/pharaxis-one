'use strict';

/**
 * Migration 169 — known devices (Rohith's sign-in Tier 2, 2026-10-12).
 *
 * Each browser a person signs in from is remembered by a random token in a
 * year-long cookie, stored hashed here. A sign-in from a browser not seen
 * before sends the person an email, so a stolen password is noticed by its
 * owner. The cookie is not a credential: it only decides whether to write.
 */

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_known_devices (
      id                INT          NOT NULL AUTO_INCREMENT,
      user_id           INT          NOT NULL,
      device_token_hash CHAR(64)     NOT NULL,
      user_agent        VARCHAR(500) NULL,
      first_seen_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_known_device (user_id, device_token_hash),
      CONSTRAINT fk_user_known_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
