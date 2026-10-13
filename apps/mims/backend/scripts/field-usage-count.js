#!/usr/bin/env node
/**
 * field-usage-count.js — Day 0 of the case form clean-up (Rohith, 2026-10-13).
 *
 * Console view of the same count the Case Form Fields screen shows in the
 * "Used in cases" column (services/fieldUsageService.js). Read-only.
 *
 *   cd apps/mims/backend
 *   node scripts/field-usage-count.js            # every organisation
 *   node scripts/field-usage-count.js --org 1    # one organisation
 *   node scripts/field-usage-count.js --csv > counts.csv
 */

'use strict';

const path = require('path');
try { process.loadEnvFile(); } catch (_) { try { process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); } catch (_) {} }
const pool = require('../database/db');
const { resolvedFields, usageForFields } = require('../services/fieldUsageService');

const args = process.argv.slice(2);
const orgArg = args.includes('--org') ? Number(args[args.indexOf('--org') + 1]) : null;
const CSV = args.includes('--csv');

async function main() {
  const [orgs] = await pool.execute(orgArg ? 'SELECT id, name FROM organisations WHERE id = ?' : 'SELECT id, name FROM organisations WHERE is_active = 1 ORDER BY id', orgArg ? [orgArg] : []);
  const rows = [];
  for (const org of orgs) {
    const fields = await resolvedFields(org.id);
    const usage = await usageForFields(org.id, fields);
    for (const f of fields) {
      const u = usage[f.id];
      rows.push({ org: org.name, section: f.section_name, field: f.field_name, hidden: f.is_hidden ? 'hidden' : '', source: u.source, cases: u.cases === null ? '' : u.cases });
    }
  }
  if (CSV) {
    console.log('organisation,section,field,hidden,where the value lives,cases with a value');
    for (const r of rows) console.log([r.org, r.section, r.field, r.hidden, r.source, r.cases].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return;
  }
  let lastOrg = '', lastSection = '';
  for (const r of rows) {
    if (r.org !== lastOrg) { console.log(`\n=== ${r.org}`); lastOrg = r.org; lastSection = ''; }
    if (r.section !== lastSection) { console.log(`  ${r.section}`); lastSection = r.section; }
    console.log(`    ${String(r.cases).padStart(6)}  ${r.field}${r.hidden ? ' (hidden)' : ''}  [${r.source}]`);
  }
  console.log(`\n${rows.length} fields. "configured values" is the extension store; "not stored" means the screen never had a place to keep it.`);
}

main().catch(err => { console.error('field-usage-count failed:', err.message); process.exitCode = 1; }).finally(() => pool.end && pool.end());
