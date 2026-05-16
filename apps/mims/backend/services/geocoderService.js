'use strict';

/**
 * geocoderService.js — address geocoding + reverse-geocoding.
 *
 * Wave 0 piece #7. Used by:
 *   - Theme 1 (Address field type — autocomplete + lat/long capture)
 *   - Postal-code lookup (Tables > Postal Code)
 *   - Reporter location reverse-geocode for Adverse Event geo dashboards
 *   - Distance-based MSL alignment (Tables > MSL Territory)
 *
 * Providers (env: GEOCODER_PROVIDER):
 *   • 'none'    — default; returns null. UI shows manual entry only.
 *   • 'google'  — Google Maps Geocoding API. Needs GEOCODER_GOOGLE_KEY.
 *   • 'mapbox'  — Mapbox Geocoding v5. Needs GEOCODER_MAPBOX_TOKEN.
 *
 * Surface:
 *   forward({ text, country? })      → Promise<{ formatted, lat, lng, components, provider } | null>
 *   reverse({ lat, lng })            → Promise<{ formatted, components, provider } | null>
 *   isEnabled()                      → boolean
 *
 * Caching: results memoized in-memory for CACHE_TTL_MS (15 min) keyed by
 * provider + payload. No Redis (the volume is small; this is not a hot path).
 */

const { logger } = require('./logger');

const PROVIDER = (process.env.GEOCODER_PROVIDER || 'none').toLowerCase();
const GOOGLE_KEY    = process.env.GEOCODER_GOOGLE_KEY    || '';
const MAPBOX_TOKEN  = process.env.GEOCODER_MAPBOX_TOKEN  || '';
const CACHE_TTL_MS  = 15 * 60 * 1000;

const _cache = new Map(); // key → { value, expiresAt }

function cached(key) {
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (hit) _cache.delete(key);
  return undefined;
}
function memo(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function isEnabled() { return PROVIDER !== 'none'; }

// Use global fetch (Node 18+) or node-fetch (already a dependency).
async function httpJson(url) {
  const f = global.fetch || require('node-fetch'); // eslint-disable-line global-require
  const r = await f(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Google ────────────────────────────────────────────────────────────────────

async function _googleForward({ text, country }) {
  if (!GOOGLE_KEY) throw new Error('GEOCODER_GOOGLE_KEY not set');
  const params = new URLSearchParams({ address: text, key: GOOGLE_KEY });
  if (country) params.append('components', `country:${country}`);
  const data = await httpJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const r = data.results?.[0];
  if (!r) return null;
  return {
    formatted: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    components: Object.fromEntries((r.address_components || [])
      .map(c => [c.types[0], c.long_name])),
    provider: 'google',
  };
}

async function _googleReverse({ lat, lng }) {
  if (!GOOGLE_KEY) throw new Error('GEOCODER_GOOGLE_KEY not set');
  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: GOOGLE_KEY });
  const data = await httpJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const r = data.results?.[0];
  if (!r) return null;
  return {
    formatted: r.formatted_address,
    components: Object.fromEntries((r.address_components || [])
      .map(c => [c.types[0], c.long_name])),
    provider: 'google',
  };
}

// ── Mapbox ────────────────────────────────────────────────────────────────────

async function _mapboxForward({ text, country }) {
  if (!MAPBOX_TOKEN) throw new Error('GEOCODER_MAPBOX_TOKEN not set');
  const q = encodeURIComponent(text);
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, limit: '1' });
  if (country) params.append('country', country);
  const data = await httpJson(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?${params}`
  );
  const f = data.features?.[0];
  if (!f) return null;
  return {
    formatted: f.place_name,
    lat: f.center?.[1] ?? null,
    lng: f.center?.[0] ?? null,
    components: Object.fromEntries((f.context || []).map(c => [c.id.split('.')[0], c.text])),
    provider: 'mapbox',
  };
}

async function _mapboxReverse({ lat, lng }) {
  if (!MAPBOX_TOKEN) throw new Error('GEOCODER_MAPBOX_TOKEN not set');
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, limit: '1' });
  const data = await httpJson(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`
  );
  const f = data.features?.[0];
  if (!f) return null;
  return {
    formatted: f.place_name,
    components: Object.fromEntries((f.context || []).map(c => [c.id.split('.')[0], c.text])),
    provider: 'mapbox',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function forward({ text, country } = {}) {
  if (!text || PROVIDER === 'none') return null;
  const key = `f|${PROVIDER}|${country || ''}|${text}`;
  const hit = cached(key); if (hit !== undefined) return hit;
  try {
    if (PROVIDER === 'google') return memo(key, await _googleForward({ text, country }));
    if (PROVIDER === 'mapbox') return memo(key, await _mapboxForward({ text, country }));
    return memo(key, null);
  } catch (err) {
    logger.warn({ err: err.message, provider: PROVIDER }, 'geocoder.forward failed');
    return null;
  }
}

async function reverse({ lat, lng } = {}) {
  if (lat == null || lng == null || PROVIDER === 'none') return null;
  const key = `r|${PROVIDER}|${lat}|${lng}`;
  const hit = cached(key); if (hit !== undefined) return hit;
  try {
    if (PROVIDER === 'google') return memo(key, await _googleReverse({ lat, lng }));
    if (PROVIDER === 'mapbox') return memo(key, await _mapboxReverse({ lat, lng }));
    return memo(key, null);
  } catch (err) {
    logger.warn({ err: err.message, provider: PROVIDER }, 'geocoder.reverse failed');
    return null;
  }
}

module.exports = { PROVIDER, isEnabled, forward, reverse };
