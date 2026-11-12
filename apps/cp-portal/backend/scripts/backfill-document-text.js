/**
 * backfill-document-text.js  (row 4 of the 27 Oct 2026 review)
 *
 * Reads the words of every PDF document uploaded before the portal search looked
 * inside documents, so those documents are found by what they say too. New uploads
 * are read at upload time and need nothing.
 *
 * Safe to run more than once: only documents with no stored text are read, and a
 * file that cannot be read (a scan, a missing file) is reported and left as it was.
 *
 *   node scripts/backfill-document-text.js
 */
require('dotenv').config({ quiet: true });
const { pool } = require('../database/db');
const storage = require('../utils/storage');
const { extractPdfText } = require('../utils/pdfText');

(async () => {
  const [docs] = await pool.execute(
    `SELECT id, client_id, title, file_path FROM cp_documents
      WHERE search_text IS NULL AND mime_type = 'application/pdf' AND file_path IS NOT NULL`);
  let read = 0, empty = 0;
  for (const d of docs) {
    const text = storage.exists(d.file_path) ? await extractPdfText(storage.resolve(d.file_path)) : null;
    if (text) {
      await pool.execute('UPDATE cp_documents SET search_text = ? WHERE id = ?', [text, d.id]);
      read += 1;
    } else {
      empty += 1;
      console.log(`no text: document ${d.id} (client ${d.client_id}) "${d.title}"`);
    }
  }
  console.log(`Documents read: ${read}. No text found: ${empty}. Checked: ${docs.length}.`);
  await pool.end();
})().catch(err => { console.error(err.message); process.exit(1); });
