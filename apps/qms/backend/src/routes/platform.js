import { Router } from 'express';
import { createInAppNotification, queueEmailNotification } from '../services/platform/notificationService.js';
import { queueOutboxEvent, markOutboxPublished } from '../services/platform/eventOutboxService.js';
import { runPeriodicAlerts } from '../services/platform/alertService.js';

export const platformRouter = Router();

platformRouter.post('/notifications/in-app', async (req, res, next) => {
  try {
    const { recipientUserId, eventType, title, message, payloadJson } = req.body || {};
    if (!eventType || !title || !message) {
      return res.status(400).json({ error: 'eventType, title, message are required' });
    }

    const notification = await req.withRlsTransaction((client) =>
      createInAppNotification(client, {
        orgId: req.authContext.orgId,
        recipientUserId,
        eventType,
        title,
        message,
        payloadJson
      })
    );
    return res.status(201).json({ notification });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/notifications/email', async (req, res, next) => {
  try {
    const { recipientEmail, subject, body } = req.body || {};
    if (!recipientEmail || !subject || !body) {
      return res.status(400).json({ error: 'recipientEmail, subject, body are required' });
    }

    const queuedEmail = await req.withRlsTransaction((client) =>
      queueEmailNotification(client, {
        orgId: req.authContext.orgId,
        recipientEmail,
        subject,
        body
      })
    );
    return res.status(201).json({ queuedEmail });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/events/outbox', async (req, res, next) => {
  try {
    const { topicKey, payloadJson } = req.body || {};
    if (!topicKey) {
      return res.status(400).json({ error: 'topicKey is required' });
    }

    const outboxEvent = await req.withRlsTransaction((client) =>
      queueOutboxEvent(client, {
        orgId: req.authContext.orgId,
        topicKey,
        payloadJson
      })
    );

    return res.status(201).json({ outboxEvent });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/events/outbox/:eventId/publish', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const event = await req.withRlsTransaction((client) => markOutboxPublished(client, eventId));
    if (!event) {
      return res.status(404).json({ error: 'Outbox event not found' });
    }
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
});

platformRouter.get('/notifications', async (req, res, next) => {
  try {
    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: inApp } = await client.query(
        `
          SELECT *
          FROM qms_notifications
          ORDER BY created_at DESC
          LIMIT 100
        `
      );
      const { rows: emails } = await client.query(
        `
          SELECT *
          FROM qms_email_notifications
          ORDER BY created_at DESC
          LIMIT 100
        `
      );
      return { inApp, emails };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/alerts/run', async (req, res, next) => {
  try {
    const result = await req.withRlsTransaction((client) =>
      runPeriodicAlerts(client, req.authContext.orgId)
    );
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});
