const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

const RELATIONSHIP_TYPES = new Set([
  'supersedes',
  'superseded_by',
  'related_to',
  'parent',
  'child',
  'supporting'
])

const RECIPROCAL_TYPES = {
  supersedes: 'superseded_by',
  superseded_by: 'supersedes',
  parent: 'child',
  child: 'parent',
  related_to: 'related_to',
  supporting: 'related_to'
}

function requireEditor(req, res, next) {
  if (!['admin', 'author'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/author can manage document relationships' })
  }
  next()
}

async function getContent(contentId, orgId) {
  const [[content]] = await pool.execute(
    `SELECT id, org_id, doc_number, title, lifecycle_state
     FROM vault_content
     WHERE id = ? AND org_id = ?`,
    [contentId, orgId]
  )
  return content
}

router.get('/content/:contentId', authenticate, async (req, res) => {
  const contentId = Number(req.params.contentId)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContent(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [rows] = await pool.execute(
      `SELECT
         r.id,
         r.relationship_type,
         r.notes,
         r.created_at,
         r.source_content_id,
         r.target_content_id,
         source.doc_number AS source_doc_number,
         source.title AS source_title,
         source.lifecycle_state AS source_lifecycle_state,
         target.doc_number AS target_doc_number,
         target.title AS target_title,
         target.lifecycle_state AS target_lifecycle_state,
         creator.name AS created_by_name
       FROM vault_document_relationships r
       JOIN vault_content source
         ON source.id = r.source_content_id
        AND source.org_id = r.org_id
       JOIN vault_content target
         ON target.id = r.target_content_id
        AND target.org_id = r.org_id
       LEFT JOIN users creator
         ON creator.id = r.created_by
        AND creator.org_id = r.org_id
       WHERE r.org_id = ?
         AND (r.source_content_id = ? OR r.target_content_id = ?)
       ORDER BY r.created_at DESC, r.id DESC`,
      [req.user.orgId, contentId, contentId]
    )

    res.json({
      content_id: contentId,
      outbound: rows.filter(row => Number(row.source_content_id) === contentId),
      inbound: rows.filter(row => Number(row.target_content_id) === contentId)
    })
  } catch (error) {
    console.error('List document relationships error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/impact/:contentId', authenticate, async (req, res) => {
  const contentId = Number(req.params.contentId)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.relationship_type, r.source_content_id, r.target_content_id,
              source.doc_number AS source_doc_number, source.title AS source_title,
              target.doc_number AS target_doc_number, target.title AS target_title
       FROM vault_document_relationships r
       JOIN vault_content source ON source.id = r.source_content_id AND source.org_id = r.org_id
       JOIN vault_content target ON target.id = r.target_content_id AND target.org_id = r.org_id
       WHERE r.org_id = ?
         AND (r.source_content_id = ? OR r.target_content_id = ?)`,
      [req.user.orgId, contentId, contentId]
    )
    const warnings = rows
      .filter(row => ['superseded_by', 'child', 'parent', 'supporting'].includes(row.relationship_type))
      .map(row => ({
        relationship_id: row.id,
        relationship_type: row.relationship_type,
        message: Number(row.source_content_id) === contentId
          ? `This document has a ${row.relationship_type} relationship with ${row.target_doc_number}.`
          : `This document is referenced by ${row.source_doc_number} as ${row.relationship_type}.`
      }))
    res.json({ content_id: contentId, relationship_count: rows.length, warnings })
  } catch (error) {
    console.error('Relationship impact error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, requireEditor, async (req, res) => {
  const sourceContentId = Number(req.body.source_content_id)
  const targetContentId = Number(req.body.target_content_id)
  const relationshipType = String(req.body.relationship_type || '').trim()
  const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null

  if (!Number.isInteger(sourceContentId) || sourceContentId <= 0) {
    return res.status(400).json({ error: 'source_content_id is required' })
  }
  if (!Number.isInteger(targetContentId) || targetContentId <= 0) {
    return res.status(400).json({ error: 'target_content_id is required' })
  }
  if (sourceContentId === targetContentId) {
    return res.status(400).json({ error: 'A document cannot be related to itself' })
  }
  if (!RELATIONSHIP_TYPES.has(relationshipType)) {
    return res.status(400).json({ error: 'Invalid relationship_type' })
  }

  try {
    const [contentRows] = await pool.execute(
      `SELECT id
       FROM vault_content
       WHERE org_id = ? AND id IN (?, ?)`,
      [req.user.orgId, sourceContentId, targetContentId]
    )
    if (contentRows.length !== 2) {
      return res.status(404).json({ error: 'Source or target content not found' })
    }

    const connection = await pool.getConnection()
    let result
    try {
      await connection.beginTransaction()
      ;[result] = await connection.execute(
        `INSERT INTO vault_document_relationships
         (org_id, source_content_id, target_content_id, relationship_type, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.orgId, sourceContentId, targetContentId, relationshipType, notes, req.user.userId]
      )
      const reciprocalType = RECIPROCAL_TYPES[relationshipType]
      if (reciprocalType) {
        await connection.execute(
          `INSERT IGNORE INTO vault_document_relationships
           (org_id, source_content_id, target_content_id, relationship_type, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.user.orgId, targetContentId, sourceContentId, reciprocalType, notes, req.user.userId]
        )
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'document_relationship_created',
      'vault_document_relationship',
      result.insertId,
      req.ip,
      null,
      { source_content_id: sourceContentId, target_content_id: targetContentId, relationship_type: relationshipType, notes },
      'Document relationship created'
    )

    res.status(201).json({ id: result.insertId, message: 'Relationship created' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Relationship already exists' })
    }
    console.error('Create document relationship error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authenticate, requireEditor, async (req, res) => {
  const relationshipId = Number(req.params.id)
  if (!Number.isInteger(relationshipId) || relationshipId <= 0) {
    return res.status(400).json({ error: 'Invalid relationship id' })
  }

  try {
    const [[existing]] = await pool.execute(
      `SELECT id, source_content_id, target_content_id, relationship_type, notes
       FROM vault_document_relationships
       WHERE id = ? AND org_id = ?`,
      [relationshipId, req.user.orgId]
    )
    if (!existing) return res.status(404).json({ error: 'Relationship not found' })

    const reciprocalType = RECIPROCAL_TYPES[existing.relationship_type]
    await pool.execute(
      `DELETE FROM vault_document_relationships
       WHERE org_id = ?
         AND (
           id = ?
           OR (
             source_content_id = ?
             AND target_content_id = ?
             AND relationship_type = ?
           )
         )`,
      [req.user.orgId, relationshipId, existing.target_content_id, existing.source_content_id, reciprocalType || existing.relationship_type]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'document_relationship_deleted',
      'vault_document_relationship',
      relationshipId,
      req.ip,
      existing,
      null,
      'Document relationship deleted'
    )

    res.json({ message: 'Relationship deleted' })
  } catch (error) {
    console.error('Delete document relationship error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
