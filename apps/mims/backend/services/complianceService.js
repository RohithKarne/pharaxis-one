'use strict';

/**
 * complianceService.js — Theme 9 (Wave 5) compliance hardening.
 *
 * Strict-mode theme — every behavior here is gated by cf.theme9_compliance.
 * Callers should also keep their legacy code path intact until QA-approved.
 *
 * Surface:
 *   isFieldLocked({orgId, section, field, status, userRole})
 *     → { locked: bool, mode, reason }
 *
 *   listLocks({orgId})
 *   upsertLock({...})
 *   removeLock({orgId, id})
 *
 *   recordReason({orgId, entityType, entityId, section, field, oldValue, newValue, reason, userId, requestId})
 *     — thin wrapper over fieldHistoryService.record() that enforces reason
 *       presence when compliance mode is on.
 *
 *   captureESign({orgId, caseId, transition, fromStatus, toStatus, signedBy, signedName, meaning, reason, authMethod, ip, userAgent, password?})
 *     — verifies the user's password (when auth_method='password'), inserts
 *       an immutable hash-chained esign_events row.
 *   getESignChainHead({orgId})
 *
 *   logMaskedReveal({orgId, userId, entityType, entityId, section, field, reason, ip, userAgent})
 *     — writes to masked_reveal_log; intended to be called by the route that
 *       returns the unmasked value.
 *   listMaskedReveals({orgId, filter})
 */

const crypto = require('crypto');
const pool = require('../database/db');
const fieldHistory = require('./fieldHistoryService');
const { logger } = require('./logger');

// ── Lock cache ────────────────────────────────────────────────────────────────

const TTL_MS = 60_000;
const _lockCache = new Map(); // key=orgId → { locks, expiresAt }

function invalidateLockCache(orgId = null) {
  if (orgId == null) { _lockCache.clear(); return; }
  _lockCache.delete(String(orgId));
}

async function _loadLocks(orgId) {
  const k = String(orgId ?? 'null');
  const hit = _lockCache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.locks;
  const [rows] = await pool.execute(
    `SELECT id, org_id, section_name, field_name, status, lock_mode, reason
       FROM field_locks
      WHERE (org_id = ? OR org_id IS NULL)`,
    [orgId ?? 0]
  );
  // Org row beats global row for the same (section, field, status)
  const map = new Map();
  for (const r of rows) {
    const key = `${r.section_name}|${r.field_name}|${r.status}`;
    if (!map.has(key) || r.org_id != null) map.set(key, r);
  }
  const locks = [...map.values()];
  _lockCache.set(k, { locks, expiresAt: Date.now() + TTL_MS });
  return locks;
}

async function isFieldLocked({ orgId, section, field, status, userRole = 'user' }) {
  if (!section || !field || !status) return { locked: false };
  const locks = await _loadLocks(orgId);
  const hit = locks.find(l => l.section_name === section && l.field_name === field && l.status === status);
  if (!hit) return { locked: false };
  if (hit.lock_mode === 'admin_only' && (userRole === 'admin' || userRole === 'superadmin')) {
    return { locked: false, mode: hit.lock_mode, reason: hit.reason, overridden_by_role: userRole };
  }
  return { locked: true, mode: hit.lock_mode, reason: hit.reason };
}

async function listLocks({ orgId }) {
  return _loadLocks(orgId);
}

async function upsertLock({ id, orgId = null, sectionName, fieldName, status, lockMode = 'read_only', reason = null, userId = null }) {
  if (!sectionName || !fieldName || !status) throw new Error('section_name, field_name, status required');
  if (id) {
    await pool.execute(
      `UPDATE field_locks
          SET lock_mode = ?, reason = ?, updated_at = NOW()
        WHERE id = ? AND (org_id <=> ?)`,
      [lockMode, reason, id, orgId]
    );
  } else {
    await pool.execute(
      `INSERT INTO field_locks
         (org_id, section_name, field_name, status, lock_mode, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         lock_mode  = VALUES(lock_mode),
         reason     = VALUES(reason),
         updated_at = NOW()`,
      [orgId, sectionName, fieldName, status, lockMode, reason, userId]
    );
  }
  invalidateLockCache(orgId);
  return { ok: true };
}

async function removeLock({ orgId, id }) {
  await pool.execute(`DELETE FROM field_locks WHERE id = ? AND (org_id <=> ?)`, [id, orgId]);
  invalidateLockCache(orgId);
  return { ok: true };
}

// ── Reason-for-change wrapper ────────────────────────────────────────────────

async function recordReason(opts) {
  // Theme 9 enforces non-empty reason when called via the gated route; the
  // raw fieldHistoryService.record() still works without one for legacy.
  if (!opts.reason || !String(opts.reason).trim()) {
    throw new Error('reason required for Theme 9 change capture');
  }
  return fieldHistory.record(opts);
}

// ── E-signature with hash chain ──────────────────────────────────────────────

async function getESignChainHead({ orgId }) {
  const [[row]] = await pool.execute(
    `SELECT hash_chain FROM esign_events
      WHERE org_id = ?
      ORDER BY id DESC LIMIT 1`,
    [orgId]
  );
  return row?.hash_chain || null;
}

function _chainHash(prev, payload) {
  const h = crypto.createHash('sha256');
  h.update(prev || '');
  h.update(JSON.stringify(payload));
  return h.digest('hex');
}

async function _verifyPassword({ userId, password }) {
  if (!password) return false;
  try {
    const [[row]] = await pool.execute(
      `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!row?.password_hash) return false;
    const bcrypt = require('bcrypt'); // already a project dep
    return await bcrypt.compare(password, row.password_hash);
  } catch (err) {
    logger.warn({ err: err.message }, 'esign password verify failed');
    return false;
  }
}

async function captureESign({
  orgId, caseId, transition, fromStatus = null, toStatus = null,
  signedBy, signedName, meaning = null, reason = null,
  authMethod = 'password', password = null,
  ip = null, userAgent = null,
}) {
  if (!caseId || !transition || !signedBy) {
    throw new Error('caseId, transition, signedBy required');
  }
  if (authMethod === 'password') {
    const ok = await _verifyPassword({ userId: signedBy, password });
    if (!ok) throw new Error('Invalid password for e-signature.');
  }
  const prevHash = await getESignChainHead({ orgId });
  const payload = {
    orgId, caseId, transition, fromStatus, toStatus, signedBy, signedName,
    meaning, reason, authMethod, ip, userAgent, ts: Date.now(),
  };
  const chain = _chainHash(prevHash, payload);
  const [r] = await pool.execute(
    `INSERT INTO esign_events
       (org_id, case_id, transition, from_status, to_status,
        signed_by, signed_name, meaning, reason, auth_method,
        ip_address, user_agent, hash_chain)
     VALUES (?, ?, ?, ?, ?,  ?, ?, ?, ?, ?,  ?, ?, ?)`,
    [orgId, caseId, transition, fromStatus, toStatus,
     signedBy, signedName, meaning, reason, authMethod,
     ip, userAgent, chain]
  );
  return { id: r.insertId, hash: chain, previous_hash: prevHash };
}

async function listESignEvents({ orgId, caseId = null, limit = 100 }) {
  const params = [orgId];
  let sql = `
    SELECT e.id, e.case_id, e.transition, e.from_status, e.to_status,
           e.signed_by, u.name AS signed_by_name, e.signed_name,
           e.meaning, e.reason, e.auth_method, e.ip_address, e.user_agent,
           e.hash_chain, e.created_at
      FROM esign_events e
      LEFT JOIN users u ON u.id = e.signed_by
     WHERE e.org_id = ?`;
  if (caseId) { sql += ' AND e.case_id = ?'; params.push(Number(caseId)); }
  sql += ' ORDER BY e.id DESC LIMIT ?';
  params.push(Number(limit) || 100);
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ── Masked reveal ────────────────────────────────────────────────────────────

async function logMaskedReveal({
  orgId, userId, entityType, entityId, section = null, field,
  reason = null, ip = null, userAgent = null,
}) {
  if (!entityType || !entityId || !field) throw new Error('entityType, entityId, field required');
  const [r] = await pool.execute(
    `INSERT INTO masked_reveal_log
       (org_id, revealed_by, entity_type, entity_id, section_name, field_name,
        reason, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?,  ?, ?, ?)`,
    [orgId, userId, entityType, entityId, section, field, reason, ip, userAgent]
  );
  return { id: r.insertId };
}

async function listMaskedReveals({ orgId, entityType = null, entityId = null, userId = null, since = null, limit = 200 }) {
  const params = [orgId];
  let sql = `
    SELECT m.id, m.entity_type, m.entity_id, m.section_name, m.field_name,
           m.reason, m.ip_address, m.user_agent, m.revealed_at,
           m.revealed_by, u.name AS revealed_by_name, u.email AS revealed_by_email
      FROM masked_reveal_log m
      LEFT JOIN users u ON u.id = m.revealed_by
     WHERE m.org_id = ?`;
  if (entityType) { sql += ' AND m.entity_type = ?'; params.push(entityType); }
  if (entityId)   { sql += ' AND m.entity_id = ?';   params.push(Number(entityId)); }
  if (userId)     { sql += ' AND m.revealed_by = ?'; params.push(Number(userId)); }
  if (since)      { sql += ' AND m.revealed_at >= ?'; params.push(since); }
  sql += ' ORDER BY m.id DESC LIMIT ?';
  params.push(Number(limit) || 200);
  const [rows] = await pool.execute(sql, params);
  return rows;
}

module.exports = {
  isFieldLocked,
  listLocks, upsertLock, removeLock, invalidateLockCache,
  recordReason,
  captureESign, getESignChainHead, listESignEvents,
  logMaskedReveal, listMaskedReveals,
};
