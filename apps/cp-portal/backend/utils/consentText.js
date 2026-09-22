'use strict';

/**
 * consentText.js — CPPM-13. The wording behind each consent version.
 *
 * A version's stored wording is written once and never changed. Reworded notice
 * means a new version, so a consent record always points at the text that was on
 * screen when it was given.
 */

const { pool } = require('../database/db');

// What the portal banner falls back to when a client has configured no wording
// (ConsentBanner.jsx). Duplicated here on purpose: what we store has to be the
// text the person actually read, defaults included.
const DEFAULT_TITLE = 'We use cookies';
const DEFAULT_BODY  = 'We use cookies and similar technologies to improve your experience on this portal. Please choose your preferences below.';

/** The wording a banner_config_json value produces on screen. */
function wordingFrom(bannerConfigJson) {
  let cfg = {};
  try { cfg = JSON.parse(bannerConfigJson || '{}') || {}; } catch { /* keep defaults */ }
  return { title: cfg.title || DEFAULT_TITLE, body: cfg.body || DEFAULT_BODY };
}

/** 1.0 -> 1.1, 1.9 -> 1.10, 2 -> 2.1. Matches the re-consent bump. */
function bumpVersion(version) {
  const parts = String(version || '1.0').replace(/^v/i, '').split('.');
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return parts.join('.');
}

async function findVersion(clientId, version) {
  const [[row]] = await pool.execute(
    'SELECT id, version, title, body, effective_from FROM cp_consent_text_versions WHERE client_id = ? AND version = ?',
    [clientId, version]);
  return row || null;
}

/**
 * The id of the row holding this version's wording, created from `wording` the
 * first time it is needed. An existing row is returned untouched — its text is
 * never rewritten, so a record can only ever point at what was really shown.
 */
async function ensureVersion(clientId, version, wording, createdBy = null) {
  const existing = await findVersion(clientId, version);
  if (existing) {
    // A row with no words is not a wording — it comes from a client who never
    // configured the banner, where the visitor saw the built-in default text.
    // Filling it in once records what was actually on screen; it is not a rewrite,
    // and a row that already holds words is still never touched.
    if (!String(existing.body || '').trim() && String(wording.body || '').trim()) {
      await pool.execute(
        'UPDATE cp_consent_text_versions SET title = ?, body = ? WHERE id = ? AND (body IS NULL OR body = \'\')',
        [wording.title, wording.body, existing.id]);
      return findVersion(clientId, version);
    }
    return existing;
  }
  // INSERT IGNORE + re-read: two visitors consenting at once race here, and the
  // unique key on (client_id, version) decides which insert wins.
  await pool.execute(
    'INSERT IGNORE INTO cp_consent_text_versions (client_id, version, title, body, created_by) VALUES (?, ?, ?, ?, ?)',
    [clientId, version, wording.title, wording.body, createdBy]);
  return findVersion(clientId, version);
}

/**
 * Save consent wording for a client. If `version` already holds different text,
 * the version is bumped and the new wording stored against the new version
 * instead — the old row is left exactly as it was.
 *
 * Returns { version, changed }: `version` is the version this wording now lives
 * under, which the caller must write back to the compliance config when it
 * differs from the one passed in.
 */
async function saveWording(clientId, version, wording, createdBy = null) {
  const existing = await findVersion(clientId, version);
  if (!existing) {
    await ensureVersion(clientId, version, wording, createdBy);
    return { version, changed: true };
  }
  if (existing.title === wording.title && existing.body === wording.body) {
    return { version, changed: false };
  }
  let next = bumpVersion(version);
  while (await findVersion(clientId, next)) next = bumpVersion(next);
  await ensureVersion(clientId, next, wording, createdBy);
  return { version: next, changed: true };
}

module.exports = { wordingFrom, bumpVersion, findVersion, ensureVersion, saveWording, DEFAULT_TITLE, DEFAULT_BODY };
