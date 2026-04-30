import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';
import { appendAuditEvent } from '../services/auditTrailService.js';
import { makeEntityCode, asDateString } from '../utils/codegen.js';

export const managementReviewRouter = Router();

const validReviewStatus = new Set(['Draft', 'InReview', 'Approved', 'Closed']);
const validActionStatus = new Set(['Open', 'InProgress', 'Closed']);

managementReviewRouter.post('/', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const {
      reviewPeriodStart,
      reviewPeriodEnd,
      chairperson = null,
      summary = null,
      decisions = null
    } = req.body || {};

    if (!reviewPeriodStart || !reviewPeriodEnd) {
      return res.status(400).json({ error: 'reviewPeriodStart and reviewPeriodEnd are required' });
    }

    const review = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO mr_management_reviews (
            org_id,
            review_code,
            review_period_start,
            review_period_end,
            chairperson,
            summary,
            decisions,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          req.authContext.orgId,
          makeEntityCode('MREV', `${reviewPeriodStart}-${reviewPeriodEnd}`),
          asDateString(reviewPeriodStart),
          asDateString(reviewPeriodEnd),
          chairperson,
          summary,
          decisions,
          req.authContext.userId
        ]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'management_review',
        entityTable: 'mr_management_reviews',
        entityId: rows[0].id,
        actionKey: 'create_review',
        actorUserId: req.authContext.userId,
        payloadJson: { reviewPeriodStart: asDateString(reviewPeriodStart), reviewPeriodEnd: asDateString(reviewPeriodEnd) }
      });

      return rows[0];
    });

    return res.status(201).json({ review });
  } catch (error) {
    return next(error);
  }
});

managementReviewRouter.patch('/:reviewId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { reviewId } = req.params;
    const {
      status = null,
      chairperson = null,
      summary = null,
      decisions = null
    } = req.body || {};

    if (status && !validReviewStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const review = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE mr_management_reviews
          SET
            status = COALESCE($2, status),
            chairperson = COALESCE($3, chairperson),
            summary = COALESCE($4, summary),
            decisions = COALESCE($5, decisions),
            approved_by = CASE WHEN COALESCE($2, status) = 'Approved' THEN $6 ELSE approved_by END,
            approved_at = CASE WHEN COALESCE($2, status) = 'Approved' THEN COALESCE(approved_at, now()) ELSE approved_at END,
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [reviewId, status, chairperson, summary, decisions, req.authContext.userId]
      );

      if (!rows[0]) {
        const error = new Error('Management review not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'management_review',
        entityTable: 'mr_management_reviews',
        entityId: reviewId,
        actionKey: 'update_review',
        actorUserId: req.authContext.userId,
        payloadJson: { status }
      });

      return rows[0];
    });

    return res.json({ review });
  } catch (error) {
    return next(error);
  }
});

managementReviewRouter.post('/:reviewId/actions', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { reviewId } = req.params;
    const { actionTitle, ownerUserId = null, dueDate = null } = req.body || {};
    if (!actionTitle) {
      return res.status(400).json({ error: 'actionTitle is required' });
    }

    const action = await req.withRlsTransaction(async (client) => {
      const { rows: reviewRows } = await client.query(`SELECT id FROM mr_management_reviews WHERE id = $1 LIMIT 1`, [reviewId]);
      if (!reviewRows[0]) {
        const error = new Error('Management review not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows } = await client.query(
        `
          INSERT INTO mr_review_actions (
            org_id,
            review_id,
            action_title,
            owner_user_id,
            due_date
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [req.authContext.orgId, reviewId, actionTitle, ownerUserId, asDateString(dueDate)]
      );

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'management_review',
        entityTable: 'mr_review_actions',
        entityId: rows[0].id,
        actionKey: 'create_action',
        actorUserId: req.authContext.userId,
        payloadJson: { reviewId, dueDate: asDateString(dueDate) }
      });

      return rows[0];
    });

    return res.status(201).json({ action });
  } catch (error) {
    return next(error);
  }
});

managementReviewRouter.patch('/actions/:actionId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['qa_reviewer', 'admin', 'superadmin']);

    const { actionId } = req.params;
    const { status = null, closureNotes = null, dueDate = null } = req.body || {};
    if (status && !validActionStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const action = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          UPDATE mr_review_actions
          SET
            status = COALESCE($2, status),
            closure_notes = COALESCE($3, closure_notes),
            due_date = COALESCE($4, due_date),
            updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [actionId, status, closureNotes, asDateString(dueDate)]
      );

      if (!rows[0]) {
        const error = new Error('Management review action not found');
        error.statusCode = 404;
        throw error;
      }

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'management_review',
        entityTable: 'mr_review_actions',
        entityId: actionId,
        actionKey: 'update_action',
        actorUserId: req.authContext.userId,
        payloadJson: { status, dueDate: asDateString(dueDate) }
      });

      return rows[0];
    });

    return res.json({ action });
  } catch (error) {
    return next(error);
  }
});

managementReviewRouter.get('/:reviewId', async (req, res, next) => {
  try {
    const { reviewId } = req.params;

    const payload = await req.withRlsTransaction(async (client) => {
      const { rows: reviewRows } = await client.query(
        `SELECT * FROM mr_management_reviews WHERE id = $1 LIMIT 1`,
        [reviewId]
      );
      if (!reviewRows[0]) {
        const error = new Error('Management review not found');
        error.statusCode = 404;
        throw error;
      }

      const { rows: actions } = await client.query(
        `SELECT * FROM mr_review_actions WHERE review_id = $1 ORDER BY created_at DESC`,
        [reviewId]
      );

      return {
        review: reviewRows[0],
        actions
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

managementReviewRouter.get('/', async (req, res, next) => {
  try {
    const snapshot = await req.withRlsTransaction(async (client) => {
      const reviewsRows = await client.query(
        `SELECT * FROM mr_management_reviews ORDER BY review_period_end DESC, updated_at DESC LIMIT 200`
      );
      const actionsRows = await client.query(
        `SELECT * FROM mr_review_actions ORDER BY updated_at DESC LIMIT 500`
      );

      return {
        reviews: reviewsRows.rows,
        actions: actionsRows.rows
      };
    });

    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});
