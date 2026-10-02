'use strict';

// MIPM-97: every call to an outside system (Veeva Vault, CRM, MIR, single sign-on)
// comes through here. Without a limit, a server that accepts the connection and
// stalls held the caller for the platform default — minutes. 30 s unless the
// caller passes its own signal.
const DEFAULT_TIMEOUT_MS = 30000;

async function httpFetch(url, options = {}) {
  const opts = options.signal ? options : { ...options, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) };
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(url, opts);
  }
  const { default: fetch } = await import('node-fetch');
  return fetch(url, opts);
}

module.exports = { httpFetch, DEFAULT_TIMEOUT_MS };
