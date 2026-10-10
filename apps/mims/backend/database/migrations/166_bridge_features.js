'use strict';

/**
 * Migration 166 — bridge features F1, F3 and F5 (Rohith, 2026-10-10: "build all F1–F5").
 *
 * - cases.source_link: the address of the request on the sending portal, so the case
 *   screen can open it (F1).
 * - cases.source_can_reply: whether the person who reported can see and answer a
 *   question on that portal (they were signed in). Empty for cases sent before the
 *   portal said so; those cannot be asked anything through it (F3).
 * - cases.possible_duplicate_of: an earlier case from the same reporter about the same
 *   product within a week, flagged at intake for a person to judge. Nothing is merged (F5).
 * - case_reporter_questions: a question MIMS asks the person who reported, through the
 *   portal that sent the case, and when it was answered (F3).
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'cases', 'source_link'))) {
    await conn.execute('ALTER TABLE cases ADD COLUMN source_link VARCHAR(500) NULL');
  }
  if (!(await columnExists(conn, 'cases', 'source_can_reply'))) {
    await conn.execute('ALTER TABLE cases ADD COLUMN source_can_reply TINYINT(1) NULL');
  }
  if (!(await columnExists(conn, 'cases', 'possible_duplicate_of'))) {
    await conn.execute('ALTER TABLE cases ADD COLUMN possible_duplicate_of INT NULL');
  }
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_reporter_questions (
      id                 INT NOT NULL AUTO_INCREMENT,
      org_id             INT NOT NULL,
      case_id            INT NOT NULL,
      question           TEXT NOT NULL,
      asked_by           INT NOT NULL,
      asked_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      answered_at        DATETIME NULL,
      answer_comment_id  INT NULL,
      withdrawn_at       DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_case_reporter_questions_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(_conn) {}

module.exports = { up, down };
