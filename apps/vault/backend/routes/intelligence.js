const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const orgId = req.user.orgId

    const [[governed]] = await pool.execute(
      `SELECT COUNT(*) AS total_governed
       FROM vault_content
       WHERE org_id = ? AND lifecycle_state IN ('approved','published')`,
      [orgId]
    )

    const [[stale]] = await pool.execute(
      `SELECT COUNT(*) AS stale_count
       FROM vault_content vc
       WHERE vc.org_id = ? AND vc.lifecycle_state IN ('approved','published')
         AND (
           SELECT MAX(vcv.viewed_at) FROM vault_content_views vcv
           WHERE vcv.content_id = vc.id AND vcv.org_id = vc.org_id
         ) < DATE_SUB(NOW(), INTERVAL 90 DAY)
            OR (
           SELECT COUNT(*) FROM vault_content_views vcv
           WHERE vcv.content_id = vc.id AND vcv.org_id = vc.org_id
         ) = 0`,
      [orgId]
    )

    const [[atRisk]] = await pool.execute(
      `SELECT COUNT(*) AS at_risk_count
       FROM vault_content vc
       WHERE vc.org_id = ? AND vc.lifecycle_state IN ('approved','published')
         AND (
           SELECT MAX(vcv.viewed_at) FROM vault_content_views vcv
           WHERE vcv.content_id = vc.id AND vcv.org_id = vc.org_id
         ) >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         AND (
           SELECT MAX(vcv.viewed_at) FROM vault_content_views vcv
           WHERE vcv.content_id = vc.id AND vcv.org_id = vc.org_id
         ) < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [orgId]
    )

    const [[expiry]] = await pool.execute(
      `SELECT COUNT(*) AS expiry_30d_count
       FROM vault_metadata vm
       JOIN vault_content vc ON vc.id = vm.content_id AND vc.org_id = vm.org_id
       WHERE vm.org_id = ?
         AND vm.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
      [orgId]
    )

    return res.json({
      total_governed: Number(governed.total_governed || 0),
      stale_count: Number(stale.stale_count || 0),
      at_risk_count: Number(atRisk.at_risk_count || 0),
      expiry_30d_count: Number(expiry.expiry_30d_count || 0)
    })
  } catch (err) {
    next(err)
  }
})

router.get('/stale', authenticate, async (req, res, next) => {
  try {
    const orgId = req.user.orgId

    const [rows] = await pool.execute(
      `SELECT
         vc.id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         MAX(vcv.viewed_at) AS last_viewed_at,
         COUNT(vcv.id) AS total_views,
         CASE
           WHEN COUNT(vcv.id) = 0 THEN 'stale'
           WHEN MAX(vcv.viewed_at) < DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 'stale'
           WHEN MAX(vcv.viewed_at) < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'at_risk'
           ELSE 'active'
         END AS health_status,
         CASE
           WHEN COUNT(vcv.id) = 0 THEN NULL
           ELSE DATEDIFF(NOW(), MAX(vcv.viewed_at))
         END AS days_since_last_view
       FROM vault_content vc
       LEFT JOIN vault_content_views vcv ON vcv.content_id = vc.id AND vcv.org_id = vc.org_id
       WHERE vc.org_id = ? AND vc.lifecycle_state IN ('approved','published')
       GROUP BY vc.id, vc.doc_number, vc.title, vc.lifecycle_state
       HAVING health_status IN ('stale','at_risk')
       ORDER BY last_viewed_at IS NOT NULL, last_viewed_at ASC
       LIMIT 50`,
      [orgId]
    )

    return res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.get('/health/:content_id', authenticate, async (req, res, next) => {
  try {
    const contentId = Number(req.params.content_id || 0)
    if (!Number.isInteger(contentId) || contentId <= 0) {
      return res.status(400).json({ error: 'Invalid content_id' })
    }

    const [[row]] = await pool.execute(
      `SELECT
         vc.id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         MAX(vcv.viewed_at) AS last_viewed_at,
         COUNT(vcv.id) AS total_views,
         DATEDIFF(NOW(), MAX(vcv.viewed_at)) AS days_since_last_view,
         CASE
           WHEN COUNT(vcv.id) = 0 THEN 'stale'
           WHEN MAX(vcv.viewed_at) < DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 'stale'
           WHEN MAX(vcv.viewed_at) < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 'at_risk'
           ELSE 'active'
         END AS health_status
       FROM vault_content vc
       LEFT JOIN vault_content_views vcv ON vcv.content_id = vc.id AND vcv.org_id = vc.org_id
       WHERE vc.id = ? AND vc.org_id = ?
       GROUP BY vc.id, vc.doc_number, vc.title, vc.lifecycle_state`,
      [contentId, req.user.orgId]
    )

    if (!row) return res.status(404).json({ error: 'Content not found' })
    return res.json(row)
  } catch (err) {
    next(err)
  }
})

module.exports = router
