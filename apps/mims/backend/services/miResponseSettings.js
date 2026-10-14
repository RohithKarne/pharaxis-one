'use strict';

/**
 * miResponseSettings.js — an organisation's MI response settings (migration
 * 178), with the defaults used when it has saved none.
 */

const pool = require('../database/db');

const DEFAULTS = Object.freeze({
  // Wording follows the elements FDA's draft guidance on unsolicited requests
  // lists for an off-label answer; the organisation edits it to its own.
  offlabel_statement:
    'This information is provided in response to your unsolicited request. It may concern a use that is not '
    + 'approved: {{product_name}} has not been approved for the use described in this response. Please refer to '
    + 'the enclosed prescribing information for the approved indications and the important safety information. '
    + 'A list of the references used is included.',
  closing_statement: '',
  require_pi_offlabel: true,
  routine_days: 5,
  urgent_days: 1,
});

const clampDays = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 60 ? n : null;
};

async function getSettings(orgId, db = pool) {
  const [[row]] = await db.execute('SELECT * FROM mi_response_settings WHERE org_id = ?', [orgId]).catch(() => [[null]]);
  if (!row) return { ...DEFAULTS, saved: false };
  return {
    offlabel_statement: row.offlabel_statement ?? DEFAULTS.offlabel_statement,
    closing_statement: row.closing_statement ?? '',
    require_pi_offlabel: !!row.require_pi_offlabel,
    routine_days: row.routine_days,
    urgent_days: row.urgent_days,
    saved: true,
    updated_at: row.updated_at,
  };
}

async function saveSettings(orgId, body, userId, db = pool) {
  const next = {
    offlabel_statement: String(body.offlabel_statement ?? DEFAULTS.offlabel_statement).slice(0, 4000),
    closing_statement: String(body.closing_statement ?? '').slice(0, 4000),
    require_pi_offlabel: body.require_pi_offlabel === undefined ? 1 : (body.require_pi_offlabel ? 1 : 0),
    routine_days: clampDays(body.routine_days),
    urgent_days: clampDays(body.urgent_days),
  };
  await db.execute(
    `INSERT INTO mi_response_settings (org_id, offlabel_statement, closing_statement, require_pi_offlabel, routine_days, urgent_days, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE offlabel_statement = VALUES(offlabel_statement), closing_statement = VALUES(closing_statement),
       require_pi_offlabel = VALUES(require_pi_offlabel), routine_days = VALUES(routine_days), urgent_days = VALUES(urgent_days),
       updated_by = VALUES(updated_by)`,
    [orgId, next.offlabel_statement, next.closing_statement, next.require_pi_offlabel, next.routine_days, next.urgent_days, userId || null]
  );
  return getSettings(orgId, db);
}

// The answer-by date for a new MI question: Date Received plus the routine or
// urgent working days, by the case's priority. Null when the setting is empty.
async function defaultResponseDue(caseId, db = pool) {
  const { addWorkingDays } = require('../utils/workingDays');
  const [[c]] = await db.execute('SELECT org_id, priority, date_received, created_at FROM cases WHERE id = ?', [caseId]);
  if (!c) return null;
  const s = await getSettings(c.org_id, db);
  const urgent = String(c.priority || '').toLowerCase() === 'urgent';
  const days = urgent ? s.urgent_days : s.routine_days;
  if (days === null || days === undefined) return null;
  return addWorkingDays(c.date_received || c.created_at || new Date(), days);
}

module.exports = { DEFAULTS, getSettings, saveSettings, defaultResponseDue };
