'use strict';
/**
 * reportPdfService.js — Executive 21 CFR Part 11 PDF Export Engine for MIMS Reports
 *
 * Generates inspection-ready landscape PDF reports complete with:
 * - Organization branding and title
 * - Complete audit metadata block (timestamp, user, filters, record count)
 * - Structured data grid with column headers and cell truncation
 * - Multi-page pagination and running confidentiality footer
 *
 * Zero external binary dependencies; pure standards-compliant PDF-1.4 generation.
 */

const WIN_ANSI = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99
};

function toWinAnsi(text) {
  const bytes = [];
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if (WIN_ANSI[ch] !== undefined) bytes.push(WIN_ANSI[ch]);
    else if (code >= 32 && code <= 255 && !(code >= 127 && code < 160)) bytes.push(code);
    else bytes.push(63); // '?'
  }
  return Buffer.from(bytes);
}

function pdfStr(buf) {
  const escaped = buf.toString('latin1').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return Buffer.concat([Buffer.from('('), Buffer.from(escaped, 'latin1'), Buffer.from(')')]);
}

function formatFilterSummary(filters = {}) {
  const entries = Object.entries(filters).filter(([k]) => !k.startsWith('__'));
  if (entries.length === 0) return 'Report Defaults (No custom filters applied)';
  return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v || 'All'}`).join(' | ');
}

/**
 * generateReportPdf({ orgName, reportName, description, filters, columns, rows, labels, user })
 * Returns Buffer of valid PDF
 */
function generateReportPdf({
  orgName = 'Calder Therapeutics',
  reportName = 'Report',
  description = '',
  filters = {},
  columns = [],
  rows = [],
  labels = {},
  user = {},
}) {
  const W = 792; // US Letter Landscape
  const H = 612;
  const ML = 36; // Left margin
  const MR = 36; // Right margin
  const usableWidth = W - ML - MR; // 720 pt

  // Visible columns only (strip internal metadata like __drill_route)
  const visibleColumns = (columns.length > 0 ? columns : Object.keys(rows[0] || {}))
    .filter((c) => !c.startsWith('__'));

  const colCount = Math.max(1, visibleColumns.length);
  const colWidth = usableWidth / colCount;

  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const generatedBy = user.name ? `${user.name} (${user.email || 'user'})` : (user.email || 'System User');

  const pages = [];
  let currentPageCommands = [];

  function startNewPage() {
    if (currentPageCommands.length > 0) {
      pages.push(currentPageCommands);
    }
    currentPageCommands = [];
    return H - 40; // initial y cursor
  }

  let y = startNewPage();

  // Draw Page 1 Header & Audit Metadata
  // Organization Banner
  currentPageCommands.push(
    `BT /F2 13 Tf ${ML} ${y} Td ${pdfStr(toWinAnsi(orgName.toUpperCase()))} Tj ET\n`,
    `BT /F1 8.5 Tf ${ML} ${y - 12} Td ${pdfStr(toWinAnsi('Medical Information Management System — Executive GxP Report'))} Tj ET\n`
  );
  y -= 26;

  // Thin dividing line
  currentPageCommands.push(
    `0.8 0.85 0.9 RG 0.75 w ${ML} ${y} m ${W - MR} ${y} l S\n`
  );
  y -= 18;

  // Report Title
  currentPageCommands.push(
    `BT /F2 15 Tf ${ML} ${y} Td ${pdfStr(toWinAnsi(reportName))} Tj ET\n`
  );
  y -= 15;

  // Description
  if (description) {
    currentPageCommands.push(
      `BT /F1 8.5 Tf ${ML} ${y} Td ${pdfStr(toWinAnsi(description.slice(0, 140)))} Tj ET\n`
    );
    y -= 14;
  }

  // Audit Metadata Box
  const auditBoxHeight = 36;
  const auditBoxY = y - auditBoxHeight;
  currentPageCommands.push(
    // Background fill & border
    `0.96 0.97 0.99 rg ${ML} ${auditBoxY} ${usableWidth} ${auditBoxHeight} re f\n`,
    `0.85 0.88 0.92 RG 0.5 w ${ML} ${auditBoxY} ${usableWidth} ${auditBoxHeight} re S\n`,
    // Text contents
    `BT /F2 7.5 Tf ${ML + 8} ${auditBoxY + 22} Td ${pdfStr(toWinAnsi('GENERATED:'))} Tj ET\n`,
    `BT /F1 7.5 Tf ${ML + 65} ${auditBoxY + 22} Td ${pdfStr(toWinAnsi(generatedAt))} Tj ET\n`,
    `BT /F2 7.5 Tf ${ML + 220} ${auditBoxY + 22} Td ${pdfStr(toWinAnsi('USER:'))} Tj ET\n`,
    `BT /F1 7.5 Tf ${ML + 250} ${auditBoxY + 22} Td ${pdfStr(toWinAnsi(generatedBy))} Tj ET\n`,
    `BT /F2 7.5 Tf ${ML + 480} ${auditBoxY + 22} Td ${pdfStr(toWinAnsi('RECORDS:'))} Tj ET\n`,
    `BT /F1 7.5 Tf ${ML + 528} ${auditBoxY + 22} Td ${pdfStr(toWinAnsi(`${rows.length} row(s)`))} Tj ET\n`,
    `BT /F2 7.5 Tf ${ML + 8} ${auditBoxY + 8} Td ${pdfStr(toWinAnsi('FILTERS:'))} Tj ET\n`,
    `BT /F1 7.5 Tf ${ML + 65} ${auditBoxY + 8} Td ${pdfStr(toWinAnsi(formatFilterSummary(filters).slice(0, 130)))} Tj ET\n`
  );

  y = auditBoxY - 18;

  function drawTableHeader(cursorY) {
    currentPageCommands.push(
      // Header background
      `0.91 0.93 0.96 rg ${ML} ${cursorY - 14} ${usableWidth} 16 re f\n`,
      `0.78 0.82 0.88 RG 0.75 w ${ML} ${cursorY - 14} ${usableWidth} 16 re S\n`
    );
    visibleColumns.forEach((col, idx) => {
      const colX = ML + (idx * colWidth) + 4;
      const label = labels[col] || col.replace(/_/g, ' ').toUpperCase();
      const maxChars = Math.floor(colWidth / 5.2);
      const safeLabel = label.slice(0, maxChars);
      currentPageCommands.push(
        `BT /F2 7.5 Tf 0.15 0.2 0.3 rg ${colX.toFixed(1)} ${(cursorY - 10).toFixed(1)} Td ${pdfStr(toWinAnsi(safeLabel))} Tj ET\n`
      );
    });
    return cursorY - 18;
  }

  y = drawTableHeader(y);

  // Render Table Rows
  const rowHeight = 15;
  const bottomThreshold = 55; // reserve space for running footer

  rows.forEach((row, rowIdx) => {
    if (y < bottomThreshold) {
      y = startNewPage();
      // Draw running header on subsequent pages
      currentPageCommands.push(
        `BT /F2 9 Tf 0.3 0.35 0.45 rg ${ML} ${y} Td ${pdfStr(toWinAnsi(`${reportName} (continued)`))} Tj ET\n`,
        `0.85 0.88 0.92 RG 0.5 w ${ML} ${y - 4} ${W - MR} ${y - 4} l S\n`
      );
      y -= 14;
      y = drawTableHeader(y);
    }

    // Alternating row background
    if (rowIdx % 2 === 1) {
      currentPageCommands.push(
        `0.98 0.98 0.99 rg ${ML} ${y - 11} ${usableWidth} ${rowHeight} re f\n`
      );
    }
    // Subtle bottom cell border
    currentPageCommands.push(
      `0.9 0.92 0.94 RG 0.3 w ${ML} ${y - 11} ${W - MR} ${y - 11} l S\n`
    );

    visibleColumns.forEach((col, idx) => {
      const colX = ML + (idx * colWidth) + 4;
      const rawVal = row[col];
      let valStr = rawVal == null || rawVal === '' ? '—' : String(rawVal);
      if (typeof rawVal === 'boolean') valStr = rawVal ? 'Yes' : 'No';
      if (typeof rawVal === 'object') {
        try { valStr = JSON.stringify(rawVal); } catch (_) { valStr = '[Object]'; }
      }
      const maxChars = Math.floor(colWidth / 4.8);
      const safeVal = valStr.length > maxChars ? valStr.slice(0, maxChars - 1) + '…' : valStr;

      currentPageCommands.push(
        `BT /F1 7 Tf 0.1 0.15 0.2 rg ${colX.toFixed(1)} ${(y - 8).toFixed(1)} Td ${pdfStr(toWinAnsi(safeVal))} Tj ET\n`
      );
    });

    y -= rowHeight;
  });

  // Finish current page
  if (currentPageCommands.length > 0) {
    pages.push(currentPageCommands);
  }

  // Append Running Footers on every page
  const totalPages = pages.length;
  pages.forEach((pageCmds, pIdx) => {
    const pageNumText = `Page ${pIdx + 1} of ${totalPages}`;
    const confidentialityNotice = 'Confidential — 21 CFR Part 11 Electronic Record — For Quality & Regulatory Audit Use Only';
    pageCmds.push(
      `0.85 0.88 0.92 RG 0.5 w ${ML} 32 ${W - MR} 32 l S\n`,
      `BT /F1 6.5 Tf 0.45 0.5 0.55 rg ${ML} 22 Td ${pdfStr(toWinAnsi(confidentialityNotice))} Tj ET\n`,
      `BT /F2 6.5 Tf 0.3 0.35 0.4 rg ${W - MR - 60} 22 Td ${pdfStr(toWinAnsi(pageNumText))} Tj ET\n`
    );
  });

  // Assemble PDF Objects
  const streams = pages.map((pageCmds) => Buffer.from(pageCmds.join(''), 'latin1'));

  const objs = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objs.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objs.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  objs.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  objs.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));

  streams.forEach((st, i) => {
    objs.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`));
    objs.push(Buffer.concat([
      Buffer.from(`<< /Length ${st.length} >>\nstream\n`),
      st,
      Buffer.from('\nendstream')
    ]));
  });

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(offset);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    chunks.push(b);
    offset += b.length;
  });

  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  chunks.push(Buffer.from(xref));

  return Buffer.concat(chunks);
}

module.exports = {
  generateReportPdf,
};
