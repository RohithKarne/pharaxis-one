'use strict';

const { submitViaConfiguredGateway } = require('./httpGateway');

async function submit(xmlString, config = {}) {
  return submitViaConfiguredGateway('mhra', xmlString, config);
}

module.exports = { submit };
