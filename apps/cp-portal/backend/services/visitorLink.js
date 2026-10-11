/**
 * The private link a visitor gets to follow a request they sent without signing in
 * (Rohith, 10 Oct 2026). Whoever holds the link can read that one request — its
 * progress, the answer, questions from the medical team — and add to it. Nothing else.
 *
 * The secret in the link is 32 random bytes. The database keeps its SHA-256 to find the
 * request, and an encrypted copy so a later email (a question from MIMS) can carry the
 * same link again. The link stops working after a year, or as soon as the person's
 * details are erased (both columns are emptied then).
 */

const crypto = require('crypto');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');

const LINK_DAYS = 365;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const FRONTEND_BASE = (process.env.CP_FRONTEND_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newVisitorToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token), enc: encryptSecret(token) };
}

function visitorLink(clientCode, token) {
  return `${FRONTEND_BASE}/portal/${encodeURIComponent(clientCode)}/request/${token}`;
}

/** The link again, from the stored encrypted secret. Null when it cannot be read back. */
function linkFromStored(clientCode, enc) {
  const token = enc ? decryptSecret(enc) : null;
  return token && TOKEN_SHAPE.test(token) ? visitorLink(clientCode, token) : null;
}

/**
 * Who may see or add to a request when the caller holds its link: the matching,
 * unexpired, not-erased request. Null for anything that is not a link secret.
 */
function visitorOwner(token) {
  if (!TOKEN_SHAPE.test(String(token || ''))) return null;
  return {
    sql: 's.visitor_token_hash = ? AND s.visitor_token_expires_at > NOW() AND s.identity_erased_at IS NULL',
    params: [hashToken(token)],
  };
}

module.exports = { LINK_DAYS, newVisitorToken, visitorLink, linkFromStored, visitorOwner };
