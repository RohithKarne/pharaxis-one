/**
 * Admin Chatbox — /api/admin/chatbox
 * AI chatbox configuration per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit, changesBetween } = require('../../utils/audit');
const { encryptSecret } = require('../../utils/secretCrypto');
const log = require('../../utils/logger');

const VALID_PROVIDERS = ['anthropic', 'openai'];

router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM cp_chatbox_config WHERE client_id = ?', [req.params.clientId]);
    if (!row) return res.status(404).json({ error: 'Chatbox config not found.' });
    // Never expose the stored API key. Surface only whether one is set.
    row.has_api_key = !!row.api_key;
    delete row.api_key;
    res.json({ chatbox: row });
  } catch (err) {
    log.error('admin.chatbox.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    // MED-31: validate model field against known Anthropic / OpenAI models
    // Keep in step with the Model dropdown in admin/pages/ChatboxConfigPage.jsx (lessons L-013).
    // Older IDs stay accepted so existing configs can still be saved.
    const VALID_ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'claude-fable-5-1',
                                    'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'];
    // Keep in step with the Model dropdown in admin/pages/ChatboxConfigPage.jsx —
    // the dropdown was updated to GPT-5.6/6 and this list was not, so every save
    // of a new model was rejected. Older IDs stay accepted so existing configs
    // can still be saved; they are no longer offered on screen.
    const VALID_OPENAI_MODELS    = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra',
                                    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const VALID_MODELS           = [...VALID_ANTHROPIC_MODELS, ...VALID_OPENAI_MODELS];

    if (req.body.ai_provider && !VALID_PROVIDERS.includes(req.body.ai_provider)) {
      return res.status(400).json({ error: `Invalid ai_provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }

    if (req.body.model && !VALID_MODELS.includes(req.body.model)) {
      return res.status(400).json({ error: `Invalid model. Supported: ${VALID_MODELS.join(', ')}` });
    }

    // CPPM-75: the model must belong to the provider it will be sent to. Each list was
    // checked on its own, so "Anthropic" with an OpenAI model was saved and every chat
    // then failed at the provider. Checked against what the row will hold after the save.
    if (req.body.ai_provider !== undefined || req.body.model !== undefined) {
      const [[cur]] = await pool.execute('SELECT ai_provider, model FROM cp_chatbox_config WHERE client_id = ?', [req.params.clientId]);
      const provider = req.body.ai_provider ?? cur?.ai_provider ?? 'anthropic';
      const model = req.body.model ?? cur?.model ?? null;
      const forProvider = provider === 'openai' ? VALID_OPENAI_MODELS : VALID_ANTHROPIC_MODELS;
      if (model && !forProvider.includes(model)) {
        const name = provider === 'openai' ? 'an OpenAI' : 'an Anthropic';
        return res.status(400).json({ error: `${model} is not ${name} model. Choose ${name} model, or change the provider.` });
      }
    }

    const allowed = ['ai_provider', 'model', 'system_prompt', 'welcome_message', 'max_tokens', 'is_active'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
    }
    // api_key stored separately — never returned in GET
    if (req.body.api_key !== undefined) { updates.push('api_key = ?'); params.push(encryptSecret(req.body.api_key || null)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.clientId);
    const ROW = 'SELECT * FROM cp_chatbox_config WHERE client_id = ?';
    const [[before]] = await pool.execute(ROW, [req.params.clientId]);
    await pool.execute(`UPDATE cp_chatbox_config SET ${updates.join(', ')} WHERE client_id = ?`, params);
    const [[after]] = await pool.execute(ROW, [req.params.clientId]);
    // CPPM-43: what changed, from → to. The API key is a secret: recorded as changed,
    // never its value (it is re-encrypted on every save, so any save that sends one shows).
    await audit(req.admin, req.params.clientId, 'UPDATE', 'chatbox', req.params.clientId,
      { changes: changesBetween(before, after, [...allowed, 'api_key'], ['api_key']) });
    res.json({ message: 'Chatbox config updated.' });
  } catch (err) {
    log.error('admin.chatbox.error', { err, route: 'PATCH /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
