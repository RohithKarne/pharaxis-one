import { randomUUID } from 'crypto';
import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';
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

/**
 * Read a change record back after a write. MySQL has no RETURNING, so every
 * UPDATE that used to return its row now re-selects it on the same id/org
 * predicate the UPDATE ran with. No row here means the id did not match this
 * org — the same 404 condition RETURNING used to signal with an empty result.
 */
async function fetchChangeRecord(client, orgId, changeId) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM cc_change_records
      WHERE id = $1
        AND org_id = $2
      LIMIT 1
    `,
    [changeId, orgId]
  );
  return rows[0] || null;
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
      ) VALUES ($1, $2, $3, $4, $5)
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
      const newChangeId = randomUUID();
      await client.query(
        `
          INSERT INTO cc_change_records (
            id,
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
          VALUES ($1, $2, $3, $4, $5, $6, 'Draft', $7, $8, $9, $10, $11, $12, $13, $9)
        `,
        [
          newChangeId,
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

      const created = await fetchChangeRecord(client, req.authContext.orgId, newChangeId);

      if (linkedDocumentId) {
        await appendTraceLink(client, {
          orgId: req.authContext.orgId,
          sourceModule: 'change_control',
          sourceTable: 'cc_change_records',
          sourceId: newChangeId,
          targetModule: 'document_control',
          targetTable: 'dc_documents',
          targetId: linkedDocumentId,
          linkType: 'Impact',
          createdBy: req.authContext.userId
        });
      }

      await appendChangeHistoryEvent(client, {
        orgId: req.authContext.orgId,
        changeId: newChangeId,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { changeType, riskLevel, cabRequired: Boolean(cabRequired) }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'change_control',
        entityTable: 'cc_change_records',
        entityId: newChangeId,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { changeType, riskLevel }
      });

      return created;
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
      await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'PendingApproval',
            risk_level = $2,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $3
        `,
        [changeId, riskLevel, req.authContext.orgId]
      );

      const changeRecord = await fetchChangeRecord(client, req.authContext.orgId, changeId);
      if (!changeRecord) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      await client.query(
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
            updated_at = CURRENT_TIMESTAMP(3)
        `,
        [req.authContext.orgId, changeId, assessmentSummary, safeModules, riskLevel, req.authContext.userId]
      );

      // Read back on change_id: the row is unique per change, and on the
      // conflict path an app-generated id would not be the one that survived.
      const { rows: impactRows } = await client.query(
        `
          SELECT *
          FROM cc_impact_assessments
          WHERE change_id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [changeId, req.authContext.orgId]
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
        change: changeRecord
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/cab-review', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin', 'approver']);

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
            AND org_id = $2
          FOR UPDATE
        `,
        [changeId, req.authContext.orgId]
      );

      if (!changes[0]) {
        const error = new Error('Change request not found');
        error.statusCode = 404;
        throw error;
      }

      const status = decision === 'Reject' ? 'Rejected' : 'CabReview';

      await client.query(
        `
          UPDATE cc_change_records
          SET
            status = $2,
            cab_decision = $3,
            cab_reviewed_by = $4,
            cab_reviewed_at = CURRENT_TIMESTAMP(3),
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $5
        `,
        [changeId, status, decision, req.authContext.userId, req.authContext.orgId]
      );

      const reviewed = await fetchChangeRecord(client, req.authContext.orgId, changeId);

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

      return reviewed;
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
            AND org_id = $2
          FOR UPDATE
        `,
        [changeId, req.authContext.orgId]
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

      const approvalId = randomUUID();
      await client.query(
        `
          INSERT INTO cc_approval_records (
            id,
            org_id,
            change_id,
            approver_user_id,
            decision,
            comments
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [approvalId, req.authContext.orgId, changeId, approverUserId, decision, comments || null]
      );

      const { rows: approvalRows } = await client.query(
        `
          SELECT *
          FROM cc_approval_records
          WHERE id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [approvalId, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE cc_change_records
          SET
            status = $2,
            approved_at = CASE WHEN $2 = 'Approved' THEN CURRENT_TIMESTAMP(3) ELSE approved_at END,
            closed_at = CASE WHEN $2 = 'Rejected' THEN CURRENT_TIMESTAMP(3) ELSE closed_at END,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $3
        `,
        [changeId, decision === 'Approve' ? 'Approved' : 'Rejected', req.authContext.orgId]
      );

      const decidedChange = await fetchChangeRecord(client, req.authContext.orgId, changeId);
      if (!decidedChange) {
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
        entityId: approvalId,
        actionKey: 'decision',
        actorUserId: req.authContext.userId,
        payloadJson: { changeId, decision }
      });

      return {
        approval: approvalRows[0],
        change: decidedChange
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
            AND org_id = $2
          FOR UPDATE
        `,
        [changeId, req.authContext.orgId]
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
            AND org_id = $2
        `,
        [changeId, req.authContext.orgId]
      );
      const nextStepNo = Number(seqRows[0]?.next_step_no || 1);

      const stepId = randomUUID();
      await client.query(
        `
          INSERT INTO cc_implementation_steps (
            id,
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 = 'Completed' THEN CURRENT_TIMESTAMP(3) ELSE NULL END, $8, $9)
        `,
        [
          stepId,
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

      const { rows: stepRows } = await client.query(
        `
          SELECT *
          FROM cc_implementation_steps
          WHERE id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [stepId, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'Implementation',
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $2
        `,
        [changeId, req.authContext.orgId]
      );

      const implementingChange = await fetchChangeRecord(client, req.authContext.orgId, changeId);

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
        entityId: stepId,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { changeId, stepNo: nextStepNo, stepStatus }
      });

      return {
        implementationStep: stepRows[0],
        change: implementingChange
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
            AND org_id = $2
          FOR UPDATE
        `,
        [changeId, req.authContext.orgId]
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
            AND org_id = $2
          ORDER BY decided_at DESC
          LIMIT 1
        `,
        [changeId, req.authContext.orgId]
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
            AND org_id = $2
          ORDER BY step_no DESC
          LIMIT 1
        `,
        [changeId, req.authContext.orgId]
      );
      if (!completedRows[0]) {
        const error = new Error('At least one completed implementation step is required before closure');
        error.statusCode = 400;
        throw error;
      }

      await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'Closed',
            closure_summary = $2,
            effectiveness_result = $3,
            closed_at = CURRENT_TIMESTAMP(3),
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $4
        `,
        [changeId, closureSummary, effectivenessResult, req.authContext.orgId]
      );

      const closedChange = await fetchChangeRecord(client, req.authContext.orgId, changeId);
      if (!closedChange) {
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

      return closedChange;
    });

    return res.json({ change: closed });
  } catch (error) {
    return next(error);
  }
});

changeControlRouter.post('/:changeId/reopen', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { changeId } = req.params;
    const { reason } = req.body || {};
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const change = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE cc_change_records
          SET
            status = 'Reopened',
            reopened_reason = $2,
            reopened_at = CURRENT_TIMESTAMP(3),
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $3
        `,
        [changeId, reason, req.authContext.orgId]
      );

      const reopened = await fetchChangeRecord(client, req.authContext.orgId, changeId);
      if (!reopened) {
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

      return reopened;
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
            AND org_id = $2
          ORDER BY occurred_at DESC
        `,
        [changeId, req.authContext.orgId]
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
            AND org_id = $2
          LIMIT 1
        `,
        [changeId, req.authContext.orgId]
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
              AND org_id = $2
            LIMIT 1
          `,
          [changeId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT *
            FROM cc_approval_records
            WHERE change_id = $1
              AND org_id = $2
            ORDER BY decided_at DESC
          `,
          [changeId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT *
            FROM cc_implementation_steps
            WHERE change_id = $1
              AND org_id = $2
            ORDER BY step_no ASC
          `,
          [changeId, req.authContext.orgId]
        ),
        client.query(
          `
            SELECT *
            FROM cc_history_events
            WHERE change_id = $1
              AND org_id = $2
            ORDER BY occurred_at DESC
          `,
          [changeId, req.authContext.orgId]
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
          [changeId, req.authContext.orgId]
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
            COUNT(s.id) AS total_steps,
            COALESCE(SUM(CASE WHEN s.step_status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed_steps
          FROM cc_change_records c
          LEFT JOIN cc_implementation_steps s ON s.change_id = c.id AND s.org_id = c.org_id
          WHERE c.org_id = $1
          GROUP BY c.id
          ORDER BY c.created_at DESC
          LIMIT 200
        `,
        [req.authContext.orgId]
      );
      // COUNT/SUM are bigint and numeric in PostgreSQL, both of which
      // node-postgres returns as JS strings. The dropped ::int casts used to
      // do this coercion in SQL.
      return rows.map((row) => ({
        ...row,
        total_steps: Number(row.total_steps || 0),
        completed_steps: Number(row.completed_steps || 0)
      }));
    });

    return res.json({ changes });
  } catch (error) {
    return next(error);
  }
});
