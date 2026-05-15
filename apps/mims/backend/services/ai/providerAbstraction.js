'use strict';

const crypto = require('crypto');
const pool = require('../../database/db');
const { encryptSecret } = require('../ssoService');

function deterministicEmbedding(text, dims = 64) {
  const vector = new Array(dims).fill(0);
  const tokens = String(text || '').toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    const hash = crypto.createHash('sha256').update(token).digest();
    const idx = hash[0] % dims;
    vector[idx] += (hash[1] / 255) + 0.1;
  }
  const mag = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map(v => Number((v / mag).toFixed(6)));
}

function tokenCount(text) {
  return Math.ceil(String(text || '').length / 4);
}

function localProvider(config = {}) {
  return {
    key: config.provider_key || 'on_prem',
    model: config.model_name || 'deterministic-local',
    async chat(messages = [], opts = {}) {
      const text = messages.map(m => m.content || '').join('\n');
      return {
        content: opts.purpose === 'summary'
          ? `AI draft summary: ${text.slice(0, 700)}`
          : `AI suggestion generated from available MIMS context. ${text.slice(0, 500)}`,
        model: config.model_name || 'deterministic-local',
        tokens_in: tokenCount(text),
        tokens_out: tokenCount(text.slice(0, 500)),
      };
    },
    async embed(text) { return deterministicEmbedding(text, 1536); },
    countTokens: tokenCount,
  };
}

async function callJson(endpoint, headers, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`AI provider request failed: ${res.status}`);
  return res.json();
}

function externalProvider(config = {}) {
  const fallback = localProvider(config);
  return {
    key: config.provider_key,
    model: config.model_name || 'gpt-4o-mini',
    async chat(messages = [], opts = {}) {
      if (config.provider_key === 'openai' || config.provider_key === 'azure_openai') {
        const endpoint = config.api_endpoint || 'https://api.openai.com/v1/chat/completions';
        const data = await callJson(endpoint, { Authorization: `Bearer ${config.api_key_plain || ''}` }, {
          model: opts.model || config.model_name || 'gpt-4o-mini',
          messages,
          temperature: opts.temperature ?? 0.2,
        });
        return {
          content: data.choices?.[0]?.message?.content || '',
          model: data.model || config.model_name,
          tokens_in: data.usage?.prompt_tokens || fallback.countTokens(JSON.stringify(messages)),
          tokens_out: data.usage?.completion_tokens || 0,
        };
      }
      if (config.provider_key === 'anthropic') {
        const endpoint = config.api_endpoint || 'https://api.anthropic.com/v1/messages';
        const data = await callJson(endpoint, { 'x-api-key': config.api_key_plain || '', 'anthropic-version': '2023-06-01' }, {
          model: opts.model || config.model_name || 'claude-3-5-sonnet-latest',
          max_tokens: opts.max_tokens || 1200,
          messages,
        });
        return { content: data.content?.[0]?.text || '', model: data.model || config.model_name, tokens_in: data.usage?.input_tokens || 0, tokens_out: data.usage?.output_tokens || 0 };
      }
      if (config.provider_key === 'on_prem' && config.api_endpoint) {
        const data = await callJson(config.api_endpoint, {}, { model: config.model_name || 'llama3', messages });
        return { content: data.message?.content || data.response || '', model: config.model_name || 'on_prem', tokens_in: fallback.countTokens(JSON.stringify(messages)), tokens_out: fallback.countTokens(data.response || '') };
      }
      return fallback.chat(messages, opts);
    },
    async embed(text) { return fallback.embed(text); },
    countTokens: fallback.countTokens,
  };
}

async function getProvider(orgId) {
  try {
    const [[config]] = await pool.execute(
      `SELECT * FROM ai_provider_configs WHERE org_id = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1`,
      [orgId || 0]
    );
    if (!config) return localProvider({ provider_key: 'on_prem' });
    if (config.allow_phi_external !== 1 && config.provider_key !== 'on_prem') {
      return localProvider({ provider_key: 'on_prem', model_name: 'phi-safe-local-fallback' });
    }
    return externalProvider(config);
  } catch (_) {
    return localProvider({ provider_key: 'on_prem' });
  }
}

async function saveProviderConfig(orgId, body = {}) {
  const encrypted = body.api_key ? encryptSecret(body.api_key) : null;
  const [existing] = await pool.execute('SELECT id FROM ai_provider_configs WHERE org_id = ? AND provider_key = ? LIMIT 1', [orgId, body.provider_key]);
  if (existing.length) {
    await pool.execute(
      `UPDATE ai_provider_configs
          SET api_endpoint = ?, api_key_encrypted = COALESCE(?, api_key_encrypted), model_name = ?, enabled = ?, daily_token_budget = ?, allow_phi_external = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [body.api_endpoint || null, encrypted, body.model_name || null, body.enabled ? 1 : 0, Number(body.daily_token_budget || 100000), body.allow_phi_external ? 1 : 0, existing[0].id]
    );
    return existing[0].id;
  }
  const [result] = await pool.execute(
    `INSERT INTO ai_provider_configs (org_id, provider_key, api_endpoint, api_key_encrypted, model_name, enabled, daily_token_budget, allow_phi_external)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, body.provider_key || 'openai', body.api_endpoint || null, encrypted, body.model_name || 'gpt-4o-mini', body.enabled ? 1 : 0, Number(body.daily_token_budget || 100000), body.allow_phi_external ? 1 : 0]
  );
  return result.insertId;
}

module.exports = { getProvider, saveProviderConfig, deterministicEmbedding, tokenCount };
