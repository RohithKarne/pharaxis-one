'use strict';

const crypto = require('crypto');

function normalizeHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') return {};
  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && key) acc[key] = String(value);
    return acc;
  }, {});
}

async function submitViaConfiguredGateway(gateway, xmlString, config = {}) {
  const payload = String(xmlString || '');
  const gatewayId = config.gateway_id || `${gateway.toUpperCase()}-${Date.now()}`;
  if (config.mode === 'mock' || !config.endpoint) {
    return {
      status: 'submitted',
      gateway_id: gatewayId,
      raw_response: {
        gateway,
        mode: 'mock',
        message: 'Mock regulatory submission accepted. Configure endpoint and credentials for live transport.',
        payload_size: payload.length,
      },
    };
  }

  const headers = {
    'Content-Type': config.content_type || 'application/xml',
    'X-MIMS-Gateway': gateway.toUpperCase(),
    'X-MIMS-Message-Id': gatewayId,
    ...normalizeHeaders(config.headers),
  };
  if (config.bearer_token) headers.Authorization = `Bearer ${config.bearer_token}`;
  if (config.api_key_header && config.api_key) headers[config.api_key_header] = config.api_key;
  if (config.signing_secret) {
    headers['X-MIMS-Payload-Signature'] = crypto.createHmac('sha256', config.signing_secret).update(payload).digest('hex');
  }

  const started = Date.now();
  const response = await fetch(config.endpoint, {
    method: config.method || 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(Number(config.timeout_ms || 30000)),
  });
  const text = await response.text();
  return {
    status: response.ok ? 'submitted' : 'rejected',
    gateway_id: response.headers.get('x-message-id') || response.headers.get('x-correlation-id') || gatewayId,
    raw_response: {
      gateway,
      http_status: response.status,
      duration_ms: Date.now() - started,
      body: text.slice(0, 4000),
    },
  };
}

module.exports = { submitViaConfiguredGateway };
