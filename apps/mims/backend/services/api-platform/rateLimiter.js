'use strict';

const buckets = new Map();

function publicApiRateLimiter(req, res, next) {
  const client = req.apiClient;
  if (!client) return next();
  const key = client.id;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = Number(client.rate_limit_per_min || 60);
  const bucket = (buckets.get(key) || []).filter(ts => now - ts < windowMs);
  if (bucket.length >= limit) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  bucket.push(now);
  buckets.set(key, bucket);
  next();
}

module.exports = { publicApiRateLimiter };
