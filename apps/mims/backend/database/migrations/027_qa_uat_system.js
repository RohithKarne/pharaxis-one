'use strict';
// Migration 027 — UAT QA System
// - qa_feedback:       in-app bug reports from any user on the UAT/prod server
// - feature_requests:  enhancement suggestions with upvoting

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS qa_feedback (
      id               INT NOT NULL AUTO_INCREMENT,
      org_id           INT,
      user_id          INT,
      user_name        VARCHAR(255),
      user_email       VARCHAR(255),
      page_url         VARCHAR(1000),
      module           VARCHAR(100),
      description      TEXT NOT NULL,
      steps_to_reproduce TEXT,
      severity         ENUM('critical','broken','wrong','minor') NOT NULL DEFAULT 'wrong',
      browser_info     VARCHAR(500),
      console_errors   TEXT,
      status           ENUM('new','investigating','confirmed','fixed','verified','closed') NOT NULL DEFAULT 'new',
      assigned_to      VARCHAR(255),
      dev_notes        TEXT,
      reported_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_qa_fb_org (org_id),
      KEY idx_qa_fb_status (status),
      KEY idx_qa_fb_severity (severity),
      KEY idx_qa_fb_reported (reported_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS feature_requests (
      id               INT NOT NULL AUTO_INCREMENT,
      org_id           INT,
      user_id          INT,
      user_name        VARCHAR(255),
      user_email       VARCHAR(255),
      module           VARCHAR(100),
      current_pain     TEXT,
      suggestion       TEXT NOT NULL,
      use_frequency    ENUM('daily','weekly','rarely') NOT NULL DEFAULT 'weekly',
      priority         ENUM('critical','nice-to-have') NOT NULL DEFAULT 'nice-to-have',
      votes            INT NOT NULL DEFAULT 0,
      status           ENUM('new','under-review','planned','in-progress','shipped','declined') NOT NULL DEFAULT 'new',
      decline_reason   TEXT,
      sprint_target    VARCHAR(100),
      dev_notes        TEXT,
      submitted_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_fr_org (org_id),
      KEY idx_fr_status (status),
      KEY idx_fr_votes (votes),
      KEY idx_fr_submitted (submitted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS feature_request_votes (
      id                  INT NOT NULL AUTO_INCREMENT,
      feature_request_id  INT NOT NULL,
      user_id             INT NOT NULL,
      voted_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_fr_vote (feature_request_id, user_id),
      KEY idx_frv_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
