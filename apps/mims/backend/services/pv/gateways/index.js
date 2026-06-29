'use strict';

// WP8 — ICSR submission gateway registry/resolver.
//
// Each adapter in this directory exports an async `submit(xml, config)` that returns
// `{ status, gateway_id, raw_response }`. The live HA transports (fda/ema/pmda/mhra)
// delegate to the shared httpGateway and stay in *mock mode* until a real endpoint +
// credentials are configured per-org (see gatewayConfig.js) — that is the CEO-approved
// "option (a)": the abstraction is live now; the actual regulatory transport activates
// when gateway credentials are provided, with no code change.
//
// This module replaces an inline `require(...)` + whitelist ternary that hardcoded a
// 'mock' fallback at the call site.

const REGISTRY = {
  fda:  () => require('./fda'),
  ema:  () => require('./ema'),
  pmda: () => require('./pmda'),
  mhra: () => require('./mhra'),
  mock: () => require('./mock'),
};

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

// Resolve a gateway adapter by key. Returns { key, adapter }. Any key that is not a known
// live transport falls back to the mock adapter, so a submission can never hard-crash on
// an unconfigured/unknown gateway.
function resolveGateway(name) {
  const requested = normalizeKey(name);
  const key = REGISTRY[requested] ? requested : 'mock';
  const adapter = REGISTRY[key]();
  if (!adapter || typeof adapter.submit !== 'function') {
    throw new Error(`ICSR gateway "${key}" does not implement submit(xml, config).`);
  }
  return { key, adapter };
}

// The set of registered gateway keys (for config UIs / validation).
function listGateways() {
  return Object.keys(REGISTRY);
}

module.exports = { resolveGateway, listGateways };
