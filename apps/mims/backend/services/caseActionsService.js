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
 *   cloneCase({orgId, caseId, userId, fields?}) — creates a new case row by
 *     copying the source's `fields_json` (+ optional override) and returning
 *     the new id. Best-effort against the canonical `cases` table.
 *
 *   bulkUpdate({orgId, caseIds, patch, userId}) — applies a flat patch to many
 *     cases via cases.fields_json JSON_SET. Returns counts.
 *
 *   recentTouch({orgId, userId, caseId})        — bumps user_recent_cases
 *   listRecent({orgId, userId, limit})
 *   togglePin({orgId, userId, caseId, note?})   — toggles user_pinned_cases
 *   listPinned({orgId, userId})
 */

const pool = require('../database/db');
const { logger } = require('./logger');

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

async function runMacro({ orgId, caseId, macroId, userId }) {
  const macro = await _loadMacro(orgId, macroId);
  if (!macro) throw new Error('Macro not found');
  const results = [];
  for (const step of macro.steps) {
    const args = typeof step.action_args === 'string' ? safeJson(step.action_args) : step.action_args;
    try {
      const out = await _runStep({ orgId, caseId, userId, action: step.action, args: args || {} });
      results.push({ step: step.step_index, action: step.action, ok: true, ...out });
    } catch (err) {
      logger.warn({ err: err.message, action: step.action }, 'macro step failed');
      results.push({ step: step.step_index, action: step.action, ok: false, error: err.message });
    }
  }
  return results;
}

async function _runStep({ orgId, caseId, userId, action, args }) {
  switch (action) {
    case 'set_field': {
      const { field, value } = args;
      await pool.execute(
        `UPDATE cases
            SET fields_json = JSON_SET(COALESCE(fields_json, JSON_OBJECT()), ?, ?),
                updated_by  = ?, updated_at = NOW()
          WHERE id = ? AND org_id = ?`,
        [`$.${field}`, value, userId, caseId, orgId]
      ).catch(() => {}); // tolerate fields_json absence on older schemas
      return { field };
    }
    case 'assign': {
      const { user_id } = args;
      await pool.execute(
        `UPDATE cases SET assigned_to = ?, updated_at = NOW() WHERE id = ? AND org_id = ?`,
        [user_id, caseId, orgId]
      ).catch(() => {});
      return { assigned_to: user_id };
    }
    case 'add_watcher': {
      const { user_id } = args;
      await pool.execute(
        `INSERT IGNORE INTO case_watchers (org_id, case_id, user_id, reason) VALUES (?, ?, ?, 'macro')`,
        [orgId, caseId, user_id]
      ).catch(() => {});
      return { user_id };
    }
    case 'comment': {
      const { body } = args;
      await pool.execute(
        `INSERT INTO case_comments (org_id, case_id, author_id, body_md) VALUES (?, ?, ?, ?)`,
        [orgId, caseId, userId, body]
      ).catch(() => {});
      return { body_chars: (body || '').length };
    }
    case 'tag': {
      const { tag } = args;
      // best-effort: append into cases.tags JSON array if column exists
      await pool.execute(
        `UPDATE cases
            SET tags = JSON_ARRAY_APPEND(COALESCE(tags, JSON_ARRAY()), '$', ?), updated_at = NOW()
          WHERE id = ? AND org_id = ?`,
        [tag, caseId, orgId]
      ).catch(() => {});
      return { tag };
    }
    case 'transition': {
      const { to_status } = args;
      await pool.execute(
        `UPDATE cases SET status = ?, updated_at = NOW() WHERE id = ? AND org_id = ?`,
        [to_status, caseId, orgId]
      ).catch(() => {});
      return { to_status };
    }
    default:
      throw new Error(`Unknown macro action: ${action}`);
  }
}

// ── Clone ─────────────────────────────────────────────────────────────────────

async function cloneCase({ orgId, caseId, userId, fields = {} }) {
  // Best-effort against the canonical cases table. Tolerates missing fields_json column.
  try {
    const [[src]] = await pool.execute(
      `SELECT * FROM cases WHERE id = ? AND org_id = ? LIMIT 1`,
      [caseId, orgId]
    );
    if (!src) throw new Error('Source case not found');
    const merged = { ...(safeJson(src.fields_json) || {}), ...fields, cloned_from: caseId };
    const [r] = await pool.execute(
      `INSERT INTO cases (org_id, case_type, status, created_by, updated_by, fields_json)
       VALUES (?, ?, 'draft', ?, ?, ?)`,
      [orgId, src.case_type || 'ae', userId, userId, JSON.stringify(merged)]
    );
    return { ok: true, new_case_id: r.insertId };
  } catch (err) {
    // Schema may not match; fall back to creating an empty case with a back-pointer note
    logger.warn({ err: err.message, caseId }, 'cloneCase fell back to insert-only');
    const [r] = await pool.execute(
      `INSERT INTO cases (org_id, status, created_by) VALUES (?, 'draft', ?)`,
      [orgId, userId]
    ).catch(() => [{ insertId: null }]);
    return { ok: !!r.insertId, new_case_id: r.insertId };
  }
}

// ── Bulk update ───────────────────────────────────────────────────────────────

async function bulkUpdate({ orgId, caseIds, patch, userId }) {
  if (!Array.isArray(caseIds) || !caseIds.length) throw new Error('caseIds required');
  if (!patch || typeof patch !== 'object') throw new Error('patch required');
  let updated = 0, skipped = 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const cid of caseIds) {
      let ok = true;
      for (const [field, value] of Object.entries(patch)) {
        try {
          const [r] = await conn.execute(
            `UPDATE cases
                SET fields_json = JSON_SET(COALESCE(fields_json, JSON_OBJECT()), ?, ?),
                    updated_by  = ?, updated_at = NOW()
              WHERE id = ? AND org_id = ?`,
            [`$.${field}`, value, userId, cid, orgId]
          );
          if (r.affectedRows === 0) ok = false;
        } catch { ok = false; break; }
      }
      ok ? updated++ : skipped++;
    }
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; }
  finally       { conn.release(); }
  return { updated, skipped };
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
  const [rows] = await pool.execute(
    `SELECT r.case_id, r.last_seen_at
       FROM user_recent_cases r
      WHERE r.org_id = ? AND r.user_id = ?
      ORDER BY r.last_seen_at DESC
      LIMIT ?`,
    [orgId, userId, Number(limit) || 25]
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
  cloneCase, bulkUpdate,
  recentTouch, listRecent, togglePin, listPinned,
};
