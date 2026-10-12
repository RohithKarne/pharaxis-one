'use strict';

/**
 * passkeys.js — passkey (WebAuthn) sign-in for CP Portal admins
 * (Rohith's sign-in Tier 2, 12 Oct 2026).
 *
 * The browser's own authenticator (Touch ID, Face ID, Windows Hello) signs a
 * one-time challenge with a private key that never leaves the device; we keep
 * only the public key in cp_admin_passkeys. Challenges live in
 * cp_admin_passkey_challenges for 90 seconds and are used once.
 *
 * The relying-party id must be the domain the admin console is opened on, and
 * the origin its full address: CP_WEBAUTHN_RP_ID and CP_WEBAUTHN_ORIGIN.
 * Development: localhost / http://localhost:5174.
 *
 * @simplewebauthn/server: the same library MIMS has used for its Touch ID sign-in
 * since Sprint 14, so the two apps verify passkeys the same way.
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { pool } = require('../database/db');
const log = require('./logger');

const RP_NAME = 'CP Portal';
const RP_ID   = process.env.CP_WEBAUTHN_RP_ID || 'localhost';
const ORIGIN  = process.env.CP_WEBAUTHN_ORIGIN || process.env.CP_FRONTEND_BASE_URL || 'http://localhost:5174';
const CHALLENGE_SECONDS = 90;

function fail(message, code) {
  return Object.assign(new Error(message), { code });
}

async function storeChallenge(adminId, type, challenge) {
  await pool.execute('DELETE FROM cp_admin_passkey_challenges WHERE admin_id = ? AND challenge_type = ?', [adminId, type]);
  // Expiry computed inside MySQL so it shares the clock of the NOW() check below.
  await pool.execute(
    'INSERT INTO cp_admin_passkey_challenges (admin_id, challenge, challenge_type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [adminId, challenge, type, CHALLENGE_SECONDS]
  );
}

async function consumeChallenge(adminId, type) {
  const [[row]] = await pool.execute(
    'SELECT id, challenge FROM cp_admin_passkey_challenges WHERE admin_id = ? AND challenge_type = ? AND expires_at > NOW() LIMIT 1',
    [adminId, type]
  );
  if (!row) return null;
  await pool.execute('DELETE FROM cp_admin_passkey_challenges WHERE id = ?', [row.id]);
  return row.challenge;
}

async function listPasskeys(adminId) {
  const [rows] = await pool.execute(
    'SELECT id, credential_id, device_name, transports, created_at, last_used_at FROM cp_admin_passkeys WHERE admin_id = ? ORDER BY created_at DESC',
    [adminId]
  );
  return rows;
}

function toDescriptor(row) {
  return { id: row.credential_id, transports: row.transports ? JSON.parse(row.transports) : [] };
}

async function registrationOptions(admin) {
  const existing = await listPasskeys(admin.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: admin.email,
    userID: new TextEncoder().encode(String(admin.id)),
    userDisplayName: admin.name || admin.email,
    timeout: CHALLENGE_SECONDS * 1000,
    attestationType: 'none',
    excludeCredentials: existing.map(toDescriptor),
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
  });
  await storeChallenge(admin.id, 'reg', options.challenge);
  return options;
}

async function finishRegistration(admin, response, deviceName) {
  const expectedChallenge = await consumeChallenge(admin.id, 'reg');
  if (!expectedChallenge) throw fail('That set-up took too long. Start again.', 'CHALLENGE_EXPIRED');
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response, expectedChallenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
    });
  } catch (err) {
    log.warn('admin.passkey.register_failed', { adminId: admin.id, err: err.message });
    throw fail('The passkey could not be registered. Try again.', 'VERIFICATION_FAILED');
  }
  if (!verification.verified || !verification.registrationInfo) throw fail('The passkey could not be registered. Try again.', 'VERIFICATION_FAILED');
  const { credential, aaguid } = verification.registrationInfo;
  const [r] = await pool.execute(
    'INSERT INTO cp_admin_passkeys (admin_id, credential_id, public_key, counter, aaguid, device_name, transports) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [admin.id, credential.id, Buffer.from(credential.publicKey).toString('base64'), credential.counter, aaguid || null,
      String(deviceName || 'This device').slice(0, 255), JSON.stringify(response.response?.transports || [])]
  );
  return { id: r.insertId, credential_id: credential.id };
}

// null when the admin has no passkey, so the sign-in page can say so.
async function authenticationOptions(adminId) {
  const rows = await listPasskeys(adminId);
  if (rows.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: RP_ID, timeout: CHALLENGE_SECONDS * 1000, allowCredentials: rows.map(toDescriptor), userVerification: 'required',
  });
  await storeChallenge(adminId, 'auth', options.challenge);
  return options;
}

async function finishAuthentication(adminId, response) {
  const expectedChallenge = await consumeChallenge(adminId, 'auth');
  if (!expectedChallenge) throw fail('That sign-in took too long. Start again.', 'CHALLENGE_EXPIRED');
  const [[row]] = await pool.execute('SELECT * FROM cp_admin_passkeys WHERE credential_id = ? AND admin_id = ?', [response?.id || '', adminId]);
  if (!row) throw fail('That passkey is not registered for this account.', 'VERIFICATION_FAILED');
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
      credential: { id: row.credential_id, publicKey: Buffer.from(row.public_key, 'base64'), counter: Number(row.counter), transports: row.transports ? JSON.parse(row.transports) : [] },
    });
  } catch (err) {
    log.warn('admin.passkey.verify_failed', { adminId, err: err.message });
    throw fail('The passkey could not be verified.', 'VERIFICATION_FAILED');
  }
  if (!verification.verified) throw fail('The passkey could not be verified.', 'VERIFICATION_FAILED');
  // The counter must move forward; a cloned authenticator replaying an old value is refused by the library.
  await pool.execute('UPDATE cp_admin_passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?', [verification.authenticationInfo.newCounter, row.id]);
  return row;
}

async function removePasskey(adminId, id) {
  const [r] = await pool.execute('DELETE FROM cp_admin_passkeys WHERE id = ? AND admin_id = ?', [id, adminId]);
  return r.affectedRows > 0;
}

module.exports = { registrationOptions, finishRegistration, authenticationOptions, finishAuthentication, listPasskeys, removePasskey };
