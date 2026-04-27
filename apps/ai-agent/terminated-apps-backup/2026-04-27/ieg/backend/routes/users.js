const express = require('express')
const bcrypt = require('bcrypt')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireRoles } = require('../middleware/authorize')
const { logAudit } = require('../services/auditService')
const { actorFromAuth } = require('../utils/actor')

const router = express.Router()

router.use(requireAuth, requireInternal)

router.get('/', requireRoles(['superadmin', 'admin']), async (_req, res) => {
  const usersResult = await query(
    `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_superadmin,
        u.is_active,
        GROUP_CONCAT(um.module_key ORDER BY um.module_key SEPARATOR ',') AS module_list
      FROM ieg_users u
      LEFT JOIN ieg_user_modules um ON um.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `
  )

  const users = usersResult.rows.map((row) => ({
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    is_superadmin: row.is_superadmin,
    is_active: row.is_active,
    modules: row.module_list ? String(row.module_list).split(',').filter(Boolean) : []
  }))

  res.json({ users })
})

router.post('/', requireRoles(['superadmin']), async (req, res) => {
  const { email, fullName, password, role, modules = [] } = req.body || {}
  if (!email || !fullName || !password || !role) {
    return res.status(400).json({ error: 'email, fullName, password, role are required' })
  }

  const hash = await bcrypt.hash(password, 10)
  const { rows } = await query(
    `
      INSERT INTO ieg_users (email, full_name, password_hash, role, is_superadmin)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, full_name, role, is_superadmin
    `,
    [email.toLowerCase().trim(), fullName, hash, role, role === 'superadmin']
  )

  for (const moduleKey of modules) {
    await query(
      `INSERT INTO ieg_user_modules (user_id, module_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [rows[0].id, moduleKey]
    )
  }

  const actor = actorFromAuth(req.auth)
  await logAudit({
    ...actor,
    moduleKey: 'foundation',
    entityType: 'user',
    entityId: String(rows[0].id),
    action: 'user_created',
    metadata: { createdRole: role, modules }
  })

  return res.status(201).json({ user: { ...rows[0], modules } })
})

router.patch('/:userId/modules', requireRoles(['superadmin']), async (req, res) => {
  const userId = Number(req.params.userId)
  const modules = Array.isArray(req.body?.modules) ? req.body.modules : []

  await query(`DELETE FROM ieg_user_modules WHERE user_id = $1`, [userId])
  for (const moduleKey of modules) {
    await query(`INSERT INTO ieg_user_modules (user_id, module_key) VALUES ($1, $2)`, [userId, moduleKey])
  }

  const actor = actorFromAuth(req.auth)
  await logAudit({
    ...actor,
    moduleKey: 'foundation',
    entityType: 'user',
    entityId: String(userId),
    action: 'user_module_access_updated',
    metadata: { modules }
  })

  return res.json({ ok: true, userId, modules })
})

module.exports = router
