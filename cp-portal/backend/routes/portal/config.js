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

  // Include public chatbox metadata (never expose api_key)
  const chatboxRow = db.prepare('SELECT welcome_message, is_active FROM cp_chatbox_config WHERE client_id = ?').get(client.id);
  const chatbox = chatboxRow?.is_active ? { welcome_message: chatboxRow.welcome_message } : null;

  res.json({
    client: { id: client.id, name: client.name, code: client.code },
    branding: branding || {},
    features: enabledFeatures,
    chatbox,
  });
});

module.exports = router;
