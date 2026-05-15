'use strict';

function getValue(data, path) {
  return String(path || '').split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), data || {});
}

function isEmpty(v) { return v === undefined || v === null || v === ''; }

function compare(condition = {}, data = {}) {
  if (condition.and) return condition.and.every(c => compare(c, data));
  if (condition.or) return condition.or.some(c => compare(c, data));
  if (condition.not) return !compare(condition.not, data);
  const left = getValue(data, condition.field);
  const right = condition.value;
  switch (String(condition.op || '=').toUpperCase()) {
    case '=': return String(left) === String(right);
    case '!=': return String(left) !== String(right);
    case '>': return Number(left) > Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<': return Number(left) < Number(right);
    case '<=': return Number(left) <= Number(right);
    case 'IN': return Array.isArray(right) && right.map(String).includes(String(left));
    case 'NOT_IN': return Array.isArray(right) && !right.map(String).includes(String(left));
    case 'EMPTY': return isEmpty(left);
    case 'NOT_EMPTY': return !isEmpty(left);
    case 'REGEX': return new RegExp(String(right || '')).test(String(left || ''));
    default: return false;
  }
}

module.exports = { compare, evaluateCondition: compare, getValue };
