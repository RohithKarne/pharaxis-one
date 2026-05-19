'use strict';
// Migration 077 — Sprint 2 #16: Off-label flag + Promotional review.
//
// FDA requires that MI responses be unsolicited, scientific, and non-promotional.
// Off-label inquiries trigger special routing:
//   - is_off_label flag captured at intake
//   - is_solicited flag captures whether the inquiry was unsolicited (key for FDA)
//   - promo_review_status tracks: not_required | pending | approved | rejected
//   - promo_review_decision_at + by + notes for audit
//
// These columns live on case_mi_tabs (the inquiry-level record).

async function up(conn) {
  const cols = [
    `ALTER TABLE case_mi_tabs ADD COLUMN is_off_label TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE case_mi_tabs ADD COLUMN is_solicited TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE case_mi_tabs ADD COLUMN promo_review_status ENUM('not_required','pending','approved','rejected') NOT NULL DEFAULT 'not_required'`,
    `ALTER TABLE case_mi_tabs ADD COLUMN promo_review_assigned_to INT NULL`,
    `ALTER TABLE case_mi_tabs ADD COLUMN promo_review_requested_at DATETIME NULL`,
    `ALTER TABLE case_mi_tabs ADD COLUMN promo_review_decided_at DATETIME NULL`,
    `ALTER TABLE case_mi_tabs ADD COLUMN promo_review_decided_by INT NULL`,
    `ALTER TABLE case_mi_tabs ADD COLUMN promo_review_notes TEXT NULL`,
    `ALTER TABLE case_mi_tabs ADD COLUMN off_label_indication VARCHAR(255) NULL`,
  ];
  for (const sql of cols) { try { await conn.execute(sql); } catch (_) {} }

  // Index for quick "show me pending promo reviews" admin queries
  try { await conn.execute(`ALTER TABLE case_mi_tabs ADD KEY idx_mi_promo_status (promo_review_status)`); }
  catch (_) {}
}

async function down(conn) {
  for (const c of [
    'is_off_label','is_solicited','promo_review_status','promo_review_assigned_to',
    'promo_review_requested_at','promo_review_decided_at','promo_review_decided_by',
    'promo_review_notes','off_label_indication',
  ]) {
    try { await conn.execute(`ALTER TABLE case_mi_tabs DROP COLUMN ${c}`); } catch (_) {}
  }
  try { await conn.execute(`ALTER TABLE case_mi_tabs DROP INDEX idx_mi_promo_status`); } catch (_) {}
}

module.exports = { up, down };
