const express = require('express');
const router = express.Router();
const { logService } = require('../services/serviceLogger');
const { logger } = require('../services/logger');
const { emitTelemetryEvent } = require('../services/telemetryService');

function safeText(value, limit = 1000) {
  const text = String(value || '');
  return text.length > limit ? text.slice(0, limit) : text;
}

router.post('/client-error', async (req, res) => {
  try {
    const payload = req.body || {};
    const message = safeText(payload.message || 'Client runtime error', 500);
    const location = safeText(payload.location || payload.route || 'unknown', 500);
    const stack = safeText(payload.stack || '', 4000);
    const requestId = safeText(req.headers['x-request-id'] || payload.request_id || '', 200);
    const exceptionId = safeText(payload.exception_id || req.headers['x-exception-id'] || '', 200);
    const userAgent = safeText(req.headers['user-agent'] || payload.user_agent || '', 500);

    await logService({
      source: 'Frontend Runtime',
      service_type: 'CLIENT',
      description: `${message} @ ${location}`,
      status: 'failed',
      details: {
        request_id: requestId || null,
        exception_id: exceptionId || null,
        location,
        stack: stack || null,
        user_agent: userAgent || null,
        app: payload.app || 'mims',
        severity: payload.severity || 'error',
      },
    });

    await emitTelemetryEvent({
      orgId: null,
      sourceModule: 'Frontend',
      method: 'CLIENT',
      path: '/telemetry/client-error',
      statusCode: 500,
      durationMs: null,
      eventType: 'client_error',
      entityType: 'browser',
      summary: message,
      payload: {
        location,
        app: payload.app || 'mims',
      },
      errorMessage: message,
    });

    return res.status(202).json({ accepted: true });
  } catch (err) {
    logger.error({ err }, 'Failed to ingest client telemetry');
    return res.status(500).json({ error: 'Telemetry ingestion failed.' });
  }
});

module.exports = router;
