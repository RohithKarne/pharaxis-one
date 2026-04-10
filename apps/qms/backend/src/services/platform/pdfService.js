import { createWriteStream } from 'fs';
import PDFDocument from 'pdfkit';

export async function createSimplePdf(filePath, sections) {
  const doc = new PDFDocument({ margin: 48 });
  const stream = createWriteStream(filePath);

  const done = new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  doc.pipe(stream);
  doc.fontSize(22).text('Pharaxis QMS Inspection Binder');
  doc.moveDown();
  doc.fontSize(12).text(`Generated: ${new Date().toISOString()}`);
  doc.moveDown();

  for (const section of sections) {
    doc.fontSize(15).text(section.title, { underline: true });
    doc.moveDown(0.5);
    for (const line of section.lines) {
      doc.fontSize(11).text(`- ${line}`);
    }
    doc.moveDown();
  }

  doc.end();
  await done;
}

