const express = require('express')
const router = express.Router()
const { authenticate, requireAdmin } = require('../../middleware/auth')
const { pool } = require('../../database/db')

// GET /api/v1/agent/admin/usage — usage log for org with optional filters
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { app_source, from_date, to_date, limit = 50, offset = 0 } = req.query

  let where = 'WHERE org_id = ?'
  const params = [req.user.orgId]

  if (app_source) { where += ' AND app_source = ?'; params.push(app_source) }
  if (from_date) { where += ' AND created_at >= ?'; params.push(from_date) }
  if (to_date) { where += ' AND created_at <= ?'; params.push(to_date) }

  const [logs] = await pool.execute(
    `SELECT id, app_source, query_type, tokens_in, tokens_out, provider, response_latency_ms, status, created_at
     FROM ai_agent_usage_log ${where}
     ORDER BY created_at DESC
     LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
    params
  )

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) as total FROM ai_agent_usage_log ${where}`,
    params
  )

  const [[summary]] = await pool.execute(
    `SELECT SUM(tokens_in) as total_tokens_in, SUM(tokens_out) as total_tokens_out, COUNT(*) as total_queries
     FROM ai_agent_usage_log ${where}`,
    params
  )

  res.json({ logs, total, summary })
})

module.exports = router
