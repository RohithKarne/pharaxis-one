'use strict';

const pool = require('../database/db');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function getVaultSession(orgId) {
  const [rows] = await pool.query(
    'SELECT vault_domain, vault_username, vault_password, vault_api_version FROM org_vault_config WHERE org_id = ? AND enabled = 1 LIMIT 1',
    [orgId]
  );

  if (!rows || rows.length === 0) {
    throw new Error('Vault not configured for org ' + orgId);
  }

  const config = rows[0];

  const authResponse = await fetch(
    config.vault_domain + '/api/' + config.vault_api_version + '/auth',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        'username=' +
        encodeURIComponent(config.vault_username) +
        '&password=' +
        encodeURIComponent(config.vault_password),
    }
  );

  const response = await authResponse.json();

  if (response.responseStatus !== 'SUCCESS') {
    throw new Error('Vault auth failed: ' + response.responseMessage);
  }

  return {
    sessionId: response.sessionId,
    vaultDomain: config.vault_domain,
    apiVersion: config.vault_api_version,
  };
}

async function runVQL(session, vql) {
  const queryResponse = await fetch(
    session.vaultDomain + '/api/' + session.apiVersion + '/query',
    {
      method: 'POST',
      headers: {
        Authorization: session.sessionId,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'q=' + encodeURIComponent(vql),
    }
  );

  const response = await queryResponse.json();
  return response.data;
}

module.exports = { getVaultSession, runVQL };
