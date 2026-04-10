const crypto = require('crypto')
const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

function generateApiKey() {
  return `vch_${crypto.randomBytes(16).toString('hex')}`
}

router.get('/channels', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, app_name, api_key, webhook_url, status, created_by, created_at
       FROM content_channels
       WHERE org_id = ?
       ORDER BY created_at DESC`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List content channels error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/channels', authenticate, requireAdmin, async (req, res) => {
  const { app_name, webhook_url } = req.body
  if (!app_name) return res.status(400).json({ error: 'app_name is required' })

  try {
    const apiKey = generateApiKey()
    const [result] = await pool.execute(
      `INSERT INTO content_channels (org_id, app_name, api_key, webhook_url, status, created_by)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [req.user.orgId, String(app_name).trim(), apiKey, webhook_url || null, req.user.userId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'content_channel_created',
      'content_channel',
      result.insertId,
      req.ip,
      null,
      { app_name, webhook_url: webhook_url || null },
      'Content channel created'
    )

    res.status(201).json({
      id: result.insertId,
      app_name: String(app_name).trim(),
      api_key: apiKey,
      webhook_url: webhook_url || null,
      status: 'active'
    })
  } catch (error) {
    console.error('Create content channel error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/channels/:id', authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid channel id' })

  const updates = []
  const params = []
  if (req.body.webhook_url !== undefined) {
    updates.push('webhook_url = ?')
    params.push(req.body.webhook_url || null)
  }
  if (req.body.status !== undefined) {
    if (!['active', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status must be active/inactive' })
    }
    updates.push('status = ?')
    params.push(req.body.status)
  }

  if (!updates.length) return res.status(400).json({ error: 'Provide webhook_url and/or status' })

  try {
    params.push(id, req.user.orgId)
    const [result] = await pool.execute(
      `UPDATE content_channels
       SET ${updates.join(', ')}
       WHERE id = ? AND org_id = ?`,
      params
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Channel not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'content_channel_updated',
      'content_channel',
      id,
      req.ip,
      null,
      req.body,
      'Content channel updated'
    )

    res.json({ message: 'Channel updated' })
  } catch (error) {
    console.error('Update content channel error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/retention', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT oc.config_key, oc.config_value
       FROM org_config oc
       WHERE oc.org_id = ?
         AND oc.config_key LIKE 'retention_type_%'`,
      [req.user.orgId]
    )

    const mapped = rows.map(row => {
      const typeId = Number(String(row.config_key).replace('retention_type_', ''))
      return {
        content_type_id: Number.isNaN(typeId) ? null : typeId,
        review_cycle_months: Number(row.config_value)
      }
    })

    res.json(mapped)
  } catch (error) {
    console.error('Get retention defaults error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/retention', authenticate, requireAdmin, async (req, res) => {
  const defaults = Array.isArray(req.body.defaults) ? req.body.defaults : []
  if (!defaults.length) {
    return res.status(400).json({ error: 'defaults array is required' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    for (const item of defaults) {
      const typeId = Number(item.content_type_id)
      const months = Number(item.review_cycle_months)
      if (!Number.isInteger(typeId) || typeId <= 0 || !Number.isInteger(months) || months <= 0) {
        throw new Error('Each default requires valid content_type_id and positive review_cycle_months')
      }

      const key = `retention_type_${typeId}`
      await connection.execute(
        `INSERT INTO org_config (org_id, config_key, config_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
        [req.user.orgId, key, String(months)]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'retention_policy_updated',
      'org_config',
      null,
      req.ip,
      null,
      { defaults },
      'Retention defaults updated'
    )

    res.json({ message: 'Retention defaults updated', updated: defaults.length })
  } catch (error) {
    await connection.rollback()
    res.status(400).json({ error: error.message || 'Invalid payload' })
  } finally {
    connection.release()
  }
})

module.exports = router
