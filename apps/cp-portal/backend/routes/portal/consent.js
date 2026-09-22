/**
 * Portal Consent — /api/portal/consent
 * F-02: Save consent record, get current config for this client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { requirePortalAuth, authenticatePortal } = require('../../middleware/auth');
const log = require('../../utils/logger');
const { hashVisitorIp, latestConsent } = require('../../utils/consent');
const { wordingFrom, findVersion, ensureVersion } = require('../../utils/consentText');

// Jurisdiction strictness ranking — highest index = strictest
const JURISDICTION_RANK = ['apac', 'pdpb', 'ccpa', 'gdpr'];

function getStrictestJurisdiction(jurisdictions) {
  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) return 'ccpa';
  let best = jurisdictions[0];
  for (const j of jurisdictions) {
    if (JURISDICTION_RANK.indexOf(j) > JURISDICTION_RANK.indexOf(best)) best = j;
  }
  return best;
}

// GET /api/portal/consent/current?clientCode=xxx
// Returns compliance config + whether this user needs to consent
router.get('/current', async (req, res) => {
  try {
    const { clientCode } = req.query;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [[config]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [client.id]);
    if (!config) return res.json({ required: false, config: null });

    const jurisdictions = JSON.parse(config.jurisdictions_json || '[]');
    if (jurisdictions.length === 0) return res.json({ required: false, config: null });

    const strictest  = getStrictestJurisdiction(jurisdictions);
    const bannerCfg  = JSON.parse(config.banner_config_json || '{}');

    res.json({
      required:    true,
      version:     config.version,
      strictest,
      jurisdictions,
      banner:      bannerCfg,
      require_reconsent: !!config.require_reconsent,
    });
  } catch (err) {
    log.error('portal.consent.error', { err, route: 'GET /current', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/consent/check?clientCode=xxx&version=xxx
// Returns { consented: true/false } for the currently signed-in user
router.get('/check', authenticatePortal, async (req, res) => {
  try {
    const { clientCode, version } = req.query;
    if (!clientCode || !version) return res.status(400).json({ error: 'clientCode and version required.' });

    // CP-XX: this used to read the JWT only from an `Authorization: Bearer` header.
    // Portal login issues an httpOnly `cp_portal_token` cookie and deliberately never
    // echoes the token, so the header was never present and every caller looked
    // anonymous — this endpoint could not return `true` for anyone, and no consent
    // record written since the cookie migration was attributable to a person.
    // `authenticatePortal` accepts the cookie *and* a Bearer header, and additionally
    // rejects deactivated users and stale token versions.
    const userId = req.portalUser?.userId || null;
    if (!userId) return res.json({ consented: false });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.json({ consented: false });

    const [[record]] = await pool.execute('SELECT id FROM cp_consent_records WHERE client_id = ? AND user_id = ? AND version = ?', [client.id, userId, version]);
    res.json({ consented: !!record });
  } catch (err) {
    log.error('portal.consent.error', { err, route: 'GET /check', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/consent/my-choice?clientCode=xxx — the visitor's latest choice (CPPM-35),
// so "Cookie settings" reopens with what they actually chose. CPPM-13 adds the
// wording they agreed to, so they can read it back rather than take our word.
router.get('/my-choice', authenticatePortal, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.query.clientCode || '']);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const record = await latestConsent(req, client.id);
    let choices = {};
    try { choices = JSON.parse(record?.choices_json || '{}') || {}; } catch { /* no choices */ }
    res.json({
      choices,
      agreed: record && record.body
        ? { version: record.version, consented_at: record.consented_at, title: record.title, body: record.body }
        : null,
    });
  } catch (err) {
    log.error('portal.consent.error', { err, route: 'GET /my-choice', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/consent — save consent record (auth optional)
router.post('/', authenticatePortal, async (req, res) => {
  try {
    const { clientCode, choices, version } = req.body;
    if (!clientCode || !version) return res.status(400).json({ error: 'clientCode and version required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    // Resolve user_id from the session. Auth is optional here on purpose — the
    // portal is browsable anonymously and an anonymous visitor must still be able
    // to record a consent choice (attributed by hashed IP below).
    const userId = req.portalUser?.userId || null;

    // CPPM-27: anonymous records carry a keyed hash of the IP. This is
    // pseudonymous personal data under GDPR — not "no PII" — but, unlike the plain
    // SHA-256 used before, it cannot be reversed without the server secret.
    const ipHash = userId ? null : hashVisitorIp(req);

    // CPPM-13: point the record at the wording behind this version. The wording
    // is only captured for the version the portal is currently serving — an older
    // version arriving from a stale browser links to its stored text if we have
    // it, and to nothing if we do not, rather than being stamped with today's.
    const [[config]] = await pool.execute('SELECT version, banner_config_json FROM cp_compliance_config WHERE client_id = ?', [client.id]);
    const textVersion = config && config.version === version
      ? await ensureVersion(client.id, version, wordingFrom(config.banner_config_json))
      : await findVersion(client.id, version);

    await pool.execute(`
      INSERT INTO cp_consent_records (client_id, user_id, ip_hash, version, consent_text_version_id, choices_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [client.id, userId, ipHash, version, textVersion?.id || null, JSON.stringify(choices || {})]);

    res.json({ saved: true });
  } catch (err) {
    log.error('portal.consent.error', { err, route: 'POST /', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
