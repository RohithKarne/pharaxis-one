'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../database/db');

const OTP_EXPIRY_MINUTES = 5;
const BACKUP_CODE_COUNT = 5;

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = String(input || '').toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}

function generateTrustedDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateTotpToken(secret, timeStep = 30, digits = 6, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function verifyTotpToken(secret, token, window = 2) {
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = generateTotpToken(secret, 30, 6, Date.now() + offset * 30000);
    if (timingSafeEqualStr(candidate, token)) return true;
  }
  return false;
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return email || '';
  if (local.length <= 2) return `${local[0] || ''}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

async function getSystemConfig() {
  const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
  return rows.reduce((acc, row) => {
    acc[row.config_key] = row.config_value;
    return acc;
  }, {});
}

async function sendEmailOtp({ toEmail, userName, code }) {
  const config = await getSystemConfig();
  const host = config.smtp_host;
  const port = parseInt(config.smtp_port || '0', 10);
  const encryption = config.smtp_encryption || 'SSL/TLS';
  const username = config.smtp_username;
  const password = config.smtp_password;
  const fromEmail = config.smtp_from_email || username;
  const fromName = config.smtp_from_name || 'MIMS Platform';

  if (!host || !port || !username || !password || !fromEmail) {
    throw new Error('Superadmin SMTP configuration is incomplete.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: encryption === 'SSL/TLS',
    requireTLS: encryption === 'STARTTLS',
    auth: { user: username, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: 'MIMS verification code',
    text: `Hello ${userName || 'User'}, your MIMS verification code is ${code}. It will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
  });
}

module.exports = {
  OTP_EXPIRY_MINUTES,
  BACKUP_CODE_COUNT,
  generateTotpSecret,
  generateOtpCode,
  generateBackupCodes,
  generateTrustedDeviceToken,
  generateTotpToken,
  verifyTotpToken,
  hashValue,
  maskEmail,
  sendEmailOtp,
};
