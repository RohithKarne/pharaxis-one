/**
 * Portal Consent — /api/portal/consent
 * F-02: Save consent record, get current config for this client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { requirePortalAuth, PORTAL_SECRET } = require('../../middleware/auth');
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
router.get('/current', (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const config = db.prepare('SELECT * FROM cp_compliance_config WHERE client_id = ?').get(client.id);
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
});

// POST /api/portal/consent — save consent record (auth optional)
router.post('/', (req, res) => {
  const { clientCode, choices, version } = req.body;
  if (!clientCode || !version) return res.status(400).json({ error: 'clientCode and version required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  // Resolve user_id from token if present
  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.slice(7), PORTAL_SECRET);
      userId = decoded.userId || null;
    } catch (_) {}
  }

  // Hash IP for anonymous records (no PII stored)
  const rawIp  = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ipHash = userId ? null : crypto.createHash('sha256').update(rawIp).digest('hex');

  db.prepare(`
    INSERT INTO cp_consent_records (client_id, user_id, ip_hash, version, choices_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(client.id, userId, ipHash, version, JSON.stringify(choices || {}));

  res.json({ saved: true });
});

module.exports = router;
