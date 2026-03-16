/**
 * Portal Config — /api/portal/config
 * Returns all configuration a portal client needs to render itself.
 * Called by the portal frontend on load using the client code.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');

// GET /api/portal/config/:clientCode
router.get('/:clientCode', (req, res) => {
  const client = db.prepare('SELECT * FROM cp_clients WHERE code = ? AND is_active = 1').get(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  const branding  = db.prepare('SELECT * FROM cp_branding WHERE client_id = ?').get(client.id);
  const features  = db.prepare('SELECT feature_key, is_enabled, display_name, display_order, icon FROM cp_features WHERE client_id = ? ORDER BY display_order ASC').all(client.id);
  const enabledFeatures = features.filter(f => f.is_enabled);

  // Chatbox — never expose api_key
  const chatboxRow = db.prepare('SELECT welcome_message, is_active FROM cp_chatbox_config WHERE client_id = ?').get(client.id);
  const chatbox = chatboxRow?.is_active ? { welcome_message: chatboxRow.welcome_message } : null;

  // Gate config — only include if enabled
  const gateConfig = db.prepare('SELECT * FROM cp_gate_config WHERE client_id = ?').get(client.id);
  let gate = null;
  if (gateConfig?.is_enabled) {
    const userTypes  = db.prepare('SELECT type_key, label, description, icon, display_order FROM cp_gate_user_types WHERE client_id = ? AND is_enabled = 1 ORDER BY display_order ASC').all(client.id);
    const accessRows = db.prepare('SELECT feature_key, type_key, is_allowed FROM cp_feature_access WHERE client_id = ?').all(client.id);
    const accessMap  = {};
    for (const row of accessRows) {
      if (!accessMap[row.feature_key]) accessMap[row.feature_key] = {};
      accessMap[row.feature_key][row.type_key] = !!row.is_allowed;
    }
    gate = {
      gate_title:         gateConfig.gate_title,
      gate_subtitle:      gateConfig.gate_subtitle,
      disclaimer_text:    gateConfig.disclaimer_text,
      require_disclaimer: !!gateConfig.require_disclaimer,
      userTypes,
      accessMap,
    };
  }

  // F-13: Safety banner flag — true if any critical/high alert is active
  const activeSafetyAlert = db.prepare(`
    SELECT COUNT(*) as cnt FROM cp_safety_alerts
    WHERE client_id = ? AND status = 'active' AND severity IN ('critical','high')
  `).get(client.id);
  const has_active_safety_alert = (activeSafetyAlert?.cnt || 0) > 0;

  // F-02: Compliance config — jurisdictions + version (no banner body exposed here)
  const complianceRow = db.prepare('SELECT jurisdictions_json, version, require_reconsent FROM cp_compliance_config WHERE client_id = ?').get(client.id);
  const compliance = complianceRow && JSON.parse(complianceRow.jurisdictions_json || '[]').length > 0
    ? { jurisdictions: JSON.parse(complianceRow.jurisdictions_json), version: complianceRow.version, require_reconsent: !!complianceRow.require_reconsent }
    : null;

  res.json({
    client:   { id: client.id, name: client.name, code: client.code },
    branding: branding || {},
    features: enabledFeatures,
    chatbox,
    gate,
    has_active_safety_alert,
    compliance,
  });
});

module.exports = router;
