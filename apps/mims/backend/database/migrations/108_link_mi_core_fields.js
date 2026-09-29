'use strict';
// Migration 108 — link the MI panel's own fields to their field_setup rows.
//
// WHY
// Customize Forms writes label / required / hidden per (section_name, field_name)
// in field_setup. The MI panel draws eleven fields itself (CaseMITab), but their
// rows carried no core_key, so:
//   - the panel ignored the admin's settings (fixed labels, no required, never hidden);
//   - DynamicFieldsSection, which skips only rows WITH a core_key, drew the same
//     eleven fields a second time as "additional fields", stored separately.
// Found in the 360 walk (M-36/M-26), 2026-09-28. Migration 102 did the same for
// the case-level fields in 'Case Information'.
//
// SAFETY
// Idempotent and additive: sets core_key only where it is empty, for every org and
// the org_id IS NULL platform defaults. No row is inserted, deleted or otherwise
// changed. The MI keys are prefixed "mi_" so they never collide with the shared
// case-level keys in formConfig.core.

const MI_CORE_FIELDS = [
  ['MI — Category & Product', 'MI Category',          'mi_category'],
  ['MI — Category & Product', 'MI Subcategory',       'mi_subcategory'],
  ['MI — Category & Product', 'Product',              'mi_product'],
  ['MI — Question Details',   'Question Summary',     'mi_question_summary'],
  ['MI — Question Details',   'Detailed Question',    'mi_detailed_question'],
  ['MI — Response',           'Response Required By', 'mi_response_required_by'],
  ['MI — Response',           'Response Date',        'mi_response_date'],
  ['MI — Response',           'Response Channel',     'mi_response_channel'],
  ['MI — Response',           'MI Status',            'mi_status'],
  ['MI — Response',           'Response Provided',    'mi_response_provided'],
  ['MI — Response',           'Literature Reference', 'mi_literature_reference'],
];

async function up(conn) {
  for (const [sectionName, fieldName, coreKey] of MI_CORE_FIELDS) {
    await conn.execute(
      `UPDATE field_setup
          SET core_key = ?
        WHERE section_name = ?
          AND LOWER(TRIM(field_name)) = LOWER(?)
          AND (core_key IS NULL OR core_key = '')`,
      [coreKey, sectionName, fieldName]
    );
  }
}

module.exports = { up, MI_CORE_FIELDS };
