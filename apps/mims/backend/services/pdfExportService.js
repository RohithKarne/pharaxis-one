'use strict';

function escapePdfText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makeTextPdf(title, lines = []) {
  const safeLines = [title, '', ...lines].map((line) => escapePdfText(line).slice(0, 140));
  const text = safeLines
    .map((line, index) => `BT /F1 ${index === 0 ? 18 : 10} Tf 50 ${760 - (index * 16)} Td (${line}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

// ── Letters ──────────────────────────────────────────────────────────────────
// A letter as a real PDF: several pages, words wrapped to the margin, headings
// in bold, list bullets, and accented Latin characters (é, ü, ñ) through the
// WinAnsi encoding of the built-in Helvetica. No library: the letter is text.

// Helvetica advance widths (1/1000 em) for ASCII 32..126, from the standard
// font metrics. Anything else is measured as 556.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,
  278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,
  667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,
  333,500,278,556,500,722,500,500,500,334,260,334,584];

// Characters outside Latin-1 that WinAnsi still has, by their byte there.
const WIN_ANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function toWinAnsi(text) {
  const bytes = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (WIN_ANSI[ch] !== undefined) bytes.push(WIN_ANSI[ch]);
    else if (code >= 32 && code <= 255 && !(code >= 127 && code < 160)) bytes.push(code);
    else bytes.push(63); // '?'
  }
  return Buffer.from(bytes);
}

function textWidth(text, size, bold) {
  let w = 0;
  for (const b of toWinAnsi(text)) w += (b >= 32 && b <= 126 ? HELV[b - 32] : 556);
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
}

// HTML to paragraphs: { text, bold, gap } — headings bold, list items bulleted.
function htmlToParagraphs(html) {
  const marked = String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\u0001• ')
    .replace(/<\s*h[1-6][^>]*>/gi, '\u0001\u0002')
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, '\u0001')
    .replace(/<\s*\/?\s*(p|div|section|article|ul|ol|tr|table|blockquote)[^>]*>/gi, '\u0001')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(marked).split('\u0001')
    .map((chunk) => ({ bold: chunk.startsWith('\u0002'), text: chunk.replace(/\u0002/g, '') }))
    .map((p) => ({ ...p, text: p.text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').trim() }))
    .filter((p) => p.text);
}

function wrap(text, size, bold, width) {
  const lines = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const word of raw.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

const pdfStr = (buf) => Buffer.concat([Buffer.from('('), Buffer.from(buf.toString('latin1').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'), 'latin1'), Buffer.from(')')]);

/**
 * makeLetterPdf({ title, html, footer }) — US Letter pages, 1-inch margins,
 * 11pt Helvetica; the title (the subject line) on the first page in bold,
 * "footer · Page n of N" at the foot of each page.
 */
function makeLetterPdf({ title = '', html = '', footer = '' }) {
  const W = 612, H = 792, M = 72, SIZE = 11, LEAD = 15, usable = W - 2 * M;
  const lines = [];
  if (title) { for (const l of wrap(title, 14, true, usable)) lines.push({ text: l, bold: true, size: 14 }); lines.push({ gap: 10 }); }
  for (const p of htmlToParagraphs(html)) {
    for (const l of wrap(p.text, SIZE, p.bold, usable)) lines.push({ text: l, bold: p.bold, size: SIZE });
    lines.push({ gap: 6 });
  }
  // Lay lines onto pages.
  const pages = [[]];
  let y = H - M;
  for (const l of lines) {
    const h = l.gap !== undefined ? l.gap : (l.size === 14 ? 19 : LEAD);
    if (l.gap === undefined && y - h < M + 20) { pages.push([]); y = H - M; }
    if (l.gap !== undefined) { y -= h; continue; }
    y -= h;
    pages[pages.length - 1].push({ ...l, y });
  }
  const streams = pages.map((page, i) => {
    const parts = page.map((l) => Buffer.concat([
      Buffer.from(`BT /${l.bold ? 'F2' : 'F1'} ${l.size} Tf ${M} ${l.y.toFixed(1)} Td `), pdfStr(toWinAnsi(l.text)), Buffer.from(' Tj ET\n')]));
    const foot = `${footer ? `${footer} · ` : ''}Page ${i + 1} of ${pages.length}`;
    parts.push(Buffer.concat([Buffer.from(`BT /F1 8 Tf ${M} 40 Td `), pdfStr(toWinAnsi(foot)), Buffer.from(' Tj ET\n')]));
    return Buffer.concat(parts);
  });
  // Objects: 1 catalog, 2 pages, 3 F1, 4 F2, then a page and its content per page.
  const objs = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objs.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objs.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  objs.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  objs.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  streams.forEach((st, i) => {
    objs.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`));
    objs.push(Buffer.concat([Buffer.from(`<< /Length ${st.length} >>\nstream\n`), st, Buffer.from('\nendstream')]));
  });
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(offset);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    chunks.push(b); offset += b.length;
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  chunks.push(Buffer.from(xref));
  return { buffer: Buffer.concat(chunks), pages: pages.length };
}

module.exports = { makeTextPdf, makeLetterPdf, htmlToParagraphs };
