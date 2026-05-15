'use strict';

const { submitViaConfiguredGateway } = require('./httpGateway');

async function submit(xmlString, config = {}) {
  return submitViaConfiguredGateway('pmda', xmlString, config);
}

module.exports = { submit };
