'use strict';

/**
 * consent.js — reading a visitor's cookie choice (CPPM-35) and fingerprinting
 * anonymous visitors (CPPM-27).
 */

const crypto = require('crypto');
const { pool } = require('../database/db');

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

// CPPM-35: the visitor's latest consent record for this client, with the wording
// it was given against (CPPM-13). No record means no consent — nothing optional
// is assumed.
const LATEST_CONSENT_SQL = `
  SELECT cr.choices_json, cr.version, cr.consented_at, v.title, v.body
    FROM cp_consent_records cr
    LEFT JOIN cp_consent_text_versions v ON v.id = cr.consent_text_version_id
   WHERE cr.client_id = ? AND `;

async function latestConsent(req, clientId) {
  const userId = req.portalUser?.userId || null;
  const [[row]] = userId
    ? await pool.execute(`${LATEST_CONSENT_SQL} cr.user_id = ? ORDER BY cr.id DESC LIMIT 1`, [clientId, userId])
    : await pool.execute(`${LATEST_CONSENT_SQL} cr.user_id IS NULL AND cr.ip_hash = ? ORDER BY cr.id DESC LIMIT 1`,
        [clientId, hashVisitorIp(req)]);
  return row || null;
}

async function latestChoices(req, clientId) {
  const row = await latestConsent(req, clientId);
  if (!row) return {};
  try { return JSON.parse(row.choices_json || '{}') || {}; } catch { return {}; }
}

async function hasAnalyticsConsent(req, clientId) {
  return (await latestChoices(req, clientId)).analytics === true;
}

module.exports = { hashVisitorIp, latestConsent, latestChoices, hasAnalyticsConsent };
