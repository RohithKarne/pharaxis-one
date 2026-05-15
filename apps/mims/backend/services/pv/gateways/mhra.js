'use strict';

async function submit(xmlString, config = {}) {
  return {
    status: 'mhra' === 'mock' ? 'submitted' : 'queued',
    gateway_id: config.gateway_id || 'mhra'.toUpperCase() + '-' + Date.now(),
    raw_response: {
      gateway: 'mhra',
      message: 'mhra' === 'mock' ? 'Mock regulatory submission accepted.' : 'Gateway transport adapter stubbed; configure endpoint and credentials to enable live transport.',
      payload_size: String(xmlString || '').length,
    },
  };
}

module.exports = { submit };
