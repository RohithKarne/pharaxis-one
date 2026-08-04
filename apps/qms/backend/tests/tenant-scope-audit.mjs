/**
 * tenant-scope-audit.mjs — find every tenant query that relies on RLS to be safe.
 *
 * Phase 0 of the PostgreSQL -> MySQL migration. MySQL has no Row Level Security,
 * so any SELECT/UPDATE/DELETE against a tenant-owned table must carry its own
 * org_id predicate. This audit lists the ones that do not.
 *
 * Tenant tables are derived from the live schema (any table with an org_id
 * column), not a hardcoded list, so the audit cannot drift as tables are added.
 *
 * This is a STATIC heuristic: it reads SQL out of template literals and looks
 * for an org_id predicate. It is deliberately biased toward false positives —
 * a flagged query that turns out to be safe costs a read; a missed one costs a
 * cross-tenant leak. The runtime guard in src/db/tenantGuard.js is the
 * authoritative check.
 *
 * Exit code is non-zero while any unscoped query remains, so this gates Phase 0.
 *
 * Run: node tests/tenant-scope-audit.mjs
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

dotenv.config();

// Walk all of src/ recursively. An earlier version listed only the top level of
// src/routes and src/services, which silently skipped src/services/platform/*
// and src/routes/superadmin/* — both of which contain unscoped tenant writes.
// A checker that does not scan a directory reports it as clean.
const SRC_ROOT = 'src';

/** Statements that read or mutate existing rows. INSERT is excluded: it sets org_id explicitly. */
const SCOPED_VERBS = /^\s*(SELECT|UPDATE|DELETE)\b/i;

async function tenantTables() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'org_id'
        ORDER BY table_name`
    );
    return new Set(rows.map((r) => r.table_name));
  } finally {
    await pool.end();
  }
}

/** Pull template-literal and quoted SQL out of a JS source file. */
function extractSql(source) {
  const found = [];
  for (const match of source.matchAll(/`([^`]*)`/g)) {
    const text = match[1];
    if (SCOPED_VERBS.test(text)) {
      found.push({ sql: text, index: match.index });
    }
  }
  for (const match of source.matchAll(/'((?:SELECT|UPDATE|DELETE)[^']*)'/gi)) {
    found.push({ sql: match[1], index: match.index });
  }
  return found;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * Extract just the WHERE clause of a statement.
 *
 * Checking the whole statement for `org_id` produces FALSE NEGATIVES: a query
 * like `... LEFT JOIN sa_org_upload_policies p ON p.org_id = d.org_id
 * WHERE d.id = $1` contains "org_id" in its JOIN and would pass while being
 * completely unscoped. Two real cross-tenant reads in documentControl.js hid
 * behind exactly that. The org predicate has to be in the WHERE.
 *
 * Returns null when the statement has no WHERE clause at all — which for a
 * tenant table is itself unscoped.
 */
function whereClauseOf(sql) {
  // Find a WHERE at PAREN DEPTH ZERO.
  //
  // Taking the first WHERE anywhere is a false NEGATIVE, which is the dangerous
  // direction for a security gate. A query with `FILTER (WHERE r.role_key IS NOT
  // NULL)` in its select list has its first WHERE inside those parentheses, so
  // the "WHERE clause" extracted was really the select list plus the JOINs — and
  // a JOIN condition like `ur.org_id = u.org_id` then matched the org_id test
  // and passed an unscoped query. Same trap for a subquery's WHERE, or a CTE's.
  let depth = 0;
  let start = -1;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && (ch === 'w' || ch === 'W')) {
      if (/^where\b/i.test(sql.slice(i)) && (i === 0 || /\s/.test(sql[i - 1]))) {
        start = i;
        break;
      }
    }
  }
  if (start === -1) return null;

  const rest = sql.slice(start);
  const end = rest.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT|RETURNING|FOR\s+UPDATE)\b/i);
  return end === -1 ? rest : rest.slice(0, end);
}

function tablesIn(sql, tenantSet) {
  const hits = new Set();
  for (const match of sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_][a-z0-9_]*)/gi)) {
    const name = match[1].toLowerCase();
    if (tenantSet.has(name)) hits.add(name);
  }
  return hits;
}

const tenantSet = await tenantTables();
console.log(`tenant tables in schema (have org_id): ${tenantSet.size}\n`);

const offenders = [];
let scanned = 0;

function jsFilesUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...jsFilesUnder(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A file may declare itself deliberately cross-org with a marker comment:
 *   // tenant-scope-audit: cross-org — <reason>
 * Its findings are then reported as EXEMPT rather than counted as failures.
 * Exemptions are always printed. An exemption nobody can see is just a hole.
 */
const EXEMPT_MARKER = /tenant-scope-audit:\s*cross-org/;

const allFiles = jsFilesUnder(SRC_ROOT);
console.log(`scanning ${allFiles.length} source files under ${SRC_ROOT}/\n`);

const exempt = [];

{
  for (const path of allFiles) {
    const source = readFileSync(path, 'utf8');
    const fileIsExempt = EXEMPT_MARKER.test(source);

    for (const { sql, index } of extractSql(source)) {
      scanned += 1;
      const touched = tablesIn(sql, tenantSet);
      if (touched.size === 0) continue;

      // The org predicate must live in the WHERE clause. A JOIN ... ON p.org_id
      // = d.org_id does NOT scope the statement, and matching on the whole SQL
      // string treats it as if it did.
      // org_code is an equally valid org scope: qms_orgs.org_code identifies one
      // org. The pre-auth login path resolves the tenant by code, not id, because
      // it has no org_id until the user row is found.
      const where = whereClauseOf(sql);
      if (where && /\borg_id\b|\borg_code\b/i.test(where)) continue;

      const finding = {
        file: path,
        line: lineOf(source, index),
        tables: [...touched].join(', '),
        reason: where ? 'no org_id in WHERE' : 'no WHERE clause',
        snippet: sql.replace(/\s+/g, ' ').trim().slice(0, 90)
      };

      // A single query may also declare itself with an inline SQL comment, for
      // files that are mostly tenant-scoped but have a few pre-auth exceptions.
      if (fileIsExempt || EXEMPT_MARKER.test(sql)) exempt.push(finding);
      else offenders.push(finding);
    }
  }
}

const byFile = offenders.reduce((acc, o) => {
  acc[o.file] = (acc[o.file] || 0) + 1;
  return acc;
}, {});

console.log(`scanned ${scanned} tenant-table statements`);
console.log(`UNSCOPED (no org_id predicate): ${offenders.length}\n`);

if (exempt.length > 0) {
  const exemptFiles = [...new Set(exempt.map((e) => e.file))];
  console.log(`EXEMPT (declared cross-org): ${exempt.length} in ${exemptFiles.length} file(s)`);
  for (const file of exemptFiles) {
    console.log(`      ${file}  (${exempt.filter((e) => e.file === file).length})`);
  }
  console.log('');
}

console.log('--- by file ---');
for (const [file, count] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
  console.log(`${String(count).padStart(4)}  ${file}`);
}

if (process.env.VERBOSE === '1') {
  console.log('\n--- detail ---');
  for (const o of offenders) {
    console.log(`${o.file}:${o.line}  [${o.tables}]  ${o.snippet}`);
  }
}

if (offenders.length > 0) {
  console.error(
    `\nTenant scope audit: FAILED — ${offenders.length} queries depend on RLS for tenant safety.`
  );
  console.error('Each must carry its own org_id predicate before the MySQL cutover.');
  process.exit(1);
}

console.log('\nTenant scope audit: PASSED');
