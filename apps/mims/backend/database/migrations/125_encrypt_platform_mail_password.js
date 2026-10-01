'use strict';

/**
 * Migration 125 — the platform mail password is encrypted at rest (MIPM-68).
 *
 * WHY
 * The platform mail account (2FA Configuration screen) carries the password for
 * sign-in codes, password resets, platform alerts and scheduled reports. It was
 * saved in system_config as typed, while every organisation mailbox password is
 * encrypted. The save routes now encrypt; this encrypts a value saved before.
 *
 * WHAT
 * If system_config.smtp_password holds a value that is not already in the
 * encrypted envelope, it is replaced by the encrypted form. Every reader
 * decrypts, and decrypting a value saved before this ran still works.
 *
 * Needs SSO_CONFIG_ENCRYPTION_KEY only when there is a value to encrypt; it fails
 * loudly rather than leave a password in plain text silently.
 */

const { decryptMailboxSecret, encryptMailboxSecret } = require('../../services/mailboxCrypto');

async function up(conn) {
  const [[row]] = await conn.execute(
    "SELECT config_value FROM system_config WHERE config_key = 'smtp_password' LIMIT 1"
  );
  const value = row?.config_value;
  if (!value || decryptMailboxSecret(value) !== value) return; // nothing saved, or already encrypted
  await conn.execute(
    "UPDATE system_config SET config_value = ? WHERE config_key = 'smtp_password'",
    [encryptMailboxSecret(value)]
  );
}

module.exports = { up };
