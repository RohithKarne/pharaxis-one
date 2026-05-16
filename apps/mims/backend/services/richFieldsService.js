'use strict';

/**
 * richFieldsService.js — Theme 1 (Wave 3) structured-value store + normalizers.
 *
 * Powers the rich field types: address (with geocoding), phone (E.164),
 * currency (amount + ISO code + snapshot rate), rich text (sanitized HTML),
 * signature (PNG dataURL + signer name + timestamp), image annotation
 * (base image attachment_id + stroke array + comments).
 *
 * Surface:
 *   get   ({orgId, entityType, entityId, section, field})           → value_json
 *   set   ({orgId, entityType, entityId, section, field, valueType, value, userId})
 *   list  ({orgId, entityType, entityId})                           → [...]
 *   delete({orgId, entityType, entityId, section, field})
 *
 *   normalize(valueType, value) → cleaned value
 *
 * `normalize()` is also used by the route layer before write so bad input
 * (e.g. partial phone, malformed currency) is rejected cleanly.
 */

const pool = require('../database/db');
const { logger } = require('./logger');
const geocoder = require('./geocoderService');

const TYPES = new Set([
  'address', 'phone', 'currency', 'rich_text', 'signature', 'image_annotation',
]);

// ── Normalizers ───────────────────────────────────────────────────────────────

function _phone(v) {
  if (!v || typeof v !== 'object') return null;
  const cc = (v.country_code || '').toString().replace(/[^\d+]/g, '');
  const n  = (v.number       || '').toString().replace(/[^\d]/g, '');
  if (!n) return null;
  return {
    country_code: cc || null,
    number:       n,
    extension:    v.extension ? String(v.extension).replace(/[^\d]/g, '') : null,
    e164:         cc ? `${cc.startsWith('+') ? cc : '+' + cc}${n}` : `+${n}`,
  };
}

function _currency(v) {
  if (!v || typeof v !== 'object') return null;
  const amount = Number(v.amount);
  if (!Number.isFinite(amount)) return null;
  const code = String(v.currency_code || 'USD').toUpperCase().slice(0, 3);
  return {
    amount,
    currency_code: code,
    rate_to_usd:   Number(v.rate_to_usd) || null,    // snapshot at write time
    captured_at:   v.captured_at || new Date().toISOString(),
  };
}

function _address(v) {
  if (!v || typeof v !== 'object') return null;
  return {
    line1:        (v.line1 || '').trim() || null,
    line2:        (v.line2 || '').trim() || null,
    city:         (v.city  || '').trim() || null,
    state:        (v.state || '').trim() || null,
    postal_code:  (v.postal_code || '').trim() || null,
    country:      (v.country || '').trim().toUpperCase().slice(0, 2) || null,
    lat:          Number.isFinite(Number(v.lat))  ? Number(v.lat)  : null,
    lng:          Number.isFinite(Number(v.lng))  ? Number(v.lng)  : null,
    formatted:    v.formatted || null,
  };
}

function _stripScriptTags(html) {
  // Very small sanitizer — strip <script>, on*= handlers, javascript: URIs.
  // For production-grade sanitization, swap in DOMPurify on the client side.
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function _richText(v) {
  if (v == null) return null;
  if (typeof v === 'string') return { html: _stripScriptTags(v) };
  if (typeof v === 'object') return { html: _stripScriptTags(v.html || '') };
  return null;
}

function _signature(v) {
  if (!v || typeof v !== 'object') return null;
  if (!v.png_data_url || !String(v.png_data_url).startsWith('data:image/')) return null;
  return {
    png_data_url: v.png_data_url,
    signer_name:  (v.signer_name || '').trim() || null,
    signed_at:    v.signed_at || new Date().toISOString(),
    intent:       (v.intent || 'sign').toString().slice(0, 40), // 'sign','approve','witness'
  };
}

function _imageAnnotation(v) {
  if (!v || typeof v !== 'object') return null;
  return {
    attachment_id: Number(v.attachment_id) || null,
    strokes:       Array.isArray(v.strokes)  ? v.strokes  : [],
    comments:      Array.isArray(v.comments) ? v.comments : [],
    width:         Number(v.width)  || null,
    height:        Number(v.height) || null,
  };
}

function normalize(valueType, value) {
  switch (valueType) {
    case 'phone':            return _phone(value);
    case 'currency':         return _currency(value);
    case 'address':          return _address(value);
    case 'rich_text':        return _richText(value);
    case 'signature':        return _signature(value);
    case 'image_annotation': return _imageAnnotation(value);
    default: return null;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function get({ orgId, entityType, entityId, section, field }) {
  const [[row]] = await pool.execute(
    `SELECT value_type, value_json
       FROM rich_field_values
      WHERE org_id = ? AND entity_type = ? AND entity_id = ?
        AND section_name = ? AND field_name = ?
      LIMIT 1`,
    [orgId, entityType, entityId, section, field]
  );
  if (!row) return null;
  try {
    return {
      value_type: row.value_type,
      value: typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json,
    };
  } catch { return null; }
}

async function list({ orgId, entityType, entityId }) {
  const [rows] = await pool.execute(
    `SELECT section_name, field_name, value_type, value_json,
            created_at, updated_at, created_by, updated_by
       FROM rich_field_values
      WHERE org_id = ? AND entity_type = ? AND entity_id = ?`,
    [orgId, entityType, entityId]
  );
  return rows.map(r => ({
    section: r.section_name,
    field:   r.field_name,
    value_type: r.value_type,
    value: typeof r.value_json === 'string' ? safeParse(r.value_json) : r.value_json,
    created_at: r.created_at, updated_at: r.updated_at,
    created_by: r.created_by, updated_by: r.updated_by,
  }));
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

async function set({ orgId, entityType, entityId, section, field, valueType, value, userId }) {
  if (!TYPES.has(valueType)) throw new Error(`Unsupported rich-field type: ${valueType}`);
  const cleaned = normalize(valueType, value);
  if (cleaned == null) throw new Error(`Invalid value for ${valueType}`);

  // Side-effect: geocode addresses on write if provider is configured.
  if (valueType === 'address' && !cleaned.lat && cleaned.line1 && geocoder.isEnabled()) {
    try {
      const probe = await geocoder.forward({
        text: [cleaned.line1, cleaned.city, cleaned.state, cleaned.country].filter(Boolean).join(', '),
        country: cleaned.country || undefined,
      });
      if (probe) { cleaned.lat = probe.lat; cleaned.lng = probe.lng; cleaned.formatted = probe.formatted; }
    } catch (err) {
      logger.warn({ err: err.message }, 'richFields: address auto-geocode failed (non-fatal)');
    }
  }

  await pool.execute(
    `INSERT INTO rich_field_values
       (org_id, entity_type, entity_id, section_name, field_name,
        value_type, value_json, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       value_type = VALUES(value_type),
       value_json = VALUES(value_json),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [orgId, entityType, entityId, section, field,
     valueType, JSON.stringify(cleaned), userId || null, userId || null]
  );
  return cleaned;
}

async function remove({ orgId, entityType, entityId, section, field }) {
  await pool.execute(
    `DELETE FROM rich_field_values
      WHERE org_id = ? AND entity_type = ? AND entity_id = ?
        AND section_name = ? AND field_name = ?`,
    [orgId, entityType, entityId, section, field]
  );
}

module.exports = { TYPES: [...TYPES], normalize, get, set, list, remove };
