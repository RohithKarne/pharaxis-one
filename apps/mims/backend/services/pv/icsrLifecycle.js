'use strict';

const ALLOWED = {
  draft: new Set(['validated', 'superseded']),
  validated: new Set(['submitted', 'draft', 'superseded']),
  submitted: new Set(['acknowledged', 'rejected', 'superseded']),
  acknowledged: new Set(['superseded']),
  rejected: new Set(['draft', 'submitted', 'superseded']),
  superseded: new Set([]),
};

function canTransition(from, to) {
  return Boolean(ALLOWED[from]?.has(to));
}

function transition(report, to, details = {}) {
  const from = report.status || 'draft';
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid ICSR transition: ${from} -> ${to}`);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
  return { ...report, status: to, transition: { from, to, at: new Date().toISOString(), ...details } };
}

module.exports = { ALLOWED, canTransition, transition };
