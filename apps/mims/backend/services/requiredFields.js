'use strict';

/**
 * requiredFields.js — enforce the admin's "required" setting on the server.
 *
 * Customize Forms writes field_setup.is_required per (section_name, field_name).
 * The case form shows a * from it, but until now no save checked it. Each case
 * route passes the fields its screen actually shows — { 'Field Name': 'bodyKey' }
 * — and gets back the labels of the required ones that are empty. Hidden or
 * disabled fields are never required.
 */

const pool = require('../database/db');

// The Add Contact form's fields, by their field_setup name.
const CONTACT_FIELDS = {
  'Prefix': 'prefix',
  'First Name': 'first_name',
  'Last Name': 'last_name',
  'Contact Type': 'contact_type',
  'Reporter Type': 'reporter_type',
  'Source': 'source',
  'Consent Status': 'consent_status',
  'Email': 'email',
  'Phone': 'phone',
  'Specialty': 'specialty',
  'Institution': 'institution',
  'Country': 'country',
  'Country of Reporter': 'country_of_reporter',
  'Qualification': 'qualification',
  'Preferred Contact Method': 'preferred_contact_method',
  'Language Preference': 'language_preference',
};

async function missingRequiredFields(orgId, sectionName, payload, fieldMap) {
  const [rows] = await pool.execute(
    `SELECT field_name, org_id, is_required, is_hidden, is_disabled, custom_label
       FROM field_setup
      WHERE section_name = ? AND (org_id = ? OR org_id IS NULL)`,
    [sectionName, orgId ?? null]
  );
  // The org's own row wins over the platform default (org_id IS NULL).
  const byName = new Map();
  for (const row of rows) {
    const existing = byName.get(row.field_name);
    if (!existing || (existing.org_id === null && row.org_id !== null)) byName.set(row.field_name, row);
  }
  const missing = [];
  for (const [fieldName, key] of Object.entries(fieldMap)) {
    const setting = byName.get(fieldName);
    if (!setting || !setting.is_required || setting.is_hidden || setting.is_disabled) continue;
    const value = payload?.[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(setting.custom_label || fieldName);
    }
  }
  return missing;
}

// The MI panel's fields, by the core_key migration 108 gave their rows.
const MI_CORE_FIELDS = {
  mi_category: 'mi_category',
  mi_subcategory: 'subcategory',
  mi_product: 'product_id',
  mi_question_summary: 'question_summary',
  mi_detailed_question: 'detailed_question',
  mi_response_required_by: 'response_required_by',
  mi_response_date: 'response_date',
  mi_response_channel: 'response_channel',
  mi_status: 'status',
  mi_response_provided: 'response_provided',
  mi_literature_reference: 'literature_reference',
};

// Same check for fields linked by core_key rather than by section and name.
async function missingRequiredCore(orgId, payload, coreFieldMap) {
  const keys = Object.keys(coreFieldMap);
  if (!keys.length) return [];
  const [rows] = await pool.execute(
    `SELECT core_key, field_name, org_id, is_required, is_hidden, is_disabled, custom_label
       FROM field_setup
      WHERE core_key IN (${keys.map(() => '?').join(',')}) AND (org_id = ? OR org_id IS NULL)`,
    [...keys, orgId ?? null]
  );
  const byKey = new Map();
  for (const row of rows) {
    const existing = byKey.get(row.core_key);
    if (!existing || (existing.org_id === null && row.org_id !== null)) byKey.set(row.core_key, row);
  }
  const missing = [];
  for (const [coreKey, key] of Object.entries(coreFieldMap)) {
    const setting = byKey.get(coreKey);
    if (!setting || !setting.is_required || setting.is_hidden || setting.is_disabled) continue;
    const value = payload?.[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(setting.custom_label || setting.field_name);
    }
  }
  return missing;
}

// Express guard for the AE/PC section saves (PUT /cases/<scope>/versions/:versionId/:tab):
// refuses the save when an admin-required panel field on that tab is empty, then
// hands over to the tab's own route. The panel sends the whole tab, so the body
// is the record as it will be saved.
function enforcePanelRequired(scope, versionsTable) {
  const { PANEL_CORE_FIELDS } = require('../catalogs/panelCoreFields');
  const { hasGlobalAdminScope } = require('../utils/adminScope');
  return async (req, res, next) => {
    const fields = PANEL_CORE_FIELDS.filter(f => f.scope === scope && f.tab === req.params.tab && f.type !== 'bool');
    if (!fields.length) return next();
    try {
      const [[row]] = await pool.execute(
        `SELECT c.org_id FROM ${versionsTable} v JOIN cases c ON c.id = v.case_id WHERE v.id = ?`,
        [req.params.versionId]
      );
      // Unknown version or another org's case: the tab route answers (404 / 403).
      if (!row || (!hasGlobalAdminScope(req.user) && Number(row.org_id) !== Number(req.user.orgId))) return next();
      const missing = await missingRequiredCore(row.org_id, req.body || {},
        Object.fromEntries(fields.map(f => [f.coreKey, f.key])));
      if (missing.length) return res.status(400).json({ error: `Required: ${missing.join(', ')}.`, missing });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { CONTACT_FIELDS, MI_CORE_FIELDS, missingRequiredFields, missingRequiredCore, enforcePanelRequired };
