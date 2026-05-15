#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'routes');
const report = [];
const writeMethod = /router\.(post|put|patch|delete)\(['"`]([^'"`]+)/g;
const serverFile = path.resolve(__dirname, '..', 'server.js');
const hasGlobalAuditCapture = fs.existsSync(serverFile) && fs.readFileSync(serverFile, 'utf8').includes('auditAutoCapture()');

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) inspect(full);
  }
}

function inspect(file) {
  const text = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = writeMethod.exec(text))) {
    const method = match[1].toUpperCase();
    const route = match[2];
    const start = Math.max(0, match.index - 1200);
    const end = Math.min(text.length, match.index + 5000);
    const body = text.slice(start, end);
    const writesAudit = hasGlobalAuditCapture || /audit_logs|case_audit_trail|transmission_audit_trail|cm_audit_trail|writeAudit|writeCaseAudit|writeAuditLog|auditAutoCapture/i.test(body);
    report.push({ file: path.relative(process.cwd(), file), method, route, writes_audit: writesAudit, missing: !writesAudit });
  }
}

walk(root);
const output = { generated_at: new Date().toISOString(), total_write_routes: report.length, missing_count: report.filter(r => r.missing).length, routes: report };
console.log(JSON.stringify(output, null, 2));
if (process.env.AUDIT_COMPLETENESS_STRICT === '1' && output.missing_count) process.exit(1);
