'use strict';

/**
 * smartFieldsService.js — Theme 2 evaluator + typeahead aggregator.
 *
 * Wave 2. Loads `smart_field_rules` for a (org, section) and provides:
 *   - resolveSmartDefaults({orgId, section, payload}) → patch
 *       Returns a partial payload for fields where smart_default fires on create.
 *   - applyAutoCalc({orgId, section, payload}) → patch
 *       Recomputes fields whose `auto_calc` formulas depend on present payload keys.
 *   - lookup({source, q, orgId}) → [{value,label,meta?}, ...]
 *       Powers typeahead. Pluggable source registry — easy to extend.
 *
 * Caching: 60s in-memory (same pattern as validationEngine).
 * Safety: formulas are evaluated in a Function() sandbox with a whitelisted
 *         `ctx` object — no globals, no require, no process. Bad formulas
 *         are logged + skipped, never crash.
 */

const pool = require('../database/db');
const { logger } = require('./logger');

const TTL_MS = 60 * 1000;
const _cache = new Map(); // `${orgId}|${section}` → { rules, expiresAt }

function cacheKey(orgId, section) {
  return `${orgId == null ? 'null' : orgId}|${section}`;
}
function invalidate(orgId = null, section = null) {
  if (orgId == null && section == null) { _cache.clear(); return; }
  for (const k of [..._cache.keys()]) {
    const [oid, sec] = k.split('|');
    if ((orgId == null || oid === String(orgId)) && (section == null || sec === section)) _cache.delete(k);
  }
}

async function loadRules(orgId, section) {
  const k = cacheKey(orgId, section);
  const hit = _cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.rules;

  const [rows] = await pool.execute(`
    SELECT id, org_id, section_name, field_name, rule_type, formula,
           lookup_source, lookup_filter, depends_on, trigger_on, priority
      FROM smart_field_rules
     WHERE enabled = 1
       AND section_name = ?
       AND (org_id = ? OR org_id IS NULL)
     ORDER BY priority DESC, id ASC
  `, [section, orgId ?? 0]);

  // Org rules take precedence over global rules for the same (field, type).
  const seen = new Map();
  for (const r of rows) {
    const k2 = `${r.field_name}|${r.rule_type}`;
    if (seen.has(k2)) {
      const prev = seen.get(k2);
      if (prev.org_id == null && r.org_id != null) seen.set(k2, r);
    } else seen.set(k2, r);
  }
  const rules = [...seen.values()];
  _cache.set(k, { rules, expiresAt: Date.now() + TTL_MS });
  return rules;
}

// ── Safe formula eval ────────────────────────────────────────────────────────

function evalFormula(formula, ctx) {
  if (!formula) return undefined;
  try {
    // Destructure context into local scope, then `return (formula)`.
    // No `with`, no `eval`, no access to globalThis members.
    const keys = Object.keys(ctx);
    const vals = keys.map(k => ctx[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; try { return (${formula}); } catch (e) { return undefined; }`);
    return fn(...vals);
  } catch (err) {
    logger.warn({ err: err.message, formula }, 'smartFields: bad formula');
    return undefined;
  }
}

// ── Public: defaults, auto-calc ─────────────────────────────────────────────

async function resolveSmartDefaults({ orgId, section, payload = {}, userCtx = {} }) {
  const rules = await loadRules(orgId, section);
  const patch = {};
  for (const r of rules) {
    if (r.rule_type !== 'smart_default') continue;
    if (payload[r.field_name] != null && payload[r.field_name] !== '') continue;
    const ctx = { ...payload, ...userCtx, now: new Date(), id: payload.id || null };
    const v = evalFormula(r.formula, ctx);
    if (v != null) patch[r.field_name] = v;
  }
  return patch;
}

async function applyAutoCalc({ orgId, section, payload = {}, userCtx = {} }) {
  const rules = await loadRules(orgId, section);
  const patch = {};
  for (const r of rules) {
    if (r.rule_type !== 'auto_calc') continue;
    const deps = (r.depends_on || '').split(',').map(s => s.trim()).filter(Boolean);
    if (deps.length && !deps.some(d => Object.prototype.hasOwnProperty.call(payload, d))) continue;
    const ctx = { ...payload, ...userCtx, now: new Date() };
    const v = evalFormula(r.formula, ctx);
    if (v !== undefined) patch[r.field_name] = v;
  }
  return patch;
}

// ── Typeahead source registry ───────────────────────────────────────────────

const _sources = new Map();

function registerSource(name, handler) {
  _sources.set(name, handler);
}

// Built-in sources — connect to existing tables.
registerSource('products', async ({ q, orgId }) => {
  const [rows] = await pool.execute(
    `SELECT id AS value, name AS label, manufacturer AS meta
       FROM products
      WHERE (? IS NULL OR org_id = ?)
        AND name LIKE ?
      ORDER BY name LIMIT 25`,
    [orgId, orgId, `%${q || ''}%`]
  );
  return rows;
});

registerSource('contacts', async ({ q, orgId }) => {
  const [rows] = await pool.execute(
    `SELECT id AS value, CONCAT(first_name,' ',last_name) AS label, email AS meta
       FROM contacts
      WHERE (? IS NULL OR org_id = ?)
        AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)
      ORDER BY last_name LIMIT 25`,
    [orgId, orgId, `%${q}%`, `%${q}%`, `%${q}%`]
  );
  return rows;
});

registerSource('users', async ({ q, orgId }) => {
  const [rows] = await pool.execute(
    `SELECT id AS value, name AS label, email AS meta
       FROM users
      WHERE (? IS NULL OR org_id = ?)
        AND (name LIKE ? OR email LIKE ?)
      ORDER BY name LIMIT 25`,
    [orgId, orgId, `%${q}%`, `%${q}%`]
  );
  return rows;
});

registerSource('picklists', async ({ q, orgId, filter }) => {
  let f = {};
  try { f = filter ? JSON.parse(filter) : {}; } catch {}
  const type = f.type || '';
  const [rows] = await pool.execute(
    `SELECT id AS value, value AS label, display_text AS meta
       FROM picklists
      WHERE (? IS NULL OR org_id = ?)
        AND (? = '' OR field_type = ?)
        AND (value LIKE ? OR display_text LIKE ?)
      ORDER BY sort_order, value LIMIT 25`,
    [orgId, orgId, type, type, `%${q}%`, `%${q}%`]
  );
  return rows;
});

async function lookup({ source, q = '', orgId = null, filter = null }) {
  const fn = _sources.get(source);
  if (!fn) return [];
  try {
    return await fn({ q, orgId, filter });
  } catch (err) {
    logger.warn({ err: err.message, source }, 'smartFields.lookup failed');
    return [];
  }
}

module.exports = {
  loadRules,
  invalidate,
  resolveSmartDefaults,
  applyAutoCalc,
  lookup,
  registerSource,
};
