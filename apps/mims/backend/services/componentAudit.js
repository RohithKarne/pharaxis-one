'use strict';

/**
 * componentAudit.js — MIPM-169.
 *
 * AE, PC, drug and PV/Quality hand-off changes are part of the case record, so
 * each one goes to the case audit trail — who, which field, old and new value —
 * as MI changes do (MIPM-159). Before this they left no trace at all.
 */

const pool = require('../database/db');
const { writeCaseAudit } = require('./caseHelpers');

const SKIP = new Set(['id', 'version_id', 'case_id', 'org_id', 'created_at', 'updated_at', 'created_by']);
const show = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v === null || v === undefined ? '' : String(v)));

// One audit row per field whose value differs between two copies of a record.
// A new record is (null, row); a removed one is (row, null).
async function auditChanges(caseId, req, action, label, before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const oldValue = show(before?.[key]);
    const newValue = show(after?.[key]);
    if (oldValue !== newValue) {
      await writeCaseAudit(caseId, req.user.userId, req.user.email, action, `${label}: ${key}`, oldValue || null, newValue || null);
    }
  }
}

// The case and version number behind an AE or PC version id.
async function versionCase(kind, versionId) {
  const [[row]] = await pool.execute(`SELECT case_id, version_number FROM case_${kind}_versions WHERE id = ?`, [versionId]);
  return row || null;
}

module.exports = { auditChanges, versionCase };
