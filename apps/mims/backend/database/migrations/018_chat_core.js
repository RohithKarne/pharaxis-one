'use strict';

// Migration 018 — Org-scoped internal chat foundation

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id                INT NOT NULL AUTO_INCREMENT,
      org_id            INT NOT NULL,
      conversation_type ENUM('direct','group','case') NOT NULL DEFAULT 'group',
      title             VARCHAR(255) DEFAULT NULL,
      created_by        INT DEFAULT NULL,
      is_archived       TINYINT(1) NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_chat_conversations_org_updated (org_id, updated_at),
      KEY idx_chat_conversations_type (conversation_type),
      KEY idx_chat_conversations_archived (is_archived)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS chat_conversation_links (
      id              INT NOT NULL AUTO_INCREMENT,
      conversation_id INT NOT NULL,
      entity_type     VARCHAR(50) NOT NULL,
      entity_id       INT NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_chat_link_entity (entity_type, entity_id),
      UNIQUE KEY uq_chat_link_conversation_entity (conversation_id, entity_type, entity_id),
      KEY idx_chat_link_conversation (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS chat_conversation_participants (
      id                   INT NOT NULL AUTO_INCREMENT,
      conversation_id      INT NOT NULL,
      user_id              INT NOT NULL,
      joined_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_read_message_id INT DEFAULT NULL,
      last_read_at         DATETIME DEFAULT NULL,
      is_active            TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id),
      UNIQUE KEY uq_chat_conversation_user (conversation_id, user_id),
      KEY idx_chat_participants_user (user_id, is_active),
      KEY idx_chat_participants_conversation (conversation_id, is_active),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id              INT NOT NULL AUTO_INCREMENT,
      conversation_id INT NOT NULL,
      user_id         INT NOT NULL,
      body            TEXT NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at      DATETIME DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_chat_messages_conversation_created (conversation_id, created_at),
      KEY idx_chat_messages_user (user_id),
      KEY idx_chat_messages_deleted (deleted_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
