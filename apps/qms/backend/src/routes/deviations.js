import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const deviationsRouter = Router();

const validTypes = new Set(['Product', 'Process', 'System', 'Environmental']);
const validClassifications = new Set(['Critical', 'Major', 'Minor']);
const validReportability = new Set(['Yes', 'No', 'Under Review']);
const validImpactLevels = new Set(['Low', 'Medium', 'High', 'Critical']);

function hasAnyRole(roles, roleKeys) {
  return Array.isArray(roles) && roleKeys.some((role) => roles.includes(role));
}

function assertRole(req, roleKeys, message = 'Insufficient permissions for this action') {
  if (!hasAnyRole(req.authContext.roles, roleKeys)) {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

async function appendDeviationHistoryEvent(client, {
  orgId,
  deviationId,
  actionKey,
  actorUserId,
  payloadJson = {}
}) {
  await client.query(
    `
      INSERT INTO dv_history_events (
        org_id,
        deviation_id,
        action_key,
        actor_user_id,
        payload_json
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [orgId, deviationId, actionKey, actorUserId, JSON.stringify(payloadJson)]
  );
}

deviationsRouter.post('/', async (req, res, next) => {
  try {
    const {
      title,
      description,
      deviationType,
      classification,
      dateOfOccurrence,
      department,
      dueDate = null
    } = req.body || {};

    if (!title || !description || !deviationType || !classification || !dateOfOccurrence || !department) {
      return res.status(400).json({
        error:
          'title, description, deviationType, classification, dateOfOccurrence, and department are required'
      });
    }

    if (!validTypes.has(deviationType)) {
      return res.status(400).json({ error: 'Invalid deviationType' });
    }
    if (!validClassifications.has(classification)) {
      return res.status(400).json({ error: 'Invalid classification' });
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
            due_date,
            detected_by,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'Open', $7, $8, $9, $10, $10)
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
          asDateString(dueDate),
          req.authContext.userId
        ]
      );

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          deviationType,
          classification,
          dueDate: asDateString(dueDate)
        }
      });

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

deviationsRouter.patch('/:deviationId', async (req, res, next) => {
  try {
    const { deviationId } = req.params;
    const {
      title,
      description,
      classification,
      dueDate,
      impactLevel,
      reportabilityStatus,
      reportabilityReason
    } = req.body || {};

    if (classification && !validClassifications.has(classification)) {
      return res.status(400).json({ error: 'Invalid classification' });
    }
    if (impactLevel && !validImpactLevels.has(impactLevel)) {
      return res.status(400).json({ error: 'Invalid impactLevel' });
    }
    if (reportabilityStatus && !validReportability.has(reportabilityStatus)) {
      return res.status(400).json({ error: 'Invalid reportabilityStatus' });
    }

    const deviation = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE dv_deviation_records
          SET
            title = COALESCE($2, title),
            description = COALESCE($3, description),
            classification = COALESCE($4, classification),
            due_date = COALESCE($5, due_date),
            impact_level = COALESCE($6, impact_level),
            reportability_status = COALESCE($7, reportability_status),
            reportability_reason = COALESCE($8, reportability_reason),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          deviationId,
          title || null,
          description || null,
          classification || null,
          asDateString(dueDate),
          impactLevel || null,
          reportabilityStatus || null,
          reportabilityReason || null
        ]
      );

      if (!rows[0]) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'update',
        actorUserId: req.authContext.userId,
        payloadJson: {
          title,
          classification,
          dueDate: asDateString(dueDate),
          impactLevel,
          reportabilityStatus
        }
      });

      return rows[0];
    });

    return res.json({ deviation });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/triage', async (req, res, next) => {
  try {
    const { deviationId } = req.params;
    const {
      triageSummary,
      impactLevel = 'Medium',
      assignedQaReviewerUserId = null,
      dueDate = null
    } = req.body || {};

    if (!triageSummary) {
      return res.status(400).json({ error: 'triageSummary is required' });
    }
    if (!validImpactLevels.has(impactLevel)) {
      return res.status(400).json({ error: 'impactLevel must be Low, Medium, High, or Critical' });
    }

    const deviation = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE dv_deviation_records
          SET
            status = 'Triage',
            triage_summary = $2,
            impact_level = $3,
            assigned_qa_reviewer_user_id = COALESCE($4, assigned_qa_reviewer_user_id),
            due_date = COALESCE($5, due_date),
            triaged_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          deviationId,
          triageSummary,
          impactLevel,
          assignedQaReviewerUserId,
          asDateString(dueDate)
        ]
      );

      if (!rows[0]) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'triage',
        actorUserId: req.authContext.userId,
        payloadJson: {
          impactLevel,
          assignedQaReviewerUserId,
          dueDate: asDateString(dueDate)
        }
      });

      return rows[0];
    });

    return res.json({ deviation });
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

      await client.query(
        `
          UPDATE dv_deviation_records
          SET status = 'Containment', updated_at = now()
          WHERE id = $1
        `,
        [deviationId]
      );

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'containment',
        actorUserId: req.authContext.userId,
        payloadJson: { actionText }
      });

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
            due_date = COALESCE($3, due_date),
            updated_at = now()
          WHERE id = $1
        `,
        [deviationId, rootCause || null, asDateString(dueDate)]
      );

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'investigation',
        actorUserId: req.authContext.userId,
        payloadJson: {
          investigatorUserId,
          dueDate: asDateString(dueDate),
          rootCause: rootCause || null
        }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_investigations',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { deviationId, investigatorUserId }
      });

      return rows[0];
    });

    return res.status(201).json({ investigation });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/qa-review', async (req, res, next) => {
  try {
    assertRole(req, ['qa_reviewer', 'admin', 'superadmin', 'approver']);

    const { deviationId } = req.params;
    const {
      decision = 'Approve',
      reviewNotes = null,
      reportabilityStatus = 'Under Review',
      reportabilityReason = null
    } = req.body || {};

    if (!['Approve', 'Reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be Approve or Reject' });
    }
    if (!validReportability.has(reportabilityStatus)) {
      return res.status(400).json({ error: 'Invalid reportabilityStatus' });
    }

    const deviation = await req.withRlsTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `
          SELECT id, status
          FROM dv_deviation_records
          WHERE id = $1
          FOR UPDATE
        `,
        [deviationId]
      );
      if (!currentRows[0]) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      const nextStatus = decision === 'Approve' ? 'QAReview' : 'Investigation';

      const { rows } = await client.query(
        `
          UPDATE dv_deviation_records
          SET
            status = $2,
            reportability_status = $3,
            reportability_reason = COALESCE($4, reportability_reason),
            qa_reviewed_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [deviationId, nextStatus, reportabilityStatus, reportabilityReason]
      );

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'qa_review',
        actorUserId: req.authContext.userId,
        payloadJson: {
          decision,
          reviewNotes,
          reportabilityStatus,
          previousStatus: currentRows[0].status
        }
      });

      return rows[0];
    });

    return res.json({ deviation });
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

    const payload = await req.withRlsTransaction(async (client) => {
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

      const traceLink = await appendTraceLink(client, {
        orgId: req.authContext.orgId,
        sourceModule: 'deviation',
        sourceTable: 'dv_deviation_records',
        sourceId: deviationId,
        targetModule: 'capa',
        targetTable: 'ca_capa_records',
        targetId: capaId,
        linkType: 'Remediation',
        createdBy: req.authContext.userId
      });

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'link_capa',
        actorUserId: req.authContext.userId,
        payloadJson: { capaId }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'deviation',
        entityTable: 'dv_deviation_capa_links',
        entityId: rows[0].id,
        actionKey: 'link',
        actorUserId: req.authContext.userId,
        payloadJson: { deviationId, capaId }
      });

      return { link: rows[0], traceLink };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.post('/:deviationId/close', async (req, res, next) => {
  try {
    assertRole(req, ['qa_reviewer', 'admin', 'superadmin', 'approver']);

    const { deviationId } = req.params;
    const { reportabilityStatus, reportabilityReason, closureSummary = null } = req.body || {};
    if (!reportabilityStatus) {
      return res.status(400).json({ error: 'reportabilityStatus is required' });
    }
    if (!validReportability.has(reportabilityStatus)) {
      return res.status(400).json({ error: 'Invalid reportabilityStatus' });
    }

    const closed = await req.withRlsTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `
          SELECT id, created_by
          FROM dv_deviation_records
          WHERE id = $1
          FOR UPDATE
        `,
        [deviationId]
      );

      const current = currentRows[0];
      if (!current) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      if (current.created_by && current.created_by === req.authContext.userId) {
        const error = new Error('Segregation rule violation: creator cannot perform final deviation closure');
        error.statusCode = 403;
        throw error;
      }

      const { rows } = await client.query(
        `
          UPDATE dv_deviation_records
          SET
            status = 'Closed',
            reportability_status = $2,
            reportability_reason = $3,
            closure_summary = COALESCE($4, closure_summary),
            closed_by = $5,
            closed_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [deviationId, reportabilityStatus, reportabilityReason || null, closureSummary, req.authContext.userId]
      );

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: {
          reportabilityStatus,
          reportabilityReason,
          closureSummary
        }
      });

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

deviationsRouter.post('/:deviationId/reopen', async (req, res, next) => {
  try {
    assertRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { deviationId } = req.params;
    const { reason } = req.body || {};
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const deviation = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE dv_deviation_records
          SET
            status = 'Reopened',
            reopened_reason = $2,
            reopened_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [deviationId, reason]
      );

      if (!rows[0]) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      await appendDeviationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        deviationId,
        actionKey: 'reopen',
        actorUserId: req.authContext.userId,
        payloadJson: { reason }
      });

      return rows[0];
    });

    return res.json({ deviation });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.get('/:deviationId/timeline', async (req, res, next) => {
  try {
    const { deviationId } = req.params;

    const timeline = await req.withRlsTransaction(async (client) => {
      const [historyResult, containmentResult, investigationResult, linkResult] = await Promise.all([
        client.query(
          `
            SELECT
              id,
              action_key,
              occurred_at AS event_at,
              payload_json,
              actor_user_id,
              'history'::text AS event_type
            FROM dv_history_events
            WHERE deviation_id = $1
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT
              id,
              'containment'::text AS action_key,
              recorded_at AS event_at,
              jsonb_build_object('actionText', action_text) AS payload_json,
              recorded_by AS actor_user_id,
              'containment'::text AS event_type
            FROM dv_containment_actions
            WHERE deviation_id = $1
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT
              id,
              'investigation'::text AS action_key,
              updated_at AS event_at,
              jsonb_build_object('findings', findings, 'status', status) AS payload_json,
              investigator_user_id AS actor_user_id,
              'investigation'::text AS event_type
            FROM dv_investigations
            WHERE deviation_id = $1
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT
              id,
              'capa_link'::text AS action_key,
              created_at AS event_at,
              jsonb_build_object('capaId', capa_id) AS payload_json,
              created_by AS actor_user_id,
              'capa_link'::text AS event_type
            FROM dv_deviation_capa_links
            WHERE deviation_id = $1
          `,
          [deviationId]
        )
      ]);

      const combined = [
        ...historyResult.rows,
        ...containmentResult.rows,
        ...investigationResult.rows,
        ...linkResult.rows
      ].sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime());

      return combined;
    });

    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

deviationsRouter.get('/:deviationId', async (req, res, next) => {
  try {
    const { deviationId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: deviationRows } = await client.query(
        `
          SELECT *
          FROM dv_deviation_records
          WHERE id = $1
          LIMIT 1
        `,
        [deviationId]
      );

      if (!deviationRows[0]) {
        const error = new Error('Deviation not found');
        error.statusCode = 404;
        throw error;
      }

      const [containmentRows, investigationRows, linkRows, timelineRows, traceRows] = await Promise.all([
        client.query(
          `
            SELECT *
            FROM dv_containment_actions
            WHERE deviation_id = $1
            ORDER BY recorded_at DESC
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT *
            FROM dv_investigations
            WHERE deviation_id = $1
            ORDER BY updated_at DESC
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT *
            FROM dv_deviation_capa_links
            WHERE deviation_id = $1
            ORDER BY created_at DESC
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT *
            FROM dv_history_events
            WHERE deviation_id = $1
            ORDER BY occurred_at DESC
          `,
          [deviationId]
        ),
        client.query(
          `
            SELECT *
            FROM qms_trace_links
            WHERE source_id = $1 OR target_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [deviationId]
        )
      ]);

      return {
        deviation: deviationRows[0],
        containmentActions: containmentRows.rows,
        investigations: investigationRows.rows,
        capaLinks: linkRows.rows,
        history: timelineRows.rows,
        traceLinks: traceRows.rows
      };
    });

    return res.json(payload);
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
