/**
 * Admin Chatbox — /api/admin/chatbox
 * AI chatbox configuration per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

router.get('/:clientId', authenticateAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM cp_chatbox_config WHERE client_id = ?').get(req.params.clientId);
  if (!row) return res.status(404).json({ error: 'Chatbox config not found.' });
  res.json({ chatbox: row });
});

router.patch('/:clientId', authenticateAdmin, (req, res) => {
  const allowed = ['ai_provider', 'model', 'system_prompt', 'welcome_message', 'max_tokens', 'is_active'];
  const updates = [], params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  // api_key stored separately — never returned in GET
  if (req.body.api_key !== undefined) { updates.push('api_key = ?'); params.push(req.body.api_key || null); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.clientId);
  db.prepare(`UPDATE cp_chatbox_config SET ${updates.join(', ')} WHERE client_id = ?`).run(...params);
  res.json({ message: 'Chatbox config updated.' });
});

module.exports = router;
