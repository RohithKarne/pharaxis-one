/**
 * Portal Consent — /api/portal/consent
 * F-02: Save consent record, get current config for this client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { requirePortalAuth, authenticatePortal } = require('../../middleware/auth');
const crypto  = require('crypto');

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

    // Hash IP for anonymous records (no PII stored)
    const rawIp  = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ipHash = userId ? null : crypto.createHash('sha256').update(rawIp).digest('hex');

    await pool.execute(`
      INSERT INTO cp_consent_records (client_id, user_id, ip_hash, version, choices_json)
      VALUES (?, ?, ?, ?, ?)
    `, [client.id, userId, ipHash, version, JSON.stringify(choices || {})]);

    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
