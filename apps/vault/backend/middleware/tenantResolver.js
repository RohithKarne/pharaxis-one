const { pool } = require('../database/db')

async function resolveTenant(req, res, next) {
  try {
    const hostname = req.hostname

    // 1. Hostname-based resolution (production custom domains)
    const [[domain]] = await pool.execute(
      `SELECT cd.org_id, o.slug, o.name, o.logo_url
       FROM custom_domains cd
       JOIN orgs o ON o.id = cd.org_id
       WHERE cd.domain = ? AND cd.onboarding_status = 'active' AND o.status = 'active'
       LIMIT 1`,
      [hostname]
    )
    if (domain) {
      req.org = { id: domain.org_id, slug: domain.slug, name: domain.name, logoUrl: domain.logo_url }
      return next()
    }

    // 2. Slug-based fallback — dev / slug URL (?org=slug or X-Org-Slug header)
    const orgSlug = req.headers['x-org-slug'] || req.query.org
    if (orgSlug) {
      const [[org]] = await pool.execute(
        `SELECT id, slug, name, logo_url FROM orgs
         WHERE LOWER(slug) = LOWER(?) AND status = 'active' LIMIT 1`,
        [String(orgSlug)]
      )
      if (org) {
        req.org = { id: org.id, slug: org.slug, name: org.name, logoUrl: org.logo_url }
        return next()
      }
    }

    // 3. JWT token fallback — orgId embedded in the Bearer token
    const authHeader = req.headers.authorization || ''
    if (authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7).trim()
      if (rawToken && rawToken !== 'null' && rawToken !== 'undefined') {
        try {
          const jwt = require('jsonwebtoken')
          const decoded = jwt.verify(rawToken, process.env.JWT_SECRET)
          if (decoded.orgId) {
            const [[org]] = await pool.execute(
              `SELECT id, slug, name, logo_url FROM orgs WHERE id = ? AND status = 'active' LIMIT 1`,
              [decoded.orgId]
            )
            if (org) {
              req.org = { id: org.id, slug: org.slug, name: org.name, logoUrl: org.logo_url }
              return next()
            }
          }
        } catch {
          // invalid token — fall through to 404
        }
      }
    }

    return res.status(404).json({ error: 'Organization not found.' })
  } catch (err) {
    next(err)
  }
}

module.exports = { resolveTenant }
