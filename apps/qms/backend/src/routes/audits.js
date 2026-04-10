import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { generateInspectionBinder } from '../services/platform/binderService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const auditsRouter = Router();

auditsRouter.post('/', async (req, res, next) => {
  try {
    const { auditTitle, auditType, scope, plannedDate, leadAuditorUserId } = req.body || {};
    if (!auditTitle || !auditType || !scope || !plannedDate) {
      return res
        .status(400)
        .json({ error: 'auditTitle, auditType, scope, plannedDate are required' });
    }

    const audit = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO au_audits (
            org_id,
            audit_code,
            audit_title,
            audit_type,
            scope,
            planned_date,
            status,
            lead_auditor_user_id,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'Planned', $7, $8)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('AUD', auditTitle),
          auditTitle,
          auditType,
          scope,
          asDateString(plannedDate),
          leadAuditorUserId || null,
          req.authContext.userId
        ]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'audit_management',
        entityTable: 'au_audits',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { auditType, plannedDate }
      });

      return rows[0];
    });

    return res.status(201).json({ audit });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.post('/:auditId/findings', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const { description, findingType, department, processArea } = req.body || {};
    if (!description || !findingType) {
      return res.status(400).json({ error: 'description and findingType are required' });
    }

    const finding = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO au_findings (
            org_id, audit_id, description, finding_type, department, process_area
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [req.authContext.orgId, auditId, description, findingType, department || null, processArea || null]
      );

      await client.query(
        `
          UPDATE au_audits
          SET status = 'FindingsCaptured', updated_at = now()
          WHERE id = $1
        `,
        [auditId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'audit_management',
        entityTable: 'au_findings',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { auditId, findingType }
      });

      return rows[0];
    });

    return res.status(201).json({ finding });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.post('/:auditId/findings/:findingId/link-capa', async (req, res, next) => {
  try {
    const { findingId } = req.params;
    const { capaId } = req.body || {};
    if (!capaId) {
      return res.status(400).json({ error: 'capaId is required' });
    }

    const link = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO au_finding_capa_links (org_id, finding_id, capa_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (finding_id, capa_id)
          DO UPDATE SET created_at = now()
          RETURNING *
        `,
        [req.authContext.orgId, findingId, capaId]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'audit_management',
        entityTable: 'au_finding_capa_links',
        entityId: rows[0].id,
        actionKey: 'link',
        actorUserId: req.authContext.userId,
        payloadJson: { findingId, capaId }
      });
      return rows[0];
    });

    return res.status(201).json({ link });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.post('/:auditId/respond/:findingId', async (req, res, next) => {
  try {
    const { findingId } = req.params;
    const { responseText, proposedAction } = req.body || {};
    if (!responseText) {
      return res.status(400).json({ error: 'responseText is required' });
    }

    const response = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO au_auditee_responses (
            org_id, finding_id, response_text, proposed_action, responded_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, findingId, responseText, proposedAction || null, req.authContext.userId]
      );
      return rows[0];
    });

    return res.status(201).json({ response });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.post('/binder/generate', async (req, res, next) => {
  try {
    const result = await req.withRlsTransaction(async (client) =>
      generateInspectionBinder(client, {
        orgId: req.authContext.orgId,
        requestedBy: req.authContext.userId
      })
    );
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

auditsRouter.get('/binder/jobs', async (req, res, next) => {
  try {
    const jobs = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_binder_jobs
          ORDER BY requested_at DESC
          LIMIT 50
        `
      );
      return rows;
    });
    return res.json({ jobs });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.get('/', async (req, res, next) => {
  try {
    const audits = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_audits
          ORDER BY created_at DESC
          LIMIT 200
        `
      );
      return rows;
    });
    return res.json({ audits });
  } catch (error) {
    return next(error);
  }
});

