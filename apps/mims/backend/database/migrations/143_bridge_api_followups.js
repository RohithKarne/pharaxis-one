'use strict';

/**
 * Migration 143 — follow-ups sent in by a connected system (bridge row 9).
 *
 * WHY
 * A person who had already sent a report could not add anything to it; a second
 * report started a second, unconnected case.
 *
 * WHAT
 * api_case_followups records each follow-up a connection has delivered, keyed by the
 * sender's own follow-up id, so a retried delivery never adds the comment twice. The
 * follow-up itself becomes a case comment, a history line and the case's
 * follow_up_received_date. Idempotent.
 */

async function up(conn) {
  await conn.execute(
    `CREATE TABLE IF NOT EXISTS api_case_followups (
       id                   INT          NOT NULL AUTO_INCREMENT,
       api_client_id        INT          NOT NULL,
       external_followup_id VARCHAR(100) NOT NULL,
       case_id              INT          NOT NULL,
       comment_id           INT          NULL,
       created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_api_followup (api_client_id, external_followup_id),
       KEY idx_api_followup_case (case_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

module.exports = { up };
