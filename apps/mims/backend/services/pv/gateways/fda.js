'use strict';

const { submitViaConfiguredGateway } = require('./httpGateway');

async function submit(xmlString, config = {}) {
  return submitViaConfiguredGateway('fda', xmlString, {
    content_type: 'application/xml',
    ...config,
    headers: {
      'X-AS2-From': config.as2_from || '',
      'X-AS2-To': config.as2_to || '',
      ...(config.headers || {}),
    },
  });
}

module.exports = { submit };
