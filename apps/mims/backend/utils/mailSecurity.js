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

// MIPM-142: the platform SMTP form marks these required, and an empty save used to
// report "saved" while leaving 2FA codes and password-reset email unable to send.
// Returns the message to refuse with, or null. Only checked when SMTP fields are sent.
async function platformSmtpConfigError(body, pool) {
  const { smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password, smtp_from_email } = body || {};
  if ([smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_from_email].every(v => v === undefined)) return null;
  const missing = [
    [smtp_host, 'SMTP host'], [smtp_port, 'SMTP port'], [smtp_encryption, 'encryption'],
    [smtp_username, 'SMTP username'], [smtp_from_email, 'from email'],
  ].filter(([v]) => !String(v ?? '').trim()).map(([, label]) => label);
  if (missing.length) return `Required: ${missing.join(', ')}.`;
  const port = Number(smtp_port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'SMTP port must be a number from 1 to 65535.';
  if (![...ENCRYPTED, 'None'].includes(smtp_encryption)) return 'Encryption must be STARTTLS, SSL/TLS or None.';
  if (!/^[^@\s]+@[^@\s]+$/.test(String(smtp_from_email).trim())) return 'From email is not a valid address.';
  if (!smtp_password) {
    const [[saved]] = await pool.execute("SELECT 1 AS ok FROM system_config WHERE config_key = 'smtp_password' AND config_value <> '' LIMIT 1");
    if (!saved) return 'Required: SMTP password.';
  }
  return null;
}

module.exports = { insecureMailAllowed, imapRequireStartTls, smtpWithRequiredTls, unencryptedMailError, platformSmtpConfigError };
