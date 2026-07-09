/**
 * rateLimitStore.js  (CP-15)
 *
 * In-memory rate-limit counters are per-process, so with >1 API instance the
 * effective limit multiplies and resets on restart. This returns a shared Redis
 * store when REDIS_URL is set (and the deps are installed), else undefined so
 * express-rate-limit falls back to its default in-memory store.
 *
 * To activate the shared store: provision Redis, set REDIS_URL, and
 *   npm i rate-limit-redis redis
 */

let sharedRedis = null;

function makeStore() {
  if (!process.env.REDIS_URL) return undefined; // dev / single instance → memory
  try {
    const { RedisStore } = require('rate-limit-redis');
    const { createClient } = require('redis');
    if (!sharedRedis) {
      sharedRedis = createClient({ url: process.env.REDIS_URL });
      sharedRedis.on('error', () => { /* logged by the client; never crash on cache errors */ });
      sharedRedis.connect().catch(() => {});
    }
    return new RedisStore({ sendCommand: (...args) => sharedRedis.sendCommand(args) });
  } catch {
    // Packages not installed yet — fall back to memory so the app still boots.
    return undefined;
  }
}

module.exports = { makeStore };
