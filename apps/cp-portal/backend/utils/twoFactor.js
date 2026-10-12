'use strict';

/**
 * twoFactor.js — the arithmetic behind two-step sign-in for CP Portal admins
 * (Rohith's sign-in Tier 1, 12 Oct 2026). Time-based one-time codes as
 * authenticator apps compute them (RFC 6238, 30-second steps, six digits),
 * six-digit email codes, backup codes, and the hashing used to store any of
 * them. Nothing here touches the database.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_CODE_COUNT = 10;
const EMAIL_CODE_MINUTES = 10;

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  const rest = bits.length % 5;
  if (rest) out += BASE32_ALPHABET[parseInt(bits.slice(bits.length - rest).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) bits += BASE32_ALPHABET.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function generateTotpToken(secret, timestamp = Date.now(), timeStep = 30, digits = 6) {
  const counter = Math.floor(timestamp / 1000 / timeStep);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

// One step either side, so a phone clock a few seconds off still works.
function verifyTotpToken(secret, token, window = 1) {
  const given = String(token || '').trim();
  if (!/^\d{6}$/.test(given)) return false;
  for (let offset = -window; offset <= window; offset++) {
    if (timingSafeEqualStr(generateTotpToken(secret, Date.now() + offset * 30000), given)) return true;
  }
  return false;
}

function generateEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

function generateDeviceToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  if (!domain) return local.length > 2 ? `${local.slice(0, 2)}…` : local;
  return `${local.slice(0, 2)}…@${domain}`;
}

module.exports = {
  BACKUP_CODE_COUNT, EMAIL_CODE_MINUTES,
  generateTotpSecret, generateTotpToken, verifyTotpToken,
  generateEmailCode, generateBackupCodes, generateDeviceToken,
  hashValue, timingSafeEqualStr, maskEmail,
};
