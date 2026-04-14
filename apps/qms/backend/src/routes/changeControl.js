import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const changeControlRouter = Router();

const VALID_CHANGE_TYPES = ['Standard', 'Major', 'Emergency'];
const VALID_RISK_LEVELS = ['High', 'Medium', 'Low'];
const VALID_APPROVAL_DECISIONS = ['Approve', 'Reject'];
const VALID_CAB_DECISIONS = ['Approve', 'Reject', 'ConditionalApprove'];
const VALID_STEP_STATUSES = ['Planned', 'InProgress', 'Completed', 'Blocked'];
const VALID_EFFECTIVENESS_RESULTS = ['Effective', 'PartiallyEffective', 'NotEffective'];

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

async function appendChangeHistoryEvent(client, {
  orgId,
  changeId,
  actionKey,
  actorUserId,
  payloadJson = {}
}) {
  await client.query(
    `
      INSERT INTO cc_history_events (
        org_id,
        change_id,
        action_key,
        actor_user_id,
        payload_json
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [orgId, changeId, actionKey, actorUserId, JSON.stringify(payloadJson)]
  );
}

changeControlRouter.post('/', async (req, res, next) => {
  try {
    const {
      title,
      changeType = 'Standard',
      reason,
      ownerUserId,
      plannedStartDate,
      plannedEndDate,
      linkedDocumentId = null,
      riskLevel = 'Medium',
      cabRequired = true
    } = req.body || {};

    if (!title || !reason || !ownerUserId) {
      return res.status(400).json({
        error: 'title, reason, and ownerUserId are required'
      });
    }
    if (!VALID_CHANGE_TYPES.includes(changeType)) {
      return res.status(400).json({
        error: `changeType must be one of: ${VALID_CHANGE_TYPES.join(', ')}`
      });
    }
    if (!VALID_RISK_LEVELS.includes(riskLevel)) {
      return res.status(400).json({
        error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(', ')}`
      });
    }

    const change = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO cc_change_records (
            org_id,
            change_code,
            title,
            change_type,
            reason,
            status,
            risk_level,
            owner_user_id,
            requested_by_user_id,
            linked_document_id,
            planned_start_date,
            planned_end_date,
            cab_required,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, 'Draft', $6, $7, $8, $9, $10, $11, $12, $8)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('CHG', title),
          title,
          changeType,
          reason,
          riskLevel,
          ownerUserId,
          req.authContext.userId,
          linkedDocumentId,
          asDateString(plannedStartDate),
          asDateString(plannedEndDate),
          Boolean(cabRequired)
        ]
      );

      if (linkedDocumentId) {
        await appendTraceLink(client, {
          orgId: req.authContext.orgId,
          sourceModule: 'change_control',
          sourceTable: 'cc_change_records',
          sourceId: rows[0].id,
          targetModule: 'document_control',
          targetTable: 'dc_documents',
          targetId: linkedDocumentId,
          linkType: 'Impact',
          createdBy: req.authContext.userId
        });
      }

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { changeType, riskLevel, cabRequired: Boolean(cabRequired) }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'change_control',
        entityTable: 'cc_change_records',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { changeType, riskLevel }
      });

      return rows[0];
    });

    return res.status(201).json({ change });
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/impact-assessment', async (req, res, next) => {
  try {
    const { changeId } = req.params;
    const { assessmentSummary, impactedModules = [], riskLevel = 'Medium' } = req.body || {};

    if (!assessmentSummary) {
      return res.status(400).json({ error: 'assessmentSummary is required' });
    }
    if (!VALID_RISK_LEVELS.includes(riskLevel)) {
      return res.status(400).json({
        error: `riskLevel must be one of: ${VALID_RISK_LEVELS.join(', ')}`
      });
    }

    const safeModules = Array.isArray(impactedModules)
      ? impactedModules.filter((value) => typeof value === 'string' && value.trim().length > 0)
      : [];

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: changeRows } = await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'PendingApproval',
            risk_level = $2,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [changeId, riskLevel]
      );

      if (!changeRows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: impactRows } = await client.query(
        `
          INSERT INTO cc_impact_assessments (
            org_id,
            change_id,
            assessment_summary,
            impacted_modules,
            risk_level,
            assessed_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (change_id)
          DO UPDATE SET
            assessment_summary = EXCLUDED.assessment_summary,
            impacted_modules = EXCLUDED.impacted_modules,
            risk_level = EXCLUDED.risk_level,
            assessed_by = EXCLUDED.assessed_by,
            updated_at = now()
          RETURNING *
        `,
        [req.authContext.orgId, changeId, assessmentSummary, safeModules, riskLevel, req.authContext.userId]
      );

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId,
        actionKey: 'impact_assessment',
        actorUserId: req.authContext.userId,
        payloadJson: { riskLevel, impactedModules: safeModules }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'change_control',
        entityTable: 'cc_impact_assessments',
        entityId: impactRows[0].id,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: { changeId, riskLevel, impactedModules: safeModules }
      });

      return {
        impactAssessment: impactRows[0],
        change: changeRows[0]
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/cab-review', async (req, res, next) => {
  try {
    assertRole(req, ['qa_reviewer', 'admin', 'superadmin', 'approver']);

    const { changeId } = req.params;
    const { decision, comments = null } = req.body || {};

    if (!VALID_CAB_DECISIONS.includes(decision)) {
      return res.status(400).json({
        error: `decision must be one of: ${VALID_CAB_DECISIONS.join(', ')}`
      });
    }

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: changes } = await client.query(
        `
          SELECT id, status
          FROM cc_change_records
          WHERE id = $1
          FOR UPDATE
        `,
        [changeId]
      );

      if (!changes[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      const status = decision === 'Reject' ? 'Rejected' : 'CabReview';

      const { rows } = await client.query(
        `
          UPDATE cc_change_records
          SET
            status = $2,
            cab_decision = $3,
            cab_reviewed_by = $4,
            cab_reviewed_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [changeId, status, decision, req.authContext.userId]
      );

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId,
        actionKey: 'cab_review',
        actorUserId: req.authContext.userId,
        payloadJson: {
          decision,
          comments
        }
      });

      return rows[0];
    });

    return res.status(201).json({ change: payload });
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/approvals', async (req, res, next) => {
  try {
    const { changeId } = req.params;
    const { decision, comments, approverUserId = req.authContext.userId } = req.body || {};

    if (!VALID_APPROVAL_DECISIONS.includes(decision)) {
      return res.status(400).json({
        error: `decision must be one of: ${VALID_APPROVAL_DECISIONS.join(', ')}`
      });
    }

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `
          SELECT id, status, created_by
          FROM cc_change_records
          WHERE id = $1
          FOR UPDATE
        `,
        [changeId]
      );
      if (!currentRows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }
      if (currentRows[0].status === 'Closed' || currentRows[0].status === 'Rejected') {
        const error = new Error('Approval decision is not allowed for closed or rejected changes');
        error.statusCode = 400;
        throw error;
      }
      if (
        decision === 'Approve' &&
        currentRows[0].created_by &&
        currentRows[0].created_by === approverUserId
      ) {
        const error = new Error(
          'Segregation rule violation: creator cannot perform final approval for this change request'
        );
        error.statusCode = 403;
        throw error;
      }

      const { rows: approvalRows } = await client.query(
        `
          INSERT INTO cc_approval_records (
            org_id,
            change_id,
            approver_user_id,
            decision,
            comments
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, changeId, approverUserId, decision, comments || null]
      );

      const { rows: changeRows } = await client.query(
        `
          UPDATE cc_change_records
          SET
            status = $2,
            approved_at = CASE WHEN $2 = 'Approved' THEN now() ELSE approved_at END,
            closed_at = CASE WHEN $2 = 'Rejected' THEN now() ELSE closed_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [changeId, decision === 'Approve' ? 'Approved' : 'Rejected']
      );

      if (!changeRows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId,
        actionKey: 'approval_decision',
        actorUserId: req.authContext.userId,
        payloadJson: { decision, comments: comments || null }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'change_control',
        entityTable: 'cc_approval_records',
        entityId: approvalRows[0].id,
        actionKey: 'decision',
        actorUserId: req.authContext.userId,
        payloadJson: { changeId, decision }
      });

      return {
        approval: approvalRows[0],
        change: changeRows[0]
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/implementation', async (req, res, next) => {
  try {
    const { changeId } = req.params;
    const { stepTitle, stepStatus = 'InProgress', dueDate, evidenceRef = null } = req.body || {};

    if (!stepTitle) {
      return res.status(400).json({ error: 'stepTitle is required' });
    }
    if (!VALID_STEP_STATUSES.includes(stepStatus)) {
      return res.status(400).json({
        error: `stepStatus must be one of: ${VALID_STEP_STATUSES.join(', ')}`
      });
    }

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: changeRows } = await client.query(
        `
          SELECT *
          FROM cc_change_records
          WHERE id = $1
          FOR UPDATE
        `,
        [changeId]
      );

      if (!changeRows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }
      if (changeRows[0].status === 'Closed' || changeRows[0].status === 'Rejected') {
        const error = new Error('Implementation steps are not allowed for closed or rejected changes');
        error.statusCode = 400;
        throw error;
      }

      const { rows: seqRows } = await client.query(
        `
          SELECT COALESCE(MAX(step_no), 0) + 1 AS next_step_no
          FROM cc_implementation_steps
          WHERE change_id = $1
        `,
        [changeId]
      );
      const nextStepNo = Number(seqRows[0]?.next_step_no || 1);

      const { rows: stepRows } = await client.query(
        `
          INSERT INTO cc_implementation_steps (
            org_id,
            change_id,
            step_no,
            step_title,
            step_status,
            due_date,
            completed_at,
            evidence_ref,
            updated_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'Completed' THEN now() ELSE NULL END, $7, $8)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          changeId,
          nextStepNo,
          stepTitle,
          stepStatus,
          asDateString(dueDate),
          evidenceRef,
          req.authContext.userId
        ]
      );

      const { rows: updatedChangeRows } = await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'Implementation',
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [changeId]
      );

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId,
        actionKey: 'implementation_step',
        actorUserId: req.authContext.userId,
        payloadJson: {
          stepNo: nextStepNo,
          stepStatus,
          stepTitle
        }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'change_control',
        entityTable: 'cc_implementation_steps',
        entityId: stepRows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { changeId, stepNo: nextStepNo, stepStatus }
      });

      return {
        implementationStep: stepRows[0],
        change: updatedChangeRows[0]
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/close', async (req, res, next) => {
  try {
    const { changeId } = req.params;
    const { closureSummary, effectivenessResult } = req.body || {};

    if (!closureSummary) {
      return res.status(400).json({ error: 'closureSummary is required' });
    }
    if (!VALID_EFFECTIVENESS_RESULTS.includes(effectivenessResult)) {
      return res.status(400).json({
        error: `effectivenessResult must be one of: ${VALID_EFFECTIVENESS_RESULTS.join(', ')}`
      });
    }

    const closed = await req.withRlsTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `
          SELECT id, status
          FROM cc_change_records
          WHERE id = $1
          FOR UPDATE
        `,
        [changeId]
      );
      if (!currentRows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }
      if (currentRows[0].status === 'Closed') {
        const error = new Error('Change request is already closed');
        error.statusCode = 400;
        throw error;
      }
      if (currentRows[0].status === 'Rejected') {
        const error = new Error('Rejected change request cannot be closed');
        error.statusCode = 400;
        throw error;
      }

      const { rows: approvalRows } = await client.query(
        `
          SELECT id
          FROM cc_approval_records
          WHERE change_id = $1 AND decision = 'Approve'
          ORDER BY decided_at DESC
          LIMIT 1
        `,
        [changeId]
      );
      if (!approvalRows[0]) {
        const error = new Error('Change request cannot be closed before an approval decision');
        error.statusCode = 400;
        throw error;
      }

      const { rows: completedRows } = await client.query(
        `
          SELECT id
          FROM cc_implementation_steps
          WHERE change_id = $1 AND step_status = 'Completed'
          ORDER BY step_no DESC
          LIMIT 1
        `,
        [changeId]
      );
      if (!completedRows[0]) {
        const error = new Error('At least one completed implementation step is required before closure');
        error.statusCode = 400;
        throw error;
      }

      const { rows } = await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'Closed',
            closure_summary = $2,
            effectiveness_result = $3,
            closed_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [changeId, closureSummary, effectivenessResult]
      );

      if (!rows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: { effectivenessResult }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'change_control',
        entityTable: 'cc_change_records',
        entityId: changeId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: { effectivenessResult }
      });

      return rows[0];
    });

    return res.json({ change: closed });
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/reopen', async (req, res, next) => {
  try {
    assertRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { changeId } = req.params;
    const { reason } = req.body || {};
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const change = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'Reopened',
            reopened_reason = $2,
            reopened_at = now(),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [changeId, reason]
      );

      if (!rows[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId,
        actionKey: 'reopen',
        actorUserId: req.authContext.userId,
        payloadJson: { reason }
      });

      return rows[0];
    });

    return res.json({ change });
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.get('/:changeId/timeline', async (req, res, next) => {
  try {
    const { changeId } = req.params;

    const timeline = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM cc_history_events
          WHERE change_id = $1
          ORDER BY occurred_at DESC
        `,
        [changeId]
      );

      return rows;
    });

    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.get('/:changeId', async (req, res, next) => {
  try {
    const { changeId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: changes } = await client.query(
        `
          SELECT *
          FROM cc_change_records
          WHERE id = $1
          LIMIT 1
        `,
        [changeId]
      );

      if (!changes[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      const [impactRows, approvalsRows, stepsRows, historyRows, traceRows] = await Promise.all([
        client.query(
          `
            SELECT *
            FROM cc_impact_assessments
            WHERE change_id = $1
            LIMIT 1
          `,
          [changeId]
        ),
        client.query(
          `
            SELECT *
            FROM cc_approval_records
            WHERE change_id = $1
            ORDER BY decided_at DESC
          `,
          [changeId]
        ),
        client.query(
          `
            SELECT *
            FROM cc_implementation_steps
            WHERE change_id = $1
            ORDER BY step_no ASC
          `,
          [changeId]
        ),
        client.query(
          `
            SELECT *
            FROM cc_history_events
            WHERE change_id = $1
            ORDER BY occurred_at DESC
          `,
          [changeId]
        ),
        client.query(
          `
            SELECT *
            FROM qms_trace_links
            WHERE source_id = $1 OR target_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [changeId]
        )
      ]);

      return {
        change: changes[0],
        impactAssessment: impactRows.rows[0] || null,
        approvals: approvalsRows.rows,
        implementationSteps: stepsRows.rows,
        timeline: historyRows.rows,
        traceLinks: traceRows.rows
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.get('/', async (req, res, next) => {
  try {
    const changes = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            c.*,
            COUNT(s.id)::int AS total_steps,
            COUNT(s.id) FILTER (WHERE s.step_status = 'Completed')::int AS completed_steps
          FROM cc_change_records c
          LEFT JOIN cc_implementation_steps s ON s.change_id = c.id
          GROUP BY c.id
          ORDER BY c.created_at DESC
          LIMIT 200
        `
      );
      return rows;
    });

    return res.json({ changes });
  } catch (error) {
    return next(error);
  }
});
