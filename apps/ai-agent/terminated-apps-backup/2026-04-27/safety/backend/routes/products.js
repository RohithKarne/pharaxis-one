const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess, canAccessClient } = require('../middleware/rbac')
const { MODULES } = require('../constants')
const { logAdminAction } = require('../services/auditService')
const { resolveClientScope } = require('../services/tenantScopeService')

const router = express.Router()

router.use(authenticate)

router.get('/catalog', async (req, res) => {
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : req.user.clientId

  if (requestedClientId && !canAccessClient(req.user, requestedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const params = [req.user.orgId]
    let clientFilterSql = ''

    if (requestedClientId) {
      params.push(requestedClientId)
      clientFilterSql = 'AND (p.client_id = ? OR p.client_id IS NULL)'
    }

    const [rows] = await pool.execute(
      `SELECT
        p.product_id,
        p.product_name,
        p.product_code,
        p.client_id,
        GROUP_CONCAT(DISTINCT i.indication_name ORDER BY i.indication_name SEPARATOR ', ') AS indications,
        GROUP_CONCAT(DISTINCT s.study_code ORDER BY s.study_code SEPARATOR ', ') AS study_codes
       FROM products p
       LEFT JOIN product_indications i ON i.product_id = p.product_id AND i.status = 'active'
       LEFT JOIN product_study_codes s ON s.product_id = p.product_id AND s.status = 'active'
       WHERE p.org_id = ?
         AND p.status = 'active'
         ${clientFilterSql}
       GROUP BY p.product_id, p.product_name, p.product_code, p.client_id
       ORDER BY p.product_name ASC`,
      params
    )

    return res.json(rows)
  } catch (error) {
    console.error('Fetch product catalog failed:', error)
    return res.status(500).json({ error: 'Failed to fetch product catalog' })
  }
})

router.use(requireModule(MODULES.PRODUCT_CONFIG))

router.get('/', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const targetClientId = req.query.clientId ? Number(req.query.clientId) : null

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid orgId' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  if (targetClientId && !canAccessClient(req.user, targetClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const params = [targetOrgId]
    let clientFilterSql = ''
    if (targetClientId) {
      clientFilterSql = 'AND p.client_id = ?'
      params.push(targetClientId)
    }

    const [rows] = await pool.execute(
      `SELECT
        p.product_id,
        p.org_id,
        p.client_id,
        c.client_name,
        p.product_name,
        p.product_code,
        p.status,
        p.created_at,
        p.updated_at,
        COUNT(DISTINCT i.indication_id) AS indication_count,
        COUNT(DISTINCT s.study_id) AS study_code_count
       FROM products p
       LEFT JOIN pharma_clients c ON c.client_id = p.client_id
       LEFT JOIN product_indications i ON i.product_id = p.product_id AND i.status = 'active'
       LEFT JOIN product_study_codes s ON s.product_id = p.product_id AND s.status = 'active'
       WHERE p.org_id = ?
       ${clientFilterSql}
       GROUP BY p.product_id, p.org_id, p.client_id, c.client_name, p.product_name, p.product_code, p.status, p.created_at, p.updated_at
       ORDER BY p.created_at DESC`,
      params
    )

    return res.json(rows)
  } catch (error) {
    console.error('List products failed:', error)
    return res.status(500).json({ error: 'Failed to list products' })
  }
})

router.post('/', async (req, res) => {
  const { orgId, clientId, productName, productCode } = req.body

  if (!productName || !productCode) {
    return res.status(400).json({ error: 'productName and productCode are required' })
  }

  const targetOrgId = Number(orgId || req.user.orgId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid orgId' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const scope = await resolveClientScope({
      orgId: targetOrgId,
      clientId,
      requireClientForCro: true,
      allowInactiveClient: false
    })

    if (scope.error) {
      return res.status(400).json({ error: scope.error })
    }

    const [result] = await pool.execute(
      `INSERT INTO products
        (org_id, client_id, product_name, product_code, status, created_by)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [
        targetOrgId,
        scope.resolvedClientId,
        String(productName).trim(),
        String(productCode).trim().toUpperCase(),
        req.user.userId
      ]
    )

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'product_created',
      entityType: 'product',
      entityId: String(result.insertId),
      afterValue: {
        clientId: scope.resolvedClientId,
        productName: String(productName).trim(),
        productCode: String(productCode).trim().toUpperCase()
      }
    })

    return res.status(201).json({
      product_id: result.insertId,
      org_id: targetOrgId,
      client_id: scope.resolvedClientId,
      product_name: String(productName).trim(),
      product_code: String(productCode).trim().toUpperCase(),
      status: 'active'
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Product code already exists in selected scope' })
    }
    console.error('Create product failed:', error)
    return res.status(500).json({ error: 'Failed to create product' })
  }
})

router.post('/:productId/indications', async (req, res) => {
  const productId = Number(req.params.productId)
  const { indicationName } = req.body

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product id' })
  }

  if (!indicationName) {
    return res.status(400).json({ error: 'indicationName is required' })
  }

  try {
    const [[product]] = await pool.execute(
      'SELECT product_id, org_id FROM products WHERE product_id = ?',
      [productId]
    )

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    if (!assertOrgAccess(req, res, product.org_id)) {
      return undefined
    }

    const [result] = await pool.execute(
      `INSERT INTO product_indications (org_id, product_id, indication_name, status)
       VALUES (?, ?, ?, 'active')`,
      [product.org_id, productId, String(indicationName).trim()]
    )

    await logAdminAction({
      orgId: product.org_id,
      actorUserId: req.user.userId,
      actionType: 'product_indication_added',
      entityType: 'product_indication',
      entityId: String(result.insertId),
      afterValue: {
        productId,
        indicationName: String(indicationName).trim()
      }
    })

    return res.status(201).json({
      indication_id: result.insertId,
      product_id: productId,
      indication_name: String(indicationName).trim(),
      status: 'active'
    })
  } catch (error) {
    console.error('Add product indication failed:', error)
    return res.status(500).json({ error: 'Failed to add indication' })
  }
})

router.post('/:productId/study-codes', async (req, res) => {
  const productId = Number(req.params.productId)
  const { studyCode } = req.body

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product id' })
  }

  if (!studyCode) {
    return res.status(400).json({ error: 'studyCode is required' })
  }

  try {
    const [[product]] = await pool.execute(
      'SELECT product_id, org_id FROM products WHERE product_id = ?',
      [productId]
    )

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    if (!assertOrgAccess(req, res, product.org_id)) {
      return undefined
    }

    const [result] = await pool.execute(
      `INSERT INTO product_study_codes (org_id, product_id, study_code, status)
       VALUES (?, ?, ?, 'active')`,
      [product.org_id, productId, String(studyCode).trim().toUpperCase()]
    )

    await logAdminAction({
      orgId: product.org_id,
      actorUserId: req.user.userId,
      actionType: 'product_study_code_added',
      entityType: 'product_study_code',
      entityId: String(result.insertId),
      afterValue: {
        productId,
        studyCode: String(studyCode).trim().toUpperCase()
      }
    })

    return res.status(201).json({
      study_id: result.insertId,
      product_id: productId,
      study_code: String(studyCode).trim().toUpperCase(),
      status: 'active'
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Study code already linked to this product' })
    }
    console.error('Add product study code failed:', error)
    return res.status(500).json({ error: 'Failed to add study code' })
  }
})

module.exports = router
