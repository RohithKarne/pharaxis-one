import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const deviationsRouter = Router();

deviationsRouter.post('/', async (req, res, next) => {
  try {
    const {
      title,
      description,
      deviationType,
      classification,
      dateOfOccurrence,
      department
    } = req.body || {};

    if (!title || !description || !deviationType || !classification || !dateOfOccurrence || !department) {
      return res.status(400).json({
        error:
          'title, description, deviationType, classification, dateOfOccurrence, and department are required'
      });
    }

    const deviation = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO dv_deviation_records (
            org_id,
            deviation_code,
            title,
            description,
            deviation_type,
            classification,
            status,
            date_of_occurrence,
            department,
            detected_by,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'Open', $7, $8, $9, $9)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('DEV', title),
          title,
          description,
          deviationType,
          classification,
          asDateString(dateOfOccurrence),
          department,
          req.authContext.userId
        ]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_deviation_records',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { classification, deviationType }
      });

      return rows[0];
    });

    return res.status(201).json({ deviation });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/containment', async (req, res, next) => {
  try {
    const { deviationId } = req.params;
    const { actionText } = req.body || {};
    if (!actionText) {
      return res.status(400).json({ error: 'actionText is required' });
    }

    const containment = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO dv_containment_actions (
            org_id,
            deviation_id,
            action_text,
            recorded_by
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [req.authContext.orgId, deviationId, actionText, req.authContext.userId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_containment_actions',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { deviationId }
      });

      return rows[0];
    });

    return res.status(201).json({ containmentAction: containment });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/investigation', async (req, res, next) => {
  try {
    const { deviationId } = req.params;
    const { investigatorUserId, dueDate, findings, evidenceRef, rootCause } = req.body || {};
    if (!investigatorUserId) {
      return res.status(400).json({ error: 'investigatorUserId is required' });
    }

    const investigation = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO dv_investigations (
            org_id,
            deviation_id,
            investigator_user_id,
            due_date,
            findings,
            evidence_ref,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'InProgress')
          ON CONFLICT (id) DO NOTHING
          RETURNING *
        `,
        [
          req.authContext.orgId,
          deviationId,
          investigatorUserId,
          asDateString(dueDate),
          findings || null,
          evidenceRef || null
        ]
      );

      await client.query(
        `
          UPDATE dv_deviation_records
          SET
            status = 'Investigation',
            root_cause = COALESCE($2, root_cause),
            updated_at = now()
          WHERE id = $1
        `,
        [deviationId, rootCause || null]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_investigations',
        entityId: rows[0]?.id || deviationId,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: { deviationId, investigatorUserId }
      });

      return rows[0] || null;
    });

    return res.status(201).json({ investigation });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/link-capa', async (req, res, next) => {
  try {
    const { deviationId } = req.params;
    const { capaId } = req.body || {};
    if (!capaId) {
      return res.status(400).json({ error: 'capaId is required' });
    }

    const link = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO dv_deviation_capa_links (
            org_id,
            deviation_id,
            capa_id,
            created_by
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (deviation_id, capa_id)
          DO UPDATE SET created_at = now()
          RETURNING *
        `,
        [req.authContext.orgId, deviationId, capaId, req.authContext.userId]
      );

      await client.query(
        `
          UPDATE dv_deviation_records
          SET status = 'CapaLinked', updated_at = now()
          WHERE id = $1
        `,
        [deviationId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_deviation_capa_links',
        entityId: rows[0].id,
        actionKey: 'link',
        actorUserId: req.authContext.userId,
        payloadJson: { deviationId, capaId }
      });

      return rows[0];
    });

    return res.status(201).json({ link });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/close', async (req, res, next) => {
  try {
    const { deviationId } = req.params;
    const { reportabilityStatus, reportabilityReason } = req.body || {};
    if (!reportabilityStatus) {
      return res.status(400).json({ error: 'reportabilityStatus is required' });
    }

    const closed = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE dv_deviation_records
          SET
            status = 'Closed',
            reportability_status = $2,
            reportability_reason = $3,
            closed_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [deviationId, reportabilityStatus, reportabilityReason || null]
      );

      if (!rows[0]) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_deviation_records',
        entityId: deviationId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: { reportabilityStatus }
      });

      return rows[0];
    });

    return res.json({ deviation: closed });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.get('/', async (req, res, next) => {
  try {
    const deviations = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM dv_deviation_records
          ORDER BY created_at DESC
          LIMIT 200
        `
      );
      return rows;
    });
    return res.json({ deviations });
  } catch (error) {
    return next(error);
  }
});

