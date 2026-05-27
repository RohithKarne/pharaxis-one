'use strict';

// Migration 095 — Repair MI off-label / promo-review columns on the live MI table.
//
// Earlier Sprint 2 work targeted `case_mi_tabs`, but the active schema stores
// MI inquiry rows in `case_mi`. This migration adds the expected columns to the
// real table so approval/classification routes stop failing on environments that
// already stamped the earlier migration.

async function addColumn(conn, ddl) {
  try {
    await conn.execute(`ALTER TABLE case_mi ADD COLUMN ${ddl}`);
  } catch (_) {}
}

async function up(conn) {
  await addColumn(conn, `is_off_label TINYINT(1) NOT NULL DEFAULT 0`);
  await addColumn(conn, `is_solicited TINYINT(1) NOT NULL DEFAULT 0`);
  await addColumn(conn, `promo_review_status ENUM('not_required','pending','approved','rejected') NOT NULL DEFAULT 'not_required'`);
  await addColumn(conn, `promo_review_assigned_to INT NULL`);
  await addColumn(conn, `promo_review_requested_at DATETIME NULL`);
  await addColumn(conn, `promo_review_decided_at DATETIME NULL`);
  await addColumn(conn, `promo_review_decided_by INT NULL`);
  await addColumn(conn, `promo_review_notes TEXT NULL`);
  await addColumn(conn, `off_label_indication VARCHAR(255) NULL`);

  try {
    await conn.execute(`ALTER TABLE case_mi ADD KEY idx_case_mi_promo_status (promo_review_status)`);
  } catch (_) {}
}

async function down(conn) {
  for (const column of [
    'is_off_label',
    'is_solicited',
    'promo_review_status',
    'promo_review_assigned_to',
    'promo_review_requested_at',
    'promo_review_decided_at',
    'promo_review_decided_by',
    'promo_review_notes',
    'off_label_indication',
  ]) {
    try {
      await conn.execute(`ALTER TABLE case_mi DROP COLUMN ${column}`);
    } catch (_) {}
  }

  try {
    await conn.execute(`ALTER TABLE case_mi DROP INDEX idx_case_mi_promo_status`);
  } catch (_) {}
}

module.exports = { up, down };
