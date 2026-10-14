'use strict';

/**
 * Migration 182 — the language a letter template is written in (content
 * management review follow-up, Rohith 2026-10-14).
 *
 * WHY
 * Documents carry a language and the letter builder offers content in the
 * letter's language, but templates had none: a French letter could start from
 * English wording and nothing showed it. Existing templates are English.
 */

async function up(conn) {
  const [[exists]] = await conn.execute(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_templates' AND COLUMN_NAME = 'language'"
  );
  if (!exists.n) await conn.execute("ALTER TABLE cm_templates ADD COLUMN language VARCHAR(20) NOT NULL DEFAULT 'en'");
}

module.exports = { up };
