/**
 * pgcompat-placeholders.mjs — does the $n -> ? rewrite bind the right values?
 *
 * This covers the one failure mode of src/db/mysql/pgCompat.js that would not
 * announce itself: a repeated placeholder. Postgres allows
 *
 *     WHERE (source_id = $1 OR target_id = $1) AND org_id = $2
 *
 * with 2 parameters. mysql2's `?` is strictly positional, so the same query
 * needs 3 values with the first repeated. A naive rewrite produces a query that
 * still RUNS and still returns rows — just the wrong ones, silently, with org_id
 * compared against a row id. QMS has queries of exactly this shape in the
 * qms_trace_links lookups, so this is a real case, not a hypothetical.
 *
 * Run: node tests/pgcompat-placeholders.mjs
 */

import { toMysqlSql } from '../src/db/mysql/pgCompat.js';

function pass(name) {
  console.log(`PASS ${name}`);
}

function fail(name, details) {
  console.error(`FAIL ${name}: ${details}`);
  process.exitCode = 1;
}

function check(name, condition, details) {
  if (condition) pass(name);
  else fail(name, details);
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

// ---- simple sequential case -------------------------------------------------
{
  const { text, values } = toMysqlSql('SELECT * FROM t WHERE id = $1 AND org_id = $2', ['ID', 'ORG']);
  eq('sequential-text', text, 'SELECT * FROM t WHERE id = ? AND org_id = ?');
  eq('sequential-values', values, ['ID', 'ORG']);
}

// ---- the dangerous one: a repeated placeholder -------------------------------
{
  const { text, values } = toMysqlSql(
    'SELECT * FROM qms_trace_links WHERE (source_id = $1 OR target_id = $1) AND org_id = $2',
    ['NODE', 'ORG']
  );
  eq(
    'repeated-text',
    text,
    'SELECT * FROM qms_trace_links WHERE (source_id = ? OR target_id = ?) AND org_id = ?'
  );
  // NODE must appear twice, and ORG must land on the third ? — not the second.
  eq('repeated-values', values, ['NODE', 'NODE', 'ORG']);
}

// ---- out-of-order placeholders ----------------------------------------------
{
  const { text, values } = toMysqlSql('UPDATE t SET a = $2, b = $3 WHERE id = $1', ['ID', 'A', 'B']);
  eq('reordered-text', text, 'UPDATE t SET a = ?, b = ? WHERE id = ?');
  eq('reordered-values', values, ['A', 'B', 'ID']);
}

// ---- double-digit placeholders ($10 must not read as $1 followed by "0") -----
{
  const params = Array.from({ length: 12 }, (_, i) => `V${i + 1}`);
  const { text, values } = toMysqlSql('SELECT $10, $11, $12, $1', params);
  eq('double-digit-text', text, 'SELECT ?, ?, ?, ?');
  eq('double-digit-values', values, ['V10', 'V11', 'V12', 'V1']);
}

// ---- no placeholders --------------------------------------------------------
{
  const { text, values } = toMysqlSql('SELECT 1', []);
  eq('no-params-text', text, 'SELECT 1');
  eq('no-params-values', values, []);
}

// ---- fails loudly on a missing parameter rather than binding undefined -------
try {
  toMysqlSql('SELECT * FROM t WHERE id = $1 AND org_id = $2', ['ONLY_ONE']);
  fail('missing-param-throws', 'expected a throw, none was raised');
} catch (error) {
  check(
    'missing-param-throws',
    /only 1 parameter/.test(error.message),
    `unexpected message: ${error.message}`
  );
}

if (process.exitCode) {
  console.error('\npgCompat placeholders: FAILED');
  process.exit(process.exitCode);
}

console.log('\npgCompat placeholders: PASSED');
