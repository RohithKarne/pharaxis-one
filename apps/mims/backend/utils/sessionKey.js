'use strict';

const crypto = require('crypto');

// MIPM-172: the sessions table and the session cache hold a SHA-256 fingerprint
// of each sign-in token, never the token itself. A copy of the table or the
// cache no longer hands anyone a working session; the server fingerprints the
// token it is shown and looks that up.
function sessionKey(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { sessionKey };
