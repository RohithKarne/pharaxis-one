'use strict';

/**
 * fieldHistoryService.js — write/read helper for field_value_history.
 *
 * Wave 0 piece #2 wiring. Every Theme 2 + Theme 9 change-tracking hook
 * routes through here so the audit-trail format stays consistent.
 *
 * Usage from any case-edit handler:
 *
 *   await fieldHistory.record({
 *     orgId, entityType: 'case', entityId: caseId,
 *     section: 'reporter', field: 'reporter_name',
 *     oldValue, newValue,
 *     changedBy: req.user.userId,
 *     reason: req.body.reason_for_change,   // Theme 9
 *     requestId: req.id,                    // pinoHttp injects this
 *     source: 'web',
 *   });
 *
 * Read:
 *   const rows = await fieldHistory.list({
 *     entityType: 'case', entityId, field, limit: 50
 *   });
 */

const pool = require('../database/db');
const { logger } = require('./logger');

function _stringify(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

async function record({
  orgId, entityType, entityId,
  section, field,
  oldValue, newValue,
  changedBy = null,
  reason    = null,
  requestId = null,
  source    = 'web',
} = {}) {
  if (!orgId || !entityType || !entityId || !field) {
    logger.warn('fieldHistory.record: missing required keys, skipping');
    return null;
  }
  const oldS = _stringify(oldValue);
  const newS = _stringify(newValue);
  if (oldS === newS) return null; // no-op write

  try {
    const [r] = await pool.execute(`
      INSERT INTO field_value_history
        (org_id, entity_type, entity_id, section_name, field_name,
         old_value, new_value, changed_by, reason, request_id, source)
      VALUES (?, ?, ?, ?, ?,  ?, ?, ?, ?, ?, ?)
    `, [
      orgId, entityType, entityId, section || '', field,
      oldS, newS, changedBy, reason, requestId, source,
    ]);
    return r.insertId;
  } catch (err) {
    logger.warn({ err: err.message, entityType, entityId, field }, 'fieldHistory.record failed');
    return null;
  }
}

/**
 * Bulk diff helper: pass an `old` object and a `new` object plus a list of
 * field names; persists one row per changed field.
 */
async function recordDiff({
  orgId, entityType, entityId,
  section, fields,
  oldObj, newObj,
  changedBy, reason, requestId, source,
}) {
  const writes = [];
  for (const f of fields || []) {
    if (oldObj?.[f] === newObj?.[f]) continue;
    writes.push(record({
      orgId, entityType, entityId, section, field: f,
      oldValue: oldObj?.[f], newValue: newObj?.[f],
      changedBy, reason, requestId, source,
    }));
  }
  return Promise.all(writes);
}

async function list({ orgId, entityType, entityId, field = null, limit = 100 }) {
  // C-03: org_id is required and applied server-side — field-value history holds
  // old/new values of reporter/patient PII, so a read must be scoped to the caller's org.
  if (!orgId) throw new Error('orgId is required');
  const params = [orgId, entityType, Number(entityId)];
  let sql = `
    SELECT h.id, h.section_name, h.field_name,
           h.old_value, h.new_value, h.reason, h.source,
           h.changed_at, h.changed_by,
           u.name AS changed_by_name
      FROM field_value_history h
      LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.org_id = ? AND h.entity_type = ? AND h.entity_id = ?
  `;
  if (field) { sql += ' AND h.field_name = ?'; params.push(field); }
  sql += ' ORDER BY h.changed_at DESC LIMIT ?';
  params.push(Number(limit) || 100);
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = { record, recordDiff, list };
