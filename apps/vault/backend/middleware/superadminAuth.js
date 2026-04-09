const jwt = require('jsonwebtoken')

function authenticateSuperadmin(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = header.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.SUPERADMIN_JWT_SECRET)
    req.superadmin = { superadminId: decoded.superadminId }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { authenticateSuperadmin }
