'use strict';

function extractFields(text = {}, schema = {}) {
  const raw = typeof text === 'string' ? text : JSON.stringify(text || {});
  const out = {};
  const mappings = {
    patient_initials: /patient(?: initials)?[:\s-]+([A-Z]{1,5})/i,
    event_description: /(event|reaction|adverse event)[:\s-]+([^\n]+)/i,
    product_name: /(product|drug|medicine)[:\s-]+([^\n,.]+)/i,
    country: /(country)[:\s-]+([A-Za-z ]+)/i,
  };
  for (const [field, regex] of Object.entries(mappings)) {
    const m = raw.match(regex);
    if (m) out[field] = (m[2] || m[1] || '').trim();
  }
  return { fields: out, schema_used: Object.keys(schema || {}) };
}

module.exports = { extractFields };
