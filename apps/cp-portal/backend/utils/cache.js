/**
 * cache.js  (CP-22)
 *
 * Tiny in-process TTL cache for hot, rarely-changing reads (portal config,
 * branding, features) so we don't hit MySQL on every page load. Swappable for
 * Redis later behind the same get/wrap API; invalidate() is called on writes.
 *
 * Note: in-process means each instance has its own copy — fine for config that
 * changes rarely and tolerates a few seconds of staleness. Use Redis for
 * cross-instance consistency once it's provisioned.
 */

const store = new Map(); // key -> { value, expires }
const DEFAULT_TTL = Number(process.env.CP_CACHE_TTL_MS || 30000); // 30s

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < nowMs()) { store.delete(key); return undefined; }
  return hit.value;
}

function set(key, value, ttl = DEFAULT_TTL) {
  store.set(key, { value, expires: nowMs() + ttl });
}

function invalidate(prefix) {
  if (!prefix) { store.clear(); return; }
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

/** Memoize an async loader under a key for `ttl` ms. */
async function wrap(key, ttl, loader) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  set(key, value, ttl);
  return value;
}

// Date.now via a small indirection keeps the module easy to reason about.
function nowMs() { return Date.now(); }

module.exports = { get, set, invalidate, wrap };
