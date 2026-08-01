/**
 * CP-65 regression — protective translation gate (Option A).
 *
 * Asserts that regulated content types are blocked from the free MyMemory API
 * BEFORE any outbound/DB call, and that only the compliance-approved non-regulated
 * types (news, FAQ) are allowed. No network is performed by this test — the whole
 * point is proving the regulated path never reaches the network.
 *
 * Run: node tests/cp65-translation-gate.js
 */
const assert = require('assert');
const https = require('https');

const db = require('../database/db');
const { autoTranslate, isTranslatableEntity } = require('../utils/translator');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
}

// 1. Classification — fail-closed: unknown types are blocked.
check('news + faq are allowed', () => {
  assert.strictEqual(isTranslatableEntity('cp_news_posts'), true);
  assert.strictEqual(isTranslatableEntity('cp_faq_items'), true);
});
check('safety + documents are blocked', () => {
  assert.strictEqual(isTranslatableEntity('cp_safety_alerts'), false);
  assert.strictEqual(isTranslatableEntity('cp_documents'), false);
});
check('unknown types are blocked (fail-closed)', () => {
  assert.strictEqual(isTranslatableEntity('cp_anything_else'), false);
});

// 2. Behaviour — a regulated call makes ZERO DB and ZERO network calls; an allowed
//    call passes the gate and reaches the DB (getTargetLangs) — proving the gate,
//    not just the constant.
async function behaviour() {
  let dbCalls = 0, netCalls = 0;
  const origExec = db.pool.execute;
  const origGet = https.get;
  // getTargetLangs is the first thing past the gate; stub it to return no languages
  // so the allowed path stops before any network, while still counting the DB hit.
  db.pool.execute = async () => { dbCalls++; return [[{ language_config_json: null }]]; };
  https.get = () => { netCalls++; throw new Error('network must not be called in this test'); };
  try {
    dbCalls = 0; netCalls = 0;
    await autoTranslate(4, 'cp_safety_alerts', 1, { title: 'Boxed warning: hepatotoxicity' });
    check('regulated content: no DB call, no network call', () => {
      assert.strictEqual(dbCalls, 0, `expected 0 DB calls, got ${dbCalls}`);
      assert.strictEqual(netCalls, 0, `expected 0 network calls, got ${netCalls}`);
    });

    dbCalls = 0; netCalls = 0;
    await autoTranslate(4, 'cp_news_posts', 1, { title: 'Company update' });
    check('allowed content: passes gate, reaches DB', () => {
      assert.ok(dbCalls >= 1, `expected >=1 DB call (gate passed), got ${dbCalls}`);
      assert.strictEqual(netCalls, 0, 'no network expected (no target languages configured)');
    });
  } finally {
    db.pool.execute = origExec;
    https.get = origGet;
  }
}

behaviour().then(() => {
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll CP-65 gate checks passed.');
  process.exit(failures ? 1 : 0);
});
