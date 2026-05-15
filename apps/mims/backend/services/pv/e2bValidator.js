'use strict';

const REQUIRED_MARKERS = [
  ['ichicsrmessageheader', 'Message header is required'],
  ['safetyreport', 'Safety report is required'],
  ['safetyreportid', 'Safety report id is required'],
  ['patient', 'Patient block is required'],
];

function validateE2BXml(xml, _xsdPath = process.env.E2B_R3_XSD_PATH) {
  const errors = [];
  const text = String(xml || '');
  if (!text.trim()) return [{ path: '/', reason: 'XML payload is empty' }];
  for (const [marker, reason] of REQUIRED_MARKERS) {
    if (!text.includes(`<${marker}`)) errors.push({ path: `/${marker}`, reason });
  }
  if (!/^<\?xml/.test(text.trim())) errors.push({ path: '/', reason: 'XML declaration is required' });
  if (/<([A-Za-z0-9:_-]+)(?:\s[^>]*)?><\/\1>/.test(text)) {
    errors.push({ path: '/', reason: 'Empty E2B elements should be omitted rather than emitted empty' });
  }
  return errors;
}

function assertValidE2BXml(xml, xsdPath) {
  const errors = validateE2BXml(xml, xsdPath);
  if (errors.length) {
    const err = new Error('E2B(R3) XML validation failed');
    err.validationErrors = errors;
    throw err;
  }
  return true;
}

module.exports = { validateE2BXml, assertValidE2BXml };
