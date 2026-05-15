'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REQUIRED_MARKERS = [
  ['ichicsrmessageheader', 'Message header is required'],
  ['safetyreport', 'Safety report is required'],
  ['safetyreportid', 'Safety report id is required'],
  ['patient', 'Patient block is required'],
];

function validateAgainstXsd(xml, xsdPath) {
  if (!xsdPath || !fs.existsSync(xsdPath)) return null;
  const tmp = path.join(os.tmpdir(), `mims-e2b-${Date.now()}-${Math.random().toString(16).slice(2)}.xml`);
  try {
    fs.writeFileSync(tmp, xml, 'utf8');
    execFileSync('xmllint', ['--noout', '--schema', xsdPath, tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return [];
  } catch (err) {
    const raw = String(err.stderr || err.message || '');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/:(\d+):\s*(?:element\s+)?([^:]+)?:?\s*(.*)$/i);
        return {
          path: match?.[2] ? `/${String(match[2]).trim()}` : '/',
          reason: match?.[3] || line,
          line: match?.[1] ? Number(match[1]) : undefined,
        };
      });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function validateE2BXml(xml, _xsdPath = process.env.E2B_R3_XSD_PATH) {
  const errors = [];
  const text = String(xml || '');
  if (!text.trim()) return [{ path: '/', reason: 'XML payload is empty' }];
  const xsdErrors = validateAgainstXsd(text, _xsdPath);
  if (Array.isArray(xsdErrors)) return xsdErrors;
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
