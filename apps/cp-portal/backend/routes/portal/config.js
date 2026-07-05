/**
 * Portal Config — /api/portal/config
 * Returns all configuration a portal client needs to render itself.
 * Called by the portal frontend on load using the client code.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');

// GET /api/portal/config/:clientCode
router.get('/:clientCode', async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT * FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [[branding]] = await pool.execute('SELECT * FROM cp_branding WHERE client_id = ?', [client.id]);
    // API-03: Return features as a simple { feature_key: is_enabled } map — no internal IDs or metadata
    const [featuresRaw] = await pool.execute('SELECT feature_key, is_enabled FROM cp_features WHERE client_id = ?', [client.id]);
    const featuresMap = {};
    for (const f of featuresRaw) { featuresMap[f.feature_key] = !!f.is_enabled; }

    // Chatbox — never expose api_key
    const [[chatboxRow]] = await pool.execute('SELECT welcome_message, is_active FROM cp_chatbox_config WHERE client_id = ?', [client.id]);
    const chatbox = chatboxRow?.is_active ? { welcome_message: chatboxRow.welcome_message } : null;

    // Gate config — only include if enabled
    const [[gateConfig]] = await pool.execute('SELECT * FROM cp_gate_config WHERE client_id = ?', [client.id]);
    let gate = null;
    if (gateConfig?.is_enabled) {
      const [userTypes] = await pool.execute('SELECT type_key, label, description, icon, display_order FROM cp_gate_user_types WHERE client_id = ? AND is_enabled = 1 ORDER BY display_order ASC', [client.id]);
      const [accessRows] = await pool.execute('SELECT feature_key, type_key, is_allowed FROM cp_feature_access WHERE client_id = ?', [client.id]);
      const accessMap = {};
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
    const [[activeSafetyAlert]] = await pool.execute(`
      SELECT COUNT(*) as cnt, MAX(id) as max_id, MAX(UNIX_TIMESTAMP(updated_at)) as max_ts FROM cp_safety_alerts
      WHERE client_id = ? AND status = 'active' AND severity IN ('critical','high')
    `, [client.id]);
    const has_active_safety_alert = (activeSafetyAlert?.cnt || 0) > 0;
    // Signature of the current active critical/high alerts. Changes when an alert is
    // added, removed, or edited — so a dismissed banner re-appears for a NEW alert.
    const safety_alert_sig = has_active_safety_alert
      ? `${activeSafetyAlert.cnt}:${activeSafetyAlert.max_id}:${activeSafetyAlert.max_ts || 0}`
      : null;

    // F-02: Compliance config — jurisdictions + version (no banner body exposed here)
    const [[complianceRow]] = await pool.execute('SELECT jurisdictions_json, version, require_reconsent FROM cp_compliance_config WHERE client_id = ?', [client.id]);
    const compliance = complianceRow && JSON.parse(complianceRow.jurisdictions_json || '[]').length > 0
      ? { jurisdictions: JSON.parse(complianceRow.jurisdictions_json), version: complianceRow.version, require_reconsent: !!complianceRow.require_reconsent }
      : null;

    let language = { default: 'en', enabled: ['en'] };
    try { language = JSON.parse(client.language_config_json || '{}'); } catch {}

    res.json({
      // API-03: omit internal client.id — only public-safe identifiers
      client:   { name: client.name, code: client.code },
      branding: branding || {},
      features: featuresMap,
      chatbox,
      gate,
      has_active_safety_alert,
      safety_alert_sig,
      compliance,
      language,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
