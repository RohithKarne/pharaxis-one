import { Router } from 'express';
import { randomUUID } from 'crypto';
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
      ) VALUES ($1, $2, $3, $4, $5, $6)
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
      const auditIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO au_audits (
            id,
            org_id,
            audit_code,
            audit_title,
            audit_type,
            scope,
            planned_date,
            status,
            lead_auditor_user_id,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Planned', $8, $9)
        `,
        [
          auditIdNew,
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
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_audits
          WHERE id = $1
            AND org_id = $2
        `,
        [auditIdNew, req.authContext.orgId]
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
      await client.query(
        `
          UPDATE au_audits
          SET
            status = 'InProgress',
            started_at = CURRENT_TIMESTAMP(3),
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $2
        `,
        [auditId, req.authContext.orgId]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_audits
          WHERE id = $1
            AND org_id = $2
        `,
        [auditId, req.authContext.orgId]
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

      const findingIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO au_findings (
            id,
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Open')
        `,
        [
          findingIdNew,
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
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_findings
          WHERE id = $1
            AND org_id = $2
        `,
        [findingIdNew, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE au_audits
          SET status = 'FindingsCaptured', updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $2
        `,
        [auditId, req.authContext.orgId]
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
      await client.query(
        `
          INSERT INTO au_finding_capa_links (id, org_id, finding_id, capa_id)
          VALUES ($1, $2, $3, $4)
          ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP(3)
        `,
        [randomUUID(), req.authContext.orgId, findingId, capaId]
      );
      // Keyed on the natural key, not the generated id: on conflict the pre-existing
      // row keeps its own id and the generated one is discarded.
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_finding_capa_links
          WHERE finding_id = $1
            AND capa_id = $2
            AND org_id = $3
        `,
        [findingId, capaId, req.authContext.orgId]
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
      const responseIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO au_auditee_responses (
            id,
            org_id,
            finding_id,
            response_text,
            proposed_action,
            responded_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [responseIdNew, req.authContext.orgId, findingId, responseText, proposedAction || null, req.authContext.userId]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_auditee_responses
          WHERE id = $1
            AND org_id = $2
        `,
        [responseIdNew, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE au_findings
          SET status = 'ResponseReceived'
          WHERE id = $1
            AND org_id = $2
        `,
        [findingId, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE au_audits
          SET status = 'ResponseInProgress', updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $2
        `,
        [auditId, req.authContext.orgId]
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
      await client.query(
        `
          UPDATE au_findings
          SET
            status = 'Closed',
            closure_summary = $2,
            effectiveness_result = $3,
            closed_by = $4,
            closed_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $5
        `,
        [findingId, closureSummary, effectivenessResult, req.authContext.userId, req.authContext.orgId]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_findings
          WHERE id = $1
            AND org_id = $2
        `,
        [findingId, req.authContext.orgId]
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
            AND org_id = $2
          LIMIT 1
        `,
        [auditId, req.authContext.orgId]
      );
      if (openRows[0]) {
        const error = new Error('All findings must be closed before audit closure');
        error.statusCode = 400;
        throw error;
      }

      await client.query(
        `
          UPDATE au_audits
          SET
            status = 'Closed',
            closure_summary = $2,
            actual_end_date = CURRENT_DATE,
            closed_by = $3,
            closed_at = CURRENT_TIMESTAMP(3),
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $4
        `,
        [auditId, closureSummary, req.authContext.userId, req.authContext.orgId]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM au_audits
          WHERE id = $1
            AND org_id = $2
        `,
        [auditId, req.authContext.orgId]
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
            AND org_id = $2
          ORDER BY occurred_at DESC
        `,
        [auditId, req.authContext.orgId]
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
            AND org_id = $2
          LIMIT 1
        `,
        [auditId, req.authContext.orgId]
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
              AND org_id = $2
            ORDER BY created_at DESC
          `,
          [auditId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT r.*
            FROM au_auditee_responses r
            JOIN au_findings f ON f.id = r.finding_id
            WHERE f.audit_id = $1
              AND r.org_id = $2
            ORDER BY r.responded_at DESC
          `,
          [auditId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT l.*
            FROM au_finding_capa_links l
            JOIN au_findings f ON f.id = l.finding_id
            WHERE f.audit_id = $1
              AND l.org_id = $2
            ORDER BY l.created_at DESC
          `,
          [auditId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT *
            FROM au_history_events
            WHERE audit_id = $1
              AND org_id = $2
            ORDER BY occurred_at DESC
          `,
          [auditId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT *
            FROM qms_trace_links
            WHERE (source_id = $1 OR target_id = $1)
              AND org_id = $2
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [auditId, req.authContext.orgId]
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
          WHERE org_id = $1
          ORDER BY requested_at DESC
          LIMIT 50
        `,
        [req.authContext.orgId]
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
            COUNT(f.id) AS total_findings,
            COALESCE(SUM(CASE WHEN f.status = 'Closed' THEN 1 ELSE 0 END), 0) AS closed_findings
          FROM au_audits a
          LEFT JOIN au_findings f ON f.audit_id = a.id AND f.org_id = a.org_id
          WHERE a.org_id = $1
          GROUP BY a.id
          ORDER BY a.created_at DESC
          LIMIT 200
        `,
        [req.authContext.orgId]
      );
      // The ::int casts were dropped for MySQL: both drivers hand back aggregates
      // as strings, so the numbers are restored here rather than in SQL.
      return rows.map((row) => ({
        ...row,
        total_findings: Number(row.total_findings),
        closed_findings: Number(row.closed_findings)
      }));
    });
    return res.json({ audits });
  } catch (error) {
    return next(error);
  }
});
