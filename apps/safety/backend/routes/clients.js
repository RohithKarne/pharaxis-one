const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES, ROLES } = require('../constants')
const { logAdminAction } = require('../services/auditService')

const router = express.Router()

router.use(authenticate)
router.use(requireModule(MODULES.CLIENT_HIERARCHY))

async function ensureCroOrg(parentOrgId) {
  const [[org]] = await pool.execute(
    'SELECT org_id, org_name, org_type, status FROM organisations WHERE org_id = ?',
    [parentOrgId]
  )

  if (!org) return { error: 'Parent organisation not found' }
  if (org.status !== 'active') return { error: 'Parent organisation is inactive' }
  if (org.org_type !== 'CRO') return { error: 'Only CRO organisations can have pharma clients' }

  return { org }
}

router.get('/', async (req, res) => {
  const requestedParentOrgId = req.query.parentOrgId ? Number(req.query.parentOrgId) : null

  try {
    if (req.user.role === ROLES.SUPER_ADMIN && !requestedParentOrgId) {
      const [rows] = await pool.execute(
        `SELECT
          c.client_id,
          c.client_name,
          c.client_code,
          c.status,
          c.parent_org_id,
          o.org_name AS parent_org_name,
          c.created_at,
          c.updated_at
         FROM pharma_clients c
         INNER JOIN organisations o ON o.org_id = c.parent_org_id
         ORDER BY o.org_name ASC, c.client_name ASC`
      )
      return res.json(rows)
    }

    const parentOrgId = requestedParentOrgId || req.user.orgId
    if (!assertOrgAccess(req, res, parentOrgId)) {
      return undefined
    }

    const [rows] = await pool.execute(
      `SELECT
        c.client_id,
        c.client_name,
        c.client_code,
        c.status,
        c.parent_org_id,
        c.created_at,
        c.updated_at
       FROM pharma_clients c
       WHERE c.parent_org_id = ?
       ORDER BY c.client_name ASC`,
      [parentOrgId]
    )

    return res.json(rows)
  } catch (error) {
    console.error('List clients failed:', error)
    return res.status(500).json({ error: 'Failed to list clients' })
  }
})

router.post('/', async (req, res) => {
  const { parentOrgId, clientName, clientCode } = req.body

  if (!clientName || !clientCode) {
    return res.status(400).json({ error: 'clientName and clientCode are required' })
  }

  const targetParentOrgId = Number(parentOrgId || req.user.orgId)
  if (!Number.isInteger(targetParentOrgId) || targetParentOrgId <= 0) {
    return res.status(400).json({ error: 'Valid parentOrgId is required' })
  }

  if (!assertOrgAccess(req, res, targetParentOrgId)) {
    return undefined
  }

  try {
    const { error } = await ensureCroOrg(targetParentOrgId)
    if (error) {
      return res.status(400).json({ error })
    }

    const [result] = await pool.execute(
      `INSERT INTO pharma_clients (parent_org_id, client_name, client_code, status)
       VALUES (?, ?, ?, 'active')`,
      [targetParentOrgId, String(clientName).trim(), String(clientCode).trim().toUpperCase()]
    )

    await logAdminAction({
      orgId: targetParentOrgId,
      actorUserId: req.user.userId,
      actionType: 'pharma_client_created',
      entityType: 'pharma_client',
      entityId: String(result.insertId),
      afterValue: {
        parentOrgId: targetParentOrgId,
        clientName: String(clientName).trim(),
        clientCode: String(clientCode).trim().toUpperCase()
      }
    })

    return res.status(201).json({
      client_id: result.insertId,
      parent_org_id: targetParentOrgId,
      client_name: String(clientName).trim(),
      client_code: String(clientCode).trim().toUpperCase(),
      status: 'active'
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Client code already exists under this CRO' })
    }
    console.error('Create client failed:', error)
    return res.status(500).json({ error: 'Failed to create client' })
  }
})

router.patch('/:clientId/status', async (req, res) => {
  const clientId = Number(req.params.clientId)
  const { status } = req.body

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'Invalid client id' })
  }

  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'status must be active or inactive' })
  }

  try {
    const [[client]] = await pool.execute(
      `SELECT client_id, parent_org_id, client_name, status
       FROM pharma_clients
       WHERE client_id = ?`,
      [clientId]
    )

    if (!client) {
      return res.status(404).json({ error: 'Client not found' })
    }

    if (!assertOrgAccess(req, res, client.parent_org_id)) {
      return undefined
    }

    if (client.status === status) {
      return res.json({ message: 'No change applied', client })
    }

    await pool.execute(
      'UPDATE pharma_clients SET status = ? WHERE client_id = ?',
      [status, clientId]
    )

    await logAdminAction({
      orgId: client.parent_org_id,
      actorUserId: req.user.userId,
      actionType: status === 'inactive' ? 'pharma_client_deactivated' : 'pharma_client_activated',
      entityType: 'pharma_client',
      entityId: String(clientId),
      beforeValue: { status: client.status },
      afterValue: { status }
    })

    return res.json({
      message: `Client status updated to ${status}`,
      client: {
        ...client,
        status
      }
    })
  } catch (error) {
    console.error('Update client status failed:', error)
    return res.status(500).json({ error: 'Failed to update client status' })
  }
})

module.exports = router
