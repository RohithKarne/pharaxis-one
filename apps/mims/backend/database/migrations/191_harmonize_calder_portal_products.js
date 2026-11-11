'use strict';

/**
 * Migration 191 — Harmonize MIMS product dictionary with Calder CP Portal products.
 *
 * WHY
 * The MIMS development product list previously held commercial brand names from other
 * companies, while Calder Therapeutics in CP Portal uses its own product catalog:
 * Rosucal 10, Glucalder M 2, Telcal 40, Azicald 500, Montecal LC, Pantocal 40,
 * Telcal AM, Sitacal M 50/500. Submissions from the portal resulted in unmatched
 * product warnings and null case_mi product IDs. This migration seeds these products
 * across organizations so bridge ingestion matches cleanly without warnings.
 */

const CALDER_PRODUCTS = [
  'Rosucal 10',
  'Glucalder M 2',
  'Telcal 40',
  'Azicald 500',
  'Montecal LC',
  'Pantocal 40',
  'Telcal AM',
  'Sitacal M 50/500',
];

async function up(conn) {
  const [orgs] = await conn.execute('SELECT id FROM organizations');
  const orgIds = orgs.map(o => o.id);
  const targets = [...new Set([...orgIds, null])];

  for (const orgId of targets) {
    for (const tradeName of CALDER_PRODUCTS) {
      if (orgId === null) {
        const [[existing]] = await conn.execute(
          'SELECT id FROM products WHERE org_id IS NULL AND LOWER(trade_name) = LOWER(?) LIMIT 1',
          [tradeName]
        );
        if (!existing) {
          await conn.execute(
            'INSERT INTO products (trade_name, org_id, is_active, created_at) VALUES (?, NULL, 1, NOW())',
            [tradeName]
          );
        }
      } else {
        const [[existing]] = await conn.execute(
          'SELECT id FROM products WHERE org_id = ? AND LOWER(trade_name) = LOWER(?) LIMIT 1',
          [orgId, tradeName]
        );
        if (!existing) {
          await conn.execute(
            'INSERT INTO products (trade_name, org_id, is_active, created_at) VALUES (?, ?, 1, NOW())',
            [tradeName, orgId]
          );
        }
      }
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
