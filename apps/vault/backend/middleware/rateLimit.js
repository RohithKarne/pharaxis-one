function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 120,
  keyFn = req => req.ip,
  errorMessage = 'Too many requests. Please retry later.'
} = {}) {
  const bucket = new Map()

  // Lightweight cleanup to avoid unbounded key growth.
  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of bucket.entries()) {
      if (value.windowStart + windowMs < now) {
        bucket.delete(key)
      }
    }
  }, Math.max(15_000, windowMs)).unref()

  return (req, res, next) => {
    const key = String(keyFn(req) || 'unknown')
    const now = Date.now()

    const current = bucket.get(key)
    if (!current || current.windowStart + windowMs <= now) {
      bucket.set(key, { windowStart: now, count: 1 })
      return next()
    }

    current.count += 1
    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((current.windowStart + windowMs - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)))
      return res.status(429).json({
        error: errorMessage
      })
    }

    return next()
  }
}

module.exports = {
  createRateLimiter
}
