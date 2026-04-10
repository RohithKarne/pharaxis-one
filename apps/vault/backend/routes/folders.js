const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Allowed roles: ${allowedRoles.join(', ')}` })
    }
    next()
  }
}

function toPathSegment(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildTree(rows, parentId = null) {
  return rows
    .filter(row => (row.parent_id === null ? null : Number(row.parent_id)) === parentId)
    .map(row => ({
      id: row.id,
      org_id: row.org_id,
      parent_id: row.parent_id,
      name: row.name,
      path: row.path,
      is_active: row.is_active,
      created_by: row.created_by,
      created_at: row.created_at,
      children: buildTree(rows, row.id)
    }))
}

async function getFolderById(folderId, orgId) {
  const [[folder]] = await pool.execute(
    `SELECT id, org_id, parent_id, name, path, is_active
     FROM vault_folders
     WHERE id = ? AND org_id = ?`,
    [folderId, orgId]
  )
  return folder
}

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, parent_id, name, path, is_active, created_by, created_at
       FROM vault_folders
       WHERE org_id = ? AND is_active = 1
       ORDER BY path ASC, created_at ASC`,
      [req.user.orgId]
    )
    res.json(buildTree(rows))
  } catch (error) {
    console.error('List folders error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, requireRole(['admin', 'author']), async (req, res) => {
  const { name, parent_id } = req.body
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' })

  const normalizedName = String(name).trim()
  const parentId = parent_id === undefined || parent_id === null || parent_id === '' ? null : Number(parent_id)
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
    return res.status(400).json({ error: 'Invalid parent_id' })
  }

  const segment = toPathSegment(normalizedName)
  if (!segment) return res.status(400).json({ error: 'Folder name has no valid path segment' })

  try {
    let parent = null
    if (parentId !== null) {
      parent = await getFolderById(parentId, req.user.orgId)
      if (!parent || Number(parent.is_active) !== 1) {
        return res.status(404).json({ error: 'Parent folder not found or inactive' })
      }
    }

    const computedPath = parent ? `${parent.path}/${segment}` : `/${segment}`

    const [existingWithName] = await pool.execute(
      `SELECT id FROM vault_folders
       WHERE org_id = ?
         AND is_active = 1
         AND name = ?
         AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)`,
      [req.user.orgId, normalizedName, parentId, parentId]
    )
    if (existingWithName.length) {
      return res.status(409).json({ error: 'Folder with same name already exists at this level' })
    }

    const [result] = await pool.execute(
      `INSERT INTO vault_folders (org_id, parent_id, name, path, is_active, created_by)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [req.user.orgId, parentId, normalizedName, computedPath, req.user.userId]
    )

    const created = await getFolderById(result.insertId, req.user.orgId)
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'folder_created',
      'vault_folder',
      result.insertId,
      req.ip,
      null,
      created,
      'Folder created'
    )

    res.status(201).json(created)
  } catch (error) {
    console.error('Create folder error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id', authenticate, requireRole(['admin']), async (req, res) => {
  const folderId = Number(req.params.id)
  const { name } = req.body
  if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'Invalid folder id' })
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' })

  const normalizedName = String(name).trim()
  const newSegment = toPathSegment(normalizedName)
  if (!newSegment) return res.status(400).json({ error: 'Folder name has no valid path segment' })

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[existing]] = await connection.execute(
      `SELECT id, org_id, parent_id, name, path, is_active
       FROM vault_folders
       WHERE id = ? AND org_id = ? FOR UPDATE`,
      [folderId, req.user.orgId]
    )
    if (!existing || Number(existing.is_active) !== 1) {
      await connection.rollback()
      return res.status(404).json({ error: 'Folder not found or inactive' })
    }

    const [nameCollision] = await connection.execute(
      `SELECT id
       FROM vault_folders
       WHERE org_id = ?
         AND id <> ?
         AND is_active = 1
         AND name = ?
         AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)`,
      [req.user.orgId, folderId, normalizedName, existing.parent_id, existing.parent_id]
    )
    if (nameCollision.length) {
      await connection.rollback()
      return res.status(409).json({ error: 'Sibling folder with same name already exists' })
    }

    const parentPath = existing.parent_id
      ? (await connection.execute(
          'SELECT path FROM vault_folders WHERE id = ? AND org_id = ?',
          [existing.parent_id, req.user.orgId]
        ))[0][0]?.path
      : ''
    const newPath = existing.parent_id ? `${parentPath}/${newSegment}` : `/${newSegment}`

    await connection.execute(
      'UPDATE vault_folders SET name = ?, path = ? WHERE id = ? AND org_id = ?',
      [normalizedName, newPath, folderId, req.user.orgId]
    )

    // Keep hierarchy paths consistent for descendants.
    await connection.execute(
      `UPDATE vault_folders
       SET path = CONCAT(?, SUBSTRING(path, ?))
       WHERE org_id = ?
         AND path LIKE CONCAT(?, '/%')`,
      [newPath, existing.path.length + 1, req.user.orgId, existing.path]
    )

    await connection.commit()

    const updated = await getFolderById(folderId, req.user.orgId)
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'folder_renamed',
      'vault_folder',
      folderId,
      req.ip,
      existing,
      updated,
      'Folder renamed'
    )

    res.json({ message: 'Folder renamed', folder: updated })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Rename folder error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

// Soft deactivate folder/subtree. No hard delete.
router.delete('/:id', authenticate, requireRole(['admin']), async (req, res) => {
  const folderId = Number(req.params.id)
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'Invalid folder id' })
  }

  try {
    const folder = await getFolderById(folderId, req.user.orgId)
    if (!folder || Number(folder.is_active) !== 1) {
      return res.status(404).json({ error: 'Folder not found or already inactive' })
    }

    const [[contentCheck]] = await pool.execute(
      `SELECT COUNT(vc.id) AS content_count
       FROM vault_content vc
       JOIN vault_folders vf
         ON vf.id = vc.folder_id
        AND vf.org_id = vc.org_id
       WHERE vc.org_id = ?
         AND vf.is_active = 1
         AND (vf.id = ? OR vf.path LIKE CONCAT(?, '/%'))`,
      [req.user.orgId, folderId, folder.path]
    )

    if (Number(contentCheck.content_count) > 0) {
      return res.status(409).json({
        error: 'Folder contains content and cannot be deactivated',
        content_count: Number(contentCheck.content_count)
      })
    }

    const [result] = await pool.execute(
      `UPDATE vault_folders
       SET is_active = 0
       WHERE org_id = ?
         AND is_active = 1
         AND (id = ? OR path LIKE CONCAT(?, '/%'))`,
      [req.user.orgId, folderId, folder.path]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'folder_deactivated',
      'vault_folder',
      folderId,
      req.ip,
      { id: folderId, path: folder.path, is_active: 1 },
      { is_active: 0, affected_count: result.affectedRows },
      'Folder subtree soft-deactivated'
    )

    res.json({ message: 'Folder deactivated', affected_count: result.affectedRows })
  } catch (error) {
    console.error('Deactivate folder error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
