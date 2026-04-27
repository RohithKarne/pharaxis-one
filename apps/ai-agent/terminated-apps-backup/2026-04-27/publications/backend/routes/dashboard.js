const express = require('express')
const { query } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const { asyncHandler } = require('../utils/asyncHandler')
const { resolveTenantIdForRequest } = require('../utils/tenant')

const router = express.Router()

router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)

    const [statusRows, typeRows, upcomingMilestones, overdueMilestones, myPublications, myReviewQueue] = await Promise.all([
      query(
        `
          SELECT status, COUNT(*) AS count
          FROM pub_publications
          WHERE tenant_id = ?
          GROUP BY status
          ORDER BY status ASC
        `,
        [tenantId]
      ),
      query(
        `
          SELECT publication_type AS publicationType, COUNT(*) AS count
          FROM pub_publications
          WHERE tenant_id = ?
          GROUP BY publication_type
          ORDER BY publication_type ASC
        `,
        [tenantId]
      ),
      query(
        `
          SELECT
            m.id,
            m.milestone_name AS milestoneName,
            m.due_date AS dueDate,
            m.status,
            p.id AS publicationId,
            p.title AS publicationTitle
          FROM pub_milestones m
          JOIN pub_publications p ON p.id = m.publication_id
          WHERE m.tenant_id = ?
            AND m.status <> 'completed'
            AND m.due_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY)
          ORDER BY m.due_date ASC
          LIMIT 20
        `,
        [tenantId]
      ),
      query(
        `
          SELECT
            m.id,
            m.milestone_name AS milestoneName,
            m.due_date AS dueDate,
            p.id AS publicationId,
            p.title AS publicationTitle
          FROM pub_milestones m
          JOIN pub_publications p ON p.id = m.publication_id
          WHERE m.tenant_id = ?
            AND m.status <> 'completed'
            AND m.due_date < CURRENT_DATE()
          ORDER BY m.due_date ASC
          LIMIT 20
        `,
        [tenantId]
      ),
      query(
        `
          SELECT DISTINCT
            p.id,
            p.title,
            p.status,
            p.publication_type AS publicationType,
            p.updated_at AS updatedAt
          FROM pub_publications p
          LEFT JOIN pub_publication_authors pa ON pa.publication_id = p.id
          LEFT JOIN pub_authors a ON a.id = pa.author_id
          WHERE p.tenant_id = ?
            AND (
              p.created_by = ?
              OR p.updated_by = ?
              OR a.email = ?
            )
          ORDER BY p.updated_at DESC
          LIMIT 20
        `,
        [tenantId, req.user.id, req.user.id, req.user.email]
      ),
      query(
        `
          SELECT
            r.id AS reviewId,
            r.review_status AS reviewStatus,
            r.created_at AS assignedAt,
            p.id AS publicationId,
            p.title AS publicationTitle,
            p.status AS publicationStatus
          FROM pub_reviews r
          JOIN pub_publications p ON p.id = r.publication_id
          WHERE r.tenant_id = ?
            AND r.reviewer_user_id = ?
            AND r.review_status = 'pending'
          ORDER BY r.created_at DESC
          LIMIT 20
        `,
        [tenantId, req.user.id]
      )
    ])

    res.json({
      tenantId,
      byStatus: statusRows,
      byPublicationType: typeRows,
      upcomingMilestones,
      overdueMilestones,
      myPublications,
      myReviewQueue
    })
  })
)

module.exports = router
