import { Router } from 'express';
import { randomUUID } from 'crypto';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { createInAppNotification } from '../services/platform/notificationService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { asDateString } from '../utils/codegen.js';

export const validationRouter = Router();

const validRiskLevels = new Set(['High', 'Medium', 'Low']);
const validGamp = new Set(['1', '3', '4', '5']);
const validTraceStatus = new Set(['Pending', 'InProgress', 'Pass', 'Fail']);

async function appendValidationHistoryEvent(client, {
  orgId,
  systemId,
  actionKey,
  actorUserId,
  payloadJson = {}
}) {
  await client.query(
    `
      INSERT INTO vs_history_events (
        org_id,
        system_id,
        action_key,
        actor_user_id,
        payload_json
      ) VALUES ($1, $2, $3, $4, $5)
    `,
    [orgId, systemId, actionKey, actorUserId, JSON.stringify(payloadJson)]
  );
}

validationRouter.post('/systems', async (req, res, next) => {
  try {
    const {
      systemName,
      vendor,
      version,
      systemOwnerUserId,
      gampCategory,
      riskLevel,
      validationScope = null,
      complianceImpact = null,
      reviewIntervalDays = 365
    } = req.body || {};

    if (!systemName || !gampCategory || !riskLevel) {
      return res.status(400).json({ error: 'systemName, gampCategory, and riskLevel are required' });
    }
    if (!validGamp.has(String(gampCategory))) {
      return res.status(400).json({ error: 'gampCategory must be one of 1, 3, 4, 5' });
    }
    if (!validRiskLevels.has(riskLevel)) {
      return res.status(400).json({ error: 'riskLevel must be High, Medium, or Low' });
    }

    const system = await req.withRlsTransaction(async (client) => {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() + Number(reviewIntervalDays || 365));
      const due = dt.toISOString().slice(0, 10);

      const systemIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_system_inventory (
            id,
            org_id,
            system_name,
            vendor,
            version,
            system_owner_user_id,
            gamp_category,
            risk_level,
            validation_scope,
            compliance_impact,
            validation_status,
            next_review_due_date,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Planned', $11, $12)
        `,
        [
          systemIdNew,
          req.authContext.orgId,
          systemName,
          vendor || null,
          version || null,
          systemOwnerUserId || null,
          String(gampCategory),
          riskLevel,
          validationScope,
          complianceImpact,
          due,
          req.authContext.userId
        ]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_system_inventory
          WHERE id = $1
            AND org_id = $2
        `,
        [systemIdNew, req.authContext.orgId]
      );

      await client.query(
        `
          INSERT INTO vs_periodic_reviews (org_id, system_id, due_date)
          VALUES ($1, $2, $3)
        `,
        [req.authContext.orgId, systemIdNew, due]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId: rows[0].id,
        actionKey: 'system_create',
        actorUserId: req.authContext.userId,
        payloadJson: {
          gampCategory: String(gampCategory),
          riskLevel,
          due
        }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'validation',
        entityTable: 'vs_system_inventory',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { gampCategory, riskLevel }
      });

      return rows[0];
    });

    return res.status(201).json({ system });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/systems/:systemId/requirements', async (req, res, next) => {
  try {
    const { systemId } = req.params;
    const { requirementCode, requirementType, description, riskLevel = 'Medium' } = req.body || {};

    if (!requirementCode || !requirementType || !description) {
      return res.status(400).json({ error: 'requirementCode, requirementType, and description are required' });
    }
    if (!['URS', 'FS', 'DS', 'CS'].includes(requirementType)) {
      return res.status(400).json({ error: 'requirementType must be URS, FS, DS, or CS' });
    }
    if (!validRiskLevels.has(riskLevel)) {
      return res.status(400).json({ error: 'riskLevel must be High, Medium, or Low' });
    }

    const requirement = await req.withRlsTransaction(async (client) => {
      const requirementIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_requirement_specs (
            id,
            org_id,
            system_id,
            requirement_code,
            requirement_type,
            description,
            risk_level,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          requirementIdNew,
          req.authContext.orgId,
          systemId,
          requirementCode,
          requirementType,
          description,
          riskLevel,
          req.authContext.userId
        ]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_requirement_specs
          WHERE id = $1
            AND org_id = $2
        `,
        [requirementIdNew, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'requirement_create',
        actorUserId: req.authContext.userId,
        payloadJson: { requirementCode, requirementType, riskLevel }
      });

      return rows[0];
    });

    return res.status(201).json({ requirement });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/systems/:systemId/traceability', async (req, res, next) => {
  try {
    const { systemId } = req.params;
    const {
      requirementId,
      planId = null,
      protocolInstanceId = null,
      scriptId = null,
      stepId = null,
      traceStatus = 'Pending',
      notes = null
    } = req.body || {};

    if (!requirementId) {
      return res.status(400).json({ error: 'requirementId is required' });
    }
    if (!validTraceStatus.has(traceStatus)) {
      return res.status(400).json({ error: 'traceStatus must be Pending, InProgress, Pass, or Fail' });
    }

    const entry = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO vs_trace_matrix_entries (
            id,
            org_id,
            system_id,
            requirement_id,
            plan_id,
            protocol_instance_id,
            script_id,
            step_id,
            trace_status,
            notes,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (requirement_id, COALESCE(step_id, '00000000-0000-0000-0000-000000000000'::uuid))
          DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            protocol_instance_id = EXCLUDED.protocol_instance_id,
            script_id = EXCLUDED.script_id,
            step_id = EXCLUDED.step_id,
            trace_status = EXCLUDED.trace_status,
            notes = EXCLUDED.notes,
            updated_at = CURRENT_TIMESTAMP(3)
        `,
        [
          randomUUID(),
          req.authContext.orgId,
          systemId,
          requirementId,
          planId,
          protocolInstanceId,
          scriptId,
          stepId,
          traceStatus,
          notes,
          req.authContext.userId
        ]
      );
      // Keyed on the upsert's natural key, not the generated id: an existing row
      // keeps its own id and the generated one is discarded.
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_trace_matrix_entries
          WHERE requirement_id = $1
            AND (step_id = $2 OR (step_id IS NULL AND $2 IS NULL))
            AND org_id = $3
        `,
        [requirementId, stepId, req.authContext.orgId]
      );

      if (stepId) {
        await appendTraceLink(client, {
          orgId: req.authContext.orgId,
          sourceModule: 'validation',
          sourceTable: 'vs_requirement_specs',
          sourceId: requirementId,
          targetModule: 'validation',
          targetTable: 'vs_test_script_steps',
          targetId: stepId,
          linkType: 'Trace',
          createdBy: req.authContext.userId
        });
      }

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'traceability_upsert',
        actorUserId: req.authContext.userId,
        payloadJson: {
          requirementId,
          stepId,
          traceStatus
        }
      });

      return rows[0];
    });

    return res.status(201).json({ traceEntry: entry });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/systems/:systemId/plans', async (req, res, next) => {
  try {
    const { systemId } = req.params;
    const { scope, approach, responsibilities, protocolTypes } = req.body || {};
    if (!scope) {
      return res.status(400).json({ error: 'scope is required' });
    }

    const plan = await req.withRlsTransaction(async (client) => {
      const planIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_validation_plans (
            id, org_id, system_id, scope, approach, responsibilities, protocol_types, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::text[], 'Draft', $8)
        `,
        [
          planIdNew,
          req.authContext.orgId,
          systemId,
          scope,
          approach || null,
          responsibilities || null,
          protocolTypes || ['IQ', 'OQ', 'PQ', 'UAT'],
          req.authContext.userId
        ]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_validation_plans
          WHERE id = $1
            AND org_id = $2
        `,
        [planIdNew, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'plan_create',
        actorUserId: req.authContext.userId,
        payloadJson: { planId: rows[0].id }
      });

      return rows[0];
    });

    return res.status(201).json({ plan });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/plans/:planId/protocols', async (req, res, next) => {
  try {
    const { planId } = req.params;
    const { protocolName } = req.body || {};
    if (!protocolName) {
      return res.status(400).json({ error: 'protocolName is required' });
    }

    const protocol = await req.withRlsTransaction(async (client) => {
      const { rows: planRows } = await client.query(
        `
          SELECT system_id
          FROM vs_validation_plans
          WHERE id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [planId, req.authContext.orgId]
      );
      if (!planRows[0]) {
        const error = new Error('Validation plan not found');
        error.statusCode = 404;
        throw error;
      }

      const protocolIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_protocol_instances (
            id,
            org_id,
            plan_id,
            protocol_name,
            status
          ) VALUES ($1, $2, $3, $4, 'Draft')
        `,
        [protocolIdNew, req.authContext.orgId, planId, protocolName]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_protocol_instances
          WHERE id = $1
            AND org_id = $2
        `,
        [protocolIdNew, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId: planRows[0].system_id,
        actionKey: 'protocol_create',
        actorUserId: req.authContext.userId,
        payloadJson: { planId, protocolId: rows[0].id }
      });

      return rows[0];
    });

    return res.status(201).json({ protocol });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/protocols/:protocolId/scripts', async (req, res, next) => {
  try {
    const { protocolId } = req.params;
    const { scriptName, expectedResult } = req.body || {};
    if (!scriptName || !expectedResult) {
      return res.status(400).json({ error: 'scriptName and expectedResult are required' });
    }

    const created = await req.withRlsTransaction(async (client) => {
      const { rows: protocolRows } = await client.query(
        `
          SELECT vp.system_id
          FROM vs_protocol_instances pi
          JOIN vs_validation_plans vp ON vp.id = pi.plan_id
          WHERE pi.id = $1
            AND pi.org_id = $2
          LIMIT 1
        `,
        [protocolId, req.authContext.orgId]
      );
      if (!protocolRows[0]) {
        const error = new Error('Protocol not found');
        error.statusCode = 404;
        throw error;
      }

      const scriptIdNew = randomUUID();
      const stepIdNew = randomUUID();

      await client.query(
        `
          INSERT INTO vs_test_scripts (id, org_id, protocol_instance_id, script_name)
          VALUES ($1, $2, $3, $4)
        `,
        [scriptIdNew, req.authContext.orgId, protocolId, scriptName]
      );

      await client.query(
        `
          INSERT INTO vs_test_script_steps (
            id,
            org_id,
            script_id,
            step_no,
            expected_result,
            outcome
          ) VALUES ($1, $2, $3, 1, $4, 'N/A')
        `,
        [stepIdNew, req.authContext.orgId, scriptIdNew, expectedResult]
      );

      const { rows: scripts } = await client.query(
        `
          SELECT *
          FROM vs_test_scripts
          WHERE id = $1
            AND org_id = $2
        `,
        [scriptIdNew, req.authContext.orgId]
      );

      const { rows: steps } = await client.query(
        `
          SELECT *
          FROM vs_test_script_steps
          WHERE id = $1
            AND org_id = $2
        `,
        [stepIdNew, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId: protocolRows[0].system_id,
        actionKey: 'script_create',
        actorUserId: req.authContext.userId,
        payloadJson: { protocolId, scriptId: scripts[0].id, stepId: steps[0].id }
      });

      return { script: scripts[0], step: steps[0] };
    });

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
});

validationRouter.patch('/steps/:stepId/execute', async (req, res, next) => {
  try {
    const { stepId } = req.params;
    const { actualResult, outcome, evidenceRef } = req.body || {};
    if (!outcome || !['Pass', 'Fail', 'N/A'].includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be Pass, Fail, or N/A' });
    }

    const result = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE vs_test_script_steps
          SET
            actual_result = $2,
            outcome = $3,
            evidence_ref = $4,
            executed_by = $5,
            executed_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $6
        `,
        [stepId, actualResult || null, outcome, evidenceRef || null, req.authContext.userId, req.authContext.orgId]
      );

      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_test_script_steps
          WHERE id = $1
            AND org_id = $2
        `,
        [stepId, req.authContext.orgId]
      );

      if (!rows[0]) {
        const error = new Error('Validation step not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: systemRows } = await client.query(
        `
          SELECT si.id AS system_id
          FROM vs_test_script_steps s
          JOIN vs_test_scripts sc ON sc.id = s.script_id
          JOIN vs_protocol_instances pi ON pi.id = sc.protocol_instance_id
          JOIN vs_validation_plans vp ON vp.id = pi.plan_id
          JOIN vs_system_inventory si ON si.id = vp.system_id
          WHERE s.id = $1
            AND s.org_id = $2
          LIMIT 1
        `,
        [stepId, req.authContext.orgId]
      );
      const systemId = systemRows[0]?.system_id;

      if (outcome === 'Fail') {
        const deviationIdNew = randomUUID();
        await client.query(
          `
            INSERT INTO vs_validation_deviations (
              id,
              org_id,
              system_id,
              protocol_step_id,
              deviation_text,
              status
            )
            VALUES ($1, $2, $3, $4, $5, 'Open')
          `,
          [
            deviationIdNew,
            req.authContext.orgId,
            systemId,
            stepId,
            `Validation step failed: ${actualResult || 'No actual result provided'}`
          ]
        );
        const { rows: deviations } = await client.query(
          `
            SELECT *
            FROM vs_validation_deviations
            WHERE id = $1
              AND org_id = $2
          `,
          [deviationIdNew, req.authContext.orgId]
        );

        await appendTraceLink(client, {
          orgId: req.authContext.orgId,
          sourceModule: 'validation',
          sourceTable: 'vs_test_script_steps',
          sourceId: stepId,
          targetModule: 'validation',
          targetTable: 'vs_validation_deviations',
          targetId: deviations[0].id,
          linkType: 'Failure',
          createdBy: req.authContext.userId
        });

        await createInAppNotification(client, {
          orgId: req.authContext.orgId,
          recipientUserId: req.authContext.userId,
          eventType: 'VALIDATION_STEP_FAILED',
          title: 'Validation deviation captured',
          message: 'A validation step failure created a linked validation deviation.',
          payloadJson: { stepId, deviationId: deviations[0].id }
        });
      }

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'step_execute',
        actorUserId: req.authContext.userId,
        payloadJson: {
          stepId,
          outcome
        }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'validation',
        entityTable: 'vs_test_script_steps',
        entityId: stepId,
        actionKey: 'execute',
        actorUserId: req.authContext.userId,
        payloadJson: { outcome }
      });

      return rows[0];
    });

    return res.json({ step: result });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/systems/:systemId/revalidation-flag', async (req, res, next) => {
  try {
    const { systemId } = req.params;
    const { changeType, isRevalidationRequired, reason } = req.body || {};
    if (!changeType || typeof isRevalidationRequired !== 'boolean') {
      return res.status(400).json({
        error: 'changeType and isRevalidationRequired are required'
      });
    }

    const flag = await req.withRlsTransaction(async (client) => {
      const flagIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_revalidation_flags (
            id,
            org_id,
            system_id,
            change_type,
            is_revalidation_required,
            reason
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [flagIdNew, req.authContext.orgId, systemId, changeType, isRevalidationRequired, reason || null]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_revalidation_flags
          WHERE id = $1
            AND org_id = $2
        `,
        [flagIdNew, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'revalidation_flag',
        actorUserId: req.authContext.userId,
        payloadJson: {
          changeType,
          isRevalidationRequired,
          reason: reason || null
        }
      });

      return rows[0];
    });

    return res.status(201).json({ revalidationFlag: flag });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/systems/:systemId/reviews/:reviewId/complete', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { systemId, reviewId } = req.params;
    const { notes = null } = req.body || {};

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: reviews } = await client.query(
        `
          SELECT *
          FROM vs_periodic_reviews
          WHERE id = $1 AND system_id = $2
            AND org_id = $3
          FOR UPDATE
        `,
        [reviewId, systemId, req.authContext.orgId]
      );
      if (!reviews[0]) {
        const error = new Error('Periodic review not found');
        error.statusCode = 404;
        throw error;
      }

      const today = new Date();
      const nextReview = new Date();
      nextReview.setUTCDate(today.getUTCDate() + 365);

      const nextReviewIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_periodic_reviews (
            id,
            org_id,
            system_id,
            due_date,
            alert_schedule_days
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [
          nextReviewIdNew,
          req.authContext.orgId,
          systemId,
          nextReview.toISOString().slice(0, 10),
          reviews[0].alert_schedule_days || [90, 60, 30, 7]
        ]
      );
      const { rows: insertedRows } = await client.query(
        `
          SELECT *
          FROM vs_periodic_reviews
          WHERE id = $1
            AND org_id = $2
        `,
        [nextReviewIdNew, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE vs_system_inventory
          SET next_review_due_date = $2, updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $3
        `,
        [systemId, nextReview.toISOString().slice(0, 10), req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'periodic_review_complete',
        actorUserId: req.authContext.userId,
        payloadJson: {
          completedReviewId: reviewId,
          notes,
          nextReviewId: insertedRows[0].id
        }
      });

      return {
        completedReview: reviews[0],
        nextReview: insertedRows[0]
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/systems/:systemId/complete', async (req, res, next) => {
  try {
    assertAnyRole(req, ['approver', 'admin', 'superadmin']);

    const { systemId } = req.params;
    const { summary = null } = req.body || {};

    const system = await req.withRlsTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `
          SELECT id, created_by
          FROM vs_system_inventory
          WHERE id = $1
            AND org_id = $2
          FOR UPDATE
        `,
        [systemId, req.authContext.orgId]
      );
      const current = currentRows[0];
      if (!current) {
        const error = new Error('Validation system not found');
        error.statusCode = 404;
        throw error;
      }
      if (current.created_by && current.created_by === req.authContext.userId) {
        const error = new Error('Segregation rule violation: creator cannot perform final validation completion');
        error.statusCode = 403;
        throw error;
      }

      await client.query(
        `
          UPDATE vs_system_inventory
          SET
            validation_status = 'Validated',
            validated_at = CURRENT_TIMESTAMP(3),
            validated_by = $2,
            updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $3
        `,
        [systemId, req.authContext.userId, req.authContext.orgId]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_system_inventory
          WHERE id = $1
            AND org_id = $2
        `,
        [systemId, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'validation_complete',
        actorUserId: req.authContext.userId,
        payloadJson: { summary }
      });

      return rows[0];
    });

    return res.json({ system });
  } catch (error) {
    return next(error);
  }
});

validationRouter.get('/systems/:systemId/timeline', async (req, res, next) => {
  try {
    const { systemId } = req.params;

    const timeline = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_history_events
          WHERE system_id = $1
            AND org_id = $2
          ORDER BY occurred_at DESC
        `,
        [systemId, req.authContext.orgId]
      );
      return rows;
    });

    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

validationRouter.get('/systems/:systemId', async (req, res, next) => {
  try {
    const { systemId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: systems } = await client.query(
        `
          SELECT *
          FROM vs_system_inventory
          WHERE id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [systemId, req.authContext.orgId]
      );

      if (!systems[0]) {
        const error = new Error('Validation system not found');
        error.statusCode = 404;
        throw error;
      }

      const [requirementsResult, plansResult, protocolsResult, deviationsResult, traceResult, timelineResult] =
        await Promise.all([
          client.query(
            `
              SELECT *
              FROM vs_requirement_specs
              WHERE system_id = $1
                AND org_id = $2
              ORDER BY created_at DESC
            `,
            [systemId, req.authContext.orgId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_validation_plans
              WHERE system_id = $1
                AND org_id = $2
              ORDER BY created_at DESC
            `,
            [systemId, req.authContext.orgId]
          ),
          client.query(
            `
              SELECT pi.*
              FROM vs_protocol_instances pi
              JOIN vs_validation_plans vp ON vp.id = pi.plan_id
              WHERE vp.system_id = $1
                AND pi.org_id = $2
              ORDER BY pi.created_at DESC
            `,
            [systemId, req.authContext.orgId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_validation_deviations
              WHERE system_id = $1
                AND org_id = $2
              ORDER BY created_at DESC
            `,
            [systemId, req.authContext.orgId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_trace_matrix_entries
              WHERE system_id = $1
                AND org_id = $2
              ORDER BY updated_at DESC
            `,
            [systemId, req.authContext.orgId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_history_events
              WHERE system_id = $1
                AND org_id = $2
              ORDER BY occurred_at DESC
            `,
            [systemId, req.authContext.orgId]
          )
        ]);

      return {
        system: systems[0],
        requirements: requirementsResult.rows,
        plans: plansResult.rows,
        protocols: protocolsResult.rows,
        validationDeviations: deviationsResult.rows,
        traceEntries: traceResult.rows,
        timeline: timelineResult.rows
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

validationRouter.get('/systems', async (req, res, next) => {
  try {
    const systems = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_system_inventory
          WHERE org_id = $1
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [req.authContext.orgId]
      );
      return rows;
    });
    return res.json({ systems });
  } catch (error) {
    return next(error);
  }
});

validationRouter.get('/deviations', async (req, res, next) => {
  try {
    const deviations = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_validation_deviations
          WHERE org_id = $1
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [req.authContext.orgId]
      );
      return rows;
    });
    return res.json({ validationDeviations: deviations });
  } catch (error) {
    return next(error);
  }
});

validationRouter.post('/reports/:systemId/generate-vsr', async (req, res, next) => {
  try {
    const { systemId } = req.params;
    const { planId } = req.body || {};

    const vsr = await req.withRlsTransaction(async (client) => {
      const reportIdNew = randomUUID();
      await client.query(
        `
          INSERT INTO vs_validation_summary_reports (
            id,
            org_id,
            system_id,
            plan_id,
            status
          )
          VALUES ($1, $2, $3, $4, 'Generated')
        `,
        [reportIdNew, req.authContext.orgId, systemId, planId || null]
      );
      const { rows } = await client.query(
        `
          SELECT *
          FROM vs_validation_summary_reports
          WHERE id = $1
            AND org_id = $2
        `,
        [reportIdNew, req.authContext.orgId]
      );

      await appendValidationHistoryEvent(client, {
        orgId: req.authContext.orgId,
        systemId,
        actionKey: 'vsr_generate',
        actorUserId: req.authContext.userId,
        payloadJson: { planId: planId || null, reportId: rows[0].id }
      });

      return rows[0];
    });

    return res.status(201).json({ validationSummaryReport: vsr });
  } catch (error) {
    return next(error);
  }
});
