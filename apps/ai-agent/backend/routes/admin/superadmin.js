const express = require('express')
const router = express.Router()
const { pool } = require('../../database/db')

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

router.get('/dashboard', async (_req, res) => {
  try {
    const [[statsRow]] = await pool.execute(
      `SELECT
        (SELECT COUNT(*) FROM ai_agent_org_config) AS total_orgs_configured,
        (SELECT COUNT(*) FROM ai_agent_org_config WHERE is_active = 1) AS total_orgs_active,
        (SELECT COUNT(*) FROM ai_agent_usage_log WHERE DATE(created_at) = CURDATE()) AS total_queries_today,
        (SELECT COUNT(*) FROM ai_agent_usage_log) AS total_queries_all_time,
        (SELECT COALESCE(SUM(tokens_in + tokens_out), 0) FROM ai_agent_usage_log) AS total_tokens_all_time,
        (SELECT COALESCE(SUM(tokens_in + tokens_out), 0) FROM ai_agent_usage_log WHERE DATE(created_at) = CURDATE()) AS total_tokens_today`
    )

    const [byAppRows] = await pool.execute(
      `SELECT app_source, COUNT(*) AS total_queries, COALESCE(SUM(tokens_in + tokens_out), 0) AS total_tokens
       FROM ai_agent_usage_log
       GROUP BY app_source
       ORDER BY total_queries DESC`
    )

    const [byProviderRows] = await pool.execute(
      `SELECT provider, COUNT(*) AS total_queries, COALESCE(SUM(tokens_in + tokens_out), 0) AS total_tokens
       FROM ai_agent_usage_log
       GROUP BY provider
       ORDER BY total_queries DESC`
    )

    const [recentRows] = await pool.execute(
      `SELECT id, org_id, app_source, query_type, provider, tokens_in, tokens_out, status, created_at
       FROM ai_agent_usage_log
       ORDER BY created_at DESC
       LIMIT 10`
    )

    res.json({
      stats: {
        total_orgs_configured: toNumber(statsRow?.total_orgs_configured),
        total_orgs_active: toNumber(statsRow?.total_orgs_active),
        total_queries_today: toNumber(statsRow?.total_queries_today),
        total_queries_all_time: toNumber(statsRow?.total_queries_all_time),
        total_tokens_all_time: toNumber(statsRow?.total_tokens_all_time),
        total_tokens_today: toNumber(statsRow?.total_tokens_today)
      },
      by_app: byAppRows.map(row => ({
        app_source: row.app_source,
        total_queries: toNumber(row.total_queries),
        total_tokens: toNumber(row.total_tokens)
      })),
      by_provider: byProviderRows.map(row => ({
        provider: row.provider,
        total_queries: toNumber(row.total_queries),
        total_tokens: toNumber(row.total_tokens)
      })),
      recent_activity: recentRows.map(row => ({
        id: toNumber(row.id),
        org_id: toNumber(row.org_id),
        app_source: row.app_source,
        query_type: row.query_type,
        provider: row.provider,
        tokens_in: toNumber(row.tokens_in),
        tokens_out: toNumber(row.tokens_out),
        status: row.status,
        created_at: row.created_at
      }))
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch superadmin dashboard data' })
  }
})

router.get('/orgs', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         c.org_id,
         c.provider,
         c.is_active,
         c.updated_at,
         COALESCE(u.total_queries, 0) AS total_queries,
         COALESCE(u.total_tokens, 0) AS total_tokens,
         u.last_query_at
       FROM ai_agent_org_config c
       LEFT JOIN (
         SELECT
           org_id,
           COUNT(*) AS total_queries,
           COALESCE(SUM(tokens_in + tokens_out), 0) AS total_tokens,
           MAX(created_at) AS last_query_at
         FROM ai_agent_usage_log
         GROUP BY org_id
       ) u ON u.org_id = c.org_id
       ORDER BY c.org_id ASC`
    )

    res.json({
      orgs: rows.map(row => ({
        org_id: toNumber(row.org_id),
        provider: row.provider,
        is_active: Boolean(row.is_active),
        updated_at: row.updated_at,
        total_queries: toNumber(row.total_queries),
        total_tokens: toNumber(row.total_tokens),
        last_query_at: row.last_query_at
      }))
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch organisations' })
  }
})

router.patch('/orgs/:orgId/toggle', async (req, res) => {
  try {
    const orgId = Number(req.params.orgId)
    const { is_active } = req.body

    if (!Number.isInteger(orgId) || orgId <= 0) {
      return res.status(400).json({ error: 'Invalid orgId' })
    }

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' })
    }

    const [result] = await pool.execute(
      'UPDATE ai_agent_org_config SET is_active = ?, updated_at = NOW() WHERE org_id = ?',
      [is_active ? 1 : 0, orgId]
    )

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Organisation config not found' })
    }

    res.json({ success: true, org_id: orgId, is_active })
  } catch {
    res.status(500).json({ error: 'Failed to update organisation status' })
  }
})

module.exports = router
