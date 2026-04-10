const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')
const lifecycleService = require('../services/lifecycleService')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' })
  }
  next()
}

function normalizeActive(value) {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === 1 || value === 0) return value
  if (value === '1' || value === '0') return Number(value)
  return null
}

function toCode(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
}

async function ensureTypeInOrg(typeId, orgId) {
  const [[type]] = await pool.execute(
    'SELECT id, org_id, name, code, is_active FROM content_types WHERE id = ? AND org_id = ?',
    [typeId, orgId]
  )
  return type
}

async function ensureSubtypeInOrg(subtypeId, orgId) {
  const [[subtype]] = await pool.execute(
    'SELECT id, org_id, content_type_id, name, is_active FROM content_subtypes WHERE id = ? AND org_id = ?',
    [subtypeId, orgId]
  )
  return subtype
}

// Types
router.get('/types', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, name, code, is_active, created_at
       FROM content_types
       WHERE org_id = ?
       ORDER BY is_active DESC, name ASC`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List content types error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/types', authenticate, requireAdmin, async (req, res) => {
  const { name, code } = req.body
  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }

  const normalizedName = String(name).trim()
  const normalizedCode = toCode(code || name)
  if (!normalizedCode) {
    return res.status(400).json({ error: 'A valid code could not be derived from name/code' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO content_types (org_id, name, code, is_active)
       VALUES (?, ?, ?, 1)`,
      [req.user.orgId, normalizedName, normalizedCode]
    )

    await lifecycleService.ensureDefaultLifecycleForType(req.user.orgId, result.insertId)

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'taxonomy_changed',
      'content_type',
      result.insertId,
      req.ip,
      null,
      { name: normalizedName, code: normalizedCode, is_active: 1 },
      'Content type created'
    )

    res.status(201).json({
      id: result.insertId,
      org_id: req.user.orgId,
      name: normalizedName,
      code: normalizedCode,
      is_active: 1
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Type code already exists in this organisation' })
    }
    console.error('Create type error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/types/:id', authenticate, requireAdmin, async (req, res) => {
  const typeId = Number(req.params.id)
  if (!Number.isInteger(typeId) || typeId <= 0) {
    return res.status(400).json({ error: 'Invalid type id' })
  }

  const nextName = req.body.name
  const nextCode = req.body.code
  const nextIsActive = normalizeActive(req.body.is_active)
  if (nextName === undefined && nextCode === undefined && nextIsActive === undefined) {
    return res.status(400).json({ error: 'Provide name, code, and/or is_active' })
  }
  if (nextIsActive === null) {
    return res.status(400).json({ error: 'is_active must be true/false or 1/0' })
  }

  try {
    const existing = await ensureTypeInOrg(typeId, req.user.orgId)
    if (!existing) {
      return res.status(404).json({ error: 'Content type not found' })
    }

    const updates = []
    const values = []
    if (nextName !== undefined) {
      updates.push('name = ?')
      values.push(String(nextName).trim())
    }
    if (nextCode !== undefined) {
      const normalizedCode = toCode(nextCode)
      if (!normalizedCode) return res.status(400).json({ error: 'Invalid code' })
      updates.push('code = ?')
      values.push(normalizedCode)
    }
    if (nextIsActive !== undefined) {
      updates.push('is_active = ?')
      values.push(nextIsActive)
    }
    if (!updates.length) {
      return res.json({ message: 'No changes applied' })
    }

    values.push(typeId, req.user.orgId)
    await pool.execute(`UPDATE content_types SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`, values)

    const updated = await ensureTypeInOrg(typeId, req.user.orgId)
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'taxonomy_changed',
      'content_type',
      typeId,
      req.ip,
      existing,
      updated,
      'Content type updated'
    )

    res.json({ message: 'Content type updated', type: updated })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Type code already exists in this organisation' })
    }
    console.error('Update type error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Subtypes
router.get('/types/:typeId/subtypes', authenticate, async (req, res) => {
  const typeId = Number(req.params.typeId)
  if (!Number.isInteger(typeId) || typeId <= 0) {
    return res.status(400).json({ error: 'Invalid type id' })
  }

  try {
    const type = await ensureTypeInOrg(typeId, req.user.orgId)
    if (!type) return res.status(404).json({ error: 'Content type not found' })

    const [rows] = await pool.execute(
      `SELECT id, org_id, content_type_id, name, is_active, created_at
       FROM content_subtypes
       WHERE org_id = ? AND content_type_id = ?
       ORDER BY is_active DESC, name ASC`,
      [req.user.orgId, typeId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List subtypes error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/types/:typeId/subtypes', authenticate, requireAdmin, async (req, res) => {
  const typeId = Number(req.params.typeId)
  const { name } = req.body
  if (!Number.isInteger(typeId) || typeId <= 0) return res.status(400).json({ error: 'Invalid type id' })
  if (!name) return res.status(400).json({ error: 'name is required' })

  try {
    const type = await ensureTypeInOrg(typeId, req.user.orgId)
    if (!type) return res.status(404).json({ error: 'Content type not found' })

    const [result] = await pool.execute(
      `INSERT INTO content_subtypes (org_id, content_type_id, name, is_active)
       VALUES (?, ?, ?, 1)`,
      [req.user.orgId, typeId, String(name).trim()]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'taxonomy_changed',
      'content_subtype',
      result.insertId,
      req.ip,
      null,
      { content_type_id: typeId, name: String(name).trim(), is_active: 1 },
      'Content subtype created'
    )

    res.status(201).json({
      id: result.insertId,
      org_id: req.user.orgId,
      content_type_id: typeId,
      name: String(name).trim(),
      is_active: 1
    })
  } catch (error) {
    console.error('Create subtype error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/subtypes/:id', authenticate, requireAdmin, async (req, res) => {
  const subtypeId = Number(req.params.id)
  const nextName = req.body.name
  const nextIsActive = normalizeActive(req.body.is_active)
  if (!Number.isInteger(subtypeId) || subtypeId <= 0) return res.status(400).json({ error: 'Invalid subtype id' })
  if (nextName === undefined && nextIsActive === undefined) {
    return res.status(400).json({ error: 'Provide name and/or is_active' })
  }
  if (nextIsActive === null) {
    return res.status(400).json({ error: 'is_active must be true/false or 1/0' })
  }

  try {
    const existing = await ensureSubtypeInOrg(subtypeId, req.user.orgId)
    if (!existing) return res.status(404).json({ error: 'Subtype not found' })

    const updates = []
    const values = []
    if (nextName !== undefined) {
      updates.push('name = ?')
      values.push(String(nextName).trim())
    }
    if (nextIsActive !== undefined) {
      updates.push('is_active = ?')
      values.push(nextIsActive)
    }
    values.push(subtypeId, req.user.orgId)

    await pool.execute(`UPDATE content_subtypes SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`, values)
    const updated = await ensureSubtypeInOrg(subtypeId, req.user.orgId)

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'taxonomy_changed',
      'content_subtype',
      subtypeId,
      req.ip,
      existing,
      updated,
      'Content subtype updated'
    )

    res.json({ message: 'Subtype updated', subtype: updated })
  } catch (error) {
    console.error('Update subtype error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Classifications
router.get('/subtypes/:subtypeId/classifications', authenticate, async (req, res) => {
  const subtypeId = Number(req.params.subtypeId)
  if (!Number.isInteger(subtypeId) || subtypeId <= 0) {
    return res.status(400).json({ error: 'Invalid subtype id' })
  }

  try {
    const subtype = await ensureSubtypeInOrg(subtypeId, req.user.orgId)
    if (!subtype) return res.status(404).json({ error: 'Subtype not found' })

    const [rows] = await pool.execute(
      `SELECT id, org_id, content_subtype_id, name, is_active, created_at
       FROM classifications
       WHERE org_id = ? AND content_subtype_id = ?
       ORDER BY is_active DESC, name ASC`,
      [req.user.orgId, subtypeId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List classifications error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/subtypes/:subtypeId/classifications', authenticate, requireAdmin, async (req, res) => {
  const subtypeId = Number(req.params.subtypeId)
  const { name } = req.body
  if (!Number.isInteger(subtypeId) || subtypeId <= 0) return res.status(400).json({ error: 'Invalid subtype id' })
  if (!name) return res.status(400).json({ error: 'name is required' })

  try {
    const subtype = await ensureSubtypeInOrg(subtypeId, req.user.orgId)
    if (!subtype) return res.status(404).json({ error: 'Subtype not found' })

    const [result] = await pool.execute(
      `INSERT INTO classifications (org_id, content_subtype_id, name, is_active)
       VALUES (?, ?, ?, 1)`,
      [req.user.orgId, subtypeId, String(name).trim()]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'taxonomy_changed',
      'classification',
      result.insertId,
      req.ip,
      null,
      { content_subtype_id: subtypeId, name: String(name).trim(), is_active: 1 },
      'Classification created'
    )

    res.status(201).json({
      id: result.insertId,
      org_id: req.user.orgId,
      content_subtype_id: subtypeId,
      name: String(name).trim(),
      is_active: 1
    })
  } catch (error) {
    console.error('Create classification error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/classifications/:id', authenticate, requireAdmin, async (req, res) => {
  const classificationId = Number(req.params.id)
  const nextName = req.body.name
  const nextIsActive = normalizeActive(req.body.is_active)
  if (!Number.isInteger(classificationId) || classificationId <= 0) {
    return res.status(400).json({ error: 'Invalid classification id' })
  }
  if (nextName === undefined && nextIsActive === undefined) {
    return res.status(400).json({ error: 'Provide name and/or is_active' })
  }
  if (nextIsActive === null) {
    return res.status(400).json({ error: 'is_active must be true/false or 1/0' })
  }

  try {
    const [[existing]] = await pool.execute(
      `SELECT id, org_id, content_subtype_id, name, is_active
       FROM classifications
       WHERE id = ? AND org_id = ?`,
      [classificationId, req.user.orgId]
    )
    if (!existing) return res.status(404).json({ error: 'Classification not found' })

    const updates = []
    const values = []
    if (nextName !== undefined) {
      updates.push('name = ?')
      values.push(String(nextName).trim())
    }
    if (nextIsActive !== undefined) {
      updates.push('is_active = ?')
      values.push(nextIsActive)
    }
    values.push(classificationId, req.user.orgId)

    await pool.execute(`UPDATE classifications SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`, values)

    const [[updated]] = await pool.execute(
      `SELECT id, org_id, content_subtype_id, name, is_active
       FROM classifications
       WHERE id = ? AND org_id = ?`,
      [classificationId, req.user.orgId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'taxonomy_changed',
      'classification',
      classificationId,
      req.ip,
      existing,
      updated,
      'Classification updated'
    )

    res.json({ message: 'Classification updated', classification: updated })
  } catch (error) {
    console.error('Update classification error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
