'use strict';
// Migration 048 — B1 bug fix: field routing.
// Adds:
//   - case_type_scope  ('shared' | 'ae' | 'mi' | 'pc')   → which case types render the field
//   - display_tab      (free string, e.g. 'info' | 'contacts' | 'ae' | 'mi' | 'pc' | 'icsr' | 'dppr')
//                        → which case-form tab the field lands on
// Backfills from caseFormExtensions.EXTRA_FIELDS category tag where possible.

async function up(conn) {
  try {
    await conn.execute(`
      ALTER TABLE field_setup
        ADD COLUMN case_type_scope ENUM('shared','ae','mi','pc') NOT NULL DEFAULT 'shared'
    `);
  } catch (_) { /* already exists */ }
  try {
    await conn.execute(`
      ALTER TABLE field_setup
        ADD COLUMN display_tab VARCHAR(40) NULL
    `);
  } catch (_) { /* already exists */ }

  // ── Heuristic backfill ────────────────────────────────────────────────────
  // Section names that obviously belong to a case-type tab.
  const SECTION_HINTS = [
    // ── case_type_scope rules ───────────────────────────────────────────────
    { pattern: /^AE[\s\-—]/i,                              scope: 'ae',  tab: 'ae' },
    { pattern: /^MI[\s\-—]/i,                              scope: 'mi',  tab: 'mi' },
    { pattern: /^PC[\s\-—]/i,                              scope: 'pc',  tab: 'pc' },
    { pattern: /adverse|reaction|event|patient[\s_-]*info/i, scope: 'ae', tab: 'ae' },
    { pattern: /medical[\s_-]*inquiry|medical[\s_-]*info|inquiry/i, scope: 'mi', tab: 'mi' },
    { pattern: /complaint|defect|product[\s_-]*complaint/i, scope: 'pc', tab: 'pc' },
    { pattern: /contact|requestor|reporter/i,              scope: 'shared', tab: 'contacts' },
    { pattern: /correspondence|email|fax|letter/i,         scope: 'shared', tab: 'correspondence' },
    { pattern: /icsr|e2b|regulatory/i,                     scope: 'ae', tab: 'icsr' },
    { pattern: /privacy|dppr|consent/i,                    scope: 'shared', tab: 'dppr' },
    // Default → shared / info
  ];

  const [rows] = await conn.execute(`SELECT id, section_name FROM field_setup`);
  for (const r of rows) {
    const sn = String(r.section_name || '');
    let scope = 'shared';
    let tab   = 'info';
    for (const h of SECTION_HINTS) {
      if (h.pattern.test(sn)) { scope = h.scope; tab = h.tab; break; }
    }
    try {
      await conn.execute(
        `UPDATE field_setup SET case_type_scope = ?, display_tab = ? WHERE id = ?`,
        [scope, tab, r.id]
      );
    } catch (_) {}
  }
}

async function down(conn) {
  try { await conn.execute(`ALTER TABLE field_setup DROP COLUMN case_type_scope`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE field_setup DROP COLUMN display_tab`);     } catch (_) {}
}

module.exports = { up, down };
