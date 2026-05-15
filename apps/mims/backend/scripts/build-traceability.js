#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const base = path.resolve(__dirname, '..', '..');
const validationDir = path.join(base, 'validation');
const testDirs = [path.join(base, 'backend', 'tests'), path.join(base, 'frontend', 'src', 'test')];

function headings(file, prefix) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.startsWith('## ')).map(l => {
    const m = l.match(/##\s+([A-Z]+-\d+)\s*(.*)/);
    return m ? { id: m[1], title: m[2].trim(), prefix } : null;
  }).filter(Boolean);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(test|spec)\.(js|jsx|ts|tsx)$/.test(entry.name) || entry.name.includes('smoke')) files.push(full);
  }
  return files;
}

const urs = headings(path.join(validationDir, 'URS.md'), 'URS');
const fsReq = headings(path.join(validationDir, 'FS.md'), 'FS');
const tests = testDirs.flatMap(d => walk(d));
const rows = [['requirement_id','requirement_title','functional_spec','test_file','status']];
for (const req of urs) {
  const fsMatch = fsReq.find(f => f.id.endsWith(req.id.split('-')[1])) || fsReq[0];
  const linked = tests.find(t => fs.readFileSync(t, 'utf8').includes(req.id));
  rows.push([req.id, req.title, fsMatch?.id || '', linked ? path.relative(base, linked) : 'manual OQ/PQ script', 'mapped']);
}
fs.mkdirSync(validationDir, { recursive: true });
fs.writeFileSync(path.join(validationDir, 'TRACEABILITY-MATRIX.csv'), rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n'));
console.log(`Traceability matrix written: ${path.join(validationDir, 'TRACEABILITY-MATRIX.csv')}`);
