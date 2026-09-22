/**
 * Portal Chatbox — /api/portal/chatbox
 * AI-powered chatbox. Uses client's configured AI provider + system prompt.
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { decryptSecret } = require('../../utils/secretCrypto');
const { retrieveContext, formatContext } = require('../../utils/retrieve');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const log = require('../../utils/logger');
const { resolveConversation, recordMessage, bestEffort } = require('../../utils/chatRecords');
const { chatStubEnabled, stubReply } = require('../../utils/chatStub');
const { systemAudit } = require('../../utils/audit');

async function isFeatureEnabled(clientId, featureKey) {
  const [[row]] = await pool.execute('SELECT is_enabled FROM cp_features WHERE client_id = ? AND feature_key = ?', [clientId, featureKey]);
  return row ? row.is_enabled === 1 : false;
}

// CPPM-16: the client's gate can switch a feature off for a user type. The
// browser applied this only for signed-in users; now the server applies it too.
async function isAllowedForUserType(clientId, featureKey, userType) {
  const [[gate]] = await pool.execute('SELECT is_enabled FROM cp_gate_config WHERE client_id = ?', [clientId]);
  if (!gate?.is_enabled) return true;
  const [[row]] = await pool.execute(
    'SELECT is_allowed FROM cp_feature_access WHERE client_id = ? AND feature_key = ? AND type_key = ?',
    [clientId, featureKey, userType]);
  return row ? !!row.is_allowed : true;
}

// POST /api/portal/chatbox/:clientCode
// CPPM-16: sign-in required, so the client knows who it is talking to and can
// follow up — and so its "who may use chat" rule actually applies.
router.post('/:clientCode', authenticatePortal, requirePortalAuth, async (req, res) => {
  // CPPM-17: set once the conversation is recorded, so every exit can record the reply.
  let answer = (status, body) => res.status(status).json(body);
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    if (!await isFeatureEnabled(client.id, 'chatbox')) {
      return res.status(403).json({ error: 'Chatbox is not enabled for this portal.' });
    }
    const userType = req.portalUser.user_type || 'other';
    if (!await isAllowedForUserType(client.id, 'chatbox', userType)) {
      return res.status(403).json({ error: 'The chat assistant is not available for your account type.' });
    }

    const [[config]] = await pool.execute('SELECT * FROM cp_chatbox_config WHERE client_id = ? AND is_active = 1', [client.id]);
    const stub = chatStubEnabled();
    if (!config || (!config.api_key && !stub)) return res.status(503).json({ error: 'Chatbox is not configured for this portal.' });
    if (config.api_key) config.api_key = decryptSecret(config.api_key);

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
    // CPPM-16: only ground answers in content this person is allowed to see.
    const retrieved = await retrieveContext(client.id, lastUserMessage, 6, userType);
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

    // CPPM-17: record the question before asking the AI, so it is kept even if the
    // AI fails. Best-effort: a recording failure is logged, never shown to the person.
    const recCtx = { client_id: client.id, route: 'POST /:clientCode' };
    const conversationId = await bestEffort('conversation', () => resolveConversation({
      conversationId: req.body.conversation_id, clientId: client.id, userId: req.portalUser.userId, userType,
      provider: stub ? 'stub' : config.ai_provider, model: stub ? null : config.model,
    }), recCtx);
    if (conversationId) {
      await bestEffort('user_message', () => recordMessage({ conversationId, clientId: client.id, role: 'user', content: lastUserMessage }), recCtx);
    }
    const startedAt = Date.now();
    answer = async (status, body, outcome = 'error') => {
      if (conversationId) {
        await bestEffort('assistant_message', () => recordMessage({
          conversationId, clientId: client.id, role: 'assistant', content: body.reply ?? body.error,
          sources: body.sources?.length ? body.sources : null, outcome, latencyMs: Date.now() - startedAt,
        }), recCtx);
      }
      return res.status(status).json({ ...body, conversation_id: conversationId });
    };

    if (stub) return answer(200, { reply: stubReply(lastUserMessage, sources), sources }, 'answered');

    if (config.ai_provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: config.api_key });
      const model = config.model || 'claude-opus-5';
      // Sonnet 5 / Opus 5 / Fable 5.1 (and 4.6+) think adaptively and accept an
      // effort level. Thinking is paid from max_tokens, so give room, and keep
      // effort low: short answers grounded in supplied content do not need depth.
      // Haiku 4.5 takes neither.
      const isCurrentGen = /^claude-(fable-5|opus-5|sonnet-5|opus-4-[678]|sonnet-4-6)/.test(model);
      const params = {
        model,
        max_tokens: isCurrentGen ? 16000 : (config.max_tokens || 1024),
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        ...(isCurrentGen ? { output_config: { effort: 'low' } } : {}),
      };
      // Opus 5 and Fable 5.1 can decline on safety grounds; server-side fallbacks
      // re-run a declined request on a suitable model inside the same call.
      const useFallbacks = model === 'claude-opus-5' || model === 'claude-fable-5-1';
      let response;
      try {
        response = useFallbacks
          ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : await anthropic.messages.create(params);
      } catch (err) {
        // The SDK throws on a provider error (bad key, no credit, outage); answer as the OpenAI path does.
        if (!(err instanceof Anthropic.APIError)) throw err;
        log.error('portal.chatbox.provider_error', { provider: 'anthropic', model, status: err.status, message: err.message });
        return answer(502, { error: 'The assistant is temporarily unavailable. Please try again later.' }, 'provider_error');
      }

      if (response.stop_reason === 'refusal') {
        log.warn('portal.chatbox.refusal', { model, category: response.stop_details?.category || null });
        return answer(200, { reply: "I can't help with that here. Please submit a medical inquiry and our medical team will respond.", sources: [] }, 'refused');
      }
      // With thinking on, the first content block is a thinking block, not the
      // answer — read the text blocks, never content[0].
      const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!reply) log.warn('portal.chatbox.empty_reply', { provider: 'anthropic', model, stop_reason: response.stop_reason });
      return answer(200, { reply: reply || 'Sorry, I could not produce an answer. Please try rephrasing your question.', sources }, reply ? 'answered' : 'empty');
    }

    if (config.ai_provider === 'openai') {
      const model = config.model || 'gpt-5.6-luna';
      // GPT-5.x / GPT-6 are reasoning models: they take max_completion_tokens (not
      // max_tokens), and their thinking is paid from that same budget. Low effort keeps
      // short, grounded answers fast and stops the thinking from consuming the reply.
      const isReasoningModel = /^(gpt-5|gpt-6|o\d)/.test(model);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: config.max_tokens || 2048,
          ...(isReasoningModel ? { reasoning_effort: 'low' } : {}),
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      });
      const data = await response.json();
      // Surface provider errors (bad key, no credit, unknown model) instead of an empty reply.
      if (!response.ok) {
        log.error('portal.chatbox.provider_error', { provider: 'openai', model, status: response.status, message: data?.error?.message });
        return answer(502, { error: 'The assistant is temporarily unavailable. Please try again later.' }, 'provider_error');
      }
      const reply = data.choices?.[0]?.message?.content || '';
      if (!reply) log.warn('portal.chatbox.empty_reply', { provider: 'openai', model, finish_reason: data.choices?.[0]?.finish_reason });
      return answer(200, { reply: reply || 'Sorry, I could not produce an answer. Please try rephrasing your question.', sources }, reply ? 'answered' : 'empty');
    }

    return answer(400, { error: 'Unsupported AI provider.' }, 'error');
  } catch (err) {
    log.error('portal.chatbox.error', { err, route: 'POST /:clientCode', path: req.path, request_id: req.requestId || null });
    return answer(502, { error: 'AI service error. Please try again.' }, 'error');
  }
});

// POST /api/portal/chatbox/:clientCode/report-unwell
// CPPM-18: the chat asks the same screening question as every portal form. A Yes
// raises a Safety Queue task linked to the conversation. Unlike the chat record,
// this is NOT best-effort: if the task cannot be raised the person is told, so a
// report is never silently lost.
router.post('/:clientCode/report-unwell', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    if (!await isFeatureEnabled(client.id, 'chatbox')) {
      return res.status(403).json({ error: 'Chatbox is not enabled for this portal.' });
    }
    const userId = req.portalUser.userId;
    const userType = req.portalUser.user_type || 'other';
    const detail = String(req.body.detail || '').trim().slice(0, 5000) || null;

    // The report belongs to a conversation — start one if the person has not asked anything yet.
    let conversationId = await resolveConversation({
      conversationId: req.body.conversation_id, clientId: client.id, userId, userType, provider: null, model: null,
    });
    const [[existing]] = await pool.execute(
      'SELECT id, status FROM cp_ae_review_tasks WHERE chat_conversation_id = ? AND client_id = ?', [conversationId, client.id]);

    let taskId;
    if (existing && existing.status === 'open') {
      // Same conversation, still under review: add to it rather than raise a second task.
      if (detail) {
        await pool.execute(
          "UPDATE cp_ae_review_tasks SET reported_detail = CONCAT_WS('\\n---\\n', reported_detail, ?) WHERE id = ?", [detail, existing.id]);
      }
      taskId = existing.id;
    } else {
      // A closed task already decided on this conversation; a new report is new
      // information and gets its own conversation and task, never a silent append.
      if (existing) {
        conversationId = await resolveConversation({ conversationId: null, clientId: client.id, userId, userType, provider: null, model: null });
      }
      const [r] = await pool.execute(
        'INSERT INTO cp_ae_review_tasks (client_id, chat_conversation_id, reported_detail) VALUES (?, ?, ?)',
        [client.id, conversationId, detail]);
      taskId = r.insertId;
      systemAudit('portal', client.id, 'AE_REVIEW_TASK_CREATED', 'chat_conversation', conversationId, { task_id: taskId });
    }

    await bestEffort('safety_flag_message', () => recordMessage({
      conversationId, clientId: client.id, role: 'system', outcome: 'safety_flag',
      content: `Reported that someone became unwell.${detail ? ` What happened: ${detail}` : ''}`,
    }), { client_id: client.id, route: 'POST /:clientCode/report-unwell' });

    res.status(201).json({
      message: 'Thank you. Our safety team will review this.',
      conversation_id: conversationId,
    });
  } catch (err) {
    log.error('portal.chatbox.report_unwell_failed', { err, route: 'POST /:clientCode/report-unwell', request_id: req.requestId || null });
    res.status(500).json({ error: 'We could not send your report. Please use the side effect form so it reaches our safety team.' });
  }
});

module.exports = router;
