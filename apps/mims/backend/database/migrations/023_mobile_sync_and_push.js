'use strict';

module.exports = {
  async up(connection) {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mobile_push_devices (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        org_id INT NULL,
        push_token VARCHAR(255) NOT NULL,
        platform VARCHAR(32) NOT NULL DEFAULT 'unknown',
        device_label VARCHAR(255) NULL,
        app_build VARCHAR(64) NULL,
        provider VARCHAR(32) NOT NULL DEFAULT 'expo',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_push_at DATETIME NULL,
        last_error TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_mobile_push_token (push_token),
        KEY idx_mobile_push_user (user_id),
        KEY idx_mobile_push_org (org_id),
        CONSTRAINT fk_mobile_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  },

  async down(connection) {
    await connection.execute('DROP TABLE IF EXISTS mobile_push_devices');
  },
};
