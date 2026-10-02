'use strict';
/**
 * utils/signInClient.js — MIPM-82: how a script signs in to MIMS since batch 1.
 *
 * The session lives only in the httpOnly `mims_token` cookie (the sign-in reply no
 * longer carries a token), and an organisation can require 2FA, so "skip setup"
 * is refused. A script account therefore needs an authenticator set up once; its
 * secret is given next to its password (e.g. REGRESSION_TOTP_SECRET) and the code
 * is computed here, as a phone app would. Nothing about 2FA is relaxed for tests.
 *
 * totpCode() is the same RFC 6238 computation as services/twoFactorService.js
 * generateTotpToken (SHA-1, 30 s, 6 digits). It is copied, not imported, because
 * that service opens the database when loaded. If the two ever disagree the
 * script's sign-in fails at the 2FA step — it cannot pass silently.
 */
const crypto = require('crypto');

function base32ToBuffer(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(secret || '').toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', base32ToBuffer(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// The session JWT from a Set-Cookie header (string or array).
function sessionTokenFromSetCookie(setCookie) {
  const all = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  for (const line of all) {
    const m = /(?:^|;\s*)mims_token=([^;]+)/.exec(String(line));
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/**
 * signIn(post, { email, password, totpSecret })
 *   post(path, body) → Promise<{ status, body, setCookie }>  (the caller's HTTP client)
 * Resolves { token, step, status, error }. token is null on failure; step says where it stopped.
 */
async function signIn(post, { email, password, totpSecret, enrollTotpIfRequired = false } = {}) {
  const login = await post('/api/auth/login', { email, password });
  if (login.status !== 200) return { token: null, step: 'password', status: login.status, error: login.body?.error };
  const direct = sessionTokenFromSetCookie(login.setCookie);
  if (direct) return { token: direct, step: 'password', status: 200 };

  const challengeToken = login.body?.challengeToken;
  if (!challengeToken) return { token: null, step: 'password', status: 200, error: 'No session and no 2FA challenge.' };

  if (login.body?.twoFactorRequired && !login.body?.twoFactorSetupRequired) {
    if (!totpSecret) return { token: null, step: '2fa', status: 200, error: 'This account needs 2FA: give its authenticator secret.' };
    const v = await post('/api/auth/2fa/verify', { challengeToken, method: 'totp', code: totpCode(totpSecret) });
    const token = sessionTokenFromSetCookie(v.setCookie);
    return { token, step: '2fa', status: v.status, error: token ? undefined : v.body?.error };
  }

  // A throwaway account a test has just created, in an org that requires 2FA: set up an
  // authenticator exactly as a new person would. Opt-in — real accounts never do this.
  if (login.body?.twoFactorSetupRequired && enrollTotpIfRequired) {
    const setup = await post('/api/auth/2fa/setup/totp', { challengeToken });
    if (setup.status !== 200 || !setup.body?.secret) return { token: null, step: '2fa-setup', status: setup.status, error: setup.body?.error };
    const v = await post('/api/auth/2fa/verify', { challengeToken, method: 'totp', code: totpCode(setup.body.secret) });
    const token = sessionTokenFromSetCookie(v.setCookie);
    return { token, step: '2fa-setup', status: v.status, error: token ? undefined : v.body?.error, totpSecret: setup.body.secret };
  }

  // 2FA offered but not required: decline it for this script account.
  const skip = await post('/api/auth/2fa/skip-setup', { challengeToken });
  const token = sessionTokenFromSetCookie(skip.setCookie);
  return { token, step: '2fa-skip', status: skip.status, error: token ? undefined : (skip.body?.error || 'Set up an authenticator for this account; its organisation requires 2FA.') };
}

// A post() for scripts on Node 18+ (global fetch).
function fetchPost(baseUrl) {
  return async (path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null; try { parsed = JSON.parse(text); } catch (_) { parsed = text; }
    const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : res.headers.get('set-cookie');
    return { status: res.status, body: parsed, setCookie };
  };
}

module.exports = { signIn, fetchPost, totpCode, sessionTokenFromSetCookie };
