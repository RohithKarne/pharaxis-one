'use strict';

/**
 * webauthnService.js — WebAuthn / Passkey (Touch ID) service
 *
 * Handles credential registration and authentication using the WebAuthn standard.
 * Uses @simplewebauthn/server for all cryptographic operations.
 * Challenges are stored in MySQL (webauthn_challenges table, 90s TTL, single-use).
 * Credentials (public keys) are stored in the webauthn_credentials DB table.
 *
 * RP ID must match the effective domain the browser loads the app from.
 * Dev: localhost / http://localhost:5173
 * Prod: mims.pharaxis.com / https://mims.pharaxis.com
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const pool       = require('../database/db');
const { logger } = require('./logger');

const RP_NAME        = process.env.WEBAUTHN_RP_NAME   || 'MIMS';
const RP_ID          = process.env.WEBAUTHN_RP_ID     || 'localhost';
const ORIGIN         = process.env.WEBAUTHN_RP_ORIGIN || 'http://localhost:5173';
const CHALLENGE_TTL_SECONDS = 90;

// ── DB challenge helpers (consistent with MIMS 2FA challenge pattern) ─────────

async function storeChallenge(userId, type, challenge) {
  // Clean up any stale challenges for this user+type first
  await pool.execute(
    'DELETE FROM webauthn_challenges WHERE user_id = ? AND type = ?',
    [userId, type]
  );
  // Compute expiry inside MySQL with DATE_ADD(NOW(), ...) so it shares the same
  // time reference as the `expires_at > NOW()` comparison on consume. Passing a
  // JS Date instead skews against the DB session timezone (SYSTEM) and makes the
  // challenge appear expired immediately. (Matches the 2FA challenge pattern.)
  await pool.execute(
    'INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [userId, challenge, type, CHALLENGE_TTL_SECONDS]
  );
}

async function consumeChallenge(userId, type) {
  const [[row]] = await pool.execute(
    'SELECT id, challenge FROM webauthn_challenges WHERE user_id = ? AND type = ? AND expires_at > NOW() LIMIT 1',
    [userId, type]
  );
  if (!row) return null;
  // Consume immediately — single use
  await pool.execute('DELETE FROM webauthn_challenges WHERE id = ?', [row.id]);
  return row.challenge;
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Generate registration options for a user.
 * Returns PublicKeyCredentialCreationOptionsJSON to send to the browser.
 */
async function generateRegistrationOptionsForUser(user) {
  // Load existing credentials so the browser knows which ones are already registered
  const existing = await listCredentialsForUser(user.id);

  const options = await generateRegistrationOptions({
    rpName:                  RP_NAME,
    rpID:                    RP_ID,
    userName:                user.email,
    userID:                  new TextEncoder().encode(String(user.id)),
    userDisplayName:         user.name || user.email,
    timeout:                 90000,
    attestationType:         'none',
    excludeCredentials:      existing.map(c => ({
      id:         c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : [],
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',    // platform = Touch ID / Face ID / Windows Hello
      residentKey:             'preferred',
      userVerification:        'required',    // biometric verification is mandatory
    },
  });

  await storeChallenge(user.id, 'reg', options.challenge);
  return options;
}

/**
 * Verify registration response from browser and store the new credential.
 * Returns the newly created credential row.
 */
async function verifyAndStoreRegistration(user, registrationResponse, deviceName) {
  const expectedChallenge = await consumeChallenge(user.id, 'reg');
  if (!expectedChallenge) {
    throw Object.assign(new Error('Registration challenge expired or not found. Please try again.'), { code: 'CHALLENGE_EXPIRED' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response:          registrationResponse,
      expectedChallenge,
      expectedOrigin:    ORIGIN,
      expectedRPID:      RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    logger.warn({ err: err.message, userId: user.id }, 'WebAuthn registration verification failed');
    throw Object.assign(new Error('Touch ID registration failed. Please try again.'), { code: 'VERIFICATION_FAILED' });
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw Object.assign(new Error('Touch ID registration could not be verified.'), { code: 'VERIFICATION_FAILED' });
  }

  const { credential, aaguid } = verification.registrationInfo;

  // credential.id is already a base64url string in v13
  const credentialId = credential.id;
  const publicKey    = Buffer.from(credential.publicKey).toString('base64');
  const counter      = credential.counter;
  const transports   = JSON.stringify(registrationResponse.response?.transports || []);
  const name         = deviceName || 'Unknown device';

  await pool.execute(
    `INSERT INTO webauthn_credentials
       (user_id, credential_id, public_key, counter, aaguid, device_name, transports)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user.id, credentialId, publicKey, counter, aaguid || null, name, transports]
  );

  const [[row]] = await pool.execute(
    'SELECT id, credential_id, device_name, created_at FROM webauthn_credentials WHERE credential_id = ?',
    [credentialId]
  );
  return row;
}

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Generate authentication options for a user.
 * Returns PublicKeyCredentialRequestOptionsJSON to send to the browser.
 * Returns null if the user has no registered credentials.
 */
async function generateAuthenticationOptionsForUser(userId) {
  const credentials = await listCredentialsForUser(userId);
  if (credentials.length === 0) return null;

  const options = await generateAuthenticationOptions({
    rpID:   RP_ID,
    timeout: 90000,
    allowCredentials: credentials.map(c => ({
      id:         c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : [],
    })),
    userVerification: 'required',
  });

  await storeChallenge(userId, 'auth', options.challenge);
  return options;
}

/**
 * Verify authentication response from browser.
 * Returns the matched credential row on success.
 */
async function verifyAuthentication(userId, authenticationResponse) {
  const expectedChallenge = await consumeChallenge(userId, 'auth');
  if (!expectedChallenge) {
    throw Object.assign(new Error('Authentication challenge expired. Please try again.'), { code: 'CHALLENGE_EXPIRED' });
  }

  // Find the specific credential being used
  const credentialId = authenticationResponse.id;
  const [[credRow]] = await pool.execute(
    'SELECT * FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?',
    [credentialId, userId]
  );
  if (!credRow) {
    throw Object.assign(new Error('Credential not found.'), { code: 'CREDENTIAL_NOT_FOUND' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response:          authenticationResponse,
      expectedChallenge,
      expectedOrigin:    ORIGIN,
      expectedRPID:      RP_ID,
      requireUserVerification: true,
      credential: {
        id:         credRow.credential_id,
        publicKey:  Buffer.from(credRow.public_key, 'base64'),
        counter:    credRow.counter,
        transports: credRow.transports ? JSON.parse(credRow.transports) : [],
      },
    });
  } catch (err) {
    logger.warn({ err: err.message, userId, credentialId }, 'WebAuthn authentication verification failed');
    throw Object.assign(new Error('Touch ID verification failed.'), { code: 'VERIFICATION_FAILED' });
  }

  if (!verification.verified) {
    throw Object.assign(new Error('Touch ID verification failed.'), { code: 'VERIFICATION_FAILED' });
  }

  // Update counter and last_used_at — counter check prevents replay attacks
  await pool.execute(
    'UPDATE webauthn_credentials SET counter = ?, last_used_at = NOW() WHERE id = ?',
    [verification.authenticationInfo.newCounter, credRow.id]
  );

  return credRow;
}

// ── Credential management ─────────────────────────────────────────────────────

async function hasCredentialForUser(userId) {
  try {
    const [[row]] = await pool.execute(
      'SELECT id FROM webauthn_credentials WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return !!row;
  } catch (_) {
    return false; // fail safe — don't break login flow if this query fails
  }
}

async function listCredentialsForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT id, credential_id, device_name, transports, created_at, last_used_at
     FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function deleteCredential(credentialId, userId) {
  const [result] = await pool.execute(
    'DELETE FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?',
    [credentialId, userId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  generateRegistrationOptionsForUser,
  verifyAndStoreRegistration,
  generateAuthenticationOptionsForUser,
  verifyAuthentication,
  hasCredentialForUser,
  listCredentialsForUser,
  deleteCredential,
};
