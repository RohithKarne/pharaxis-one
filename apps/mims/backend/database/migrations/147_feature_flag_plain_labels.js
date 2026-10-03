'use strict';

/**
 * Migration 147 — plain names for the case-form feature flags.
 *
 * Migration 037 seeded the nine case-form flags with roadmap names
 * ("Theme 5 — Real-time Collaboration (trimmed)"). Those names show on the
 * Feature Flags admin screen, so they are renamed to say what each flag turns on.
 *
 * Only a row whose label is still the seeded one is changed, so a label an
 * administrator has edited is kept. flag_key, wave and theme are untouched.
 */

const RENAMES = [
  ['cf.theme1_rich_fields',       'Theme 1 — Rich Field Types',                   'Rich Field Types', null],
  ['cf.theme2_smart_behaviors',   'Theme 2 — Smart Field Behaviors',              'Field Defaults and Calculations', null],
  ['cf.theme3_inline_validation', 'Theme 3 — Inline Validation',                  'Inline Validation', null],
  ['cf.theme4_visual_polish',     'Theme 4 — Visual Polish',                      'Case Form Navigation Aids', null],
  ['cf.theme5_realtime_collab',   'Theme 5 — Real-time Collaboration (trimmed)',  'Real-time Collaboration',
    'Presence, @-mentions, watchers and comment threads on fields.'],
  ['cf.theme6_documents',         'Theme 6 — Document & Attachment Power',        'Documents and Attachments', null],
  ['cf.theme7_multirow_grids',    'Theme 7 — Multi-row Grid Sections',            'Multi-row Grid Sections', null],
  ['cf.theme8_smart_actions',     'Theme 8 — Case-level Smart Actions',           'Case-level Actions', null],
  ['cf.theme9_compliance',        'Theme 9 — Compliance Hardening',               'Compliance Controls', null],
];

const OLD_THEME5_DESCRIPTION = 'Presence + @-mentions + watchers + field threads (no live cursors / locks).';

async function up(conn) {
  for (const [key, oldLabel, newLabel, newDescription] of RENAMES) {
    await conn.execute(
      'UPDATE feature_flags SET label = ? WHERE flag_key = ? AND label = ?',
      [newLabel, key, oldLabel]
    );
    if (newDescription) {
      await conn.execute(
        'UPDATE feature_flags SET description = ? WHERE flag_key = ? AND description = ?',
        [newDescription, key, OLD_THEME5_DESCRIPTION]
      );
    }
  }
}

module.exports = { up };
