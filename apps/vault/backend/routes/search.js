const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.get('/', authenticate, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10))
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '25', 10)))
  const offset = (page - 1) * limit

  const where = ['vc.org_id = ?']
  const params = [req.user.orgId]

  if (req.query.q) {
    where.push('(vc.title LIKE ? OR vc.doc_number LIKE ? OR vm.keywords LIKE ?)')
    const q = `%${req.query.q}%`
    params.push(q, q, q)
  }

  if (req.query.type_id) {
    where.push('vc.content_type_id = ?')
    params.push(Number(req.query.type_id))
  }
  if (req.query.subtype_id) {
    where.push('vc.content_subtype_id = ?')
    params.push(Number(req.query.subtype_id))
  }
  if (req.query.classification_id) {
    where.push('vc.classification_id = ?')
    params.push(Number(req.query.classification_id))
  }
  if (req.query.state) {
    where.push('vc.lifecycle_state = ?')
    params.push(req.query.state)
  }
  if (req.query.folder_id) {
    where.push('vc.folder_id = ?')
    params.push(Number(req.query.folder_id))
  }
  if (req.query.regulated !== undefined && req.query.regulated !== '') {
    where.push('vm.regulated = ?')
    params.push(['1', 'true', 'yes'].includes(String(req.query.regulated).toLowerCase()) ? 1 : 0)
  }
  if (req.query.audience) {
    where.push('vm.audience = ?')
    params.push(req.query.audience)
  }
  if (req.query.confidentiality) {
    where.push('vm.confidentiality = ?')
    params.push(req.query.confidentiality)
  }

  if (req.query.date_from) {
    where.push('DATE(vc.created_at) >= DATE(?)')
    params.push(req.query.date_from)
  }
  if (req.query.date_to) {
    where.push('DATE(vc.created_at) <= DATE(?)')
    params.push(req.query.date_to)
  }

  if (req.query.effective_from) {
    where.push('DATE(vm.effective_date) >= DATE(?)')
    params.push(req.query.effective_from)
  }
  if (req.query.effective_to) {
    where.push('DATE(vm.effective_date) <= DATE(?)')
    params.push(req.query.effective_to)
  }

  if (req.query.expiry_from) {
    where.push('DATE(vm.expiry_date) >= DATE(?)')
    params.push(req.query.expiry_from)
  }
  if (req.query.expiry_to) {
    where.push('DATE(vm.expiry_date) <= DATE(?)')
    params.push(req.query.expiry_to)
  }

  try {
    const [results] = await pool.execute(
      `SELECT
         vc.id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         vc.created_at,
         vc.updated_at,
         vc.folder_id,
         ct.name AS type_name,
         ct.code AS type_code,
         st.name AS subtype_name,
         c.name AS classification_name,
         vm.keywords,
         vm.regulated,
         vm.audience,
         vm.confidentiality,
         vm.effective_date,
         vm.expiry_date,
         vv.version_number
       FROM vault_content vc
       LEFT JOIN vault_metadata vm
         ON vm.content_id = vc.id
        AND vm.org_id = vc.org_id
       LEFT JOIN content_types ct
         ON ct.id = vc.content_type_id
        AND ct.org_id = vc.org_id
       LEFT JOIN content_subtypes st
         ON st.id = vc.content_subtype_id
        AND st.org_id = vc.org_id
       LEFT JOIN classifications c
         ON c.id = vc.classification_id
        AND c.org_id = vc.org_id
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY vc.updated_at DESC, vc.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM vault_content vc
       LEFT JOIN vault_metadata vm
         ON vm.content_id = vc.id
        AND vm.org_id = vc.org_id
       WHERE ${where.join(' AND ')}`,
      params
    )

    res.json({
      results,
      total: Number(countRow.total),
      page,
      limit
    })
  } catch (error) {
    console.error('Search content error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
