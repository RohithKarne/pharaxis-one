import { Router } from 'express';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { createInAppNotification } from '../services/platform/notificationService.js';
import { asDateString } from '../utils/codegen.js';

export const validationRouter = Router();

validationRouter.post('/systems', async (req, res, next) => {
  try {
    const {
      systemName,
      vendor,
      version,
      systemOwnerUserId,
      gampCategory,
      riskLevel,
      reviewIntervalDays = 365
    } = req.body || {};

    if (!systemName || !gampCategory || !riskLevel) {
      return res.status(400).json({ error: 'systemName, gampCategory, and riskLevel are required' });
    }

    const system = await req.withRlsTransaction(async (client) => {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() + Number(reviewIntervalDays));
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
            validation_status,
            next_review_due_date,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'Planned', $8, $9)
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
          due,
          req.authContext.userId
        ]
      );

      await client.query(
        `
          INSERT INTO vs_periodic_reviews (org_id, system_id, due_date)
          VALUES ($1, $2, $3)
          ON CONFLICT (system_id)
          DO UPDATE SET due_date = EXCLUDED.due_date, updated_at = now()
        `,
        [req.authContext.orgId, rows[0].id, due]
      );

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
        `SELECT org_id FROM vs_validation_plans WHERE id = $1`,
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
            org_id, plan_id, protocol_name, status
          ) VALUES ($1, $2, $3, 'Draft')
          RETURNING *
        `,
        [req.authContext.orgId, planId, protocolName]
      );

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
            org_id, script_id, step_no, expected_result, outcome
          ) VALUES ($1, $2, 1, $3, 'N/A')
          RETURNING *
        `,
        [req.authContext.orgId, scripts[0].id, expectedResult]
      );

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

      if (outcome === 'Fail') {
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

        const { rows: deviations } = await client.query(
          `
            INSERT INTO vs_validation_deviations (
              org_id, system_id, protocol_step_id, deviation_text, status
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

        await createInAppNotification(client, {
          orgId: req.authContext.orgId,
          recipientUserId: req.authContext.userId,
          eventType: 'VALIDATION_STEP_FAILED',
          title: 'Validation deviation captured',
          message: 'A validation step failure created a linked validation deviation.',
          payloadJson: { stepId, deviationId: deviations[0].id }
        });
      }

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
            org_id, system_id, change_type, is_revalidation_required, reason
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, systemId, changeType, isRevalidationRequired, reason || null]
      );
      return rows[0];
    });

    return res.status(201).json({ revalidationFlag: flag });
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
            org_id, system_id, plan_id, status
          )
          VALUES ($1, $2, $3, 'Generated')
          RETURNING *
        `,
        [req.authContext.orgId, systemId, planId || null]
      );
      return rows[0];
    });

    return res.status(201).json({ validationSummaryReport: vsr });
  } catch (error) {
    return next(error);
  }
});

