'use strict';

// Migration 098 — Hash legacy integration API keys (F13).
//
// Legacy API-key auth (middleware/apiKeyAuth.js) previously stored and compared
// org_integrations.api_key in PLAINTEXT, exposing live integration credentials
// at rest. This migration adds an api_key_hash column holding SHA-256(api_key)
// and backfills it for every existing row so current keys keep authenticating
// after the middleware switches to hash-based lookup.
//
// MySQL's SHA2(value, 256) returns the same lowercase hex digest as Node's
// crypto.createHash('sha256').update(value).digest('hex'), so the backfilled
// values match what the middleware computes for the presented key.

async function addColumn(conn, ddl) {
  try {
    await conn.execute(`ALTER TABLE org_integrations ADD COLUMN ${ddl}`);
  } catch (_) {}
}

async function up(conn) {
  await addColumn(conn, `api_key_hash CHAR(64) NULL`);

  // Backfill the hash for existing plaintext keys so they keep working.
  try {
    await conn.execute(
      `UPDATE org_integrations
          SET api_key_hash = LOWER(SHA2(api_key, 256))
        WHERE api_key IS NOT NULL
          AND api_key <> ''
          AND (api_key_hash IS NULL OR api_key_hash = '')`
    );
  } catch (_) {}

  try {
    await conn.execute(
      `ALTER TABLE org_integrations ADD KEY idx_org_integrations_api_key_hash (api_key_hash)`
    );
  } catch (_) {}
}

async function down(conn) {
  try {
    await conn.execute(`ALTER TABLE org_integrations DROP INDEX idx_org_integrations_api_key_hash`);
  } catch (_) {}
  try {
    await conn.execute(`ALTER TABLE org_integrations DROP COLUMN api_key_hash`);
  } catch (_) {}
}

module.exports = { up, down };
