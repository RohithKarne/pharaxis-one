const express = require('express')
const router = express.Router()
const { authenticate, requireAdmin } = require('../../middleware/auth')
const { pool } = require('../../database/db')

// PATCH /api/v1/agent/admin/provider/toggle — enable or disable AI for org
router.patch('/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const { is_active } = req.body
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' })
    }

    const [[config]] = await pool.execute(
      'SELECT id FROM ai_agent_org_config WHERE org_id = ?',
      [req.user.orgId]
    )
    if (!config) {
      return res.status(404).json({ error: 'No AI configuration found. Add an API key first.' })
    }

    await pool.execute(
      'UPDATE ai_agent_org_config SET is_active = ?, updated_at = NOW() WHERE org_id = ?',
      [is_active ? 1 : 0, req.user.orgId]
    )

    res.json({ success: true, is_active })
  } catch {
    res.status(500).json({ error: 'Failed to update provider configuration' })
  }
})

module.exports = router
