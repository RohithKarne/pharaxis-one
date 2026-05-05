const crypto = require('crypto')
const express = require('express')
const nodemailer = require('nodemailer')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')
const storageService = require('../services/storageService')
const watermarkService = require('../services/watermarkService')

const router = express.Router()

function requireEditor(req, res, next) {
  if (!['admin', 'author'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/author can manage controlled shares' })
  }
  next()
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function isPdfMime(mimeType, fileName) {
  if (String(mimeType || '').toLowerCase().includes('pdf')) return true
  return String(fileName || '').toLowerCase().endsWith('.pdf')
}

function createPasscode() {
  return String(crypto.randomInt(100000, 1000000))
}

function passcodeMatches(share, value) {
  if (!share.passcode_hash) return true
  if (!value) return false
  return hashToken(String(value).trim()) === share.passcode_hash
}

function publicShareUrl(req, token) {
  const origin = `${req.protocol}://${req.get('host')}`
  return `${origin}/external/vault-share/${token}`
}

async function getPublicShare(token) {
  const [[share]] = await pool.execute(
    `SELECT es.id, es.org_id, es.content_id, es.recipient_name, es.recipient_email, es.purpose,
            es.passcode_hash, es.status, es.expires_at, vc.doc_number, vc.title, vc.lifecycle_state,
            vv.id AS version_id, vv.version_number, vv.file_name, vv.file_path, vv.s3_key, vv.mime_type
       FROM external_share_links es
       JOIN vault_content vc
         ON vc.id = es.content_id
        AND vc.org_id = es.org_id
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       WHERE es.token_hash = ?`,
    [hashToken(token || '')]
  )
  return share
}

function validatePublicShare(share, passcode) {
  if (!share) return { status: 404, error: 'Share link not found' }
  if (share.status !== 'active' || new Date(share.expires_at).getTime() < Date.now()) {
    return { status: 410, error: 'Share link is expired or revoked' }
  }
  if (!passcodeMatches(share, passcode)) {
    return { status: 403, error: 'Passcode required or invalid' }
  }
  return null
}

async function deliverShareEmail({ to, shareUrl, passcode, docNumber, title }) {
  if (!to) return { status: 'skipped', error: 'No recipient email' }
  if (!process.env.SMTP_HOST && !process.env.SMTP_USER) {
    return { status: 'skipped', error: 'SMTP not configured' }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined
    })
    await transporter.sendMail({
      from: process.env.EXTERNAL_SHARE_FROM || process.env.SMTP_USER || 'vault-share@pharaxis.local',
      to,
      subject: `[Pharaxis Vault] Controlled document share ${docNumber}`,
      text: [
        `A controlled document was shared with you: ${docNumber} - ${title}`,
        `Open: ${shareUrl}`,
        passcode ? `Passcode: ${passcode}` : 'Passcode: not required',
        '',
        'This link is tracked and expires automatically.'
      ].join('\n')
    })
    return { status: 'sent', error: null }
  } catch (error) {
    return { status: 'failed', error: error.message }
  }
}

router.get('/public/:token', async (req, res) => {
  try {
    const share = await getPublicShare(req.params.token)
    if (!share) return res.status(404).json({ error: 'Share link not found' })
    if (share.status !== 'active' || new Date(share.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Share link is expired or revoked' })
    }

    await pool.execute(
      `UPDATE external_share_links
       SET opened_count = opened_count + 1,
           last_opened_at = NOW()
       WHERE id = ?`,
      [share.id]
    )

    await auditService.log(
      share.org_id,
      null,
      'org_user',
      'external_share_opened',
      'external_share_link',
      share.id,
      req.ip,
      null,
      { content_id: share.content_id, recipient_email: share.recipient_email },
      'External share link opened'
    )

    res.json({
      doc_number: share.doc_number,
      title: share.title,
      lifecycle_state: share.lifecycle_state,
      version_number: share.version_number,
      file_name: share.file_name,
      mime_type: share.mime_type,
      purpose: share.purpose,
      expires_at: share.expires_at,
      passcode_required: Boolean(share.passcode_hash),
      download_available: true
    })
  } catch (error) {
    console.error('Public external share error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/public/:token/download', async (req, res) => {
  try {
    const share = await getPublicShare(req.params.token)
    const validation = validatePublicShare(share, req.body?.passcode)
    if (validation) return res.status(validation.status).json({ error: validation.error })
    if (!share.version_id) return res.status(404).json({ error: 'No current document version available' })

    await pool.execute(
      `UPDATE external_share_links
       SET download_count = download_count + 1,
           last_downloaded_at = NOW()
       WHERE id = ?`,
      [share.id]
    )

    await auditService.log(
      share.org_id,
      null,
      'org_user',
      'external_share_downloaded',
      'external_share_link',
      share.id,
      req.ip,
      null,
      { content_id: share.content_id, recipient_email: share.recipient_email },
      'External share file downloaded'
    )

    const fileName = share.file_name || `${share.doc_number}.bin`
    if (isPdfMime(share.mime_type, fileName)) {
      const originalBuffer = await storageService.getObjectBuffer(share)
      const stampedBuffer = await watermarkService.applyWatermark(originalBuffer, share.lifecycle_state)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
      return res.send(stampedBuffer)
    }

    const descriptor = await storageService.getDownloadDescriptor(share)
    if (descriptor.source === 'local') {
      const localPath = storageService.resolveLocalPath(share)
      res.setHeader('Content-Type', share.mime_type || 'application/octet-stream')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      return res.sendFile(localPath)
    }
    res.json({
      source: descriptor.source,
      url: descriptor.url,
      file_name: fileName,
      mime_type: share.mime_type,
      expires_in_seconds: descriptor.expires_in_seconds
    })
  } catch (error) {
    console.error('Download external share error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/content/:contentId', authenticate, async (req, res) => {
  const contentId = Number(req.params.contentId)
  if (!Number.isInteger(contentId) || contentId <= 0) return res.status(400).json({ error: 'Invalid content id' })

  try {
    const [rows] = await pool.execute(
      `SELECT es.id, es.content_id, es.recipient_name, es.recipient_email, es.purpose, es.status,
              es.expires_at, es.opened_count, es.download_count, es.last_opened_at, es.last_downloaded_at,
              es.email_delivery_status, es.email_delivery_error, es.last_email_sent_at,
              es.passcode_hash IS NOT NULL AS passcode_required,
              es.created_at, creator.name AS created_by_name
       FROM external_share_links es
       LEFT JOIN users creator
         ON creator.id = es.created_by
        AND creator.org_id = es.org_id
       WHERE es.org_id = ? AND es.content_id = ?
       ORDER BY es.created_at DESC, es.id DESC`,
      [req.user.orgId, contentId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List external shares error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/content/:contentId', authenticate, requireEditor, async (req, res) => {
  const contentId = Number(req.params.contentId)
  const expiresInDays = Math.min(90, Math.max(1, Number(req.body.expires_in_days || 7)))
  const recipientName = req.body.recipient_name ? String(req.body.recipient_name).trim().slice(0, 150) : null
  const recipientEmail = req.body.recipient_email ? String(req.body.recipient_email).trim().slice(0, 150) : null
  const purpose = req.body.purpose ? String(req.body.purpose).trim().slice(0, 300) : null
  const requirePasscode = Boolean(req.body.require_passcode)
  if (!Number.isInteger(contentId) || contentId <= 0) return res.status(400).json({ error: 'Invalid content id' })
  if (!recipientEmail) return res.status(400).json({ error: 'recipient_email is required' })

  try {
    const [[content]] = await pool.execute(
      'SELECT id, doc_number, title FROM vault_content WHERE id = ? AND org_id = ?',
      [contentId, req.user.orgId]
    )
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const token = crypto.randomBytes(24).toString('hex')
    const passcode = requirePasscode ? createPasscode() : null
    const shareUrl = publicShareUrl(req, token)
    const delivery = await deliverShareEmail({
      to: recipientEmail,
      shareUrl,
      passcode,
      docNumber: content.doc_number,
      title: content.title
    })
    const [result] = await pool.execute(
      `INSERT INTO external_share_links
       (org_id, content_id, token_hash, recipient_name, recipient_email, purpose, passcode_hash,
        email_delivery_status, email_delivery_error, last_email_sent_at, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)`,
      [
        req.user.orgId,
        contentId,
        hashToken(token),
        recipientName,
        recipientEmail,
        purpose,
        passcode ? hashToken(passcode) : null,
        delivery.status,
        delivery.error,
        delivery.status === 'sent' ? new Date() : null,
        expiresInDays,
        req.user.userId
      ]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'external_share_created',
      'external_share_link',
      result.insertId,
      req.ip,
      null,
      { content_id: contentId, recipient_email: recipientEmail, expires_in_days: expiresInDays, passcode_required: requirePasscode, email_delivery_status: delivery.status },
      'Controlled external share created'
    )

    res.status(201).json({
      id: result.insertId,
      share_url: shareUrl,
      passcode,
      expires_in_days: expiresInDays,
      email_delivery_status: delivery.status,
      email_delivery_error: delivery.error
    })
  } catch (error) {
    console.error('Create external share error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/revoke', authenticate, requireEditor, async (req, res) => {
  const shareId = Number(req.params.id)
  if (!Number.isInteger(shareId) || shareId <= 0) return res.status(400).json({ error: 'Invalid share id' })

  try {
    const [result] = await pool.execute(
      `UPDATE external_share_links
       SET status = 'revoked'
       WHERE id = ? AND org_id = ?`,
      [shareId, req.user.orgId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Share not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'external_share_revoked',
      'external_share_link',
      shareId,
      req.ip,
      null,
      { status: 'revoked' },
      'Controlled external share revoked'
    )
    res.json({ message: 'Share revoked' })
  } catch (error) {
    console.error('Revoke external share error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
