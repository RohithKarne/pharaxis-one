'use strict';

/**
 * Bridge plan P5 — the fingerprint of a report sent over the bridge.
 *
 * SHA-256 of the report as JSON with its keys in sorted order at every level, so
 * the portal and MIMS get the same value from the same report whatever order the
 * keys travelled in. The `payload_sha256` field, where the sender puts its own
 * value, is left out. MIMS has the same function
 * (apps/mims/backend/services/api-platform/reportFingerprint.js); the two must not drift.
 */
const crypto = require('crypto');

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

function reportFingerprint(report) {
  const { payload_sha256: _ignored, ...rest } = report || {};
  return crypto.createHash('sha256').update(canonical(rest)).digest('hex');
}

module.exports = { reportFingerprint };
