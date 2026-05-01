const buckets = new Map();

export function createRateLimiter({ windowMs = 60000, max = 600, keyFn = (req) => req.ip, message = 'Rate limit exceeded' } = {}) {
  return function rateLimiter(req, res, next) {
    const key = keyFn(req) || 'anonymous';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}
