'use strict';

const pool = require('../../database/db');
const { logger } = require('../logger');

// Gateway settings are kept in system_config, which has one set for the whole
// installation (no organisation column). The lookup used to name columns the
// table does not have, failed every time and fell back to mock without a word.
async function getGatewayConfig(orgId, receiverId) {
  const keys = [`pv_gateway_${String(receiverId || '').toLowerCase()}`, 'pv_gateway_default'];
  for (const key of keys) {
    try {
      const [[row]] = await pool.execute('SELECT config_value FROM system_config WHERE config_key = ? LIMIT 1', [key]);
      if (row?.config_value) return JSON.parse(row.config_value);
    } catch (err) {
      logger.warn({ err: err.message, key, org_id: orgId }, 'pv gateway settings could not be read; using mock');
    }
  }
  return { mode: 'mock', endpoint: null };
}

module.exports = { getGatewayConfig };
