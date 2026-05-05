const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.post('/', authenticate, async (req, res, next) => {
  try {
    const contentId = Number(req.body.content_id || 0)
    if (!Number.isInteger(contentId) || contentId <= 0) {
      return res.status(400).json({ error: 'content_id must be a positive integer' })
    }
    const viewType = req.body.view_type === 'download' ? 'download' : 'view'
    const channelId = req.body.channel_id ? Number(req.body.channel_id) : null

    await pool.execute(
      `INSERT INTO vault_content_views (org_id, content_id, viewer_user_id, view_type, channel_id)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, contentId, req.user.userId, viewType, channelId]
    )
    return res.json({ logged: true })
  } catch (err) {
    next(err)
  }
})

router.get('/content/:content_id', authenticate, async (req, res, next) => {
  try {
    const contentId = Number(req.params.content_id || 0)
    if (!Number.isInteger(contentId) || contentId <= 0) {
      return res.status(400).json({ error: 'Invalid content_id' })
    }

    const [[stats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_views,
         COUNT(DISTINCT viewer_user_id) AS unique_viewers,
         SUM(view_type = 'download') AS download_count,
         MAX(viewed_at) AS last_viewed_at
       FROM vault_content_views
       WHERE org_id = ? AND content_id = ?`,
      [req.user.orgId, contentId]
    )

    const [timeline] = await pool.execute(
      `SELECT DATE(viewed_at) AS day, COUNT(*) AS views
       FROM vault_content_views
       WHERE org_id = ? AND content_id = ?
         AND viewed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(viewed_at)
       ORDER BY day ASC`,
      [req.user.orgId, contentId]
    )

    const totalViews = Number(stats.total_views || 0)
    const uniqueViewers = Number(stats.unique_viewers || 0)
    const downloadCount = Number(stats.download_count || 0)
    const reachScore = (uniqueViewers * 3) + (totalViews * 1) + (downloadCount * 2)

    return res.json({
      content_id: contentId,
      total_views: totalViews,
      unique_viewers: uniqueViewers,
      download_count: downloadCount,
      last_viewed_at: stats.last_viewed_at || null,
      reach_score: reachScore,
      view_timeline: timeline
    })
  } catch (err) {
    next(err)
  }
})

router.get('/top', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         vc.id AS content_id,
         vc.doc_number,
         vc.title,
         COUNT(vcv.id) AS total_views,
         COUNT(DISTINCT vcv.viewer_user_id) AS unique_viewers,
         SUM(vcv.view_type = 'download') AS download_count,
         (COUNT(DISTINCT vcv.viewer_user_id) * 3 + COUNT(vcv.id) + SUM(vcv.view_type = 'download') * 2) AS reach_score
       FROM vault_content vc
       JOIN vault_content_views vcv ON vcv.content_id = vc.id AND vcv.org_id = vc.org_id
       WHERE vc.org_id = ?
       GROUP BY vc.id, vc.doc_number, vc.title
       ORDER BY reach_score DESC
       LIMIT 10`,
      [req.user.orgId]
    )
    return res.json(rows)
  } catch (err) {
    next(err)
  }
})

module.exports = router
