'use strict';

/**
 * knownDevices.js — "new device signed in" (Rohith's sign-in Tier 2, 12 Oct 2026).
 *
 * Each browser gets a random token in a year-long cookie, cp_device, kept
 * hashed in cp_known_devices per person. At sign-in the cookie is looked up:
 * a match is touched; no match is recorded as a new device and, unless it is
 * the first device this person has ever signed in from, an email goes out
 * through the client's own mail set-up. The cookie is not a credential: it
 * only decides whether the email is sent.
 */

const crypto = require('crypto');
const { pool } = require('../database/db');
const { queueEmail } = require('./emailOutbox');
const { browserLabel } = require('./browserLabel');

const COOKIE = 'cp_device';
const COOKIE_DAYS = 365;

function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

// Returns { isNew, firstEver }. Sets the cookie when the browser had none.
async function noteDevice(req, res, subjectType, subjectId) {
  let token = req.cookies?.[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: COOKIE_DAYS * 24 * 60 * 60 * 1000 });
  }
  const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null;
  const [r] = await pool.execute(
    `UPDATE cp_known_devices SET last_seen_at = NOW() WHERE subject_type = ? AND subject_id = ? AND token_hash = ?`,
    [subjectType, subjectId, hash(token)]
  );
  if (r.affectedRows > 0) return { isNew: false, firstEver: false };
  const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM cp_known_devices WHERE subject_type = ? AND subject_id = ?', [subjectType, subjectId]);
  await pool.execute(
    'INSERT IGNORE INTO cp_known_devices (subject_type, subject_id, token_hash, user_agent) VALUES (?, ?, ?, ?)',
    [subjectType, subjectId, hash(token), userAgent]
  );
  return { isNew: true, firstEver: count.n === 0 };
}

// Never throws: the sign-in has already succeeded.
async function sendNewDeviceEmail(clientId, { to, name, req, securityHint }) {
  if (!clientId) return;
  const when = new Date().toUTCString();
  const browser = browserLabel(req.headers['user-agent']);
  const ip = req.ip || '';
  const text = `Hi ${name || ''},\n\nYour CP Portal account was just signed in to from a browser we had not seen before.\n\nWhen: ${when}\nBrowser: ${browser}\nAddress: ${ip}\n\nIf this was you, there is nothing to do. If it was not, change your password now and ${securityHint}.`;
  const html = `<p>Hi ${escapeHtml(name || '')},</p><p>Your CP Portal account was just signed in to from a browser we had not seen before.</p><p><b>When:</b> ${when}<br><b>Browser:</b> ${escapeHtml(browser)}<br><b>Address:</b> ${escapeHtml(ip)}</p><p>If this was you, there is nothing to do. If it was not, change your password now and ${escapeHtml(securityHint)}.</p>`;
  await queueEmail(clientId, { to, subject: 'New sign-in to your CP Portal account', text, html }, { kind: 'new_device' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { noteDevice, sendNewDeviceEmail, COOKIE };
