const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

function normalizeSavedSearchPayload(body = {}) {
  const name = String(body.name || '').trim().slice(0, 180)
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : null
  const isShared = body.is_shared ? 1 : 0
  return { name, filters, isShared }
}

router.get('/saved', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, user_id, name, filters_json, is_shared, created_at, updated_at
       FROM vault_saved_searches
       WHERE org_id = ?
         AND (user_id = ? OR is_shared = 1)
       ORDER BY is_shared DESC, updated_at DESC, created_at DESC`,
      [req.user.orgId, req.user.userId]
    )

    res.json(rows.map(row => ({
      id: row.id,
      name: row.name,
      filters: row.filters_json || {},
      is_shared: Number(row.is_shared) === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      owned_by_current_user: Number(row.user_id) === Number(req.user.userId)
    })))
  } catch (error) {
    console.error('List saved searches error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/saved', authenticate, async (req, res) => {
  const { name, filters, isShared } = normalizeSavedSearchPayload(req.body)
  if (!name) return res.status(400).json({ error: 'Search name is required' })
  if (!filters) return res.status(400).json({ error: 'filters object is required' })

  try {
    const [result] = await pool.execute(
      `INSERT INTO vault_saved_searches (org_id, user_id, name, filters_json, is_shared)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, req.user.userId, name, JSON.stringify(filters), req.user.role === 'admin' ? isShared : 0]
    )

    res.status(201).json({
      id: result.insertId,
      name,
      filters,
      is_shared: req.user.role === 'admin' ? Boolean(isShared) : false
    })
  } catch (error) {
    console.error('Create saved search error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/saved/:id', authenticate, async (req, res) => {
  const savedSearchId = Number(req.params.id)
  if (!Number.isInteger(savedSearchId) || savedSearchId <= 0) {
    return res.status(400).json({ error: 'Invalid saved search id' })
  }

  const { name, filters, isShared } = normalizeSavedSearchPayload(req.body)

  try {
    const [[existing]] = await pool.execute(
      `SELECT id, user_id
       FROM vault_saved_searches
       WHERE id = ? AND org_id = ?`,
      [savedSearchId, req.user.orgId]
    )
    if (!existing) return res.status(404).json({ error: 'Saved search not found' })
    if (Number(existing.user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'Only the owner can edit this saved search' })
    }

    await pool.execute(
      `UPDATE vault_saved_searches
       SET name = COALESCE(?, name),
           filters_json = COALESCE(?, filters_json),
           is_shared = ?
       WHERE id = ? AND org_id = ?`,
      [
        name || null,
        filters ? JSON.stringify(filters) : null,
        req.user.role === 'admin' ? isShared : 0,
        savedSearchId,
        req.user.orgId
      ]
    )

    res.json({ message: 'Saved search updated', id: savedSearchId })
  } catch (error) {
    console.error('Update saved search error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/saved/:id', authenticate, async (req, res) => {
  const savedSearchId = Number(req.params.id)
  if (!Number.isInteger(savedSearchId) || savedSearchId <= 0) {
    return res.status(400).json({ error: 'Invalid saved search id' })
  }

  try {
    const [result] = await pool.execute(
      `DELETE FROM vault_saved_searches
       WHERE id = ?
         AND org_id = ?
         AND user_id = ?`,
      [savedSearchId, req.user.orgId, req.user.userId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Saved search not found' })
    res.json({ message: 'Saved search deleted', id: savedSearchId })
  } catch (error) {
    console.error('Delete saved search error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

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
