'use strict';

/**
 * mailboxCrypto.js — shared mailbox-credential decryption (extracted from
 * emailPoller.js so emailCaseImportService can send acknowledgments over the
 * intake account's SMTP without a circular require).
 *
 * P7/F12: mailbox passwords are stored AES-256-GCM encrypted at rest (same
 * scheme as SSO secrets, written with ssoService.encryptSecret under the
 * dedicated SSO_CONFIG_ENCRYPTION_KEY). Fail closed if the key is missing —
 * no fallback to JWT_SECRET or a hardcoded constant for new writes; legacy
 * keys are attempted read-only for rows written before the key was required.
 */

const crypto = require('crypto');

function getMailboxEncryptionKeyMaterial() {
  const configured = String(process.env.SSO_CONFIG_ENCRYPTION_KEY || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SSO_CONFIG_ENCRYPTION_KEY must be set in production to decrypt mailbox credentials.'
    );
  }
  throw new Error(
    'SSO_CONFIG_ENCRYPTION_KEY is not set. Add it to your environment (.env) to manage mailbox credentials.'
  );
}

function deriveMailboxSecretKey() {
  return crypto.createHash('sha256').update(getMailboxEncryptionKeyMaterial()).digest();
}

// Read-compatibility only: keys previously used to derive the mailbox secret
// key before a dedicated key was required. Used solely to decrypt legacy rows.
function legacyMailboxDecryptionKeys() {
  const keys = [];
  const seen = new Set();
  const push = (material) => {
    const base = String(material || '').trim();
    if (!base || seen.has(base)) return;
    seen.add(base);
    keys.push(crypto.createHash('sha256').update(base).digest());
  };
  push(process.env.JWT_SECRET);
  push(require('../utils/jwtSecret'));
  return keys;
}

function decryptWithMailboxKey(key, ivB64, tagB64, encryptedB64) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

function decryptMailboxSecret(value) {
  const payload = String(value == null ? '' : value).trim();
  if (!payload) return value;
  const parts = payload.split('.');
  if (parts.length !== 3) return value; // not our envelope → assume legacy plaintext
  const [ivB64, tagB64, encryptedB64] = parts;
  if (!ivB64 || !tagB64 || !encryptedB64) return value;
  // Dedicated key first, then legacy keys for rows written before it was
  // required. The GCM auth tag makes a wrong-key attempt throw, so we advance
  // to the next candidate.
  const candidateKeys = [deriveMailboxSecretKey(), ...legacyMailboxDecryptionKeys()];
  for (const key of candidateKeys) {
    try {
      return decryptWithMailboxKey(key, ivB64, tagB64, encryptedB64);
    } catch (_) { /* wrong key → try next */ }
  }
  return value; // no configured key matched → treat as legacy plaintext
}

module.exports = { decryptMailboxSecret };
