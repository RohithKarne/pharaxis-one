import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { createInAppNotification, queueEmailNotification } from '../services/platform/notificationService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const capaRouter = Router();

const VALID_SOURCE_TYPES = new Set([
  'Deviation',
  'AuditFinding',
  'Manual',
  'Complaint',
  'ChangeControl',
  'DocumentControl',
  'Validation'
]);
const VALID_CLASSIFICATIONS = new Set(['Corrective', 'Preventive', 'Both']);
const VALID_ACTION_TYPES = new Set(['Corrective', 'Preventive']);
const VALID_ACTION_STATUSES = new Set(['NotStarted', 'InProgress', 'Complete']);
const VALID_EFFECTIVENESS_RESULT = new Set(['Pass', 'Fail']);
const VALID_APPROVAL_STAGES = new Set(['ActionPlan', 'Closure']);
const VALID_APPROVAL_DECISIONS = new Set(['Approve', 'Reject']);

const STATUS = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  Investigation: 'Investigation',
  ActionPlanApproval: 'ActionPlanApproval',
  InExecution: 'InExecution',
  EffectivenessPending: 'EffectivenessPending',
  Closed: 'Closed',
  Reopened: 'Reopened'
};

function makeError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hasRole(authRoles, roleKey) {
  return Array.isArray(authRoles) && authRoles.includes(roleKey);
}

function hasAnyRole(authRoles, roleKeys) {
  return Array.isArray(authRoles) && roleKeys.some((role) => authRoles.includes(role));
}

function assertRole(req, roleKeys, errorMessage = 'Insufficient permissions for this action') {
  if (!hasAnyRole(req.authContext.roles, roleKeys)) {
    throw makeError(errorMessage, 403);
  }
}

function normalizeRiskFactor(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw makeError('severity, occurrence, and detectability must be integer values between 1 and 5');
  }
  return parsed;
}

function calculateRiskBand(score) {
  if (!score) return null;
  if (score <= 20) return 'Low';
  if (score <= 60) return 'Medium';
  if (score <= 100) return 'High';
  return 'Critical';
}

function calculateRiskPayload({ severity, occurrence, detectability }) {
  if (!severity || !occurrence || !detectability) {
    return {
      severity: severity || null,
      occurrence: occurrence || null,
      detectability: detectability || null,
      riskScore: null,
      riskBand: null
    };
  }

  const riskScore = severity * occurrence * detectability;
  return {
    severity,
    occurrence,
    detectability,
    riskScore,
    riskBand: calculateRiskBand(riskScore)
  };
}

async function getCapaRecord(client, capaId, { forUpdate = false } = {}) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM ca_capa_records
      WHERE id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}
      LIMIT 1
    `,
    [capaId]
  );

  return rows[0] || null;
}

async function appendCapaHistory(client, {
  orgId,
  capaId,
  actionKey,
  actorUserId,
  payloadJson = {}
}) {
  await client.query(
    `
      INSERT INTO ca_history_events (org_id, capa_id, action_key, actor_user_id, payload_json)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [orgId, capaId, actionKey, actorUserId, payloadJson]
  );
}

async function appendCapaAudit(client, {
  orgId,
  entityTable,
  entityId,
  actionKey,
  actorUserId,
  payloadJson
}) {
  await appendAuditEvent(client, {
    orgId,
    moduleKey: 'capa',
    entityTable,
    entityId,
    actionKey,
    actorUserId,
    payloadJson
  });
}

function assertNotClosed(capa) {
  if (capa.status === STATUS.Closed) {
    throw makeError('Closed CAPA cannot be modified. Use reopen flow first.', 400);
  }
}

function assertCanModifyCapa(req, capa) {
  const privileged = hasAnyRole(req.authContext.roles, ['admin', 'superadmin', 'qa_reviewer']);
  const isOwner = capa.owner_user_id === req.authContext.userId;
  const isCreator = capa.created_by === req.authContext.userId;

  if (!privileged && !isOwner && !isCreator) {
    throw makeError('Only owner, creator, or admin roles can modify this CAPA', 403);
  }
}

capaRouter.post('/', async (req, res, next) => {
  try {
    const {
      title,
      sourceType = 'Manual',
      sourceRefId = null,
      classification = 'Corrective',
      ownerUserId,
      dueDate,
      department = null,
      productName = null,
      batchLotNo = null,
      severity,
      occurrence,
      detectability
    } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!VALID_SOURCE_TYPES.has(sourceType)) {
      return res.status(400).json({ error: 'Invalid sourceType value' });
    }
    if (!VALID_CLASSIFICATIONS.has(classification)) {
      return res.status(400).json({ error: 'Invalid classification value' });
    }

    const capa = await req.withRlsTransaction(async (client) => {
      const ownerId = ownerUserId || req.authContext.userId;
      const riskPayload = calculateRiskPayload({
        severity: normalizeRiskFactor(severity),
        occurrence: normalizeRiskFactor(occurrence),
        detectability: normalizeRiskFactor(detectability)
      });

      const { rows } = await client.query(
        `
          INSERT INTO ca_capa_records (
            org_id,
            capa_code,
            title,
            source_type,
            source_ref_id,
            classification,
            status,
            owner_user_id,
            due_date,
            department,
            product_name,
            batch_lot_no,
            severity,
            occurrence,
            detectability,
            risk_score,
            risk_band,
            created_by
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18
          )
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('CAPA', title),
          title,
          sourceType,
          sourceRefId,
          classification,
          STATUS.Draft,
          ownerId,
          asDateString(dueDate),
          department,
          productName,
          batchLotNo,
          riskPayload.severity,
          riskPayload.occurrence,
          riskPayload.detectability,
          riskPayload.riskScore,
          riskPayload.riskBand,
          req.authContext.userId
        ]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId: rows[0].id,
        actionKey: 'capa_created',
        actorUserId: req.authContext.userId,
        payloadJson: {
          sourceType,
          classification,
          riskBand: riskPayload.riskBand
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_capa_records',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          sourceType,
          classification,
          riskScore: riskPayload.riskScore,
          riskBand: riskPayload.riskBand
        }
      });

      return rows[0];
    });

    return res.status(201).json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.patch('/:capaId', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const {
      title,
      sourceType,
      sourceRefId,
      classification,
      ownerUserId,
      dueDate,
      department,
      productName,
      batchLotNo,
      rootCauseSummary,
      triageSummary,
      investigationSummary,
      closureSummary,
      severity,
      occurrence,
      detectability
    } = req.body || {};

    const capa = await req.withRlsTransaction(async (client) => {
      const current = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!current) throw makeError('CAPA not found', 404);

      assertNotClosed(current);
      assertCanModifyCapa(req, current);

      const nextSourceType = sourceType ?? current.source_type;
      const nextClassification = classification ?? current.classification;

      if (!VALID_SOURCE_TYPES.has(nextSourceType)) {
        throw makeError('Invalid sourceType value');
      }
      if (!VALID_CLASSIFICATIONS.has(nextClassification)) {
        throw makeError('Invalid classification value');
      }

      const nextSeverity = normalizeRiskFactor(severity, current.severity);
      const nextOccurrence = normalizeRiskFactor(occurrence, current.occurrence);
      const nextDetectability = normalizeRiskFactor(detectability, current.detectability);
      const riskPayload = calculateRiskPayload({
        severity: nextSeverity,
        occurrence: nextOccurrence,
        detectability: nextDetectability
      });

      const nextDueDate =
        dueDate === null
          ? null
          : dueDate
            ? asDateString(dueDate)
            : current.due_date;

      const { rows } = await client.query(
        `
          UPDATE ca_capa_records
          SET
            title = $2,
            source_type = $3,
            source_ref_id = $4,
            classification = $5,
            owner_user_id = $6,
            due_date = $7,
            department = $8,
            product_name = $9,
            batch_lot_no = $10,
            root_cause_summary = $11,
            triage_summary = $12,
            investigation_summary = $13,
            closure_summary = $14,
            severity = $15,
            occurrence = $16,
            detectability = $17,
            risk_score = $18,
            risk_band = $19,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          capaId,
          title ?? current.title,
          nextSourceType,
          sourceRefId ?? current.source_ref_id,
          nextClassification,
          ownerUserId ?? current.owner_user_id,
          nextDueDate,
          department ?? current.department,
          productName ?? current.product_name,
          batchLotNo ?? current.batch_lot_no,
          rootCauseSummary ?? current.root_cause_summary,
          triageSummary ?? current.triage_summary,
          investigationSummary ?? current.investigation_summary,
          closureSummary ?? current.closure_summary,
          riskPayload.severity,
          riskPayload.occurrence,
          riskPayload.detectability,
          riskPayload.riskScore,
          riskPayload.riskBand
        ]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_updated',
        actorUserId: req.authContext.userId,
        payloadJson: {
          sourceType: nextSourceType,
          classification: nextClassification,
          riskBand: riskPayload.riskBand
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_capa_records',
        entityId: capaId,
        actionKey: 'update',
        actorUserId: req.authContext.userId,
        payloadJson: {
          sourceType: nextSourceType,
          classification: nextClassification,
          riskScore: riskPayload.riskScore,
          riskBand: riskPayload.riskBand
        }
      });

      return rows[0];
    });

    return res.json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/submit', async (req, res, next) => {
  try {
    const { capaId } = req.params;

    const capa = await req.withRlsTransaction(async (client) => {
      const current = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!current) throw makeError('CAPA not found', 404);

      assertNotClosed(current);
      assertCanModifyCapa(req, current);

      if (![STATUS.Draft, STATUS.Reopened].includes(current.status)) {
        throw makeError('CAPA can be submitted only from Draft or Reopened status');
      }

      const { rows } = await client.query(
        `
          UPDATE ca_capa_records
          SET status = $2, submitted_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId, STATUS.Submitted]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_submitted',
        actorUserId: req.authContext.userId,
        payloadJson: { fromStatus: current.status }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_capa_records',
        entityId: capaId,
        actionKey: 'submit',
        actorUserId: req.authContext.userId,
        payloadJson: { fromStatus: current.status, toStatus: STATUS.Submitted }
      });

      return rows[0];
    });

    return res.json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/triage', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const { triageSummary = null, ownerUserId = null } = req.body || {};

    assertRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const capa = await req.withRlsTransaction(async (client) => {
      const current = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!current) throw makeError('CAPA not found', 404);
      assertNotClosed(current);

      if (![STATUS.Submitted, STATUS.Reopened, STATUS.Draft].includes(current.status)) {
        throw makeError('CAPA can be triaged only from Submitted, Reopened, or Draft status');
      }

      const { rows } = await client.query(
        `
          UPDATE ca_capa_records
          SET
            status = $2,
            triaged_at = now(),
            triage_summary = $3,
            owner_user_id = COALESCE($4, owner_user_id),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId, STATUS.Investigation, triageSummary, ownerUserId]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_triaged',
        actorUserId: req.authContext.userId,
        payloadJson: {
          fromStatus: current.status,
          toStatus: STATUS.Investigation,
          ownerUserId: ownerUserId || current.owner_user_id
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_capa_records',
        entityId: capaId,
        actionKey: 'triage',
        actorUserId: req.authContext.userId,
        payloadJson: {
          fromStatus: current.status,
          toStatus: STATUS.Investigation
        }
      });

      return rows[0];
    });

    return res.json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/rca/5why', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const { entries, whyLevel, answer } = req.body || {};

    const normalizedEntries = Array.isArray(entries)
      ? entries
      : whyLevel && answer
        ? [{ whyLevel, answer }]
        : [];

    if (normalizedEntries.length === 0) {
      return res.status(400).json({ error: 'Provide entries array or whyLevel with answer' });
    }

    const fiveWhys = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);
      assertCanModifyCapa(req, capa);

      for (const item of normalizedEntries) {
        const level = Number(item.whyLevel);
        if (!Number.isInteger(level) || level < 1 || level > 5) {
          throw makeError('whyLevel must be between 1 and 5');
        }
        if (!item.answer) {
          throw makeError('answer is required for each 5-Why entry');
        }

        await client.query(
          `
            INSERT INTO ca_root_cause_5why (org_id, capa_id, why_level, answer, created_by)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (capa_id, why_level)
            DO UPDATE SET
              answer = EXCLUDED.answer,
              created_by = EXCLUDED.created_by,
              created_at = now()
          `,
          [req.authContext.orgId, capaId, level, item.answer, req.authContext.userId]
        );
      }

      const { rows } = await client.query(
        `
          SELECT *
          FROM ca_root_cause_5why
          WHERE capa_id = $1
          ORDER BY why_level ASC
        `,
        [capaId]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_rca_5why_upserted',
        actorUserId: req.authContext.userId,
        payloadJson: { count: normalizedEntries.length }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_root_cause_5why',
        entityId: capaId,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: { count: normalizedEntries.length }
      });

      return rows;
    });

    return res.status(201).json({ fiveWhys });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/rca/fishbone', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const { entries, category, cause } = req.body || {};

    const normalizedEntries = Array.isArray(entries)
      ? entries
      : category && cause
        ? [{ category, cause }]
        : [];

    if (normalizedEntries.length === 0) {
      return res.status(400).json({ error: 'Provide entries array or category with cause' });
    }

    const fishbone = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);
      assertCanModifyCapa(req, capa);

      for (const item of normalizedEntries) {
        if (!item.category || !item.cause) {
          throw makeError('category and cause are required for each fishbone entry');
        }
        await client.query(
          `
            INSERT INTO ca_root_cause_fishbone (org_id, capa_id, category, cause, created_by)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [req.authContext.orgId, capaId, item.category, item.cause, req.authContext.userId]
        );
      }

      const { rows } = await client.query(
        `
          SELECT *
          FROM ca_root_cause_fishbone
          WHERE capa_id = $1
          ORDER BY created_at DESC
        `,
        [capaId]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_rca_fishbone_added',
        actorUserId: req.authContext.userId,
        payloadJson: { count: normalizedEntries.length }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_root_cause_fishbone',
        entityId: capaId,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { count: normalizedEntries.length }
      });

      return rows;
    });

    return res.status(201).json({ fishbone });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/actions', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const {
      description,
      actionType = 'Corrective',
      assignedOwnerUserId,
      dueDate
    } = req.body || {};

    if (!description || !dueDate) {
      return res.status(400).json({ error: 'description and dueDate are required' });
    }

    if (!VALID_ACTION_TYPES.has(actionType)) {
      return res.status(400).json({ error: 'actionType must be Corrective or Preventive' });
    }

    const action = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);
      assertCanModifyCapa(req, capa);

      const owner = assignedOwnerUserId || capa.owner_user_id;

      const { rows } = await client.query(
        `
          INSERT INTO ca_action_items (
            org_id,
            capa_id,
            action_type,
            description,
            assigned_owner_user_id,
            due_date,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'NotStarted')
          RETURNING *
        `,
        [req.authContext.orgId, capaId, actionType, description, owner, asDateString(dueDate)]
      );

      if ([STATUS.Submitted, STATUS.Draft, STATUS.Reopened].includes(capa.status)) {
        await client.query(
          `
            UPDATE ca_capa_records
            SET status = $2, updated_at = now()
            WHERE id = $1
          `,
          [capaId, STATUS.Investigation]
        );
      }

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_action_created',
        actorUserId: req.authContext.userId,
        payloadJson: {
          actionId: rows[0].id,
          actionType,
          dueDate: asDateString(dueDate)
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_action_items',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          capaId,
          actionType,
          dueDate: asDateString(dueDate)
        }
      });

      return rows[0];
    });

    return res.status(201).json({ actionItem: action });
  } catch (error) {
    return next(error);
  }
});

capaRouter.patch('/:capaId/actions/:actionId', async (req, res, next) => {
  try {
    const { capaId, actionId } = req.params;
    const {
      status,
      dueDate,
      completionEvidenceRef,
      completionNotes
    } = req.body || {};

    if (!status && !dueDate && completionEvidenceRef === undefined && completionNotes === undefined) {
      return res.status(400).json({ error: 'At least one update field is required' });
    }

    if (status && !VALID_ACTION_STATUSES.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${Array.from(VALID_ACTION_STATUSES).join(', ')}` });
    }

    const updated = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);
      assertCanModifyCapa(req, capa);

      const { rows: actionRows } = await client.query(
        `
          SELECT *
          FROM ca_action_items
          WHERE id = $1 AND capa_id = $2
          FOR UPDATE
        `,
        [actionId, capaId]
      );

      const current = actionRows[0];
      if (!current) {
        throw makeError('Action item not found', 404);
      }

      const nextStatus = status || current.status;
      const nextDueDate = dueDate ? asDateString(dueDate) : current.due_date;

      const { rows } = await client.query(
        `
          UPDATE ca_action_items
          SET
            status = $3,
            due_date = $4,
            completion_evidence_ref = $5,
            completion_notes = $6,
            completed_at = CASE WHEN $3 = 'Complete' THEN now() ELSE NULL END,
            updated_at = now()
          WHERE id = $1 AND capa_id = $2
          RETURNING *
        `,
        [
          actionId,
          capaId,
          nextStatus,
          nextDueDate,
          completionEvidenceRef ?? current.completion_evidence_ref,
          completionNotes ?? current.completion_notes
        ]
      );

      if (nextStatus !== 'Complete') {
        const isOverdue = rows[0].due_date && new Date(rows[0].due_date) < new Date();
        if (isOverdue) {
          await client.query(
            `
              INSERT INTO ca_escalations (org_id, capa_id, action_item_id, reason)
              VALUES ($1, $2, $3, $4)
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

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_action_updated',
        actorUserId: req.authContext.userId,
        payloadJson: {
          actionId,
          fromStatus: current.status,
          toStatus: nextStatus
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_action_items',
        entityId: actionId,
        actionKey: 'update',
        actorUserId: req.authContext.userId,
        payloadJson: {
          fromStatus: current.status,
          toStatus: nextStatus
        }
      });

      return rows[0];
    });

    return res.json({ actionItem: updated });
  } catch (error) {
    return next(error);
  }
});

capaRouter.patch('/:capaId/actions/:actionId/status', async (req, res, next) => {
  try {
    const { capaId, actionId } = req.params;
    const { status } = req.body || {};

    if (!status || !VALID_ACTION_STATUSES.has(status)) {
      return res.status(400).json({
        error: `status must be one of: ${Array.from(VALID_ACTION_STATUSES).join(', ')}`
      });
    }

    const updated = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);
      assertCanModifyCapa(req, capa);

      const { rows: actionRows } = await client.query(
        `
          SELECT *
          FROM ca_action_items
          WHERE id = $1 AND capa_id = $2
          FOR UPDATE
        `,
        [actionId, capaId]
      );

      const current = actionRows[0];
      if (!current) throw makeError('Action item not found', 404);

      const { rows } = await client.query(
        `
          UPDATE ca_action_items
          SET
            status = $3,
            completed_at = CASE WHEN $3 = 'Complete' THEN now() ELSE NULL END,
            updated_at = now()
          WHERE id = $1 AND capa_id = $2
          RETURNING *
        `,
        [actionId, capaId, status]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_action_updated',
        actorUserId: req.authContext.userId,
        payloadJson: {
          actionId,
          fromStatus: current.status,
          toStatus: status
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_action_items',
        entityId: actionId,
        actionKey: 'update',
        actorUserId: req.authContext.userId,
        payloadJson: {
          fromStatus: current.status,
          toStatus: status
        }
      });

      return rows[0];
    });

    return res.json({ actionItem: updated });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/approve', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const {
      stage,
      decision,
      comments = null,
      approverUserId = req.authContext.userId,
      signatureId = null
    } = req.body || {};

    if (!VALID_APPROVAL_STAGES.has(stage)) {
      return res.status(400).json({ error: 'stage must be ActionPlan or Closure' });
    }
    if (!VALID_APPROVAL_DECISIONS.has(decision)) {
      return res.status(400).json({ error: 'decision must be Approve or Reject' });
    }

    assertRole(req, ['approver', 'qa_reviewer', 'admin', 'superadmin']);

    const payload = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);

      let nextStatus = capa.status;
      if (stage === 'ActionPlan') {
        if (![STATUS.Investigation, STATUS.ActionPlanApproval, 'PlanApproval', 'InProgress'].includes(capa.status)) {
          throw makeError('Action plan approval is allowed only from investigation states');
        }
        nextStatus = decision === 'Approve' ? STATUS.InExecution : STATUS.Investigation;
      }

      if (stage === 'Closure') {
        if (decision === 'Approve' && capa.created_by && capa.created_by === approverUserId) {
          throw makeError('Segregation rule violation: creator cannot perform final approval on same CAPA', 403);
        }

        if (decision === 'Approve') {
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
            throw makeError('Closure approval requires a passing effectiveness check', 400);
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
            throw makeError('Closure approval requires all CAPA actions to be complete', 400);
          }

          nextStatus = STATUS.Closed;
        } else {
          nextStatus = STATUS.InExecution;
        }
      }

      const { rows: approvalRows } = await client.query(
        `
          INSERT INTO ca_approvals (
            org_id,
            capa_id,
            stage,
            decision,
            comments,
            approver_user_id,
            signature_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [req.authContext.orgId, capaId, stage, decision, comments, approverUserId, signatureId]
      );

      const { rows: capaRows } = await client.query(
        `
          UPDATE ca_capa_records
          SET
            status = $2,
            action_plan_approved_at = CASE
              WHEN $3 = 'ActionPlan' AND $4 = 'Approve' THEN now()
              ELSE action_plan_approved_at
            END,
            closed_at = CASE
              WHEN $3 = 'Closure' AND $4 = 'Approve' THEN now()
              ELSE closed_at
            END,
            closed_by = CASE
              WHEN $3 = 'Closure' AND $4 = 'Approve' THEN $5
              ELSE closed_by
            END,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId, nextStatus, stage, decision, approverUserId]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_approval_recorded',
        actorUserId: req.authContext.userId,
        payloadJson: {
          stage,
          decision,
          fromStatus: capa.status,
          toStatus: nextStatus
        }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_approvals',
        entityId: approvalRows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          capaId,
          stage,
          decision,
          toStatus: nextStatus
        }
      });

      return {
        approval: approvalRows[0],
        capa: capaRows[0]
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/effectiveness', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const {
      criteria,
      method = null,
      sampleSize = null,
      observedResult = null,
      evidenceRef = null,
      result
    } = req.body || {};

    if (!result || !VALID_EFFECTIVENESS_RESULT.has(result)) {
      return res.status(400).json({ error: 'result must be Pass or Fail' });
    }

    const payload = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!capa) throw makeError('CAPA not found', 404);
      assertNotClosed(capa);
      assertCanModifyCapa(req, capa);

      const derivedCriteria = criteria || method || 'Effectiveness review';

      const criteriaText = [
        derivedCriteria,
        method ? `method=${method}` : null,
        sampleSize ? `sampleSize=${sampleSize}` : null,
        observedResult ? `observed=${observedResult}` : null
      ]
        .filter(Boolean)
        .join(' | ');

      const { rows: checkRows } = await client.query(
        `
          INSERT INTO ca_effectiveness_checks (
            org_id,
            capa_id,
            criteria,
            evidence_ref,
            result,
            checked_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [req.authContext.orgId, capaId, criteriaText, evidenceRef, result, req.authContext.userId]
      );

      const nextStatus = result === 'Pass' ? STATUS.EffectivenessPending : STATUS.InExecution;

      const { rows: capaRows } = await client.query(
        `
          UPDATE ca_capa_records
          SET
            effectiveness_result = $2,
            effective_verified_at = now(),
            status = $3,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId, result, nextStatus]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_effectiveness_recorded',
        actorUserId: req.authContext.userId,
        payloadJson: { result, toStatus: nextStatus }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_effectiveness_checks',
        entityId: checkRows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          capaId,
          result,
          toStatus: nextStatus
        }
      });

      return {
        effectivenessCheck: checkRows[0],
        capa: capaRows[0]
      };
    });

    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/close', async (req, res, next) => {
  try {
    const { capaId } = req.params;

    const capa = await req.withRlsTransaction(async (client) => {
      const current = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!current) throw makeError('CAPA not found', 404);

      if (current.created_by && current.created_by === req.authContext.userId) {
        throw makeError('Segregation rule violation: creator cannot perform final approval on same CAPA', 403);
      }

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
        throw makeError('CAPA cannot be closed until effectiveness result is Pass', 400);
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
        throw makeError('All CAPA actions must be complete before closure', 400);
      }

      await client.query(
        `
          INSERT INTO ca_approvals (
            org_id,
            capa_id,
            stage,
            decision,
            comments,
            approver_user_id
          )
          VALUES ($1, $2, 'Closure', 'Approve', 'Closed via compatibility endpoint', $3)
        `,
        [req.authContext.orgId, capaId, req.authContext.userId]
      );

      const { rows } = await client.query(
        `
          UPDATE ca_capa_records
          SET status = 'Closed', closed_at = now(), closed_by = $2, updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId, req.authContext.userId]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_closed',
        actorUserId: req.authContext.userId,
        payloadJson: {}
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_capa_records',
        entityId: capaId,
        actionKey: 'close',
        actorUserId: req.authContext.userId,
        payloadJson: {}
      });

      return rows[0];
    });

    return res.json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.post('/:capaId/reopen', async (req, res, next) => {
  try {
    const { capaId } = req.params;
    const { reason } = req.body || {};

    if (!reason) {
      return res.status(400).json({ error: 'reason is required to reopen CAPA' });
    }

    assertRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const capa = await req.withRlsTransaction(async (client) => {
      const current = await getCapaRecord(client, capaId, { forUpdate: true });
      if (!current) throw makeError('CAPA not found', 404);

      if (![STATUS.Closed, STATUS.EffectivenessPending].includes(current.status)) {
        throw makeError('CAPA can be reopened only from Closed or EffectivenessPending status');
      }

      const { rows } = await client.query(
        `
          UPDATE ca_capa_records
          SET
            status = $2,
            reopened_reason = $3,
            reopened_at = now(),
            closed_at = NULL,
            closed_by = NULL,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [capaId, STATUS.Reopened, reason]
      );

      await appendCapaHistory(client, {
        orgId: req.authContext.orgId,
        capaId,
        actionKey: 'capa_reopened',
        actorUserId: req.authContext.userId,
        payloadJson: { reason }
      });

      await appendCapaAudit(client, {
        orgId: req.authContext.orgId,
        entityTable: 'ca_capa_records',
        entityId: capaId,
        actionKey: 'reopen',
        actorUserId: req.authContext.userId,
        payloadJson: { reason }
      });

      return rows[0];
    });

    return res.json({ capa });
  } catch (error) {
    return next(error);
  }
});

capaRouter.get('/:capaId/timeline', async (req, res, next) => {
  try {
    const { capaId } = req.params;

    const timeline = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            h.id,
            h.action_key,
            h.payload_json,
            h.occurred_at,
            u.id AS actor_user_id,
            u.full_name AS actor_name,
            u.email::text AS actor_email
          FROM ca_history_events h
          LEFT JOIN qms_users u ON u.id = h.actor_user_id
          WHERE h.capa_id = $1
          ORDER BY h.occurred_at DESC, h.id DESC
          LIMIT 500
        `,
        [capaId]
      );
      return rows;
    });

    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

capaRouter.get('/:capaId', async (req, res, next) => {
  try {
    const { capaId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const capa = await getCapaRecord(client, capaId);
      if (!capa) throw makeError('CAPA not found', 404);

      const [actions, fiveWhys, fishbone, effectiveness, approvals, timeline] = await Promise.all([
        client.query(
          `
            SELECT *
            FROM ca_action_items
            WHERE capa_id = $1
            ORDER BY created_at ASC
          `,
          [capaId]
        ),
        client.query(
          `
            SELECT *
            FROM ca_root_cause_5why
            WHERE capa_id = $1
            ORDER BY why_level ASC
          `,
          [capaId]
        ),
        client.query(
          `
            SELECT *
            FROM ca_root_cause_fishbone
            WHERE capa_id = $1
            ORDER BY created_at DESC
          `,
          [capaId]
        ),
        client.query(
          `
            SELECT *
            FROM ca_effectiveness_checks
            WHERE capa_id = $1
            ORDER BY checked_at DESC
          `,
          [capaId]
        ),
        client.query(
          `
            SELECT *
            FROM ca_approvals
            WHERE capa_id = $1
            ORDER BY decided_at DESC
          `,
          [capaId]
        ),
        client.query(
          `
            SELECT
              h.id,
              h.action_key,
              h.payload_json,
              h.occurred_at,
              u.full_name AS actor_name,
              u.email::text AS actor_email
            FROM ca_history_events h
            LEFT JOIN qms_users u ON u.id = h.actor_user_id
            WHERE h.capa_id = $1
            ORDER BY h.occurred_at DESC, h.id DESC
            LIMIT 300
          `,
          [capaId]
        )
      ]);

      return {
        capa,
        actionItems: actions.rows,
        fiveWhys: fiveWhys.rows,
        fishbone: fishbone.rows,
        effectivenessChecks: effectiveness.rows,
        approvals: approvals.rows,
        timeline: timeline.rows
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

capaRouter.get('/', async (req, res, next) => {
  try {
    const { status, ownerUserId, riskBand, q } = req.query;

    const capas = await req.withRlsTransaction(async (client) => {
      const clauses = [];
      const params = [];

      if (status) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }

      if (ownerUserId) {
        params.push(ownerUserId);
        clauses.push(`owner_user_id = $${params.length}`);
      }

      if (riskBand) {
        params.push(riskBand);
        clauses.push(`risk_band = $${params.length}`);
      }

      if (q) {
        params.push(`%${String(q).trim()}%`);
        clauses.push(`(title ILIKE $${params.length} OR capa_code ILIKE $${params.length})`);
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

      const { rows } = await client.query(
        `
          SELECT *
          FROM ca_capa_records
          ${where}
          ORDER BY updated_at DESC
          LIMIT 300
        `,
        params
      );

      return rows;
    });

    return res.json({ capas });
  } catch (error) {
    return next(error);
  }
});
