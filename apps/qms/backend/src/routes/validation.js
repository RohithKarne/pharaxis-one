import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { createInAppNotification } from '../services/platform/notificationService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { asDateString } from '../utils/codegen.js';

export const validationRouter = Router();

const validRiskLevels = new Set(['High', 'Medium', 'Low']);
const validGamp = new Set(['1', '3', '4', '5']);
const validTraceStatus = new Set(['Pending', 'InProgress', 'Pass', 'Fail']);

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
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
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

      const { rows } = await client.query(
        `
          INSERT INTO vs_system_inventory (
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Planned', $10, $11)
          RETURNING *
        `,
        [
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

      await client.query(
        `
          INSERT INTO vs_periodic_reviews (org_id, system_id, due_date)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [req.authContext.orgId, rows[0].id, due]
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
      const { rows } = await client.query(
        `
          INSERT INTO vs_requirement_specs (
            org_id,
            system_id,
            requirement_code,
            requirement_type,
            description,
            risk_level,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          systemId,
          requirementCode,
          requirementType,
          description,
          riskLevel,
          req.authContext.userId
        ]
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
      const { rows } = await client.query(
        `
          INSERT INTO vs_trace_matrix_entries (
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (requirement_id, COALESCE(step_id, '00000000-0000-0000-0000-000000000000'::uuid))
          DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            protocol_instance_id = EXCLUDED.protocol_instance_id,
            script_id = EXCLUDED.script_id,
            step_id = EXCLUDED.step_id,
            trace_status = EXCLUDED.trace_status,
            notes = EXCLUDED.notes,
            updated_at = now()
          RETURNING *
        `,
        [
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
      const { rows } = await client.query(
        `
          INSERT INTO vs_validation_plans (
            org_id, system_id, scope, approach, responsibilities, protocol_types, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6::text[], 'Draft', $7)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          systemId,
          scope,
          approach || null,
          responsibilities || null,
          protocolTypes || ['IQ', 'OQ', 'PQ', 'UAT'],
          req.authContext.userId
        ]
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
          LIMIT 1
        `,
        [planId]
      );
      if (!planRows[0]) {
        const error = new Error('Validation plan not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows } = await client.query(
        `
          INSERT INTO vs_protocol_instances (
            org_id,
            plan_id,
            protocol_name,
            status
          ) VALUES ($1, $2, $3, 'Draft')
          RETURNING *
        `,
        [req.authContext.orgId, planId, protocolName]
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
          LIMIT 1
        `,
        [protocolId]
      );
      if (!protocolRows[0]) {
        const error = new Error('Protocol not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: scripts } = await client.query(
        `
          INSERT INTO vs_test_scripts (org_id, protocol_instance_id, script_name)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [req.authContext.orgId, protocolId, scriptName]
      );

      const { rows: steps } = await client.query(
        `
          INSERT INTO vs_test_script_steps (
            org_id,
            script_id,
            step_no,
            expected_result,
            outcome
          ) VALUES ($1, $2, 1, $3, 'N/A')
          RETURNING *
        `,
        [req.authContext.orgId, scripts[0].id, expectedResult]
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
      const { rows } = await client.query(
        `
          UPDATE vs_test_script_steps
          SET
            actual_result = $2,
            outcome = $3,
            evidence_ref = $4,
            executed_by = $5,
            executed_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [stepId, actualResult || null, outcome, evidenceRef || null, req.authContext.userId]
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
          LIMIT 1
        `,
        [stepId]
      );
      const systemId = systemRows[0]?.system_id;

      if (outcome === 'Fail') {
        const { rows: deviations } = await client.query(
          `
            INSERT INTO vs_validation_deviations (
              org_id,
              system_id,
              protocol_step_id,
              deviation_text,
              status
            )
            VALUES ($1, $2, $3, $4, 'Open')
            RETURNING *
          `,
          [
            req.authContext.orgId,
            systemId,
            stepId,
            `Validation step failed: ${actualResult || 'No actual result provided'}`
          ]
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
      const { rows } = await client.query(
        `
          INSERT INTO vs_revalidation_flags (
            org_id,
            system_id,
            change_type,
            is_revalidation_required,
            reason
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, systemId, changeType, isRevalidationRequired, reason || null]
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
    assertRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { systemId, reviewId } = req.params;
    const { notes = null } = req.body || {};

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: reviews } = await client.query(
        `
          SELECT *
          FROM vs_periodic_reviews
          WHERE id = $1 AND system_id = $2
          FOR UPDATE
        `,
        [reviewId, systemId]
      );
      if (!reviews[0]) {
        const error = new Error('Periodic review not found');
        error.statusCode = 404;
        throw error;
      }

      const today = new Date();
      const nextReview = new Date();
      nextReview.setUTCDate(today.getUTCDate() + 365);

      const { rows: insertedRows } = await client.query(
        `
          INSERT INTO vs_periodic_reviews (
            org_id,
            system_id,
            due_date,
            alert_schedule_days
          ) VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          systemId,
          nextReview.toISOString().slice(0, 10),
          reviews[0].alert_schedule_days || [90, 60, 30, 7]
        ]
      );

      await client.query(
        `
          UPDATE vs_system_inventory
          SET next_review_due_date = $2, updated_at = now()
          WHERE id = $1
        `,
        [systemId, nextReview.toISOString().slice(0, 10)]
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
    assertRole(req, ['approver', 'admin', 'superadmin']);

    const { systemId } = req.params;
    const { summary = null } = req.body || {};

    const system = await req.withRlsTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        `
          SELECT id, created_by
          FROM vs_system_inventory
          WHERE id = $1
          FOR UPDATE
        `,
        [systemId]
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

      const { rows } = await client.query(
        `
          UPDATE vs_system_inventory
          SET
            validation_status = 'Validated',
            validated_at = now(),
            validated_by = $2,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [systemId, req.authContext.userId]
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
          ORDER BY occurred_at DESC
        `,
        [systemId]
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
          LIMIT 1
        `,
        [systemId]
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
              ORDER BY created_at DESC
            `,
            [systemId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_validation_plans
              WHERE system_id = $1
              ORDER BY created_at DESC
            `,
            [systemId]
          ),
          client.query(
            `
              SELECT pi.*
              FROM vs_protocol_instances pi
              JOIN vs_validation_plans vp ON vp.id = pi.plan_id
              WHERE vp.system_id = $1
              ORDER BY pi.created_at DESC
            `,
            [systemId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_validation_deviations
              WHERE system_id = $1
              ORDER BY created_at DESC
            `,
            [systemId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_trace_matrix_entries
              WHERE system_id = $1
              ORDER BY updated_at DESC
            `,
            [systemId]
          ),
          client.query(
            `
              SELECT *
              FROM vs_history_events
              WHERE system_id = $1
              ORDER BY occurred_at DESC
            `,
            [systemId]
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
          ORDER BY created_at DESC
          LIMIT 200
        `
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
          ORDER BY created_at DESC
          LIMIT 200
        `
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
      const { rows } = await client.query(
        `
          INSERT INTO vs_validation_summary_reports (
            org_id,
            system_id,
            plan_id,
            status
          )
          VALUES ($1, $2, $3, 'Generated')
          RETURNING *
        `,
        [req.authContext.orgId, systemId, planId || null]
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
