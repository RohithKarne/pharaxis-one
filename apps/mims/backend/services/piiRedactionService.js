'use strict';

const pool = require('../database/db');

function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function generalizeDob(dob) { return dob ? String(dob).slice(0, 4) : dob; }
function generalizePostal(zip) { return zip ? String(zip).slice(0, 3) : zip; }
function getPath(obj, path) { return String(path).split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
function setPath(obj, path, value, drop = false) {
  const parts = String(path).split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  if (drop) delete cursor[parts[parts.length - 1]];
  else cursor[parts[parts.length - 1]] = value;
}

async function loadRules(haCode) {
  const [rows] = await pool.execute('SELECT * FROM pii_redaction_rules WHERE ha_code IS NULL OR ha_code = ? ORDER BY ha_code IS NULL DESC, id ASC', [haCode || null]);
  return rows;
}

async function redact({ report, ha_code }) {
  const copy = clone(report);
  const rules = await loadRules(ha_code);
  const applied = [];
  for (const rule of rules) {
    const current = getPath(copy, rule.field_path);
    if (current === undefined || current === null || current === '') continue;
    if (rule.action === 'drop') setPath(copy, rule.field_path, null, true);
    else if (rule.action === 'redact') setPath(copy, rule.field_path, '[REDACTED]');
    else if (rule.action === 'mask') setPath(copy, rule.field_path, rule.mask_pattern || '***');
    else if (rule.action === 'generalize') {
      const g = String(rule.generalization || '').toLowerCase();
      setPath(copy, rule.field_path, g.includes('year') ? generalizeDob(current) : g.includes('first3') ? generalizePostal(current) : String(current).slice(0, 3));
    }
    applied.push(rule.id);
  }
  return { report: copy, applied_rule_ids: applied };
}

module.exports = { redact, generalizeDob, generalizePostal };
