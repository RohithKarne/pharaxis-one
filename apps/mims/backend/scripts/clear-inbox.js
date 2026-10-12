#!/usr/bin/env node
/**
 * clear-inbox.js — empty the MIMS Inbox and make the next "Fetch mail" pull
 * everything the mailbox holds (Rohith, 2026-10-12).
 *
 * Removes every inbox message with its attachments, notes, read receipts and
 * case links, in every tab (Inbox, Pending, Processed, Non-Processed, Outbox).
 * Cases already created from a message stay. The mail sending queue stays.
 * Then each mailbox's "fetched up to" marker is set back to 1 Jan 2000, so the
 * next fetch asks the mail server for everything rather than the last few days.
 *
 * Nothing is deleted without --yes. Run it from the backend folder:
 *
 *   cd apps/mims/backend
 *   node scripts/clear-inbox.js          # shows what would go
 *   node scripts/clear-inbox.js --yes    # does it
 */

'use strict';

const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(); } catch (_) { try { process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); } catch (_) {} }

const pool = require('../database/db');
const CONFIRM = process.argv.includes('--yes');
const CHILD_TABLES = ['inquiry_read_receipts', 'inquiry_notes', 'inquiry_attachments', 'email_case_sources'];

async function count(table) {
  const [[row]] = await pool.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  return row.n;
}

async function main() {
  const before = { inquiries: await count('inquiries') };
  for (const t of CHILD_TABLES) before[t] = await count(t);
  const [accounts] = await pool.execute('SELECT id, account_name, last_ingest_at FROM email_accounts');

  console.log('Inbox rows now:');
  for (const [t, n] of Object.entries(before)) console.log(`  ${t}: ${n}`);
  console.log(`Mailboxes: ${accounts.map(a => `${a.account_name} (fetched up to ${a.last_ingest_at ? new Date(a.last_ingest_at).toISOString() : 'never'})`).join(', ') || 'none'}`);

  if (!CONFIRM) {
    console.log('\nNothing deleted. Run again with --yes to clear the inbox and reset the fetch marker.');
    return;
  }

  // attachment files on disk, best effort: a missing file is not an error
  const [files] = await pool.execute('SELECT storage_path FROM inquiry_attachments WHERE storage_path IS NOT NULL');
  let removedFiles = 0;
  for (const f of files) { try { fs.unlinkSync(f.storage_path); removedFiles++; } catch (_) {} }

  for (const t of CHILD_TABLES) await pool.execute(`DELETE FROM ${t}`);
  await pool.execute('DELETE FROM inquiries');
  await pool.execute(`UPDATE email_accounts SET last_ingest_at = '2000-01-01 00:00:00'`);

  console.log(`\nDone. Removed ${before.inquiries} messages and ${removedFiles} attachment files.`);
  console.log('Every mailbox will fetch from 1 Jan 2000 on the next "Fetch mail".');
}

main()
  .catch(err => { console.error('clear-inbox failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end && pool.end());
