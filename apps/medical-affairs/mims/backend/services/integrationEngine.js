'use strict';

const pool = require('../database/db');
const https = require('https');
const http = require('http');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseEventTriggers(eventTriggers) {
  if (Array.isArray(eventTriggers)) return eventTriggers;
  if (!eventTriggers) return [];
  if (typeof eventTriggers === 'string') {
    try {
      const parsed = JSON.parse(eventTriggers);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
}

function doPost(endpointUrl, apiKey, body) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(endpointUrl);
    } catch (err) {
      reject(err);
      return;
    }

    const bodyString = JSON.stringify(body);
    const client = endpointUrl.startsWith('https') ? https : http;

    const req = client.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyString),
          'x-api-key': apiKey || '',
        },
      },
      res => {
        let responseBody = '';
        res.on('data', chunk => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
            return;
          }
          reject(new Error(`Webhook failed with status ${res.statusCode}: ${responseBody}`));
        });
      }
    );

    req.on('error', reject);
    req.write(bodyString);
    req.end();
  });
}

async function sendWithRetry(endpointUrl, apiKey, eventType, payload, orgId, integrationId) {
  const body = {
    event: eventType,
    org_id: orgId,
    data: payload,
    timestamp: new Date().toISOString(),
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await doPost(endpointUrl, apiKey, body);
      await pool.query(
        'UPDATE org_integrations SET last_sync_at = NOW() WHERE id = ?',
        [integrationId]
      );
      return true;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      console.error(
        `Integration webhook failed after ${MAX_ATTEMPTS} attempts for org ${orgId}, integration ${integrationId}:`,
        err.message
      );
      return false;
    }
  }

  return false;
}

async function fireIntegrationEvent(orgId, eventType, payload) {
  const [rows] = await pool.query(
    `SELECT id, endpoint_url, api_key, event_triggers
     FROM org_integrations
     WHERE org_id = ? AND enabled = 1`,
    [orgId]
  );

  const jobs = [];

  for (const row of rows) {
    const triggers = parseEventTriggers(row.event_triggers);
    if (!triggers.includes(eventType)) continue;

    jobs.push(
      sendWithRetry(
        row.endpoint_url,
        row.api_key,
        eventType,
        payload,
        orgId,
        row.id
      )
    );
  }

  return Promise.allSettled(jobs);
}

module.exports = { fireIntegrationEvent };
