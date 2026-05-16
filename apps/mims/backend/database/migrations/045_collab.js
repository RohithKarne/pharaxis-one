'use strict';
// Migration 045 — Theme 5 Real-time Collab (trimmed) (Wave 4).
// Three tables:
//   - case_comments: threaded comments scoped to a case (and optionally a field)
//   - case_watchers: per-user watch subscriptions for notifications
//   - case_mentions: log of @-mentions resolved out of comments
// Presence/typing/focus live in-memory in casePresenceService (Wave 0 #3).

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_comments (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      case_id       BIGINT NOT NULL,
      parent_id     BIGINT NULL,                 -- for threaded replies
      section_name  VARCHAR(120) NULL,           -- optional: thread is scoped to a section
      field_name    VARCHAR(120) NULL,           -- optional: thread is scoped to a single field
      author_id     INT NOT NULL,
      body_md       TEXT NOT NULL,               -- markdown source (rendered client-side)
      body_html     TEXT NULL,                   -- pre-sanitized cache (optional)
      resolved      TINYINT(1) NOT NULL DEFAULT 0,
      resolved_by   INT NULL,
      resolved_at   DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at    DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_cc_case      (case_id, deleted_at, created_at),
      KEY idx_cc_field     (case_id, section_name, field_name),
      KEY idx_cc_author    (author_id),
      KEY idx_cc_parent    (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_watchers (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      case_id       BIGINT NOT NULL,
      user_id       INT NOT NULL,
      reason        VARCHAR(40) NOT NULL DEFAULT 'manual',  -- manual|mentioned|assigned|author
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_watcher (case_id, user_id),
      KEY idx_watcher_user (user_id),
      KEY idx_watcher_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_mentions (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      case_id       BIGINT NOT NULL,
      comment_id    BIGINT NULL,                -- nullable if mention came from somewhere other than a comment
      mentioned_user_id INT NOT NULL,
      mentioned_by_user_id INT NULL,
      seen          TINYINT(1) NOT NULL DEFAULT 0,
      seen_at       DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mention_user (mentioned_user_id, seen, created_at),
      KEY idx_mention_case (case_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS case_mentions`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS case_watchers`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS case_comments`); } catch (_) {}
}

module.exports = { up, down };
