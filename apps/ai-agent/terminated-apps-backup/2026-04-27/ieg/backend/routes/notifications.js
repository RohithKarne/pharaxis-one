const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { listUserNotifications } = require('../services/notificationService')
const { query } = require('../database/db')

const router = express.Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const notifications = await listUserNotifications({
    userId: req.auth.type === 'internal' ? req.auth.userId : null,
    externalUserId: req.auth.type === 'external' ? req.auth.userId : null
  })

  return res.json({ notifications })
})

router.patch('/:id/read', async (req, res) => {
  const id = Number(req.params.id)
  const whereColumn = req.auth.type === 'internal' ? 'recipient_user_id' : 'recipient_external_user_id'

  const { rows } = await query(
    `
      UPDATE ieg_notifications
      SET status = 'read'
      WHERE id = $1 AND ${whereColumn} = $2
      RETURNING *
    `,
    [id, req.auth.userId]
  )

  if (!rows[0]) return res.status(404).json({ error: 'Notification not found' })
  return res.json({ notification: rows[0] })
})

module.exports = router
