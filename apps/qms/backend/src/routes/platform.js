import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';
import {
  createInAppNotification,
  queueEmailNotification,
  retryEmailNotification,
  markEmailNotificationFailed,
  markEmailNotificationSent
} from '../services/platform/notificationService.js';
import {
  queueOutboxEvent,
  markOutboxPublished,
  markOutboxFailed,
  retryOutboxEvent
} from '../services/platform/eventOutboxService.js';
import { runPeriodicAlerts } from '../services/platform/alertService.js';
import { readTraceLinks } from '../services/traceabilityService.js';

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

platformRouter.post('/notifications/email/:emailId/retry', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const { emailId } = req.params;
    const email = await req.withRlsTransaction((client) => retryEmailNotification(client, emailId));
    if (!email) {
      return res.status(404).json({ error: 'Email notification not found' });
    }
    return res.json({ email });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/notifications/email/:emailId/fail', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin']);

    const { emailId } = req.params;
    const { errorMessage } = req.body || {};

    const email = await req.withRlsTransaction((client) =>
      markEmailNotificationFailed(client, emailId, errorMessage)
    );
    if (!email) {
      return res.status(404).json({ error: 'Email notification not found' });
    }
    return res.json({ email });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/notifications/email/:emailId/mark-sent', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin']);

    const { emailId } = req.params;
    const email = await req.withRlsTransaction((client) => markEmailNotificationSent(client, emailId));
    if (!email) {
      return res.status(404).json({ error: 'Email notification not found' });
    }
    return res.json({ email });
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

platformRouter.post('/events/outbox/:eventId/retry', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin']);

    const { eventId } = req.params;
    const event = await req.withRlsTransaction((client) => retryOutboxEvent(client, eventId));
    if (!event) {
      return res.status(404).json({ error: 'Outbox event not found' });
    }
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/events/outbox/:eventId/fail', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin']);

    const { eventId } = req.params;
    const { errorMessage } = req.body || {};

    const event = await req.withRlsTransaction((client) =>
      markOutboxFailed(client, eventId, errorMessage)
    );
    if (!event) {
      return res.status(404).json({ error: 'Outbox event not found' });
    }
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
});

platformRouter.get('/trace-links', async (req, res, next) => {
  try {
    const { module, entityId, limit } = req.query;

    const traceLinks = await req.withRlsTransaction((client) =>
      readTraceLinks(client, req.authContext.orgId, {
        module,
        entityId,
        limit
      })
    );

    return res.json({ traceLinks });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/training/catalog', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const {
      trainingCode,
      title,
      description = null,
      sourceModule = null,
      sourceTable = null,
      sourceId = null
    } = req.body || {};

    if (!trainingCode || !title) {
      return res.status(400).json({ error: 'trainingCode and title are required' });
    }

    const training = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO qms_training_catalog (
            org_id,
            training_code,
            title,
            description,
            source_module,
            source_table,
            source_id,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          trainingCode,
          title,
          description,
          sourceModule,
          sourceTable,
          sourceId,
          req.authContext.userId
        ]
      );
      return rows[0];
    });

    return res.status(201).json({ training });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/training/assignments', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const { trainingId, assignedUserId = null, assignedRoleKey = null, dueDate = null } = req.body || {};

    if (!trainingId || (!assignedUserId && !assignedRoleKey)) {
      return res.status(400).json({ error: 'trainingId and assignedUserId/assignedRoleKey are required' });
    }

    const assignment = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO qms_training_assignments (
            org_id,
            training_id,
            assigned_user_id,
            assigned_role_key,
            due_date,
            assigned_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          trainingId,
          assignedUserId,
          assignedRoleKey,
          dueDate || null,
          req.authContext.userId
        ]
      );
      return rows[0];
    });

    return res.status(201).json({ assignment });
  } catch (error) {
    return next(error);
  }
});

platformRouter.post('/training/assignments/:assignmentId/complete', async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { completionNotes = null } = req.body || {};

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: assignments } = await client.query(
        `
          UPDATE qms_training_assignments
          SET status = 'Completed'
          WHERE id = $1
          RETURNING *
        `,
        [assignmentId]
      );

      if (!assignments[0]) {
        const error = new Error('Training assignment not found');
        error.statusCode = 404;
        throw error;
      }

      const completionUserId = assignments[0].assigned_user_id || req.authContext.userId;

      const { rows: completions } = await client.query(
        `
          INSERT INTO qms_training_completions (
            org_id,
            assignment_id,
            user_id,
            completion_notes
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (assignment_id, user_id)
          DO UPDATE SET completed_at = now(), completion_notes = EXCLUDED.completion_notes
          RETURNING *
        `,
        [req.authContext.orgId, assignmentId, completionUserId, completionNotes]
      );

      return {
        assignment: assignments[0],
        completion: completions[0]
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

platformRouter.get('/training/catalog', async (req, res, next) => {
  try {
    const { activeOnly = 'true', limit = 300 } = req.query;

    const trainingCatalog = await req.withRlsTransaction(async (client) => {
      const clauses = [];
      const values = [];
      if (String(activeOnly) !== 'false') {
        clauses.push('is_active = true');
      }
      values.push(Math.min(Number(limit) || 300, 500));

      const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await client.query(
        `
          SELECT *
          FROM qms_training_catalog
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length}
        `,
        values
      );
      return rows;
    });

    return res.json({ trainingCatalog });
  } catch (error) {
    return next(error);
  }
});

platformRouter.get('/training/assignments', async (req, res, next) => {
  try {
    const { status = null } = req.query;

    const payload = await req.withRlsTransaction(async (client) => {
      const where = [];
      const params = [];
      let idx = 1;

      if (status) {
        where.push(`a.status = $${idx}`);
        params.push(status);
        idx += 1;
      }

      const sql = `
        SELECT
          a.*,
          c.training_code,
          c.title AS training_title
        FROM qms_training_assignments a
        JOIN qms_training_catalog c ON c.id = a.training_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.assigned_at DESC
        LIMIT 200
      `;

      const { rows } = await client.query(sql, params);
      return rows;
    });

    return res.json({ assignments: payload });
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
      const { rows: outbox } = await client.query(
        `
          SELECT *
          FROM qms_event_outbox
          ORDER BY created_at DESC
          LIMIT 100
        `
      );
      return { inApp, emails, outbox };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

platformRouter.patch('/notifications/:notificationId/read', async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const payload = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE qms_notifications
          SET is_read = true
          WHERE id = $1
          RETURNING *
        `,
        [notificationId]
      );
      return rows[0] || null;
    });

    if (!payload) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ notification: payload });
  } catch (error) {
    return next(error);
  }
});

platformRouter.patch('/notifications/read-all', async (req, res, next) => {
  try {
    const payload = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE qms_notifications
          SET is_read = true
          WHERE is_read = false
            AND (recipient_user_id IS NULL OR recipient_user_id = $1)
          RETURNING id
        `,
        [req.authContext.userId]
      );
      return rows.length;
    });

    return res.json({ updatedCount: payload });
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
