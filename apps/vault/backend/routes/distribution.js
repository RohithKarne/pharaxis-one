const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { recordDistributionEvent } = require('../services/contentDistributionService')

const router = express.Router()

function requireEditor(req, res, next) {
  if (!['admin', 'author'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/author can distribute content' })
  }
  next()
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

async function getContent(contentId, orgId) {
  const [[content]] = await pool.execute(
    `SELECT vc.id, vc.org_id, vc.doc_number, vc.title, vc.lifecycle_state,
            vv.version_number
     FROM vault_content vc
     LEFT JOIN vault_versions vv
       ON vv.id = vc.current_version_id
      AND vv.org_id = vc.org_id
     WHERE vc.id = ? AND vc.org_id = ?`,
    [contentId, orgId]
  )
  return content
}

async function getChannel(channelId, orgId) {
  const [[channel]] = await pool.execute(
    `SELECT id, org_id, app_name, webhook_url, status
     FROM content_channels
     WHERE id = ? AND org_id = ?`,
    [channelId, orgId]
  )
  return channel
}

router.get('/content/:contentId', authenticate, async (req, res) => {
  const contentId = Number(req.params.contentId)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContent(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [channels] = await pool.execute(
      `SELECT
         ch.id,
         ch.app_name,
         ch.webhook_url,
         ch.status AS channel_status,
         event.id AS last_event_id,
         event.action AS last_action,
         event.status AS last_status,
         event.message AS last_message,
         event.error_message AS last_error,
         event.created_at AS last_pushed_at,
         actor.name AS last_actor_name
       FROM content_channels ch
       LEFT JOIN (
         SELECT e.*
         FROM content_distribution_events e
         JOIN (
           SELECT content_channel_id, MAX(id) AS max_id
           FROM content_distribution_events
           WHERE org_id = ? AND content_id = ?
           GROUP BY content_channel_id
         ) latest ON latest.max_id = e.id
       ) event
         ON event.content_channel_id = ch.id
        AND event.org_id = ch.org_id
       LEFT JOIN users actor
         ON actor.id = event.created_by
        AND actor.org_id = event.org_id
       WHERE ch.org_id = ?
       ORDER BY ch.status ASC, ch.app_name ASC`,
      [req.user.orgId, contentId, req.user.orgId]
    )

    const [events] = await pool.execute(
      `SELECT e.id, e.content_channel_id, ch.app_name, e.action, e.status, e.message, e.error_message,
              e.created_at, e.completed_at, actor.name AS created_by_name
       FROM content_distribution_events e
       JOIN content_channels ch
         ON ch.id = e.content_channel_id
        AND ch.org_id = e.org_id
       LEFT JOIN users actor
         ON actor.id = e.created_by
        AND actor.org_id = e.org_id
       WHERE e.org_id = ? AND e.content_id = ?
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 25`,
      [req.user.orgId, contentId]
    )

    res.json({ content_id: contentId, channels, events })
  } catch (error) {
    console.error('Get content distribution error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/content/:contentId/push', authenticate, requireEditor, async (req, res) => {
  const contentId = Number(req.params.contentId)
  const channelId = Number(req.body.content_channel_id)
  if (!Number.isInteger(contentId) || contentId <= 0 || !Number.isInteger(channelId) || channelId <= 0) {
    return res.status(400).json({ error: 'Valid content and channel are required' })
  }

  try {
    const [content, channel] = await Promise.all([
      getContent(contentId, req.user.orgId),
      getChannel(channelId, req.user.orgId)
    ])
    if (!content) return res.status(404).json({ error: 'Content not found' })
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    if (channel.status !== 'active') return res.status(400).json({ error: 'Channel is inactive' })

    const event = await recordDistributionEvent({
      orgId: req.user.orgId,
      userId: req.user.userId,
      ip: req.ip,
      content,
      channel,
      action: 'push'
    })

    res.status(201).json(event)
  } catch (error) {
    console.error('Push content distribution error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/events/:id/retry', authenticate, requireEditor, async (req, res) => {
  const eventId = Number(req.params.id)
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return res.status(400).json({ error: 'Invalid event id' })
  }

  try {
    const [[event]] = await pool.execute(
      `SELECT e.id, e.content_id, e.content_channel_id,
              vc.doc_number, vc.title, vc.lifecycle_state, vv.version_number,
              ch.app_name, ch.webhook_url, ch.status AS channel_status
       FROM content_distribution_events e
       JOIN vault_content vc
         ON vc.id = e.content_id
        AND vc.org_id = e.org_id
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       JOIN content_channels ch
         ON ch.id = e.content_channel_id
        AND ch.org_id = e.org_id
       WHERE e.id = ? AND e.org_id = ?`,
      [eventId, req.user.orgId]
    )
    if (!event) return res.status(404).json({ error: 'Distribution event not found' })

    const retry = await recordDistributionEvent({
      orgId: req.user.orgId,
      userId: req.user.userId,
      ip: req.ip,
      content: {
        id: event.content_id,
        doc_number: event.doc_number,
        title: event.title,
        lifecycle_state: event.lifecycle_state,
        version_number: event.version_number
      },
      channel: {
        id: event.content_channel_id,
        app_name: event.app_name,
        webhook_url: event.webhook_url,
        status: event.channel_status
      },
      action: 'retry'
    })

    res.status(201).json(retry)
  } catch (error) {
    console.error('Retry content distribution error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/events/:id/withdraw', authenticate, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id)
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return res.status(400).json({ error: 'Invalid event id' })
  }

  try {
    const [[event]] = await pool.execute(
      `SELECT e.id, e.content_id, e.content_channel_id,
              vc.doc_number, vc.title, vc.lifecycle_state, vv.version_number,
              ch.app_name, ch.webhook_url, ch.status AS channel_status
       FROM content_distribution_events e
       JOIN vault_content vc
         ON vc.id = e.content_id
        AND vc.org_id = e.org_id
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       JOIN content_channels ch
         ON ch.id = e.content_channel_id
        AND ch.org_id = e.org_id
       WHERE e.id = ? AND e.org_id = ?`,
      [eventId, req.user.orgId]
    )
    if (!event) return res.status(404).json({ error: 'Distribution event not found' })

    const withdrawal = await recordDistributionEvent({
      orgId: req.user.orgId,
      userId: req.user.userId,
      ip: req.ip,
      content: {
        id: event.content_id,
        doc_number: event.doc_number,
        title: event.title,
        lifecycle_state: event.lifecycle_state,
        version_number: event.version_number
      },
      channel: {
        id: event.content_channel_id,
        app_name: event.app_name,
        webhook_url: event.webhook_url,
        status: event.channel_status
      },
      action: 'withdraw'
    })

    res.status(201).json(withdrawal)
  } catch (error) {
    console.error('Withdraw content distribution error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
