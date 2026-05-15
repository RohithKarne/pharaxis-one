'use strict';

async function submit(xmlString, config = {}) {
  return {
    status: 'ema' === 'mock' ? 'submitted' : 'queued',
    gateway_id: config.gateway_id || 'ema'.toUpperCase() + '-' + Date.now(),
    raw_response: {
      gateway: 'ema',
      message: 'ema' === 'mock' ? 'Mock regulatory submission accepted.' : 'Gateway transport adapter stubbed; configure endpoint and credentials to enable live transport.',
      payload_size: String(xmlString || '').length,
    },
  };
}

module.exports = { submit };
