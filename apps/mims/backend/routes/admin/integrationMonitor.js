'use strict';

const express = require('express');
const { authenticate, requireRole, requireModule } = require('../../middleware/auth');
const pool = require('../../database/db');
const { MAX_ATTEMPTS } = require('../../services/api-platform/webhookDeliveryWorker');

const router = express.Router();
const WEBHOOK_PAGE_SIZE = 25;

const INTEGRATION_NAMES = {
  crm: 'CRM Sync',
  // Veeva Vault was removed from the product on 2026-09-09.
  emir: 'EMIR Integration',
  email: 'Inbound Email Sync',
  mir: 'MIR Integration'
};

router.get('/integrations/health', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      `SELECT integration_type, enabled, endpoint_url, last_sync_at, config
       FROM org_integrations
       WHERE org_id = ?`,
      [orgId]
    );

    const integrations = Object.keys(INTEGRATION_NAMES).map(key => {
      const dbRow = rows.find(r => r.integration_type === key);
      
      // Only what is stored: switched on, off, or not set up. "healthy" was
      // claimed for anything switched on, with no check behind it (M-83).
      let status = 'not_configured';
      if (dbRow && dbRow.enabled) {
        status = 'enabled';
      } else if (dbRow && !dbRow.enabled) {
        status = 'disabled';
      }

      let endpointUrl = null;
      if (dbRow) {
        if (dbRow.endpoint_url) endpointUrl = dbRow.endpoint_url;
        else if (dbRow.config) {
          const conf = typeof dbRow.config === 'string' ? JSON.parse(dbRow.config) : dbRow.config;
          endpointUrl = conf.domain || conf.endpoint_url || null;
        }
      }

      return {
        key,
        name: INTEGRATION_NAMES[key],
        status,
        lastSyncAt: dbRow ? dbRow.last_sync_at : null,
        endpointUrl,
        // Sync counts, errors and latency are not measured anywhere; they were
        // random numbers (M-83). Not sent until something records them.
      };
    });

    // Bridge row 6: systems that send cases in (CP Portal and others), from what their
    // calls actually did in the last 24 hours — not a stored "enabled" flag.
    const [connections] = await pool.query(
      `SELECT c.id, c.name, c.status,
              (SELECT MAX(l.created_at) FROM api_call_log l WHERE l.client_id = c.id) AS last_call_at,
              (SELECT COUNT(*) FROM api_call_log l WHERE l.client_id = c.id AND l.created_at > NOW() - INTERVAL 1 DAY) AS calls_24h,
              (SELECT COUNT(*) FROM api_call_log l WHERE l.client_id = c.id AND l.created_at > NOW() - INTERVAL 1 DAY AND l.status_code >= 400) AS failures_24h,
              (SELECT CONCAT(l.status_code, ' ', l.method, ' ', l.path) FROM api_call_log l WHERE l.client_id = c.id AND l.status_code >= 400 ORDER BY l.id DESC LIMIT 1) AS last_failure,
              (SELECT MAX(l.created_at) FROM api_call_log l WHERE l.client_id = c.id AND l.status_code >= 400) AS last_failure_at
         FROM api_clients c WHERE c.org_id = ? ORDER BY c.name`, [orgId]);

    res.json({ integrations, connections });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch integration health' });
  }
});

router.get('/integrations/webhook-deliveries', authenticate, requireRole('admin', 'platform_admin'),
  requireModule('admin_console'), async (req, res) => {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Select an organisation first.' });

    const before = req.query.before;
    if (before !== undefined && (typeof before !== 'string' || !/^[1-9]\d*$/.test(before)
        || !Number.isSafeInteger(Number(before)))) {
      return res.status(400).json({ error: 'Invalid delivery history cursor.' });
    }

    try {
      const hasCursor = before !== undefined;
      const [rows] = await pool.query(
        `SELECT d.id, c.name AS clientName, d.event, d.attempt_count AS attemptCount,
                d.response_status AS responseStatus, d.next_retry_at AS nextRetryAt,
                CASE
                  WHEN d.delivered_at IS NOT NULL THEN 'delivered'
                  WHEN d.attempt_count >= ? THEN 'exhausted'
                  WHEN s.status = 'paused' THEN 'paused'
                  WHEN s.status = 'revoked' THEN 'revoked'
                  WHEN d.attempt_count = 0 THEN 'queued'
                  ELSE 'retrying'
                END AS status
           FROM webhook_deliveries d
           JOIN webhook_subscriptions s ON s.id = d.subscription_id
           JOIN api_clients c ON c.id = s.client_id
          WHERE c.org_id = ? ${hasCursor ? 'AND d.id < ?' : ''}
          ORDER BY d.id DESC LIMIT ${WEBHOOK_PAGE_SIZE + 1}`,
        hasCursor ? [MAX_ATTEMPTS, orgId, Number(before)] : [MAX_ATTEMPTS, orgId]
      );
      const deliveries = rows.slice(0, WEBHOOK_PAGE_SIZE).map(row => ({
        ...row,
        nextRetryAt: row.status === 'retrying' ? row.nextRetryAt : null,
      }));
      const nextCursor = rows.length > WEBHOOK_PAGE_SIZE ? deliveries.at(-1).id : null;
      res.set('Cache-Control', 'no-store');
      res.json({ deliveries, nextCursor });
    } catch (error) {
      req.log?.error({ err: error }, 'Failed to load webhook delivery history');
      res.status(500).json({ error: 'Failed to load webhook delivery history.' });
    }
  });

router.post('/integrations/:key/test', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });
    
    // There is no live check behind this: it answered "healthy" with a random
    // latency for every integration (M-83). Say so instead.
    res.status(501).json({
      ok: false,
      error: 'No live connection test exists for this integration yet.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Test connection failed' });
  }
});

module.exports = router;
