/**
 * CPPM-34 regression — a portal visitor must never reach a document that has
 * expired, is still a draft, or is not yet due to publish.
 *
 * The document library already applies that rule. Search, the type-ahead
 * suggestions, the authenticated download and the saved-items list did not,
 * so an old or bookmarked link still served the file.
 *
 * Runs with a stubbed pool and stubbed portal auth — no database, no network.
 * Run: node tests/cppm34-document-visibility.js
 */
const assert  = require('assert');
const express = require('express');
const Module  = require('module');

let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
}

// ── Stub portal auth before the routes require it ────────────────────────────
const authPath = require.resolve('../middleware/auth');
require.cache[authPath] = new Module(authPath, null);
require.cache[authPath].exports = {
  authenticatePortal: (req, _res, next) => {
    req.portalUser = { id: 7, clientId: 1, user_type: 'hcp' };
    next();
  },
  requirePortalAuth: (_req, _res, next) => next(),
};
require.cache[authPath].loaded = true;

// ── Stub the pool so every query is answered from fixtures ───────────────────
const db = require('../database/db');
const SQL = [];                 // every statement the routes ran
let documentRow = null;         // what a single-document lookup returns

function fixtureFor(sql) {
  if (sql.includes('FROM cp_clients'))     return [[{ id: 1 }]];
  if (sql.includes('FROM cp_features'))    return [[{ feature_key: 'document_library', is_enabled: 1 }]];
  if (sql.includes('FROM cp_saved_items')) return [[{ id: 3, item_type: 'document', item_id: 55, created_at: '2026-09-01' }]];
  if (sql.includes('FROM cp_documents'))   return [documentRow ? [documentRow] : []];
  if (sql.startsWith('UPDATE'))            return [{ affectedRows: 1 }];
  return [[]];
}
db.pool.execute = async (sql, params) => { SQL.push(String(sql)); return fixtureFor(String(sql)); };

// ── Mount the routes under test ──────────────────────────────────────────────
const app = express();
app.use('/api/portal/search',    require('../routes/portal/search'));
app.use('/api/portal/documents', require('../routes/portal/documents'));
app.use('/api/portal/saved',     require('../routes/portal/saved'));

const EXPIRED   = { id: 55, client_id: 1, title: 'Withdrawn SmPC', status: 'published', visible_to_json: '[]',
                    file_path: 'uploads/none.pdf', file_name: 'none.pdf',
                    expires_at: '2020-01-01 00:00:00', publish_at: '2019-01-01 00:00:00' };
const DRAFT     = { ...EXPIRED, title: 'Unapproved draft', status: 'draft',     expires_at: null, publish_at: null };
const SCHEDULED = { ...EXPIRED, title: 'Next month',       status: 'scheduled', expires_at: null, publish_at: '2099-01-01 00:00:00' };
const LIVE      = { ...EXPIRED, title: 'Current SmPC',     status: 'published', expires_at: null, publish_at: '2020-01-01 00:00:00' };

function lastDocumentSql() { return SQL.filter(s => s.includes('FROM cp_documents')).pop() || ''; }
function appliesTheRule(sql) { return sql.includes('expires_at') && sql.includes('publish_at'); }

async function run() {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path) => { const r = await fetch(base + path); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  // 1. Search must not offer an expired or unpublished document.
  SQL.length = 0; documentRow = EXPIRED;
  await get('/api/portal/search?clientCode=calder&q=smpc');
  const searchSql = lastDocumentSql();
  check('search applies the expiry and publish rule', () => {
    assert.ok(appliesTheRule(searchSql), `search query does not mention expires_at/publish_at:\n   ${searchSql.replace(/\s+/g, ' ').trim()}`);
  });

  // 2. Type-ahead suggestions, same rule.
  SQL.length = 0;
  await get('/api/portal/search/suggest?clientCode=calder&q=smpc');
  const suggestSql = lastDocumentSql();
  check('suggestions apply the expiry and publish rule', () => {
    assert.ok(appliesTheRule(suggestSql), `suggest query does not mention expires_at/publish_at:\n   ${suggestSql.replace(/\s+/g, ' ').trim()}`);
  });

  // 3. Download of an expired document — 410, and the agreed wording.
  documentRow = EXPIRED;
  const expired = await get('/api/portal/documents/55/download');
  check('an expired document is refused with "no longer available"', () => {
    assert.strictEqual(expired.status, 410, `expected 410, got ${expired.status}`);
    assert.match(String(expired.body.error || ''), /no longer available/i, `unexpected message: ${JSON.stringify(expired.body)}`);
  });

  // 4. Download of a draft or a future-dated document — indistinguishable from not found.
  documentRow = DRAFT;
  const draft = await get('/api/portal/documents/55/download');
  check('a draft document is not found', () => {
    assert.strictEqual(draft.status, 404, `expected 404, got ${draft.status}`);
    assert.strictEqual(draft.body.error, 'Document not found.',
      `a draft must be refused as not found, before any file lookup: ${JSON.stringify(draft.body)}`);
  });

  documentRow = SCHEDULED;
  const scheduled = await get('/api/portal/documents/55/download');
  check('a not-yet-published document is not found', () => {
    assert.strictEqual(scheduled.status, 404, `expected 404, got ${scheduled.status}`);
    assert.strictEqual(scheduled.body.error, 'Document not found.',
      `expected the visibility check to refuse it, not the file lookup: ${JSON.stringify(scheduled.body)}`);
  });

  // 5. A saved bookmark of an expired document stays visible but is marked withdrawn.
  documentRow = EXPIRED;
  const saved = await get('/api/portal/saved?clientCode=calder');
  check('a saved expired document is marked withdrawn, not silently dropped', () => {
    const item = (saved.body.saved || [])[0];
    assert.ok(item, `saved list is empty — the bookmark must stay visible: ${JSON.stringify(saved.body)}`);
    assert.strictEqual(item.withdrawn, true, `saved item is not marked withdrawn: ${JSON.stringify(item)}`);
  });

  // 6. The document that is genuinely live must still work exactly as before.
  documentRow = LIVE;
  const live = await get('/api/portal/documents/55/download');
  check('a live document still passes the visibility check', () => {
    assert.notStrictEqual(live.status, 410, 'a live document was refused as expired');
    assert.match(String(live.body.error || ''), /File not found on server/i,
      `expected the live document to reach the file-streaming step, got ${live.status} ${JSON.stringify(live.body)}`);
  });

  server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
