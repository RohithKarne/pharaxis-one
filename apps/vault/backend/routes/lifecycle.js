const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

router.get('/states/:typeId', authenticate, async (req, res) => {
  const typeId = Number(req.params.typeId)
  if (!Number.isInteger(typeId) || typeId <= 0) return res.status(400).json({ error: 'Invalid type id' })

  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, content_type_id, state_name, state_code, is_initial, is_terminal
       FROM lifecycle_states
       WHERE org_id = ? AND content_type_id = ?
       ORDER BY is_initial DESC, id ASC`,
      [req.user.orgId, typeId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List lifecycle states error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/states', authenticate, requireAdmin, async (req, res) => {
  const { content_type_id, state_name, state_code, is_initial = 0, is_terminal = 0 } = req.body
  const typeId = Number(content_type_id)
  if (!Number.isInteger(typeId) || typeId <= 0 || !state_name || !state_code) {
    return res.status(400).json({ error: 'content_type_id, state_name and state_code are required' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO lifecycle_states (org_id, content_type_id, state_name, state_code, is_initial, is_terminal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        typeId,
        String(state_name).trim(),
        String(state_code).trim(),
        Number(is_initial) ? 1 : 0,
        Number(is_terminal) ? 1 : 0
      ]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'lifecycle_state_created',
      'lifecycle_state',
      result.insertId,
      req.ip,
      null,
      req.body,
      'Lifecycle state created'
    )

    res.status(201).json({ id: result.insertId })
  } catch (error) {
    console.error('Create lifecycle state error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/transitions/:typeId', authenticate, async (req, res) => {
  const typeId = Number(req.params.typeId)
  if (!Number.isInteger(typeId) || typeId <= 0) return res.status(400).json({ error: 'Invalid type id' })

  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, content_type_id, from_state, to_state, allowed_roles
       FROM lifecycle_transitions
       WHERE org_id = ? AND content_type_id = ?
       ORDER BY id ASC`,
      [req.user.orgId, typeId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List lifecycle transitions error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/transitions', authenticate, requireAdmin, async (req, res) => {
  const { content_type_id, from_state, to_state, allowed_roles } = req.body
  const typeId = Number(content_type_id)
  if (!Number.isInteger(typeId) || typeId <= 0 || !from_state || !to_state || !allowed_roles) {
    return res.status(400).json({ error: 'content_type_id, from_state, to_state and allowed_roles are required' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO lifecycle_transitions (org_id, content_type_id, from_state, to_state, allowed_roles)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        typeId,
        String(from_state).trim(),
        String(to_state).trim(),
        String(allowed_roles).trim()
      ]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'lifecycle_transition_rule_created',
      'lifecycle_transition',
      result.insertId,
      req.ip,
      null,
      req.body,
      'Lifecycle transition rule created'
    )

    res.status(201).json({ id: result.insertId })
  } catch (error) {
    console.error('Create lifecycle transition error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
