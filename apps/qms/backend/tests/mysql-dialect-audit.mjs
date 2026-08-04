/**
 * mysql-dialect-audit.mjs — what in the application's SQL is still PostgreSQL-only?
 *
 * Phase 2 of the PostgreSQL -> MySQL migration. Phase 1 converted the schema;
 * this tracks the query layer. It is the gate: it fails while any Postgres-only
 * construct remains in application SQL, and the count is the remaining work.
 *
 * It is a STATIC scan of SQL string literals, so it is approximate at the edges
 * (a `::` inside a comment, a `$1` inside prose). It is biased toward reporting
 * too much rather than too little — an over-report costs a read, a miss ships a
 * runtime error to a user.
 *
 * Run:            node tests/mysql-dialect-audit.mjs
 * Per-construct:  VERBOSE=1 node tests/mysql-dialect-audit.mjs
 * One construct:  ONLY=returning VERBOSE=1 node tests/mysql-dialect-audit.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = 'src';

/**
 * Each construct: how to find it, and what it has to become.
 * `blocking: false` means it is valid in both dialects and only listed so the
 * count is honest — it does not fail the gate.
 */
const CONSTRUCTS = [
  {
    // NOT blocking: src/db/mysql/pgCompat.js rewrites $n -> ? at runtime, so
    // these need no source edit. Counting them as work to do would make the gate
    // unpassable and hide the constructs that genuinely still need a human.
    key: 'placeholders',
    pattern: /\$\d+/g,
    what: '$1 positional placeholders',
    fix: 'handled at runtime by the pgCompat adapter — no source change needed',
    blocking: false
  },
  {
    key: 'returning',
    pattern: /\bRETURNING\b/gi,
    what: 'RETURNING clause',
    fix: 'MySQL has none. Generate the id in the app (crypto.randomUUID) and SELECT back'
  },
  {
    key: 'onconflict',
    pattern: /\bON\s+CONFLICT\b/gi,
    what: 'ON CONFLICT upsert',
    fix: 'ON DUPLICATE KEY UPDATE (and DO NOTHING -> INSERT IGNORE)'
  },
  {
    key: 'casts',
    pattern: /::(?:text|uuid|jsonb|json|int|integer|boolean|date|timestamptz|numeric)\b/gi,
    what: ':: type casts',
    fix: 'drop, or CAST(x AS CHAR/UNSIGNED/JSON)'
  },
  {
    key: 'setconfig',
    pattern: /\b(?:set_config|current_setting)\s*\(/gi,
    what: 'set_config / current_setting (RLS session vars)',
    fix: 'no MySQL equivalent — scoping is already in the queries after Phase 0'
  },
  {
    // (?<!Date\.) so JavaScript's Date.now() is not counted. Without it the gate
    // could never reach zero: three template literals legitimately contain
    // Date.now() (codegen.js, requestContext.js) and a gate with a permanent
    // non-zero floor teaches everyone to ignore it.
    key: 'now',
    pattern: /(?<!Date\.)\bnow\(\)/gi,
    what: 'now()',
    fix: 'CURRENT_TIMESTAMP(3)'
  },
  {
    key: 'ilike',
    pattern: /\bILIKE\b/gi,
    what: 'ILIKE',
    fix: 'LIKE — the utf8mb4_0900_ai_ci collation is already case-insensitive'
  },
  {
    key: 'filter',
    pattern: /\bFILTER\s*\(\s*WHERE/gi,
    what: 'aggregate FILTER (WHERE ...)',
    fix: 'SUM(CASE WHEN ... THEN 1 ELSE 0 END)'
  },
  {
    key: 'genuuid',
    pattern: /\bgen_random_uuid\s*\(/gi,
    what: 'gen_random_uuid()',
    fix: 'UUID(), or generate in the app'
  },
  {
    key: 'splitpart',
    pattern: /\bsplit_part\s*\(/gi,
    what: 'split_part()',
    fix: 'SUBSTRING_INDEX()'
  },
  {
    key: 'pgcrypto',
    pattern: /\b(?:crypt|gen_salt|digest|pgp_sym_encrypt|pgp_sym_decrypt)\s*\(/gi,
    what: 'pgcrypto functions (crypt/gen_salt/digest)',
    fix: 'MySQL has none. Password hashing must move to the app layer (bcrypt)'
  },
  {
    key: 'excluded',
    pattern: /\bEXCLUDED\./gi,
    what: 'EXCLUDED.col (inside ON CONFLICT DO UPDATE)',
    fix: 'MySQL 8.0.20+: alias the row — INSERT ... AS new ... UPDATE c = new.c'
  },
  {
    key: 'interval',
    pattern: /\binterval\s+'/gi,
    what: "interval 'n unit' literal",
    fix: 'INTERVAL n UNIT (no quotes) — e.g. INTERVAL 7 DAY'
  },
  {
    // Postgres returns an integer number of days for `date - date`. MySQL's `-`
    // on dates does something else entirely (numeric coercion), so this is a
    // silent wrong-answer rather than an error. Found in the document-control
    // alerts query; no other construct pattern would have caught it.
    key: 'datearith',
    pattern: /(?:-\s*CURRENT_DATE|CURRENT_DATE\s*-)/gi,
    what: 'date - date arithmetic',
    fix: 'DATEDIFF(a, b) — MySQL does not return days from a date subtraction'
  },
  {
    // Found during the cutover, not by this audit — the aiInsights trend queries
    // bucketed by week with to_char(date_trunc('week', ...)). Neither function
    // exists in MySQL. Added so the gap cannot reopen.
    key: 'pgdatefns',
    pattern: /\b(?:to_char|date_trunc|age|generate_series)\s*\(/gi,
    what: 'to_char / date_trunc / age / generate_series',
    fix: 'DATE_FORMAT / DATE_SUB with WEEKDAY() / TIMESTAMPDIFF — no MySQL equivalents'
  },
  {
    key: 'jsonbuild',
    pattern: /\bjsonb?_build_(?:object|array)\s*\(/gi,
    what: 'jsonb_build_object / jsonb_build_array',
    fix: 'JSON_OBJECT() / JSON_ARRAY()'
  },
  {
    // Position, not syntax. Postgres tolerates `FOR UPDATE` before `LIMIT`;
    // MySQL requires LIMIT first and otherwise raises a syntax error at
    // runtime. The clause itself is fine in both, which is exactly why the
    // non-blocking `forupdate` entry below did NOT catch this — it cost a 500
    // on CAPA submit after the cutover.
    key: 'forupdatelimit',
    pattern: /\bFOR\s+UPDATE\b[\s\S]{0,60}?\bLIMIT\b/gi,
    what: 'FOR UPDATE placed before LIMIT',
    fix: 'MySQL requires LIMIT first: ... LIMIT 1 FOR UPDATE'
  },
  {
    key: 'forupdate',
    pattern: /\bFOR\s+UPDATE\b/gi,
    what: 'SELECT ... FOR UPDATE',
    fix: 'valid in MySQL/InnoDB too — listed for completeness',
    blocking: false
  }
];

const ONLY = process.env.ONLY || '';
const VERBOSE = process.env.VERBOSE === '1';

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
 * Every string literal in the file — template, single- and double-quoted.
 *
 * Earlier versions only accepted chunks that STARTED with SELECT/INSERT/…, which
 * missed two whole classes of real SQL:
 *   - double-quoted statements (every set_config call in rlsContext.js)
 *   - dynamically-built WHERE fragments pushed into a clauses array, e.g.
 *       clauses.push(`(title ILIKE $${n} OR capa_code ILIKE $${n})`)
 *     which is where all the ILIKE usage lives and reported as zero.
 *
 * The construct patterns below are SQL-specific enough to do the filtering
 * themselves, so casting a wide net here is safer than trying to decide up front
 * what counts as "a query".
 */
/**
 * Strip comments before scanning. A JSDoc block explaining "this used to be
 * crypt($2, $1)" contains backticks and would otherwise be counted as SQL —
 * documenting a migration would make the gate fail. Only block comments and
 * whole-line // comments are removed; an inline // is left alone so a URL
 * inside a string literal ("https://…") is not truncated.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

function sqlChunks(rawSource) {
  const source = stripComments(rawSource);
  const chunks = [];
  for (const m of source.matchAll(/`([^`]*)`/g)) chunks.push({ sql: m[1], index: m.index });
  for (const m of source.matchAll(/'([^'\n]*)'/g)) chunks.push({ sql: m[1], index: m.index });
  for (const m of source.matchAll(/"([^"\n]*)"/g)) chunks.push({ sql: m[1], index: m.index });
  return chunks;
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/**
 * A file may declare itself deliberately PostgreSQL-only:
 *   // mysql-dialect-audit: postgres-only — <reason>
 * Its findings are reported as EXEMPT instead of failing the gate. Exemptions
 * are always printed — one nobody can see is just an untracked hole.
 */
const EXEMPT_MARKER = /mysql-dialect-audit:\s*postgres-only/;

const files = jsFilesUnder(SRC_ROOT);
const hits = new Map(CONSTRUCTS.map((c) => [c.key, []]));
const exemptFiles = [];

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  if (EXEMPT_MARKER.test(source)) {
    exemptFiles.push(path);
    continue;
  }
  for (const { sql, index } of sqlChunks(source)) {
    for (const c of CONSTRUCTS) {
      if (ONLY && c.key !== ONLY) continue;
      const found = sql.match(c.pattern);
      if (!found) continue;
      hits.get(c.key).push({
        file: path,
        line: lineOf(source, index),
        count: found.length,
        snippet: sql.replace(/\s+/g, ' ').trim().slice(0, 80)
      });
    }
  }
}

console.log(`scanned ${files.length} source files under ${SRC_ROOT}/\n`);

let blocking = 0;
if (exemptFiles.length) {
  console.log(`EXEMPT (declared postgres-only): ${exemptFiles.length} file(s)`);
  for (const f of exemptFiles) console.log(`      ${f}`);
  console.log('');
}

console.log('construct                                  sites  occurrences');
console.log('-------------------------------------------------------------');
for (const c of CONSTRUCTS) {
  if (ONLY && c.key !== ONLY) continue;
  const rows = hits.get(c.key);
  const occurrences = rows.reduce((a, r) => a + r.count, 0);
  if (rows.length === 0) continue;
  const flag = c.blocking === false ? ' (ok in MySQL)' : '';
  console.log(
    `${c.what.padEnd(42)} ${String(rows.length).padStart(5)}  ${String(occurrences).padStart(11)}${flag}`
  );
  if (c.blocking !== false) blocking += rows.length;
}

if (VERBOSE) {
  for (const c of CONSTRUCTS) {
    if (ONLY && c.key !== ONLY) continue;
    const rows = hits.get(c.key);
    if (!rows.length) continue;
    console.log(`\n--- ${c.what}  →  ${c.fix}`);
    const byFile = rows.reduce((acc, r) => {
      acc[r.file] = (acc[r.file] || 0) + r.count;
      return acc;
    }, {});
    for (const [file, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${file}`);
    }
  }
}

console.log('');
if (blocking > 0) {
  console.error(`MySQL dialect audit: FAILED — ${blocking} site(s) still PostgreSQL-only.`);
  console.error('Each must be translated before the driver can be swapped.');
  process.exit(1);
}

console.log('MySQL dialect audit: PASSED');
