import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { appendTraceLink } from '../services/traceabilityService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const riskManagementRouter = Router();

const validDomains = new Set(['Product', 'Process', 'Supplier', 'Compliance', 'Cyber', 'Clinical']);
const validBands = new Set(['Low', 'Medium', 'High', 'Critical']);
const validStatus = new Set(['Open', 'Mitigating', 'Accepted', 'Closed']);

function computeRiskBand(score) {
  if (score >= 80) return 'Critical';
  if (score >= 45) return 'High';
  if (score >= 20) return 'Medium';
  return 'Low';
}

riskManagementRouter.post('/register', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const {
      riskTitle,
      riskDomain,
      severity,
      occurrence,
      detectability,
      mitigationPlan = null,
      ownerUserId = null,
      reviewDueDate = null
    } = req.body || {};

    if (!riskTitle || !riskDomain || !severity || !occurrence || !detectability) {
      return res.status(400).json({ error: 'riskTitle, riskDomain, severity, occurrence, and detectability are required' });
    }
    if (!validDomains.has(riskDomain)) {
      return res.status(400).json({ error: 'Invalid riskDomain' });
    }

    const s = Number(severity);
    const o = Number(occurrence);
    const d = Number(detectability);
    if ([s, o, d].some((n) => Number.isNaN(n) || n < 1 || n > 5)) {
      return res.status(400).json({ error: 'severity, occurrence, detectability must be numbers from 1 to 5' });
    }

    const riskScore = s * o * d;
    const riskBand = computeRiskBand(riskScore);

    const risk = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO rm_risk_register (
            org_id,
            risk_code,
            risk_title,
            risk_domain,
            severity,
            occurrence,
            detectability,
            risk_score,
            risk_band,
            mitigation_plan,
            owner_user_id,
            review_due_date,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('RISK', riskTitle),
          riskTitle,
          riskDomain,
          s,
          o,
          d,
          riskScore,
          riskBand,
          mitigationPlan,
          ownerUserId,
          asDateString(reviewDueDate),
          req.authContext.userId
        ]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'risk_management',
        entityTable: 'rm_risk_register',
        entityId: rows[0].id,
        actionKey: 'create_risk',
        actorUserId: req.authContext.userId,
        payloadJson: { riskDomain, riskScore, riskBand }
      });

      return rows[0];
    });

    return res.status(201).json({ risk });
  } catch (error) {
    return next(error);
  }
});

riskManagementRouter.patch('/register/:riskId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { riskId } = req.params;
    const {
      riskTitle = null,
      mitigationPlan = null,
      ownerUserId = null,
      status = null,
      reviewDueDate = null,
      severity = null,
      occurrence = null,
      detectability = null
    } = req.body || {};

    if (status && !validStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const risk = await req.withRlsTransaction(async (client) => {
      const { rows: existingRows } = await client.query(
        `SELECT * FROM rm_risk_register WHERE id = $1 LIMIT 1`,
        [riskId]
      );
      if (!existingRows[0]) {
        const error = new Error('Risk not found');
        error.statusCode = 404;
        throw error;
      }
      const current = existingRows[0];

      const s = Number(severity || current.severity);
      const o = Number(occurrence || current.occurrence);
      const d = Number(detectability || current.detectability);
      if ([s, o, d].some((n) => Number.isNaN(n) || n < 1 || n > 5)) {
        const error = new Error('severity, occurrence, detectability must be numbers from 1 to 5');
        error.statusCode = 400;
        throw error;
      }
      const riskScore = s * o * d;
      const riskBand = computeRiskBand(riskScore);

      const { rows } = await client.query(
        `
          UPDATE rm_risk_register
          SET
            risk_title = COALESCE($2, risk_title),
            mitigation_plan = COALESCE($3, mitigation_plan),
            owner_user_id = COALESCE($4, owner_user_id),
            status = COALESCE($5, status),
            review_due_date = COALESCE($6, review_due_date),
            severity = $7,
            occurrence = $8,
            detectability = $9,
            risk_score = $10,
            risk_band = $11,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [
          riskId,
          riskTitle,
          mitigationPlan,
          ownerUserId,
          status,
          asDateString(reviewDueDate),
          s,
          o,
          d,
          riskScore,
          riskBand
        ]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'risk_management',
        entityTable: 'rm_risk_register',
        entityId: riskId,
        actionKey: 'update_risk',
        actorUserId: req.authContext.userId,
        payloadJson: { status, riskScore, riskBand }
      });

      return rows[0];
    });

    return res.json({ risk });
  } catch (error) {
    return next(error);
  }
});

riskManagementRouter.post('/register/:riskId/review', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { riskId } = req.params;
    const { reviewNotes, residualScore = null, linkedModule = null, linkedEntityTable = null, linkedEntityId = null } = req.body || {};
    if (!reviewNotes) {
      return res.status(400).json({ error: 'reviewNotes is required' });
    }

    const review = await req.withRlsTransaction(async (client) => {
      const { rows: riskRows } = await client.query(`SELECT * FROM rm_risk_register WHERE id = $1 LIMIT 1`, [riskId]);
      if (!riskRows[0]) {
        const error = new Error('Risk not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows } = await client.query(
        `
          INSERT INTO rm_risk_reviews (
            org_id,
            risk_id,
            review_notes,
            residual_score,
            reviewed_by
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, riskId, reviewNotes, residualScore, req.authContext.userId]
      );

      if (linkedModule && linkedEntityTable && linkedEntityId) {
        await appendTraceLink(client, {
          orgId: req.authContext.orgId,
          sourceModule: 'risk_management',
          sourceTable: 'rm_risk_register',
          sourceId: riskId,
          targetModule: linkedModule,
          targetTable: linkedEntityTable,
          targetId: linkedEntityId,
          linkType: 'RiskLink',
          createdBy: req.authContext.userId
        });
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'risk_management',
        entityTable: 'rm_risk_reviews',
        entityId: rows[0].id,
        actionKey: 'review_risk',
        actorUserId: req.authContext.userId,
        payloadJson: { residualScore }
      });

      return rows[0];
    });

    return res.status(201).json({ review });
  } catch (error) {
    return next(error);
  }
});

riskManagementRouter.get('/register/:riskId', async (req, res, next) => {
  try {
    const { riskId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: riskRows } = await client.query(`SELECT * FROM rm_risk_register WHERE id = $1 LIMIT 1`, [riskId]);
      if (!riskRows[0]) {
        const error = new Error('Risk not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: reviews } = await client.query(
        `SELECT * FROM rm_risk_reviews WHERE risk_id = $1 ORDER BY reviewed_at DESC`,
        [riskId]
      );

      return {
        risk: riskRows[0],
        reviews
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

riskManagementRouter.get('/', async (req, res, next) => {
  try {
    const { status, riskBand, limit = 200 } = req.query;
    const filters = [];
    const values = [];

    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    if (riskBand) {
      if (!validBands.has(riskBand)) {
        return res.status(400).json({ error: 'Invalid riskBand' });
      }
      values.push(riskBand);
      filters.push(`risk_band = $${values.length}`);
    }

    values.push(Math.min(Number(limit) || 200, 500));
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const risks = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT *
          FROM rm_risk_register
          ${whereClause}
          ORDER BY updated_at DESC
          LIMIT $${values.length}
        `,
        values
      );
      return rows;
    });

    return res.json({ risks });
  } catch (error) {
    return next(error);
  }
});
