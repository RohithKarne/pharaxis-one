'use strict';

/**
 * Migration 154 — the template evidence rule names real template states (MIPM-190).
 *
 * Templates move Draft → Approved → Published, but the "template status" rule
 * required 'Active', so no template could be published or used. Organisations
 * that saved their own copy of that rule get the corrected values too.
 */

async function up(conn) {
  const [tables] = await conn.execute("SHOW TABLES LIKE 'evidence_chain_rules'");
  if (!tables.length) return;
  await conn.execute(
    `UPDATE evidence_chain_rules
        SET check_config = '{"values":["Approved","Published"]}'
      WHERE applies_to = 'template' AND check_type = 'status_in'
        AND JSON_CONTAINS(check_config, '"Active"', '$.values')`
  );
}

async function down(_conn) {}

module.exports = { up, down };
