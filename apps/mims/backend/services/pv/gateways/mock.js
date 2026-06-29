'use strict';

// WP8 — Mock ICSR transport. Used when no live gateway is selected/configured. Accepts the
// submission and returns a synthetic gateway id so the rest of the submission flow (audit
// trail, ACK polling UI) works end-to-end without contacting a real health authority.
// Replaces a prior stub that compared the literal 'mock' === 'mock' (always-true dead code).

async function submit(xmlString, config = {}) {
  const gatewayId = config.gateway_id || `MOCK-${Date.now()}`;
  return {
    status: 'submitted',
    gateway_id: gatewayId,
    raw_response: {
      gateway: 'mock',
      mode: 'mock',
      message: 'Mock regulatory submission accepted. Configure a gateway endpoint and credentials to enable live transport.',
      payload_size: String(xmlString || '').length,
    },
  };
}

module.exports = { submit };
