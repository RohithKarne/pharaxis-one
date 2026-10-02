'use strict';
/**
 * utils/mailSecurity.js — MIPM-63: MIMS does not talk to a mail server over an
 * unencrypted connection. The one exception is the deliberate development
 * switch SMTP_ALLOW_INSECURE_TLS=true (see .env.example).
 */
const ENCRYPTED = ['SSL/TLS', 'STARTTLS'];

function insecureMailAllowed() {
  return process.env.SMTP_ALLOW_INSECURE_TLS === 'true';
}

// imapflow: true = stop if the server will not upgrade to TLS. Left undefined,
// a missing STARTTLS offer is accepted and the session carries on in the clear,
// which is also exactly what a downgrade attack looks like.
function imapRequireStartTls(encryption) {
  if (encryption === 'SSL/TLS') return undefined;
  return encryption === 'STARTTLS' || !insecureMailAllowed() ? true : undefined;
}

// nodemailer: a transport that is not implicit TLS must upgrade with STARTTLS.
function smtpWithRequiredTls(options) {
  if (options.secure || options.requireTLS || insecureMailAllowed()) return options;
  return { ...options, requireTLS: true };
}

// For the save routes: the message to refuse with, or null when the directions
// in use are both encrypted.
function unencryptedMailError(direction, imapEncryption, smtpEncryption) {
  if (insecureMailAllowed()) return null;
  if (['Inbound', 'Both'].includes(direction) && !ENCRYPTED.includes(imapEncryption)) {
    return 'Incoming mail encryption must be SSL/TLS or STARTTLS.';
  }
  if (['Outbound', 'Both'].includes(direction) && !ENCRYPTED.includes(smtpEncryption)) {
    return 'Outgoing mail encryption must be SSL/TLS or STARTTLS.';
  }
  return null;
}

module.exports = { insecureMailAllowed, imapRequireStartTls, smtpWithRequiredTls, unencryptedMailError };
