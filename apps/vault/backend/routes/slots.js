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
  const where = ['cs.org_id = ?']
  const params = [req.user.orgId]

  if (req.query.status) {
    where.push('cs.status = ?')
    params.push(req.query.status)
  }
  if (String(req.query.overdue || '').toLowerCase() === 'true') {
    where.push('cs.status = ? AND cs.due_date < CURDATE()')
    params.push('pending')
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         cs.id,
         cs.org_id,
         cs.title,
         cs.expected_type_id,
         cs.responsible_user_id,
         cs.due_date,
         cs.status,
         cs.folder_id,
         cs.dossier_id,
         cs.filled_content_id,
         cs.created_by,
         cs.created_at,
         u.name AS responsible_user_name,
         ct.name AS expected_type_name
       FROM content_slots cs
       LEFT JOIN users u
         ON u.id = cs.responsible_user_id
        AND u.org_id = cs.org_id
       LEFT JOIN content_types ct
         ON ct.id = cs.expected_type_id
        AND ct.org_id = cs.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY cs.due_date ASC, cs.created_at DESC`,
      params
    )

    res.json(rows)
  } catch (error) {
    console.error('List content slots error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { title, expected_type_id, responsible_user_id, due_date, folder_id, dossier_id } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const expectedTypeId = expected_type_id ? Number(expected_type_id) : null
  const responsibleUserId = responsible_user_id ? Number(responsible_user_id) : null
  const folderId = folder_id ? Number(folder_id) : null
  const dossierId = dossier_id ? Number(dossier_id) : null

  try {
    const [result] = await pool.execute(
      `INSERT INTO content_slots
         (org_id, folder_id, dossier_id, title, expected_type_id, responsible_user_id, due_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        req.user.orgId,
        folderId,
        dossierId,
        String(title).trim(),
        expectedTypeId,
        responsibleUserId,
        due_date || null,
        req.user.userId
      ]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'slot_created',
      'content_slot',
      result.insertId,
      req.ip,
      null,
      req.body,
      'Content slot created'
    )

    res.status(201).json({ id: result.insertId })
  } catch (error) {
    console.error('Create content slot error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid slot id' })

  const updates = []
  const params = []
  if (req.body.title !== undefined) {
    updates.push('title = ?')
    params.push(String(req.body.title).trim())
  }
  if (req.body.expected_type_id !== undefined) {
    updates.push('expected_type_id = ?')
    params.push(req.body.expected_type_id ? Number(req.body.expected_type_id) : null)
  }
  if (req.body.responsible_user_id !== undefined) {
    updates.push('responsible_user_id = ?')
    params.push(req.body.responsible_user_id ? Number(req.body.responsible_user_id) : null)
  }
  if (req.body.due_date !== undefined) {
    updates.push('due_date = ?')
    params.push(req.body.due_date || null)
  }
  if (req.body.status !== undefined) {
    if (!['pending', 'filled'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status must be pending/filled' })
    }
    updates.push('status = ?')
    params.push(req.body.status)
  }

  if (!updates.length) return res.status(400).json({ error: 'No updatable fields provided' })

  try {
    params.push(id, req.user.orgId)
    const [result] = await pool.execute(
      `UPDATE content_slots
       SET ${updates.join(', ')}
       WHERE id = ? AND org_id = ?`,
      params
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Slot not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'slot_updated',
      'content_slot',
      id,
      req.ip,
      null,
      req.body,
      'Content slot updated'
    )

    res.json({ message: 'Slot updated' })
  } catch (error) {
    console.error('Update content slot error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/fill', authenticate, requireAuthorOrAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const contentId = Number(req.body.content_id)

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Valid slot id and content_id are required' })
  }

  try {
    const [[content]] = await pool.execute(
      `SELECT id, org_id, content_type_id, folder_id
       FROM vault_content
       WHERE id = ? AND org_id = ?`,
      [contentId, req.user.orgId]
    )
    if (!content) return res.status(404).json({ error: 'Content not found in this organisation' })

    const [[slot]] = await pool.execute(
      `SELECT id, org_id, expected_type_id, folder_id, status
       FROM content_slots
       WHERE id = ? AND org_id = ?`,
      [id, req.user.orgId]
    )
    if (!slot) return res.status(404).json({ error: 'Slot not found' })

    if (slot.expected_type_id && Number(slot.expected_type_id) !== Number(content.content_type_id)) {
      return res.status(400).json({ error: 'Content type does not match slot expected type' })
    }

    if (slot.folder_id && Number(slot.folder_id) !== Number(content.folder_id)) {
      return res.status(400).json({ error: 'Content folder does not match slot folder' })
    }

    await pool.execute(
      `UPDATE content_slots
       SET status = 'filled', filled_content_id = ?
       WHERE id = ? AND org_id = ?`,
      [contentId, id, req.user.orgId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'slot_filled',
      'content_slot',
      id,
      req.ip,
      { status: slot.status, filled_content_id: null },
      { status: 'filled', filled_content_id: contentId },
      'Content slot filled'
    )

    res.json({ message: 'Slot filled', content_id: contentId })
  } catch (error) {
    console.error('Fill content slot error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
