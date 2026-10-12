'use strict';

/**
 * knownDeviceService.js — "new device signed in" (Rohith's sign-in Tier 2, 2026-10-12).
 *
 * Each browser gets a random token in a year-long cookie, mims_device, kept
 * hashed in user_known_devices per person. At sign-in the cookie is looked up:
 * a match is touched; no match is recorded as a new device and, unless it is
 * the first device this person has ever signed in from, an email goes out
 * through the platform mail set-up. The cookie is not a credential.
 */

const crypto = require('crypto');
const pool = require('../database/db');
const mailer = require('../utils/mailer');
const { decryptMailboxSecret } = require('./mailboxCrypto');
const { getSystemConfig } = require('./alertService');
const { logger } = require('./logger');

const COOKIE = 'mims_device';
const COOKIE_DAYS = 365;

function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function readCookie(req, name) {
  const raw = req?.headers?.cookie || '';
  const part = raw.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

// Returns { isNew, firstEver }. Sets the cookie when the browser had none.
async function noteDevice(req, res, userId) {
  let token = readCookie(req, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: COOKIE_DAYS * 24 * 60 * 60 * 1000 });
  }
  const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null;
  const [r] = await pool.execute(
    'UPDATE user_known_devices SET last_seen_at = NOW() WHERE user_id = ? AND device_token_hash = ?',
    [userId, hash(token)]
  );
  if (r.affectedRows > 0) return { isNew: false, firstEver: false };
  const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM user_known_devices WHERE user_id = ?', [userId]);
  await pool.execute(
    'INSERT IGNORE INTO user_known_devices (user_id, device_token_hash, user_agent) VALUES (?, ?, ?)',
    [userId, hash(token), userAgent]
  );
  return { isNew: true, firstEver: count.n === 0 };
}

function browserLabel(ua) {
  const u = String(ua || '');
  if (!u) return 'Unknown browser';
  const browser = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
    : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  const os = /Windows/.test(u) ? 'Windows' : /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android'
    : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'unknown device';
  return `${browser} on ${os}`;
}

// Operational mail: the person is the one who signed in and is waiting to know
// whether that was noticed. Never throws; a failure is logged and the sign-in stands.
async function sendNewDeviceEmail({ toEmail, userName, req, ip, location }) {
  try {
    const config = await getSystemConfig();
    const host = config.smtp_host;
    const port = parseInt(config.smtp_port || '0', 10);
    const username = config.smtp_username;
    const password = decryptMailboxSecret(config.smtp_password);
    const fromEmail = config.smtp_from_email || username;
    if (!host || !port || !username || !password || !fromEmail) {
      logger.warn({ toEmail }, 'New-device email not sent: platform SMTP is not set up');
      return false;
    }
    const transporter = mailer.createTransport('operational', {
      host, port,
      secure: (config.smtp_encryption || 'STARTTLS') === 'SSL/TLS',
      requireTLS: (config.smtp_encryption || 'STARTTLS') === 'STARTTLS',
      auth: { user: username, pass: password },
      tls: { rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS !== 'true' },
      connectionTimeout: 10000,
    });
    const base = (process.env.MIMS_FRONTEND_BASE_URL || '').replace(/\/$/, '');
    const where = [location, ip].filter(Boolean).join(', ');
    await transporter.sendMail({
      from: `"${config.smtp_from_name || 'MIMS Platform'}" <${fromEmail}>`,
      to: toEmail,
      subject: 'New sign-in to your MIMS account',
      text: `Hello ${userName || ''},\n\nYour MIMS account was just signed in to from a browser we had not seen before.\n\nWhen: ${new Date().toUTCString()}\nBrowser: ${browserLabel(req.headers['user-agent'])}\nFrom: ${where || 'unknown'}\n\nIf this was you, there is nothing to do. If it was not, change your password now and sign out of every other session at ${base}/session-management.`,
    });
    return true;
  } catch (err) {
    logger.warn({ err: err.message, toEmail }, 'New-device email failed');
    return false;
  }
}

module.exports = { noteDevice, sendNewDeviceEmail, COOKIE };
