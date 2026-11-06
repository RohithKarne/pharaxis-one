/**
 * The words inside an uploaded PDF, so the portal search finds a document by what it
 * says and not only by its title (row 4 of the 27 Oct review). Read once, at upload,
 * and kept on the document row. A scanned PDF has no text layer and yields nothing:
 * it is still found by title.
 */
const fs = require('fs');
const log = require('./logger');

const MAX_CHARS = 1000000; // a 300-page label stays well under this; the column holds 16 MB

let pdfjs = null;
async function lib() {
  // PDF.js ships as an ES module; this backend is CommonJS.
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

async function extractPdfText(absPath) {
  try {
    const { getDocument } = await lib();
    const data = new Uint8Array(await fs.promises.readFile(absPath));
    // No scripts, no fonts fetched, no worker: text only.
    const doc = await getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    let text = '';
    for (let n = 1; n <= doc.numPages && text.length < MAX_CHARS; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    await doc.destroy();
    text = text.replace(/[ \t]+/g, ' ').trim().slice(0, MAX_CHARS);
    return text || null;
  } catch (err) {
    log.warn('documents.pdf_text_failed', { err: { name: err.name, message: err.message } });
    return null;
  }
}

module.exports = { extractPdfText };
