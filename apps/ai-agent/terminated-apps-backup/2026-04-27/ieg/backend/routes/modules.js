const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { listTasksForUser } = require('../services/taskService')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/accessible', async (req, res) => {
  const { rows } = await query(`SELECT module_key FROM ieg_user_modules WHERE user_id = $1 ORDER BY module_key`, [req.auth.userId])
  const modules = rows.map((row) => row.module_key)
  return res.json({ modules, defaultModule: modules[0] || null })
})

router.get('/switch/:moduleKey', async (req, res) => {
  const { moduleKey } = req.params
  const modules = req.auth.modules || []
  if (!modules.includes(moduleKey) && !req.auth.isSuperadmin) {
    return res.status(403).json({ error: 'Module not assigned for this user' })
  }

  const tasks = await listTasksForUser(req.auth.userId, moduleKey)
  return res.json({ moduleKey, landing: 'task_queue', tasks })
})

module.exports = router
