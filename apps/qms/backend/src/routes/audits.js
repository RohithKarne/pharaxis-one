import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { generateInspectionBinder } from '../services/platform/binderService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const auditsRouter = Router();

const validAuditTypes = new Set(['Internal', 'External', 'RegulatoryInspection']);
const validFindingTypes = new Set(['Observation', 'Minor', 'Major', 'Critical']);

async function appendAuditHistoryEvent(client, {
  orgId,
  auditId,
  findingId = null,
  actionKey,
  actorUserId,
  payloadJson = {}
}) {
  await client.query(
    `
      INSERT INTO au_history_events (
        org_id,
        audit_id,
        finding_id,
        action_key,
        actor_user_id,
        payload_json
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [orgId, auditId, findingId, actionKey, actorUserId, JSON.stringify(payloadJson)]
  );
}

auditsRouter.post('/', async (req, res, next) => {
  try {
    const { auditTitle, auditType, scope, plannedDate, leadAuditorUserId } = req.body || {};
    if (!auditTitle || !auditType || !scope || !plannedDate) {
      return res
        .status(400)
        .json({ error: 'auditTitle, auditType, scope, plannedDate are required' });
    }
    if (!validAuditTypes.has(auditType)) {
      return res.status(400).json({ error: 'Invalid auditType' });
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

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { auditType, plannedDate }
      });

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

auditsRouter.post('/:auditId/start', async (req, res, next) => {
  try {
    const { auditId } = req.params;

    const audit = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE au_audits
          SET
            status = 'InProgress',
            started_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [auditId]
      );
      if (!rows[0]) {
        const error = new Error('Audit not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId,
        actionKey: 'start',
        actorUserId: req.authContext.userId
      });

      return rows[0];
    });

    return res.json({ audit });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.post('/:auditId/findings', async (req, res, next) => {
  try {
    const { auditId } = req.params;
    const {
      description,
      findingType,
      department,
      processArea,
      dueDate = null,
      responseDueDate = null
    } = req.body || {};
    if (!description || !findingType) {
      return res.status(400).json({ error: 'description and findingType are required' });
    }
    if (!validFindingTypes.has(findingType)) {
      return res.status(400).json({ error: 'Invalid findingType' });
    }

    const finding = await req.withRlsTransaction(async (client) => {
      const findingCode = makeEntityCode('AF', `${findingType}-${description.slice(0, 24)}`);

      const { rows } = await client.query(
        `
          INSERT INTO au_findings (
            org_id,
            audit_id,
            finding_code,
            description,
            finding_type,
            department,
            process_area,
            due_date,
            response_due_date,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Open')
          RETURNING *
        `,
        [
          req.authContext.orgId,
          auditId,
          findingCode,
          description,
          findingType,
          department || null,
          processArea || null,
          asDateString(dueDate),
          asDateString(responseDueDate)
        ]
      );

      await client.query(
        `
          UPDATE au_audits
          SET status = 'FindingsCaptured', updated_at = now()
          WHERE id = $1
        `,
        [auditId]
      );

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId,
        findingId: rows[0].id,
        actionKey: 'finding_create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          findingType,
          dueDate: asDateString(dueDate),
          responseDueDate: asDateString(responseDueDate)
        }
      });

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
    const { auditId, findingId } = req.params;
    const { capaId } = req.body || {};
    if (!capaId) {
      return res.status(400).json({ error: 'capaId is required' });
    }

    const payload = await req.withRlsTransaction(async (client) => {
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

      const traceLink = await appendTraceLink(client, {
        orgId: req.authContext.orgId,
        sourceModule: 'audit',
        sourceTable: 'au_findings',
        sourceId: findingId,
        targetModule: 'capa',
        targetTable: 'ca_capa_records',
        targetId: capaId,
        linkType: 'Remediation',
        createdBy: req.authContext.userId
      });

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId,
        findingId,
        actionKey: 'finding_link_capa',
        actorUserId: req.authContext.userId,
        payloadJson: { capaId }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'audit_management',
        entityTable: 'au_finding_capa_links',
        entityId: rows[0].id,
        actionKey: 'link',
        actorUserId: req.authContext.userId,
        payloadJson: { findingId, capaId }
      });

      return { link: rows[0], traceLink };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

async function respondToFinding(req, res, next) {
  try {
    const { auditId, findingId } = req.params;
    const { responseText, proposedAction } = req.body || {};
    if (!responseText) {
      return res.status(400).json({ error: 'responseText is required' });
    }

    const response = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO au_auditee_responses (
            org_id,
            finding_id,
            response_text,
            proposed_action,
            responded_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, findingId, responseText, proposedAction || null, req.authContext.userId]
      );

      await client.query(
        `
          UPDATE au_findings
          SET status = 'ResponseReceived'
          WHERE id = $1
        `,
        [findingId]
      );

      await client.query(
        `
          UPDATE au_audits
          SET status = 'ResponseInProgress', updated_at = now()
          WHERE id = $1
        `,
        [auditId]
      );

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId,
        findingId,
        actionKey: 'finding_response',
        actorUserId: req.authContext.userId,
        payloadJson: { proposedAction: proposedAction || null }
      });

      return rows[0];
    });

    return res.status(201).json({ response });
  } catch (error) {
    return next(error);
  }
}

// Legacy path kept for compatibility with older smoke suites
auditsRouter.post('/:auditId/respond/:findingId', respondToFinding);
auditsRouter.post('/:auditId/findings/:findingId/respond', respondToFinding);

auditsRouter.post('/:auditId/findings/:findingId/close', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin', 'approver']);

    const { auditId, findingId } = req.params;
    const { closureSummary, effectivenessResult = 'Effective' } = req.body || {};

    if (!closureSummary) {
      return res.status(400).json({ error: 'closureSummary is required' });
    }
    if (!['Effective', 'PartiallyEffective', 'NotEffective'].includes(effectivenessResult)) {
      return res.status(400).json({ error: 'Invalid effectivenessResult' });
    }

    const finding = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE au_findings
          SET
            status = 'Closed',
            closure_summary = $2,
            effectiveness_result = $3,
            closed_by = $4,
            closed_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [findingId, closureSummary, effectivenessResult, req.authContext.userId]
      );
      if (!rows[0]) {
        const error = new Error('Finding not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId,
        findingId,
        actionKey: 'finding_close',
        actorUserId: req.authContext.userId,
        payloadJson: { effectivenessResult }
      });

      return rows[0];
    });

    return res.json({ finding });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.post('/:auditId/close', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin', 'approver']);

    const { auditId } = req.params;
    const { closureSummary } = req.body || {};
    if (!closureSummary) {
      return res.status(400).json({ error: 'closureSummary is required' });
    }

    const audit = await req.withRlsTransaction(async (client) => {
      const { rows: openRows } = await client.query(
        `
          SELECT id
          FROM au_findings
          WHERE audit_id = $1
            AND status <> 'Closed'
          LIMIT 1
        `,
        [auditId]
      );
      if (openRows[0]) {
        const error = new Error('All findings must be closed before audit closure');
        error.statusCode = 400;
        throw error;
      }

      const { rows } = await client.query(
        `
          UPDATE au_audits
          SET
            status = 'Closed',
            closure_summary = $2,
            actual_end_date = CURRENT_DATE,
            closed_by = $3,
            closed_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [auditId, closureSummary, req.authContext.userId]
      );
      if (!rows[0]) {
        const error = new Error('Audit not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditHistoryEvent(client, {
        orgId: req.authContext.orgId,
        auditId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: { closureSummary }
      });

      return rows[0];
    });

    return res.json({ audit });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.get('/:auditId/timeline', async (req, res, next) => {
  try {
    const { auditId } = req.params;

    const timeline = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_history_events
          WHERE audit_id = $1
          ORDER BY occurred_at DESC
        `,
        [auditId]
      );
      return rows;
    });

    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

auditsRouter.get('/:auditId', async (req, res, next) => {
  try {
    const { auditId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: audits } = await client.query(
        `
          SELECT *
          FROM au_audits
          WHERE id = $1
          LIMIT 1
        `,
        [auditId]
      );
      if (!audits[0]) {
        const error = new Error('Audit not found');
        error.statusCode = 404;
        throw error;
      }

      const [findingsResult, responsesResult, linksResult, timelineResult, traceResult] = await Promise.all([
        client.query(
          `
            SELECT *
            FROM au_findings
            WHERE audit_id = $1
            ORDER BY created_at DESC
          `,
          [auditId]
        ),
        client.query(
          `
            SELECT r.*
            FROM au_auditee_responses r
            JOIN au_findings f ON f.id = r.finding_id
            WHERE f.audit_id = $1
            ORDER BY r.responded_at DESC
          `,
          [auditId]
        ),
        client.query(
          `
            SELECT l.*
            FROM au_finding_capa_links l
            JOIN au_findings f ON f.id = l.finding_id
            WHERE f.audit_id = $1
            ORDER BY l.created_at DESC
          `,
          [auditId]
        ),
        client.query(
          `
            SELECT *
            FROM au_history_events
            WHERE audit_id = $1
            ORDER BY occurred_at DESC
          `,
          [auditId]
        ),
        client.query(
          `
            SELECT *
            FROM qms_trace_links
            WHERE source_id = $1 OR target_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [auditId]
        )
      ]);

      return {
        audit: audits[0],
        findings: findingsResult.rows,
        responses: responsesResult.rows,
        capaLinks: linksResult.rows,
        timeline: timelineResult.rows,
        traceLinks: traceResult.rows
      };
    });

    return res.json(payload);
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
          SELECT
            a.*,
            COUNT(f.id)::int AS total_findings,
            COUNT(f.id) FILTER (WHERE f.status = 'Closed')::int AS closed_findings
          FROM au_audits a
          LEFT JOIN au_findings f ON f.audit_id = a.id
          GROUP BY a.id
          ORDER BY a.created_at DESC
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
