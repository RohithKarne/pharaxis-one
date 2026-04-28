'use strict';

async function httpFetch(...args) {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(...args);
  }
  const { default: fetch } = await import('node-fetch');
  return fetch(...args);
}

module.exports = { httpFetch };
