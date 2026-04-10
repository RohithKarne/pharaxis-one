const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

function requireAuthorOrAdmin(req, res, next) {
  if (!['admin', 'author'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin or author role required' })
  }
  next()
}

router.get('/', authenticate, async (req, res) => {
  const where = ['d.org_id = ?']
  const params = [req.user.orgId]

  if (req.query.status) {
    where.push('d.status = ?')
    params.push(req.query.status)
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         d.id,
         d.org_id,
         d.title,
         d.description,
         d.status,
         d.created_by,
         d.created_at,
         COUNT(di.id) AS item_count
       FROM vault_dossiers d
       LEFT JOIN dossier_items di
         ON di.dossier_id = d.id
        AND di.org_id = d.org_id
       WHERE ${where.join(' AND ')}
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      params
    )

    res.json(rows)
  } catch (error) {
    console.error('List dossiers error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, requireAuthorOrAdmin, async (req, res) => {
  const { title, description } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  try {
    const [result] = await pool.execute(
      `INSERT INTO vault_dossiers (org_id, title, description, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`,
      [req.user.orgId, String(title).trim(), description || null, req.user.userId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'dossier_created',
      'vault_dossier',
      result.insertId,
      req.ip,
      null,
      req.body,
      'Dossier created'
    )

    res.status(201).json({ id: result.insertId })
  } catch (error) {
    console.error('Create dossier error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id', authenticate, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid dossier id' })

  try {
    const [[dossier]] = await pool.execute(
      `SELECT id, org_id, title, description, status, created_by, created_at
       FROM vault_dossiers
       WHERE id = ? AND org_id = ?`,
      [id, req.user.orgId]
    )
    if (!dossier) return res.status(404).json({ error: 'Dossier not found' })

    const [items] = await pool.execute(
      `SELECT
         di.id,
         di.position,
         di.content_id,
         di.added_by,
         di.added_at,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         vv.version_number
       FROM dossier_items di
       JOIN vault_content vc
         ON vc.id = di.content_id
        AND vc.org_id = di.org_id
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       WHERE di.dossier_id = ?
         AND di.org_id = ?
       ORDER BY di.position ASC, di.id ASC`,
      [id, req.user.orgId]
    )

    res.json({ ...dossier, items })
  } catch (error) {
    console.error('Get dossier detail error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid dossier id' })

  const updates = []
  const params = []

  if (req.body.title !== undefined) {
    updates.push('title = ?')
    params.push(String(req.body.title).trim())
  }
  if (req.body.description !== undefined) {
    updates.push('description = ?')
    params.push(req.body.description || null)
  }
  if (req.body.status !== undefined) {
    if (!['draft', 'final', 'archived'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status must be draft/final/archived' })
    }
    updates.push('status = ?')
    params.push(req.body.status)
  }

  if (!updates.length) return res.status(400).json({ error: 'No updatable fields provided' })

  try {
    params.push(id, req.user.orgId)
    const [result] = await pool.execute(
      `UPDATE vault_dossiers
       SET ${updates.join(', ')}
       WHERE id = ? AND org_id = ?`,
      params
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Dossier not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'dossier_updated',
      'vault_dossier',
      id,
      req.ip,
      null,
      req.body,
      'Dossier updated'
    )

    res.json({ message: 'Dossier updated' })
  } catch (error) {
    console.error('Update dossier error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/items', authenticate, requireAuthorOrAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const contentId = Number(req.body.content_id)
  const position = Number(req.body.position || 0)

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Valid dossier id and content_id are required' })
  }

  try {
    const [[dossier]] = await pool.execute(
      'SELECT id FROM vault_dossiers WHERE id = ? AND org_id = ?',
      [id, req.user.orgId]
    )
    if (!dossier) return res.status(404).json({ error: 'Dossier not found' })

    const [[content]] = await pool.execute(
      'SELECT id FROM vault_content WHERE id = ? AND org_id = ?',
      [contentId, req.user.orgId]
    )
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [result] = await pool.execute(
      `INSERT INTO dossier_items (org_id, dossier_id, content_id, position, added_by)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, id, contentId, Number.isInteger(position) ? position : 0, req.user.userId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'dossier_item_added',
      'dossier_item',
      result.insertId,
      req.ip,
      null,
      { dossier_id: id, content_id: contentId, position },
      'Dossier item added'
    )

    res.status(201).json({ id: result.insertId })
  } catch (error) {
    console.error('Add dossier item error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id/items/:itemId', authenticate, requireAuthorOrAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const itemId = Number(req.params.itemId)

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid dossier/item id' })
  }

  try {
    const [result] = await pool.execute(
      `DELETE FROM dossier_items
       WHERE id = ? AND dossier_id = ? AND org_id = ?`,
      [itemId, id, req.user.orgId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Dossier item not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'dossier_item_removed',
      'dossier_item',
      itemId,
      req.ip,
      null,
      { dossier_id: id },
      'Dossier item removed'
    )

    res.json({ message: 'Dossier item removed' })
  } catch (error) {
    console.error('Remove dossier item error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/items/reorder', authenticate, requireAuthorOrAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const items = Array.isArray(req.body.items) ? req.body.items : []

  if (!Number.isInteger(id) || id <= 0 || !items.length) {
    return res.status(400).json({ error: 'dossier id and non-empty items are required' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    for (const item of items) {
      const itemId = Number(item.itemId)
      const position = Number(item.position)
      if (!Number.isInteger(itemId) || !Number.isInteger(position)) {
        throw new Error('Invalid itemId/position in reorder payload')
      }

      await connection.execute(
        `UPDATE dossier_items
         SET position = ?
         WHERE id = ? AND dossier_id = ? AND org_id = ?`,
        [position, itemId, id, req.user.orgId]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'dossier_items_reordered',
      'vault_dossier',
      id,
      req.ip,
      null,
      { items },
      'Dossier items reordered'
    )

    res.json({ message: 'Dossier items reordered', count: items.length })
  } catch (error) {
    await connection.rollback()
    res.status(400).json({ error: error.message || 'Invalid payload' })
  } finally {
    connection.release()
  }
})

module.exports = router
