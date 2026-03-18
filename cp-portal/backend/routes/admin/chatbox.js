/**
 * Admin Chatbox — /api/admin/chatbox
 * AI chatbox configuration per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

const VALID_PROVIDERS = ['anthropic', 'openai'];

router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const row = db.prepare('SELECT * FROM cp_chatbox_config WHERE client_id = ?').get(req.params.clientId);
  if (!row) return res.status(404).json({ error: 'Chatbox config not found.' });
  res.json({ chatbox: row });
});

router.patch('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  // MED-31: validate model field against known Anthropic / OpenAI models
  const VALID_ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];
  const VALID_OPENAI_MODELS    = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  const VALID_MODELS           = [...VALID_ANTHROPIC_MODELS, ...VALID_OPENAI_MODELS];

  if (req.body.ai_provider && !VALID_PROVIDERS.includes(req.body.ai_provider)) {
    return res.status(400).json({ error: `Invalid ai_provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
  }

  if (req.body.model && !VALID_MODELS.includes(req.body.model)) {
    return res.status(400).json({ error: `Invalid model. Supported: ${VALID_MODELS.join(', ')}` });
  }

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
  audit(req.admin, req.params.clientId, 'UPDATE', 'chatbox', req.params.clientId, { fields: Object.keys(req.body).filter(k => k !== 'api_key') });
  res.json({ message: 'Chatbox config updated.' });
});

module.exports = router;
