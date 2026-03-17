/**
 * Portal Chatbox — /api/portal/chatbox
 * AI-powered chatbox. Uses client's configured AI provider + system prompt.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');

function isFeatureEnabled(clientId, featureKey) {
  const row = db.prepare('SELECT is_enabled FROM cp_features WHERE client_id = ? AND feature_key = ?').get(clientId, featureKey);
  return row ? row.is_enabled === 1 : false;
}

// POST /api/portal/chatbox/:clientCode
router.post('/:clientCode', async (req, res) => {
  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(req.params.clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  if (!isFeatureEnabled(client.id, 'chatbox')) {
    return res.status(403).json({ error: 'Chatbox is not enabled for this portal.' });
  }

  const config = db.prepare('SELECT * FROM cp_chatbox_config WHERE client_id = ? AND is_active = 1').get(client.id);
  if (!config || !config.api_key) return res.status(503).json({ error: 'Chatbox is not configured for this portal.' });

  let { messages } = req.body; // [{ role: 'user'|'assistant', content: string }]
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
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

  // Build context from client content for better AI answers
  const therapeuticAreas = db.prepare('SELECT name, short_desc FROM cp_therapeutic_areas WHERE client_id=? AND is_active=1').all(client.id);
  const drugs = db.prepare('SELECT brand_name, generic_name, indication FROM cp_drugs WHERE client_id=? AND is_active=1').all(client.id);

  const contextLines = [];
  if (therapeuticAreas.length) contextLines.push(`Therapeutic Areas: ${therapeuticAreas.map(a => a.name).join(', ')}`);
  if (drugs.length) contextLines.push(`Products: ${drugs.map(d => d.brand_name).join(', ')}`);

  const safeSystemPrompt = (config.system_prompt || 'You are a helpful medical information assistant for a pharmaceutical company.').slice(0, 2000);

  const systemPrompt = [
    safeSystemPrompt,
    contextLines.length ? `\nContext about this portal:\n${contextLines.join('\n')}` : '',
    '\nIMPORTANT: You provide general information only. Always advise users to consult their healthcare provider for medical decisions. Do not provide specific medical diagnoses or treatment recommendations.',
  ].join('');

  try {
    if (config.ai_provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: config.api_key });
      const response = await anthropic.messages.create({
        model: config.model || 'claude-haiku-4-5-20251001',
        max_tokens: config.max_tokens || 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      return res.json({ reply: response.content[0]?.text || '' });
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
      return res.json({ reply: data.choices?.[0]?.message?.content || '' });
    }

    res.status(400).json({ error: 'Unsupported AI provider.' });
  } catch (err) {
    console.error('Chatbox AI error:', err);
    res.status(502).json({ error: 'AI service error. Please try again.' });
  }
});

module.exports = router;
