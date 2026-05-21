'use strict';

/**
 * Migration 087 — Seed default Segregation of Duties rules (P3).
 *
 * Enforced on group save (PUT /access-config/groups/:id/privileges): a single
 * group cannot hold BOTH sides of a 'block' rule. These encode the core 21 CFR
 * Part 11 "author ≠ approver" controls. Admins can add org-specific rules later.
 */

const RULES = [
  // [rule_key, first_privilege, conflicting_privilege, severity]
  ['letter_author_vs_approver',  'case.letter.draft', 'case.letter.approve', 'block'],
  ['content_author_vs_approver', 'content.author',    'content.approve',     'block'],
  // Drafting and sending a response without independent approval — warn only.
  ['letter_draft_vs_send',       'case.letter.draft', 'case.letter.send',    'warning'],
];

async function up(conn) {
  for (const [ruleKey, first, conflicting, severity] of RULES) {
    try {
      await conn.execute(
        `INSERT IGNORE INTO access_sod_rules
           (org_id, rule_key, first_privilege, conflicting_privilege, severity, is_active)
         VALUES (NULL, ?, ?, ?, ?, 1)`,
        [ruleKey, first, conflicting, severity]
      );
    } catch (e) {
      if (!/duplicate/i.test(e.message)) throw e;
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
