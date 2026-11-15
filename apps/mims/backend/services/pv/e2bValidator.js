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

const DEFAULT_ICH_SCHEMA = '/private/tmp/pharaxis-audit-ich-schema/4_ICH_ICSR_Schema_Files/multicacheschemas/MCCI_IN200100UV01.xsd';

function validateAgainstXsd(xml, xsdPath) {
  const resolvedPath = xsdPath || (fs.existsSync(DEFAULT_ICH_SCHEMA) ? DEFAULT_ICH_SCHEMA : null);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) return null;
  const tmp = path.join(os.tmpdir(), `mims-e2b-${Date.now()}-${Math.random().toString(16).slice(2)}.xml`);
  try {
    fs.writeFileSync(tmp, xml, 'utf8');
    execFileSync('xmllint', ['--noout', '--schema', resolvedPath, tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return [];
  } catch (err) {
    if (err && (err.code === 'ENOENT' || String(err.message).includes('ENOENT'))) {
      return null;
    }
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

function checkBasicXmlWellFormedness(xml) {
  const text = String(xml || '').trim();
  if (!text) return [{ path: '/', reason: 'XML payload is empty' }];
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const tagRegex = /<(\/)?([a-zA-Z0-9:_-]+)(?:\s+[^>]*)?(\/)?>/g;
  const stack = [];
  let match;
  while ((match = tagRegex.exec(cleaned)) !== null) {
    const isClosing = Boolean(match[1]);
    const tagName = match[2];
    const isSelfClosing = Boolean(match[3]) || match[0].endsWith('/>');
    if (isSelfClosing) continue;
    if (isClosing) {
      if (stack.length === 0) {
        return [{ path: `/${tagName}`, reason: `Unexpected closing tag </${tagName}> without matching opening tag` }];
      }
      const last = stack.pop();
      if (last !== tagName) {
        return [{ path: `/${tagName}`, reason: `Mismatched closing tag </${tagName}>, expected </${last}>` }];
      }
    } else {
      stack.push(tagName);
    }
  }
  if (stack.length > 0) {
    return [{ path: `/${stack[stack.length - 1]}`, reason: `Unclosed tag <${stack[stack.length - 1]}>` }];
  }
  return [];
}

function validateWellFormedXml(xml) {
  const tmp = path.join(os.tmpdir(), `mims-e2b-wf-${Date.now()}-${Math.random().toString(16).slice(2)}.xml`);
  try {
    fs.writeFileSync(tmp, xml, 'utf8');
    execFileSync('xmllint', ['--noout', tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return [];
  } catch (err) {
    if (err && (err.code === 'ENOENT' || String(err.message).includes('ENOENT'))) {
      return checkBasicXmlWellFormedness(xml);
    }
    const raw = String(err.stderr || err.message || '');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/:(\d+):\s*(?:parser error\s*:?\s*)?(.*)$/i);
        return {
          path: '/',
          reason: match?.[2] || line,
          line: match?.[1] ? Number(match[1]) : undefined,
        };
      });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function validateE2BXml(xml, _xsdPath = process.env.E2B_R3_XSD_PATH) {
  const text = String(xml || '');
  if (!text.trim()) return [{ path: '/', reason: 'XML payload is empty' }];

  // 1. First enforce strict XML well-formedness
  const wfErrors = validateWellFormedXml(text);
  if (wfErrors.length) return wfErrors;

  // 2. Validate against official schema if schema path is available
  const xsdErrors = validateAgainstXsd(text, _xsdPath);
  if (Array.isArray(xsdErrors)) return xsdErrors;

  // 3. Fallback semantic checks
  const errors = [];
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
