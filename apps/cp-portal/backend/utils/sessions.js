'use strict';

/**
 * sessions.js — server-side sessions with an idle limit for CP Portal admins
 * and portal users (Rohith's sign-in Tier 1, 12 Oct 2026).
 *
 * A sign-in cookie lasted its full 12 or 24 hours however long the browser sat
 * idle. Every sign-in now has a row in cp_sessions; a request after the idle
 * limit is refused and the row ended, and sign-out ends it too. The limits:
 * 30 minutes for an admin, 60 for a portal user, overridable with
 * CP_ADMIN_IDLE_MINUTES and CP_PORTAL_IDLE_MINUTES. The absolute cookie
 * lifetime still applies on top.
 */

const crypto = require('crypto');
const { pool } = require('../database/db');

const IDLE_MINUTES = {
  admin: Number(process.env.CP_ADMIN_IDLE_MINUTES) || 30,
  portal: Number(process.env.CP_PORTAL_IDLE_MINUTES) || 60,
};
// Activity is written at most once a minute per session, not on every request.
const TOUCH_INTERVAL_MS = 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function idleMessage(subjectType) {
  return `You were signed out after ${IDLE_MINUTES[subjectType]} minutes of inactivity. Please sign in again.`;
}

async function createSession(subjectType, subjectId, token, userAgent) {
  await pool.execute(
    'INSERT INTO cp_sessions (subject_type, subject_id, token_hash, user_agent) VALUES (?, ?, ?, ?)',
    [subjectType, subjectId, hashToken(token), userAgent ? String(userAgent).slice(0, 500) : null]
  );
}

// Returns 'ok', 'idle' (ended now for inactivity) or 'missing' (never created,
// ended earlier, or issued before sessions existed).
async function touchSession(subjectType, token) {
  const [[row]] = await pool.execute(
    `SELECT id, last_seen_at, ended_at, TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS idle_seconds
     FROM cp_sessions WHERE token_hash = ? AND subject_type = ?`,
    [hashToken(token), subjectType]
  );
  if (!row || row.ended_at) return 'missing';
  if (row.idle_seconds > IDLE_MINUTES[subjectType] * 60) {
    await pool.execute(`UPDATE cp_sessions SET ended_at = NOW(), ended_reason = 'idle' WHERE id = ?`, [row.id]);
    return 'idle';
  }
  if (row.idle_seconds * 1000 >= TOUCH_INTERVAL_MS) {
    await pool.execute('UPDATE cp_sessions SET last_seen_at = NOW() WHERE id = ?', [row.id]);
  }
  return 'ok';
}

async function endSession(token, reason = 'logout') {
  if (!token) return;
  await pool.execute(
    `UPDATE cp_sessions SET ended_at = NOW(), ended_reason = ? WHERE token_hash = ? AND ended_at IS NULL`,
    [reason, hashToken(token)]
  );
}

// Where this person is signed in (Rohith's sign-in Tier 2, 12 Oct 2026): every
// open session, the current one marked, so they can end any other or all of them.
async function listSessions(subjectType, subjectId, currentToken) {
  const [rows] = await pool.execute(
    `SELECT id, user_agent, created_at, last_seen_at, token_hash = ? AS is_current
     FROM cp_sessions WHERE subject_type = ? AND subject_id = ? AND ended_at IS NULL
     ORDER BY last_seen_at DESC`,
    [hashToken(currentToken || ''), subjectType, subjectId]
  );
  return rows.map(r => ({ id: r.id, user_agent: r.user_agent, created_at: r.created_at, last_seen_at: r.last_seen_at, is_current: !!r.is_current }));
}

async function endSessionById(subjectType, subjectId, id) {
  const [r] = await pool.execute(
    `UPDATE cp_sessions SET ended_at = NOW(), ended_reason = 'ended_by_user' WHERE id = ? AND subject_type = ? AND subject_id = ? AND ended_at IS NULL`,
    [id, subjectType, subjectId]
  );
  return r.affectedRows > 0;
}

async function endOtherSessions(subjectType, subjectId, currentToken) {
  const [r] = await pool.execute(
    `UPDATE cp_sessions SET ended_at = NOW(), ended_reason = 'ended_by_user' WHERE subject_type = ? AND subject_id = ? AND ended_at IS NULL AND token_hash <> ?`,
    [subjectType, subjectId, hashToken(currentToken || '')]
  );
  return r.affectedRows;
}

module.exports = { createSession, touchSession, endSession, listSessions, endSessionById, endOtherSessions, idleMessage, IDLE_MINUTES };
