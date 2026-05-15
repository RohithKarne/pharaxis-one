'use strict';

function readField(formData, field) {
  if (!field) return undefined;
  if (Object.prototype.hasOwnProperty.call(formData || {}, field)) return formData[field];
  const normalized = String(field).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return (formData || {})[normalized];
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function coerceComparable(value) {
  if (value === true || value === false) return value ? 1 : 0;
  if (value === 'true') return 1;
  if (value === 'false') return 0;
  const num = Number(value);
  return Number.isFinite(num) && String(value).trim() !== '' ? num : String(value ?? '');
}

function compareCondition(condition, formData) {
  const op = String(condition?.op || condition?.operator || '=').toUpperCase();
  const left = readField(formData, condition?.field);
  const right = condition?.value;

  if (op === 'EMPTY') return isEmpty(left);
  if (op === 'NOT_EMPTY') return !isEmpty(left);
  if (op === 'IN') return Array.isArray(right) ? right.map(String).includes(String(left)) : false;
  if (op === 'NOT_IN') return Array.isArray(right) ? !right.map(String).includes(String(left)) : true;
  if (op === 'REGEX') {
    try { return new RegExp(String(right || '')).test(String(left ?? '')); } catch (_) { return false; }
  }

  const a = coerceComparable(left);
  const b = coerceComparable(right);
  if (op === '=' || op === '==') return String(left ?? '') === String(right ?? '');
  if (op === '!=' || op === '<>') return String(left ?? '') !== String(right ?? '');
  if (op === '>') return a > b;
  if (op === '>=') return a >= b;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  return false;
}

function evaluateCondition(condition, formData) {
  if (!condition || typeof condition !== 'object') return true;
  if (Array.isArray(condition.and)) return condition.and.every((c) => evaluateCondition(c, formData));
  if (Array.isArray(condition.or)) return condition.or.some((c) => evaluateCondition(c, formData));
  return compareCondition(condition, formData);
}

function parseMaybeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function evaluateRule(rule, formData) {
  const condition = parseMaybeJson(rule?.condition_json || rule?.condition, {});
  const action = parseMaybeJson(rule?.action_json || rule?.action, {});
  const matched = evaluateCondition(condition, formData || {});
  const type = String(rule?.rule_type || '').toLowerCase();

  if (!matched) {
    if (type === 'visibility') return false;
    if (type === 'required') return false;
    return { matched: false, value: undefined, action };
  }

  if (type === 'visibility') return action.action ? action.action !== 'hide' : true;
  if (type === 'required') return action.required !== false;
  if (type === 'default') return Object.prototype.hasOwnProperty.call(action, 'value') ? action.value : action.default_value;
  if (type === 'validation') return { matched: true, valid: action.valid !== false, message: action.message || 'Validation rule failed.', action };
  if (type === 'cascade') return { matched: true, parentField: action.parent_field || condition.field, parentValue: readField(formData || {}, action.parent_field || condition.field), action };
  return matched;
}

module.exports = {
  evaluateRule,
  evaluateCondition,
  compareCondition,
  readField,
};
