const express = require('express')
const crypto = require('crypto')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

function requireEditor(req, res, next) {
  if (!['admin', 'author'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/author can assign read-and-understood tasks' })
  }
  next()
}

function normalizeUserIds(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
  ))
}

function completionHash({ orgId, assignmentId, userId, contentId, completedAt }) {
  return crypto
    .createHash('sha256')
    .update([orgId, assignmentId, userId, contentId, completedAt].join(':'))
    .digest('hex')
}

router.get('/my', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT rua.id, rua.content_id, rua.status, rua.due_at, rua.completed_at, rua.created_at,
              vc.doc_number, vc.title, vc.lifecycle_state, assigner.name AS assigned_by_name
       FROM read_understood_assignments rua
       JOIN vault_content vc
         ON vc.id = rua.content_id
        AND vc.org_id = rua.org_id
       LEFT JOIN users assigner
         ON assigner.id = rua.assigned_by
        AND assigner.org_id = rua.org_id
       WHERE rua.org_id = ? AND rua.assignee_user_id = ?
       ORDER BY FIELD(rua.status, 'pending', 'completed', 'cancelled'), rua.due_at ASC, rua.created_at DESC`,
      [req.user.orgId, req.user.userId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List my training assignments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/content/:contentId', authenticate, async (req, res) => {
  const contentId = Number(req.params.contentId)
  if (!Number.isInteger(contentId) || contentId <= 0) return res.status(400).json({ error: 'Invalid content id' })

  try {
    const [rows] = await pool.execute(
      `SELECT rua.id, rua.content_id, rua.assignee_user_id, rua.status, rua.due_at, rua.completed_at,
              rua.acknowledgement_text, rua.created_at, assignee.name AS assignee_name,
              assignee.email AS assignee_email, assigner.name AS assigned_by_name
       FROM read_understood_assignments rua
       JOIN users assignee
         ON assignee.id = rua.assignee_user_id
        AND assignee.org_id = rua.org_id
       LEFT JOIN users assigner
         ON assigner.id = rua.assigned_by
        AND assigner.org_id = rua.org_id
       WHERE rua.org_id = ? AND rua.content_id = ?
       ORDER BY rua.created_at DESC, rua.id DESC`,
      [req.user.orgId, contentId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List content training assignments error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/content/:contentId/assign', authenticate, requireEditor, async (req, res) => {
  const contentId = Number(req.params.contentId)
  const assigneeIds = normalizeUserIds(req.body.assignee_user_ids)
  const dueAt = req.body.due_at || null
  if (!Number.isInteger(contentId) || contentId <= 0) return res.status(400).json({ error: 'Invalid content id' })
  if (!assigneeIds.length) return res.status(400).json({ error: 'assignee_user_ids are required' })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [[content]] = await connection.execute(
      'SELECT id FROM vault_content WHERE id = ? AND org_id = ?',
      [contentId, req.user.orgId]
    )
    if (!content) {
      await connection.rollback()
      return res.status(404).json({ error: 'Content not found' })
    }

    let created = 0
    for (const assigneeId of assigneeIds) {
      const [[user]] = await connection.execute(
        'SELECT id FROM users WHERE id = ? AND org_id = ? AND is_active = 1',
        [assigneeId, req.user.orgId]
      )
      if (!user) continue

      await connection.execute(
        `INSERT INTO read_understood_assignments
         (org_id, content_id, assignee_user_id, assigned_by, due_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE due_at = VALUES(due_at), status = 'pending'`,
        [req.user.orgId, contentId, assigneeId, req.user.userId, dueAt]
      )
      created += 1
    }

    await connection.commit()
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'training_assigned',
      'read_understood_assignment',
      contentId,
      req.ip,
      null,
      { content_id: contentId, assignee_user_ids: assigneeIds, created },
      'Read-and-understood assignments created'
    )
    res.status(201).json({ message: 'Assignments created', created })
  } catch (error) {
    await connection.rollback()
    console.error('Assign training error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

router.get('/assignments/:id/certificate', authenticate, async (req, res) => {
  const assignmentId = Number(req.params.id)
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ error: 'Invalid assignment id' })

  try {
    const [[row]] = await pool.execute(
      `SELECT rua.id, rua.org_id, rua.content_id, rua.assignee_user_id, rua.status, rua.due_at, rua.completed_at,
              rua.acknowledgement_text, rua.completion_hash,
              vc.doc_number, vc.title, vc.lifecycle_state,
              assignee.name AS assignee_name, assignee.email AS assignee_email,
              assigner.name AS assigned_by_name
       FROM read_understood_assignments rua
       JOIN vault_content vc ON vc.id = rua.content_id AND vc.org_id = rua.org_id
       JOIN users assignee ON assignee.id = rua.assignee_user_id AND assignee.org_id = rua.org_id
       LEFT JOIN users assigner ON assigner.id = rua.assigned_by AND assigner.org_id = rua.org_id
       WHERE rua.id = ?
         AND rua.org_id = ?
         AND (rua.assignee_user_id = ? OR ? IN ('admin','author'))`,
      [assignmentId, req.user.orgId, req.user.userId, req.user.role]
    )
    if (!row) return res.status(404).json({ error: 'Assignment not found' })
    if (row.status !== 'completed') return res.status(409).json({ error: 'Assignment is not completed yet' })
    res.json({
      certificate_id: `RUA-${row.id}`,
      document: {
        id: row.content_id,
        doc_number: row.doc_number,
        title: row.title,
        lifecycle_state: row.lifecycle_state
      },
      assignee: {
        id: row.assignee_user_id,
        name: row.assignee_name,
        email: row.assignee_email
      },
      assigned_by_name: row.assigned_by_name,
      completed_at: row.completed_at,
      acknowledgement_text: row.acknowledgement_text,
      completion_hash: row.completion_hash
    })
  } catch (error) {
    console.error('Training certificate error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/assignments/:id/remind', authenticate, requireEditor, async (req, res) => {
  const assignmentId = Number(req.params.id)
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ error: 'Invalid assignment id' })

  try {
    const [result] = await pool.execute(
      `UPDATE read_understood_assignments
       SET reminder_count = reminder_count + 1,
           last_reminded_at = NOW()
       WHERE id = ? AND org_id = ? AND status = 'pending'`,
      [assignmentId, req.user.orgId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Pending assignment not found' })
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'training_reminder_sent',
      'read_understood_assignment',
      assignmentId,
      req.ip,
      null,
      { reminder_sent: true },
      'Read-and-understood reminder recorded'
    )
    res.json({ message: 'Reminder recorded' })
  } catch (error) {
    console.error('Training reminder error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/assignments/:id/complete', authenticate, async (req, res) => {
  const assignmentId = Number(req.params.id)
  const acknowledgement = String(req.body.acknowledgement_text || 'I have read and understood this document.').trim().slice(0, 500)
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ error: 'Invalid assignment id' })

  try {
    const [[assignment]] = await pool.execute(
      `SELECT id, org_id, content_id, assignee_user_id
       FROM read_understood_assignments
       WHERE id = ? AND org_id = ? AND assignee_user_id = ? AND status = 'pending'`,
      [assignmentId, req.user.orgId, req.user.userId]
    )
    if (!assignment) return res.status(404).json({ error: 'Pending assignment not found' })

    const completedAt = new Date()
    const hash = completionHash({
      orgId: req.user.orgId,
      assignmentId,
      userId: req.user.userId,
      contentId: assignment.content_id,
      completedAt: completedAt.toISOString()
    })

    const [result] = await pool.execute(
      `UPDATE read_understood_assignments
       SET status = 'completed',
           completed_at = ?,
           acknowledgement_text = ?,
           completion_hash = ?
       WHERE id = ?
         AND org_id = ?
         AND assignee_user_id = ?
         AND status = 'pending'`,
      [completedAt, acknowledgement, hash, assignmentId, req.user.orgId, req.user.userId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Pending assignment not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'training_completed',
      'read_understood_assignment',
      assignmentId,
      req.ip,
      null,
      { status: 'completed', acknowledgement_text: acknowledgement, completion_hash: hash },
      'Read-and-understood assignment completed'
    )
    res.json({ message: 'Assignment completed', completion_hash: hash })
  } catch (error) {
    console.error('Complete training error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/assignments/:id/cancel', authenticate, requireEditor, async (req, res) => {
  const assignmentId = Number(req.params.id)
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ error: 'Invalid assignment id' })

  try {
    const [result] = await pool.execute(
      `UPDATE read_understood_assignments
       SET status = 'cancelled'
       WHERE id = ? AND org_id = ? AND status = 'pending'`,
      [assignmentId, req.user.orgId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Pending assignment not found' })
    res.json({ message: 'Assignment cancelled' })
  } catch (error) {
    console.error('Cancel training error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
