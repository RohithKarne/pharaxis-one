'use strict';

/**
 * csvHelpers.js — shared CSV utilities for admin export/import.
 *
 * Centralised so every admin export endpoint produces consistent
 * RFC-4180-style output: comma-separated, quoted fields when needed,
 * double-quote escape inside quoted fields.
 */

function csvEscape(field) {
  if (field == null) return '';
  let s = String(field);
  // Neutralise CSV formula injection: prefix a single quote when the value
  // starts with a formula trigger (=, +, -, @) or a tab/CR.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, columns) {
  // columns = [{ key: 'name', label: 'Name' }, ...]
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => csvEscape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(',')
  ).join('\n');
  return `${header}\n${body}\n`;
}

function setCsvDownloadHeaders(res, filenameStem) {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}-${stamp}.csv"`);
}

function parseCsvRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"' && cur === '') { inQ = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCsv(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(l => {
    const cells = parseCsvRow(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

module.exports = { csvEscape, toCsv, setCsvDownloadHeaders, parseCsvRow, parseCsv };
