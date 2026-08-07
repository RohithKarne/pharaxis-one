/**
 * Portal Chatbox — /api/portal/chatbox
 * AI-powered chatbox. Uses client's configured AI provider + system prompt.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { decryptSecret } = require('../../utils/secretCrypto');
const { retrieveContext, formatContext } = require('../../utils/retrieve');
const log = require('../../utils/logger');

async function isFeatureEnabled(clientId, featureKey) {
  const [[row]] = await pool.execute('SELECT is_enabled FROM cp_features WHERE client_id = ? AND feature_key = ?', [clientId, featureKey]);
  return row ? row.is_enabled === 1 : false;
}

// POST /api/portal/chatbox/:clientCode
router.post('/:clientCode', async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    if (!await isFeatureEnabled(client.id, 'chatbox')) {
      return res.status(403).json({ error: 'Chatbox is not enabled for this portal.' });
    }

    const [[config]] = await pool.execute('SELECT * FROM cp_chatbox_config WHERE client_id = ? AND is_active = 1', [client.id]);
    if (!config || !config.api_key) return res.status(503).json({ error: 'Chatbox is not configured for this portal.' });
    config.api_key = decryptSecret(config.api_key);

    // Accept either {messages} array OR {message + history} format from frontend
    let messages;
    if (Array.isArray(req.body.messages) && req.body.messages.length > 0) {
      // Normalized format: [{role, content}]
      messages = req.body.messages;
    } else if (req.body.message && typeof req.body.message === 'string') {
      // Legacy frontend format: {message, history: [{role, text}]}
      const history = Array.isArray(req.body.history) ? req.body.history : [];
      // Convert history {role, text} → {role, content}
      const historyNormalized = history.map(m => ({ role: m.role, content: m.text || m.content || '' }));
      messages = [...historyNormalized, { role: 'user', content: req.body.message }];
    } else {
      return res.status(400).json({ error: 'messages array is required.' });
    }

    // SEC-05: Sanitize incoming messages to prevent prompt injection and context overflow
    messages = messages
      .filter(m => m != null)                                           // strip null/undefined
      .filter(m => m.role === 'user' || m.role === 'assistant')         // only valid roles
      .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) })) // cap content length
      .slice(-20);                                                       // cap to last 20 messages

    if (messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required.' });
    }

    // RAG: retrieve relevant approved content for the user's latest question and
    // ground the model in it. Retrieval is keyword-based (v1); the interface lets
    // us swap in semantic search later without changing this handler.
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const retrieved = await retrieveContext(client.id, lastUserMessage, 6);
    const contextBlock = formatContext(retrieved);

    const safeSystemPrompt = (config.system_prompt || 'You are a helpful medical information assistant for a pharmaceutical company.').slice(0, 2000);

    const systemPrompt = [
      safeSystemPrompt,
      contextBlock
        ? `\n\nUse ONLY the following approved portal content to answer. Cite sources by their [number]. If the answer is not in this content, say you don't have that information and suggest contacting the medical team.\n\n--- APPROVED CONTENT ---\n${contextBlock}\n--- END CONTENT ---`
        : `\n\nYou have no matching approved content for this question. Do not invent specifics — say you don't have that information and suggest contacting the medical team.`,
      '\n\nIMPORTANT: You provide general information only, grounded in the approved content above. Always advise users to consult their healthcare provider for medical decisions. Never provide diagnoses or treatment recommendations beyond the approved content.',
    ].join('');

    // Sources surfaced to the client for citation display.
    const sources = retrieved.map((s, i) => ({ n: i + 1, source: s.source, title: s.title }));

    if (config.ai_provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: config.api_key });
      const response = await anthropic.messages.create({
        model: config.model || 'claude-haiku-4-5-20251001',
        max_tokens: config.max_tokens || 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      return res.json({ reply: response.content[0]?.text || '', sources });
    }

    if (config.ai_provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-mini',
          max_tokens: config.max_tokens || 1024,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      });
      const data = await response.json();
      return res.json({ reply: data.choices?.[0]?.message?.content || '', sources });
    }

    res.status(400).json({ error: 'Unsupported AI provider.' });
  } catch (err) {
    log.error('portal.chatbox.error', { err, route: 'POST /:clientCode', path: req.path, request_id: req.requestId || null });
    res.status(502).json({ error: 'AI service error. Please try again.' });
  }
});

module.exports = router;
