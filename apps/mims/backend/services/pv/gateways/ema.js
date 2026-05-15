'use strict';

const { submitViaConfiguredGateway } = require('./httpGateway');

async function submit(xmlString, config = {}) {
  return submitViaConfiguredGateway('ema', xmlString, config);
}

module.exports = { submit };
