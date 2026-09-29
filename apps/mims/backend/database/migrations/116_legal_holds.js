'use strict';
// Migration 116 — legal holds for data-privacy enforcement (gap register row 16).
//
// Scheduled DPPR enforcement was suspended on 2026-08-03 (DCI-5) because it
// anonymises or deletes personal data with no way for legal to stop it touching
// a record under hold. This adds that interlock.
//
// A hold names a case or an inbox inquiry. A case hold protects the case and
// every case record DPPR works on (contacts, reporter, patient, AE patient info,
// narrative) and any inquiry linked to the case. A hold is active while
// released_at is NULL; releasing it keeps the row, so history is never lost.
// Place and release are also written to audit_logs by the route.
//
// dppr_execution_log gains the number of records each rule skipped for hold.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS legal_holds (
      id             INT NOT NULL AUTO_INCREMENT,
      org_id         INT NOT NULL,
      entity_type    ENUM('case','inquiry') NOT NULL,
      entity_id      INT NOT NULL,
      reason         VARCHAR(1000) NOT NULL,
      placed_by      INT NOT NULL,
      placed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_by    INT NULL,
      released_at    DATETIME NULL,
      release_reason VARCHAR(1000) NULL,
      PRIMARY KEY (id),
      KEY idx_legal_holds_entity (entity_type, entity_id, released_at),
      KEY idx_legal_holds_org (org_id, released_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try {
    await conn.execute(
      'ALTER TABLE dppr_execution_log ADD COLUMN records_skipped_legal_hold INT NOT NULL DEFAULT 0 AFTER records_affected'
    );
  } catch (err) {
    if (!err || err.code !== 'ER_DUP_FIELDNAME') throw err; // already applied
  }
}

module.exports = { up };
