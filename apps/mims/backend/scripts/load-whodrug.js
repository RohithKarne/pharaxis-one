#!/usr/bin/env node
'use strict';
const fs = require('fs');
const readline = require('readline');
const pool = require('../database/db');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/load-whodrug.js <licensed-whodrug-csv>');
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    const [code, term, level, parent_id, version] = line.split(',').map(v => v?.trim());
    if (!code || code.toLowerCase() === 'code') continue;
    await pool.execute('INSERT INTO dictionary_whodrug (code, term, level, parent_id, version) VALUES (?, ?, ?, ?, ?)', [code, term, level || null, parent_id || null, version || null]);
    count += 1;
  }
  console.log(`Loaded ${count} WHODrug terms`);
  process.exit(0);
}
main().catch(err => { console.error(err.message); process.exit(1); });
