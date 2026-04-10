import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { createInAppNotification, queueEmailNotification } from '../services/platform/notificationService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const capaRouter = Router();

capaRouter.post('/', async (req, res, next) => {
  try {
    const { title, sourceType = 'Manual', sourceRefId = null, classification, ownerUserId, dueDate } =
      req.body || {};

    if (!title || !classification || !ownerUserId) {
      return res.status(400).json({
        error: 'title, classification, ownerUserId are required'
      });
    }

    const capa = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO ca_capa_records (
            org_id, capa_code, title, source_type, source_ref_id, classification,
            status, owner_user_id, due_date, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'Draft', $7, $8, $9)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('CAPA', title),
          title,
          sourceType,
          sourceRefId,
          classification,
          ownerUserId,
          asDateString(dueDate),
          req.authContext.userId
        ]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'capa',
        entityTable: 'ca_capa_records',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { classification, sourceType }
      });

      return rows[0];
    });

    return res.status(201).json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/actions', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const { description, assignedOwnerUserId, dueDate } = req.body || {};

    if (!description || !assignedOwnerUserId || !dueDate) {
      return res
        .status(400)
        .json({ error: 'description, assignedOwnerUserId, and dueDate are required' });
    }

    const action = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO ca_action_items (
            org_id, capa_id, description, assigned_owner_user_id, due_date, status
          ) VALUES ($1, $2, $3, $4, $5, 'NotStarted')
          RETURNING *
        `,
        [req.authContext.orgId, capaId, description, assignedOwnerUserId, asDateString(dueDate)]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'capa',
        entityTable: 'ca_action_items',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { capaId, dueDate }
      });

      return rows[0];
    });

    return res.status(201).json({ actionItem: action });
  } catch (error) {
    return next(error);
  }
});

capaRouter.patch('/:capaId/actions/:actionId/status', async (req, res, next) => {
  try {
    const { capaId, actionId } = req.params;
    const { status } = req.body || {};
    const valid = ['NotStarted', 'InProgress', 'Complete'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
    }

    const updated = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE ca_action_items
          SET
            status = $3,
            completed_at = CASE WHEN $3 = 'Complete' THEN now() ELSE completed_at END,
            updated_at = now()
          WHERE id = $1 AND capa_id = $2
          RETURNING *
        `,
        [actionId, capaId, status]
      );

      if (!rows[0]) {
        const error = new Error('Action item not found');
        error.statusCode = 404;
        throw error;
      }

      if (status !== 'Complete') {
        const isOverdue = rows[0].due_date && new Date(rows[0].due_date) < new Date();
        if (isOverdue) {
          await client.query(
            `
              INSERT INTO ca_escalations (
                org_id, capa_id, action_item_id, reason
              ) VALUES ($1, $2, $3, $4)
            `,
            [req.authContext.orgId, capaId, actionId, 'CAPA action overdue']
          );

          await createInAppNotification(client, {
            orgId: req.authContext.orgId,
            recipientUserId: rows[0].assigned_owner_user_id,
            eventType: 'CAPA_OVERDUE',
            title: 'CAPA action overdue',
            message: `Action "${rows[0].description}" is overdue`,
            payloadJson: { capaId, actionId }
          });

          await queueEmailNotification(client, {
            orgId: req.authContext.orgId,
            recipientEmail: 'manager@pharaxis.local',
            subject: 'CAPA overdue escalation',
            body: `CAPA ${capaId} action ${actionId} is overdue.`
          });
        }
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'capa',
        entityTable: 'ca_action_items',
        entityId: actionId,
        actionKey: 'status_update',
        actorUserId: req.authContext.userId,
        payloadJson: { status }
      });

      return rows[0];
    });

    return res.json({ actionItem: updated });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/effectiveness', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const { criteria, evidenceRef, result } = req.body || {};
    if (!criteria || !result) {
      return res.status(400).json({ error: 'criteria and result are required' });
    }
    if (!['Pass', 'Fail'].includes(result)) {
      return res.status(400).json({ error: 'result must be Pass or Fail' });
    }

    const check = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO ca_effectiveness_checks (
            org_id, capa_id, criteria, evidence_ref, result, checked_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [req.authContext.orgId, capaId, criteria, evidenceRef || null, result, req.authContext.userId]
      );

      await client.query(
        `
          UPDATE ca_capa_records
          SET
            effectiveness_result = $2,
            effective_verified_at = now(),
            status = CASE WHEN $2 = 'Pass' THEN 'EffectivenessPending' ELSE 'InProgress' END,
            updated_at = now()
          WHERE id = $1
        `,
        [capaId, result]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'capa',
        entityTable: 'ca_effectiveness_checks',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { result }
      });

      return rows[0];
    });

    return res.status(201).json({ effectivenessCheck: check });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/close', async (req, res, next) => {
  try {
    const { capaId } = req.params;

    const closed = await req.withRlsTransaction(async (client) => {
      const { rows: checks } = await client.query(
        `
          SELECT id
          FROM ca_effectiveness_checks
          WHERE capa_id = $1 AND result = 'Pass'
          ORDER BY checked_at DESC
          LIMIT 1
        `,
        [capaId]
      );
      if (!checks[0]) {
        const error = new Error('CAPA cannot be closed until effectiveness result is Pass');
        error.statusCode = 400;
        throw error;
      }

      const { rows: openActions } = await client.query(
        `
          SELECT id
          FROM ca_action_items
          WHERE capa_id = $1 AND status <> 'Complete'
          LIMIT 1
        `,
        [capaId]
      );
      if (openActions[0]) {
        const error = new Error('All CAPA actions must be complete before closure');
        error.statusCode = 400;
        throw error;
      }

      const { rows } = await client.query(
        `
          UPDATE ca_capa_records
          SET status = 'Closed', closed_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId]
      );

      if (!rows[0]) {
        const error = new Error('CAPA not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'capa',
        entityTable: 'ca_capa_records',
        entityId: capaId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: {}
      });

      return rows[0];
    });

    return res.json({ capa: closed });
  } catch (error) {
    return next(error);
  }
});

capaRouter.get('/', async (req, res, next) => {
  try {
    const capas = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM ca_capa_records
          ORDER BY created_at DESC
          LIMIT 200
        `
      );
      return rows;
    });
    return res.json({ capas });
  } catch (error) {
    return next(error);
  }
});

