const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { asyncHandler } = require('../utils/asyncHandler')
const {
  listUserPreferences,
  upsertUserPreference,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount
} = require('../services/notificationService')
const { subscribeToUser } = require('../services/notificationHub')

const router = express.Router()

router.get(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const preferences = await listUserPreferences(req.user.id)
    res.json({ preferences })
  })
)

router.put(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const eventKey = String(req.body?.eventKey || '').trim()
    const emailEnabled = Boolean(req.body?.emailEnabled)

    if (!eventKey) {
      return res.status(400).json({ error: 'eventKey is required' })
    }

    await upsertUserPreference(req.user.id, eventKey, emailEnabled)
    const preferences = await listUserPreferences(req.user.id)
    res.json({ preferences })
  })
)

router.get(
  '/feed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await listNotificationsForUser(req.user)
    const unreadCount = await getUnreadCount(req.user.id)
    res.json({ notifications, unreadCount })
  })
)

router.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req, res) => {
    const unreadCount = await getUnreadCount(req.user.id)
    res.json({ unreadCount })
  })
)

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.id)
    if (!Number.isFinite(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification id' })
    }

    await markNotificationRead(req.user.id, notificationId)
    const unreadCount = await getUnreadCount(req.user.id)
    res.json({ notificationId, unreadCount })
  })
)

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await markAllNotificationsRead(req.user.id)
    const unreadCount = await getUnreadCount(req.user.id)
    res.json({ unreadCount })
  })
)

router.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, userId: req.user.id })}\n\n`)

  const unsubscribe = subscribeToUser(req.user.id, async (payload) => {
    const unreadCount = await getUnreadCount(req.user.id)
    res.write(`event: notification\ndata: ${JSON.stringify({ ...payload, unreadCount })}\n\n`)
  })

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: {}\n\n`)
  }, 25000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })
})

module.exports = router
