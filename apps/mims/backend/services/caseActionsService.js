'use strict';

/**
 * caseActionsService.js — Theme 8 (Wave 4) case-level smart actions.
 *
 * Surface:
 *   listTemplates({orgId, caseType?})
 *   getTemplate({orgId, id})
 *   upsertTemplate({...})
 *   removeTemplate({orgId, id})
 *
 *   listMacros({orgId})
 *   runMacro({orgId, caseId, macroId, userId})  → [{step, ok, message}]
 *
 *   cloneCase({orgId, caseId, userId, fields?}) — creates a new draft case
 *     copying the source's type, site, channel, priority and description.
 *
 *   recentTouch({orgId, userId, caseId})        — bumps user_recent_cases
 *   listRecent({orgId, userId, limit})
 *   togglePin({orgId, userId, caseId, note?})   — toggles user_pinned_cases
 *   listPinned({orgId, userId})
 */

const pool = require('../database/db');
const { logger } = require('./logger');
const { writeCaseAudit } = require('./caseHelpers');
const { checkTransitionAllowed } = require('./workflowEngine');
const { resolveDefaultWorkflowStateId } = require('./orgBootstrapService');

// ── Templates ─────────────────────────────────────────────────────────────────

async function listTemplates({ orgId, caseType = null }) {
  const params = [orgId]; let where = ' WHERE (org_id = ? OR org_id IS NULL) ';
  if (caseType) { where += ' AND case_type = ?'; params.push(caseType); }
  const [rows] = await pool.execute(
    `SELECT id, org_id, case_type, name, description, created_at, updated_at
       FROM case_templates ${where} ORDER BY case_type, name`, params);
  return rows;
}

async function getTemplate({ orgId, id }) {
  const [[row]] = await pool.execute(
    `SELECT * FROM case_templates WHERE id = ? AND (org_id = ? OR org_id IS NULL)`,
    [id, orgId]
  );
  if (!row) return null;
  return { ...row, payload_json: typeof row.payload_json === 'string' ? safeJson(row.payload_json) : row.payload_json };
}

async function upsertTemplate({ id, orgId = null, caseType, name, description = null, payload = {}, userId = null }) {
  if (!caseType || !name) throw new Error('case_type + name required');
  const json = JSON.stringify(payload || {});
  if (id) {
    await pool.execute(
      `UPDATE case_templates SET name=?, description=?, payload_json=?, updated_at=NOW()
        WHERE id=? AND (org_id <=> ?)`,
      [name, description, json, id, orgId]
    );
  } else {
    await pool.execute(
      `INSERT INTO case_templates (org_id, case_type, name, description, payload_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE description=VALUES(description),
         payload_json=VALUES(payload_json), updated_at=NOW()`,
      [orgId, caseType, name, description, json, userId]
    );
  }
  return { ok: true };
}

async function removeTemplate({ orgId, id }) {
  await pool.execute(
    `DELETE FROM case_templates WHERE id=? AND (org_id <=> ?)`, [id, orgId]
  );
  return { ok: true };
}

// ── Macros ────────────────────────────────────────────────────────────────────

async function listMacros({ orgId }) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.org_id, m.name, m.description, COUNT(s.id) AS step_count
       FROM case_macros m
       LEFT JOIN case_macro_steps s ON s.macro_id = m.id
      WHERE (m.org_id = ? OR m.org_id IS NULL)
      GROUP BY m.id ORDER BY m.name`,
    [orgId]
  );
  return rows;
}

async function _loadMacro(orgId, id) {
  const [[macro]] = await pool.execute(
    `SELECT * FROM case_macros WHERE id=? AND (org_id <=> ? OR org_id IS NULL)`,
    [id, orgId]
  );
  if (!macro) return null;
  const [steps] = await pool.execute(
    `SELECT id, step_index, action, action_args FROM case_macro_steps
      WHERE macro_id=? ORDER BY step_index ASC`,
    [id]
  );
  return { ...macro, steps };
}

async function runMacro({ orgId, caseId, macroId, userId, userName = null }) {
  const macro = await _loadMacro(orgId, macroId);
  if (!macro) throw new Error('Macro not found');
  const results = [];
  for (const step of macro.steps) {
    const args = typeof step.action_args === 'string' ? safeJson(step.action_args) : step.action_args;
    try {
      const out = await _runStep({ orgId, caseId, userId, userName, action: step.action, args: args || {} });
      results.push({ step: step.step_index, action: step.action, ok: true, ...out });
    } catch (err) {
      logger.warn({ err: err.message, action: step.action }, 'macro step failed');
      results.push({ step: step.step_index, action: step.action, ok: false, error: err.message });
    }
  }
  return results;
}

// Case columns a macro (or a clone override) may set. The steps used to write
// cases.fields_json / assigned_to / status / tags — none of which exist — and
// swallowed the error, so every step reported ok without doing anything (T16).
const SETTABLE_CASE_FIELDS = ['priority', 'description', 'internal_notes', 'intake_channel'];

async function _caseRow(orgId, caseId) {
  const [[row]] = await pool.execute(
    `SELECT id, org_id, site_id, case_type, status_id, case_owner_id, priority, description,
            internal_notes, intake_channel
       FROM cases WHERE id = ? AND org_id = ? AND is_deleted = 0 LIMIT 1`,
    [caseId, orgId]
  );
  if (!row) throw new Error('Case not found');
  return row;
}

async function _runStep({ orgId, caseId, userId, userName, action, args }) {
  switch (action) {
    case 'set_field': {
      const { field, value } = args;
      if (!SETTABLE_CASE_FIELDS.includes(field)) throw new Error(`A macro cannot set "${field}".`);
      const current = await _caseRow(orgId, caseId);
      await pool.execute(`UPDATE cases SET ${field} = ?, updated_at = NOW() WHERE id = ? AND org_id = ?`,
        [value ?? null, caseId, orgId]);
      await writeCaseAudit(caseId, userId, userName, 'FIELD_UPDATED', field, current[field], value ?? null);
      return { field };
    }
    case 'assign': {
      const { user_id } = args;
      const [[owner]] = await pool.execute(
        `SELECT u.id FROM users u JOIN user_org_access a ON a.user_id = u.id
          WHERE u.id = ? AND a.org_id = ? AND a.is_active = 1 AND u.is_active = 1 LIMIT 1`,
        [user_id, orgId]
      );
      if (!owner) throw new Error('That user is not an active member of this organisation.');
      const current = await _caseRow(orgId, caseId);
      await pool.execute('UPDATE cases SET case_owner_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?',
        [user_id, caseId, orgId]);
      await writeCaseAudit(caseId, userId, userName, 'OWNER_CHANGED', 'case_owner_id', current.case_owner_id, user_id);
      return { case_owner_id: user_id };
    }
    case 'add_watcher': {
      const { user_id } = args;
      await pool.execute(
        `INSERT IGNORE INTO case_watchers (org_id, case_id, user_id, reason) VALUES (?, ?, ?, 'macro')`,
        [orgId, caseId, user_id]
      );
      return { user_id };
    }
    case 'comment': {
      const text = String(args.body || '').trim();
      if (!text) throw new Error('A comment step needs text.');
      await _caseRow(orgId, caseId);
      await pool.execute('INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, ?, ?)',
        [caseId, userId, text.slice(0, 4000)]);
      await writeCaseAudit(caseId, userId, userName, 'COMMENT_ADDED', 'comment', null, text.slice(0, 4000));
      return { body_chars: text.length };
    }
    case 'tag':
      throw new Error('Cases have no tags; this step cannot run.');
    case 'transition': {
      // to_status: a workflow state id or name. The same transition rules as the
      // case screen apply; a transition that needs a password or comment cannot
      // be run by a macro.
      const current = await _caseRow(orgId, caseId);
      const [[state]] = await pool.execute(
        `SELECT id, name, is_closed FROM workflow_states
          WHERE (id = ? OR LOWER(name) = LOWER(?)) AND is_active = 1 AND (org_id = ? OR org_id IS NULL)
          ORDER BY org_id IS NULL LIMIT 1`,
        [Number(args.to_status) || 0, String(args.to_status || ''), orgId]
      );
      if (!state) throw new Error(`Unknown status "${args.to_status}".`);
      if (Number(state.id) === Number(current.status_id)) return { status_id: state.id };
      // MIPM-168: closing and reopening carry their own permission and signature
      // rules on the case screen; a macro skipped them, so it does neither.
      if (Number(state.is_closed) === 1) throw new Error('A macro cannot close a case — close it on the case screen.');
      const check = await checkTransitionAllowed(orgId, current.status_id, state.id);
      if (!check.allowed) throw new Error(check.reason || 'Transition not allowed.');
      const [[needs]] = await pool.execute(
        `SELECT MAX(require_password) AS pwd, MAX(require_comment) AS cmt, MAX(require_checklist) AS chk
           FROM workflow_rules
          WHERE is_active = 1 AND from_state_id = ? AND to_state_id = ?`,
        [current.status_id, state.id]
      );
      if (Number(needs?.pwd) || Number(needs?.cmt) || Number(needs?.chk)) {
        throw new Error('This transition needs a password, comment or checklist — make it on the case screen.');
      }
      await pool.execute('UPDATE cases SET status_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?',
        [state.id, caseId, orgId]);
      await writeCaseAudit(caseId, userId, userName, 'STATUS_CHANGED', 'status_id', current.status_id, state.id);
      return { status_id: state.id };
    }
    default:
      throw new Error(`Unknown macro action: ${action}`);
  }
}

// ── Clone ─────────────────────────────────────────────────────────────────────

async function cloneCase({ orgId, caseId, userId, userName = null, fields = {} }) {
  // A new draft case (no case number yet, like New Case) copying the source's
  // type, site, channel, priority and description. The old version wrote
  // status / fields_json / updated_by (none exist) and on failure inserted an
  // empty case, which also failed — nothing was ever cloned (T16).
  const src = await _caseRow(orgId, caseId);
  const override = Object.fromEntries(
    Object.entries(fields || {}).filter(([k]) => SETTABLE_CASE_FIELDS.includes(k))
  );
  const merged = { ...src, ...override };
  const statusId = await resolveDefaultWorkflowStateId(pool, orgId);
  const [r] = await pool.execute(
    `INSERT INTO cases (org_id, site_id, case_type, intake_channel, priority, description,
                        internal_notes, status_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, src.site_id, src.case_type, merged.intake_channel, merged.priority,
     merged.description, merged.internal_notes, statusId, userId]
  );
  await writeCaseAudit(r.insertId, userId, userName, 'CASE_CREATED', 'cloned_from', null, caseId);
  return { ok: true, new_case_id: r.insertId };
}

// ── Recent + Pinned ───────────────────────────────────────────────────────────

async function recentTouch({ orgId, userId, caseId }) {
  await pool.execute(
    `INSERT INTO user_recent_cases (org_id, user_id, case_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen_at = NOW()`,
    [orgId, userId, caseId]
  );
  return { ok: true };
}

async function listRecent({ orgId, userId, limit = 25 }) {
  // LIMIT is an inlined integer: a bound `LIMIT ?` is refused by execute() here
  // ("Incorrect arguments to mysqld_stmt_execute") — GET /cases/recent was a 500.
  const [rows] = await pool.execute(
    `SELECT r.case_id, r.last_seen_at
       FROM user_recent_cases r
      WHERE r.org_id = ? AND r.user_id = ?
      ORDER BY r.last_seen_at DESC
      LIMIT ${Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100)}`,
    [orgId, userId]
  );
  return rows;
}

async function togglePin({ orgId, userId, caseId, note = null }) {
  const [[existing]] = await pool.execute(
    `SELECT id FROM user_pinned_cases WHERE user_id = ? AND case_id = ? LIMIT 1`,
    [userId, caseId]
  );
  if (existing) {
    await pool.execute(`DELETE FROM user_pinned_cases WHERE id = ?`, [existing.id]);
    return { pinned: false };
  }
  await pool.execute(
    `INSERT INTO user_pinned_cases (org_id, user_id, case_id, note) VALUES (?, ?, ?, ?)`,
    [orgId, userId, caseId, note]
  );
  return { pinned: true };
}

async function listPinned({ orgId, userId }) {
  const [rows] = await pool.execute(
    `SELECT case_id, note, pinned_at, sort_order
       FROM user_pinned_cases
      WHERE org_id = ? AND user_id = ?
      ORDER BY sort_order, pinned_at DESC`,
    [orgId, userId]
  );
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

module.exports = {
  listTemplates, getTemplate, upsertTemplate, removeTemplate,
  listMacros, runMacro,
  cloneCase,
  recentTouch, listRecent, togglePin, listPinned,
};
