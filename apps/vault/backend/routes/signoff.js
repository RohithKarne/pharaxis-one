const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.get('/content/:content_id', authenticate, async (req, res, next) => {
  try {
    const contentId = Number(req.params.content_id || 0)
    if (!Number.isInteger(contentId) || contentId <= 0) {
      return res.status(400).json({ error: 'Invalid content_id' })
    }

    const [rows] = await pool.execute(
      `SELECT
         vs.id,
         u.name AS signer_name,
         u.email AS signer_email,
         u.role AS signer_role,
         wt.task_type,
         wt.step_order,
         vs.signature_meaning,
         vs.signature_comment,
         vs.hash_snapshot,
         vs.signed_at,
         vs.ip_address,
         vv.version_number
       FROM vault_signatures vs
       JOIN workflow_tasks wt ON wt.id = vs.workflow_task_id
       JOIN users u ON u.id = vs.signer_user_id
       LEFT JOIN vault_content vc ON vc.id = vs.content_id AND vc.org_id = vs.org_id
       LEFT JOIN vault_versions vv ON vv.id = vc.current_version_id
       WHERE vs.content_id = ? AND vs.org_id = ?
       ORDER BY vs.signed_at ASC`,
      [contentId, req.user.orgId]
    )

    return res.json(rows)
  } catch (err) {
    next(err)
  }
})

module.exports = router
