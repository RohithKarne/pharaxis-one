'use strict';

const crypto = require('crypto');
const fs = require('fs');
const pool = require('../database/db');

function sha256(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }

async function createESignManifest({ signer_user_id, signer_email, intent_string, signed_object, privateKeyPath = process.env.ESIGN_PRIVATE_KEY_PATH }) {
  if (!privateKeyPath) throw new Error('ESIGN_PRIVATE_KEY_PATH is required for cryptographic e-sign manifests.');
  const key = fs.readFileSync(privateKeyPath, 'utf8');
  const content_hash = sha256(JSON.stringify(signed_object || {}));
  const signature_value = crypto.sign('sha256', Buffer.from(content_hash), { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING }).toString('base64');
  const public_key_fingerprint = sha256(crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }));
  const manifest_id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO e_sign_manifests (manifest_id, signer_user_id, signer_email, intent_string, content_hash, signature_value, public_key_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [manifest_id, signer_user_id, signer_email, intent_string, content_hash, signature_value, public_key_fingerprint]
  );
  return { manifest_id, content_hash, signature_value, public_key_fingerprint };
}

module.exports = { createESignManifest, sha256 };
