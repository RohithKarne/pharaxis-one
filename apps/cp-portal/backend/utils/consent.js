'use strict';

/**
 * consent.js — reading a visitor's cookie choice (CPPM-35) and fingerprinting
 * anonymous visitors (CPPM-27).
 */

const crypto = require('crypto');
const { pool } = require('../database/db');
const log = require('./logger');

// CPPM-27: a plain SHA-256 of an IP address can be reversed by trying every
// address, so it was never "no personal data". A keyed hash cannot be reversed
// without the server secret. It is still pseudonymous personal data under GDPR
// and is handled as such — it is simply no longer trivially reversible.
let hashKey = null;
function key() {
  if (hashKey) return hashKey;
  const material = process.env.CP_CONSENT_HASH_KEY || process.env.CP_SECRET_ENCRYPTION_KEY;
  if (!material && process.env.NODE_ENV === 'production') {
    throw new Error('CP_CONSENT_HASH_KEY or CP_SECRET_ENCRYPTION_KEY must be set in production.');
  }
  hashKey = crypto.createHash('sha256').update(`consent-ip:${material || 'cp-portal-local-dev'}`).digest();
  return hashKey;
}

function visitorIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

function hashVisitorIp(req) {
  return crypto.createHmac('sha256', key()).update(visitorIp(req)).digest('hex');
}

// CPPM-35: the visitor's latest recorded choice for this client. No record means
// no consent — nothing optional is assumed.
async function latestChoices(req, clientId) {
  const userId = req.portalUser?.userId || null;
  const [[row]] = userId
    ? await pool.execute(
        'SELECT choices_json FROM cp_consent_records WHERE client_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
        [clientId, userId])
    : await pool.execute(
        'SELECT choices_json FROM cp_consent_records WHERE client_id = ? AND user_id IS NULL AND ip_hash = ? ORDER BY id DESC LIMIT 1',
        [clientId, hashVisitorIp(req)]);
  if (!row) return {};
  try { return JSON.parse(row.choices_json || '{}') || {}; } catch { return {}; }
}

async function hasAnalyticsConsent(req, clientId) {
  return (await latestChoices(req, clientId)).analytics === true;
}

// CPPM-29: an anonymous visitor's choice is kept 12 months (Vasu, CCO, 29 Sep 2026).
// Rows written before the keyed hash reached main (PR #660, 22 Sep 2026) still carry
// the reversible hash, so they go now. Only anonymous rows (ip_hash set) are touched:
// a signed-in person's row has no ip_hash, even after their account is deleted.
const CONSENT_RETENTION_MONTHS = 12;
const KEYED_HASH_SINCE = '2026-09-23 00:00:00';

async function purgeExpiredConsent() {
  const [r] = await pool.execute(
    `DELETE FROM cp_consent_records
      WHERE user_id IS NULL AND ip_hash IS NOT NULL
        AND (consented_at < NOW() - INTERVAL ? MONTH OR consented_at < ?)`,
    [CONSENT_RETENTION_MONTHS, KEYED_HASH_SINCE]);
  if (r.affectedRows) log.info('consent.records.purged', { records: r.affectedRows, retention_months: CONSENT_RETENTION_MONTHS });
}

module.exports = { hashVisitorIp, latestChoices, hasAnalyticsConsent, purgeExpiredConsent };
