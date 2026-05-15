'use strict';

const pool = require('../../database/db');

async function getGatewayConfig(orgId, receiverId) {
  const keys = [`pv_gateway_${String(receiverId || '').toLowerCase()}`, 'pv_gateway_default'];
  for (const key of keys) {
    try {
      const [[row]] = await pool.execute('SELECT setting_value FROM system_config WHERE org_id = ? AND setting_key = ? LIMIT 1', [orgId, key]);
      if (row?.setting_value) return JSON.parse(row.setting_value);
    } catch (_) {}
  }
  return { mode: 'mock', endpoint: null };
}

module.exports = { getGatewayConfig };
