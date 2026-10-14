'use strict';

/**
 * Migration 176 — the MI field review (Rohith, 2026-10-13, "go with all 6").
 *
 * WHY
 * - The answer to an MI is the signed letter (Response Builder). The MI's own
 *   Response Provided and Response Date boxes held nothing on any of 366 MI
 *   questions on the local copy; the MI tab now shows the sent letter instead.
 * - Off-Label Discussion repeated the classification block's off-label tick,
 *   the only one that starts the two-signer route; Patient-specific had no rule.
 * - Every enquiry must be screened for an adverse event or product complaint.
 *   case_mi.ae_pc_screening holds the answer; a response cannot be sent until
 *   it is given, and a Yes needs a linked AE or PC case.
 *
 * WHAT
 * 1. MI rows marked `decided` in catalogs/caseFormCutList.js: hidden and not
 *    required, for the platform defaults and every organisation. Values kept.
 * 2. case_mi.ae_pc_screening, where missing.
 * Each organisation's outcome is written to the audit log (case_form_cleanup).
 */

const { CUT_FIELDS } = require('../../catalogs/caseFormCutList');

const MI_DECIDED = CUT_FIELDS.filter(f => f.decided && f.section.startsWith('MI —'));

async function up(conn) {
  for (const f of MI_DECIDED) {
    await conn.execute(
      `UPDATE field_setup SET is_hidden = 1, is_required = 0
        WHERE section_name = ? AND LOWER(TRIM(field_name)) = LOWER(?)`,
      [f.section, f.field]
    );
  }

  const [[exists]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'case_mi' AND COLUMN_NAME = 'ae_pc_screening'`
  );
  if (!exists.n) await conn.execute('ALTER TABLE case_mi ADD COLUMN ae_pc_screening VARCHAR(3) NULL AFTER is_solicited');

  const [orgs] = await conn.execute('SELECT id FROM organisations');
  for (const org of orgs) {
    await conn.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (NULL, 'Migration 176', 'CASE_FORM_CUT', 'case_form_cleanup', ?, ?)`,
      [org.id, JSON.stringify({ hidden: MI_DECIDED.map(f => `${f.section} / ${f.field}`), added: ['MI screening: mentions an adverse event or product complaint?'] })]
    ).catch(() => {});
  }
}

module.exports = { up };
