const express = require('express')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const storageService = require('../services/storageService')

const router = express.Router()

function normalizeText(buffer) {
  return buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function isTextVersion(version) {
  const mime = String(version.mime_type || '').toLowerCase()
  const fileName = String(version.file_name || '').toLowerCase()
  return mime.startsWith('text/') || /\.(txt|md|csv|json|xml|html|css|js|jsx|ts|tsx)$/i.test(fileName)
}

function execFileText(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
      if (error) return reject(error)
      resolve(stdout)
    })
  })
}

async function extractComparableText(version, buffer) {
  if (isTextVersion(version)) return normalizeText(buffer)

  const fileName = String(version.file_name || '').toLowerCase()
  const mime = String(version.mime_type || '').toLowerCase()
  const isPdf = mime.includes('pdf') || fileName.endsWith('.pdf')
  const isDocx = mime.includes('wordprocessingml') || fileName.endsWith('.docx')

  if (isPdf) {
    try {
      const tempPath = path.join(os.tmpdir(), `vault-compare-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`)
      await fs.promises.writeFile(tempPath, buffer)
      try {
        return normalizeText(Buffer.from(await execFileText('pdftotext', ['-layout', tempPath, '-'])))
      } finally {
        fs.promises.unlink(tempPath).catch(() => {})
      }
    } catch {
      return null
    }
  }

  if (isDocx && process.platform === 'darwin') {
    try {
      const tempPath = path.join(os.tmpdir(), `vault-compare-${Date.now()}-${Math.random().toString(16).slice(2)}.docx`)
      await fs.promises.writeFile(tempPath, buffer)
      try {
        return normalizeText(Buffer.from(await execFileText('textutil', ['-convert', 'txt', '-stdout', tempPath])))
      } finally {
        fs.promises.unlink(tempPath).catch(() => {})
      }
    } catch {
      return null
    }
  }

  return null
}

function lineDiff(leftText, rightText) {
  const leftLines = leftText.split('\n')
  const rightLines = rightText.split('\n')
  const max = Math.max(leftLines.length, rightLines.length)
  const changes = []
  for (let index = 0; index < max; index += 1) {
    const left = leftLines[index] ?? ''
    const right = rightLines[index] ?? ''
    if (left !== right) {
      changes.push({
        line: index + 1,
        left,
        right
      })
    }
    if (changes.length >= 200) break
  }
  return changes
}

router.get('/content/:contentId', authenticate, async (req, res) => {
  const contentId = Number(req.params.contentId)
  const leftVersionId = Number(req.query.left_version_id)
  const rightVersionId = Number(req.query.right_version_id)
  if (!Number.isInteger(contentId) || contentId <= 0) return res.status(400).json({ error: 'Invalid content id' })
  if (!Number.isInteger(leftVersionId) || leftVersionId <= 0 || !Number.isInteger(rightVersionId) || rightVersionId <= 0) {
    return res.status(400).json({ error: 'left_version_id and right_version_id are required' })
  }

  try {
    const [versions] = await pool.execute(
      `SELECT id, org_id, content_id, version_number, file_name, file_path, s3_key, file_size_kb, mime_type, uploaded_at
       FROM vault_versions
       WHERE org_id = ?
         AND content_id = ?
         AND id IN (?, ?)`,
      [req.user.orgId, contentId, leftVersionId, rightVersionId]
    )
    if (versions.length !== 2 && leftVersionId !== rightVersionId) {
      return res.status(404).json({ error: 'One or both versions not found' })
    }

    const left = versions.find(version => Number(version.id) === leftVersionId) || versions[0]
    const right = versions.find(version => Number(version.id) === rightVersionId) || versions[0]
    const metadataDiff = [
      ['version_number', left.version_number, right.version_number],
      ['file_name', left.file_name, right.file_name],
      ['file_size_kb', left.file_size_kb, right.file_size_kb],
      ['mime_type', left.mime_type, right.mime_type]
    ].map(([field, leftValue, rightValue]) => ({ field, left: leftValue, right: rightValue, changed: leftValue !== rightValue }))

    let textDiff = []
    let mode = 'metadata'
    const [leftBuffer, rightBuffer] = await Promise.all([
      storageService.getObjectBuffer(left),
      storageService.getObjectBuffer(right)
    ])
    const [leftText, rightText] = await Promise.all([
      extractComparableText(left, leftBuffer),
      extractComparableText(right, rightBuffer)
    ])
    if (leftText !== null && rightText !== null) {
      textDiff = lineDiff(leftText, rightText)
      mode = 'text'
    }

    res.json({
      mode,
      left,
      right,
      metadata_diff: metadataDiff,
      text_diff: textDiff,
      text_diff_truncated: textDiff.length >= 200
    })
  } catch (error) {
    console.error('Compare versions error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
