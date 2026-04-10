const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib')

const WATERMARK_BY_STATE = {
  draft: 'DRAFT - Not for Distribution',
  in_review: 'UNDER REVIEW - Not for Distribution',
  approved: 'APPROVED',
  published: '',
  archived: 'ARCHIVED - Superseded'
}

async function applyWatermark(pdfBuffer, lifecycleState) {
  const text = WATERMARK_BY_STATE[lifecycleState] || ''
  if (!text) return pdfBuffer

  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pages = pdfDoc.getPages()
  for (const page of pages) {
    const { width, height } = page.getSize()
    const fontSize = Math.max(20, Math.floor(Math.min(width, height) * 0.08))
    const textWidth = font.widthOfTextAtSize(text, fontSize)

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: rgb(0.85, 0.15, 0.15),
      opacity: 0.22,
      rotate: degrees(45)
    })
  }

  return Buffer.from(await pdfDoc.save())
}

module.exports = {
  applyWatermark,
  WATERMARK_BY_STATE
}
