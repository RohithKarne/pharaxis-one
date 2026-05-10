const express = require('express')
const router = express.Router()
const { pool } = require('../database/db')
const { authenticateSuperadmin } = require('../middleware/superadminAuth')
const { verifyCname, provisionSsl, activateDomain } = require('../services/domainVerificationService')

// All routes require superadmin auth
router.use(authenticateSuperadmin)

// GET /api/superadmin/domains/orgs/:id/status
router.get('/orgs/:id/status', async (req, res) => {
  const orgId = parseInt(req.params.id, 10)
  try {
    const [[row]] = await pool.execute(
      'SELECT * FROM custom_domains WHERE org_id = ?',
      [orgId]
    )
    if (!row) return res.status(404).json({ error: 'No domain configured for this org' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/superadmin/domains/orgs/:id/domain — add or update custom domain
router.post('/orgs/:id/domain', async (req, res) => {
  const orgId = parseInt(req.params.id, 10)
  const { domain } = req.body
  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'domain is required' })
  }
  const normalised = domain.trim().toLowerCase()
  try {
    const [[org]] = await pool.execute('SELECT id FROM orgs WHERE id = ? AND status = ?', [orgId, 'active'])
    if (!org) return res.status(404).json({ error: 'Org not found or inactive' })

    await pool.execute(
      `INSERT INTO custom_domains (org_id, domain, onboarding_status)
       VALUES (?, ?, 'cname_pending')
       ON DUPLICATE KEY UPDATE domain = VALUES(domain), onboarding_status = 'cname_pending',
       cname_verified = 0, ssl_provisioned = 0, cname_verified_at = NULL,
       ssl_provisioned_at = NULL, activated_at = NULL, welcome_sent = 0`,
      [orgId, normalised]
    )
    res.json({
      message: 'Domain registered. Awaiting CNAME verification.',
      domain: normalised,
      cname_instruction: `Point vault.${normalised.split('.').slice(1).join('.')} → ${process.env.VAULT_CNAME_TARGET || 'hosted.pharaxisvault.com'}`
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This domain is already registered to another org' })
    }
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/superadmin/domains/orgs/:id/verify — manually trigger CNAME check
router.post('/orgs/:id/verify', async (req, res) => {
  const orgId = parseInt(req.params.id, 10)
  try {
    const [[row]] = await pool.execute('SELECT domain FROM custom_domains WHERE org_id = ?', [orgId])
    if (!row) return res.status(404).json({ error: 'No domain configured for this org' })

    const result = await verifyCname(row.domain)
    if (!result.verified) {
      return res.json({ verified: false, message: 'CNAME not yet pointing to our servers', records: result.records || [] })
    }

    await pool.execute(
      `UPDATE custom_domains SET cname_verified = 1, cname_verified_at = NOW(),
       onboarding_status = 'cname_verified' WHERE org_id = ?`,
      [orgId]
    )
    await provisionSsl(orgId, row.domain)
    res.json({ verified: true, message: 'CNAME verified. SSL provisioning started. Domain will activate shortly.' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/superadmin/domains/orgs/:id/activate — finalize domain once SSL is ready
router.post('/orgs/:id/activate', async (req, res) => {
  const orgId = parseInt(req.params.id, 10)
  try {
    const [[row]] = await pool.execute(
      `SELECT domain, cname_verified, ssl_provisioned, onboarding_status
       FROM custom_domains
       WHERE org_id = ?`,
      [orgId]
    )
    if (!row) return res.status(404).json({ error: 'No domain configured for this org' })
    if (!Number(row.cname_verified)) {
      return res.status(409).json({ error: 'CNAME is not verified yet' })
    }
    if (!Number(row.ssl_provisioned)) {
      return res.status(409).json({ error: 'SSL is not provisioned yet' })
    }
    if (row.onboarding_status === 'active') {
      return res.json({ message: 'Domain is already active', domain: row.domain })
    }

    await activateDomain(orgId)
    res.json({ message: 'Domain activated', domain: row.domain })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/superadmin/domains/orgs/:id/domain — deactivate and remove domain
router.delete('/orgs/:id/domain', async (req, res) => {
  const orgId = parseInt(req.params.id, 10)
  try {
    const [result] = await pool.execute('DELETE FROM custom_domains WHERE org_id = ?', [orgId])
    if (!result.affectedRows) return res.status(404).json({ error: 'No domain found for this org' })
    res.json({ message: 'Domain removed. Org is no longer accessible via custom domain.' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
