'use strict';

/**
 * Migration 160 — remove logo files no organisation uses (MIPM-131 follow-up to
 * MIPM-197).
 *
 * Before MIPM-197 a replaced logo stayed in the publicly served logo folder.
 * Files named like an uploaded logo that no organisation points at are deleted.
 * Anything else in the folder is left alone.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../storage/org_logos');
const LOGO_FILE = /^org_\d+_\d+\.(png|jpe?g|gif|webp)$/i;

async function up(conn) {
  if (!fs.existsSync(DIR)) return;
  const [rows] = await conn.execute('SELECT logo_url FROM organisations WHERE logo_url IS NOT NULL');
  const inUse = new Set(rows.map((r) => path.basename(String(r.logo_url))));
  for (const name of fs.readdirSync(DIR)) {
    if (LOGO_FILE.test(name) && !inUse.has(name)) fs.unlinkSync(path.join(DIR, name));
  }
}

async function down(_conn) {}

module.exports = { up, down };
