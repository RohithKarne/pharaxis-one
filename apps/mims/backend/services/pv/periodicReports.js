'use strict';

function buildPeriodicSafetySummary({ product, from, to, reports = [] }) {
  const total = reports.length;
  const serious = reports.filter(r => String(r.serious || r.status || '').toLowerCase().includes('serious')).length;
  return { product, from, to, report_type: 'PSUR/DSUR draft', total_cases: total, serious_cases: serious, generated_at: new Date().toISOString() };
}

module.exports = { buildPeriodicSafetySummary };
