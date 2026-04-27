const fs = require('fs')
const path = require('path')
const express = require('express')
const { query, withTransaction } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const { authorizeRoles } = require('../middleware/authorize')
const { asyncHandler } = require('../utils/asyncHandler')
const { resolveTenantIdForRequest, assertTenantScope } = require('../utils/tenant')
const { ROLES, PUBLICATION_TYPES, PUBLICATION_STATUSES } = require('../utils/constants')
const { runDeadlineAlertScan } = require('../services/milestoneNotifierService')

const router = express.Router()

const managerRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER]
const writerRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER, ROLES.MEDICAL_WRITER]
const adminOrManagerRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER]

function csvEscape(value) {
  const raw = value == null ? '' : String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

function toCsv(rows = []) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key])).join(','))
  }
  return lines.join('\n')
}

function parseCsvText(text = '') {
  const rows = []
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return rows
  const headers = lines[0].split(',').map((h) => h.trim())

  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map((cell) => cell.trim())
    const row = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] || ''
    })
    rows.push(row)
  }

  return rows
}

async function getPublicationById(publicationId) {
  const rows = await query(
    `
      SELECT
        id,
        tenant_id AS tenantId,
        title,
        publication_type AS publicationType,
        status
      FROM pub_publications
      WHERE id = ?
      LIMIT 1
    `,
    [publicationId]
  )
  return rows[0] || null
}

async function writeAudit({ tenantId, actorUserId, actionType, entityType, entityId, metadata }) {
  await query(
    `
      INSERT INTO pub_audit_log
      (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [tenantId, actorUserId || null, actionType, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata || {})]
  )
}

router.get(
  '/gantt',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)

    const rows = await query(
      `
        SELECT
          p.id AS publicationId,
          p.title,
          p.status,
          p.publication_type AS publicationType,
          DATE(p.created_at) AS plannedStartDate,
          COALESCE(MAX(m.due_date), DATE_ADD(DATE(p.created_at), INTERVAL 45 DAY)) AS targetDate
        FROM pub_publications p
        LEFT JOIN pub_milestones m ON m.publication_id = p.id
        WHERE p.tenant_id = ?
          AND p.status <> 'published'
        GROUP BY p.id, p.title, p.status, p.publication_type, DATE(p.created_at)
        ORDER BY targetDate ASC
      `,
      [tenantId]
    )

    res.json({ tenantId, items: rows })
  })
)

router.get(
  '/publications/:id/documents/compare',
  requireAuth,
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const leftVersionId = Number(req.query.leftVersionId)
    const rightVersionId = Number(req.query.rightVersionId)

    if (!Number.isFinite(publicationId) || !Number.isFinite(leftVersionId) || !Number.isFinite(rightVersionId)) {
      return res.status(400).json({ error: 'publicationId and both version ids are required' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    const versions = await query(
      `
        SELECT
          dv.id,
          dv.version_no AS versionNo,
          dv.file_name AS fileName,
          dv.mime_type AS mimeType,
          dv.file_size AS fileSize,
          dv.storage_path AS storagePath
        FROM pub_document_versions dv
        JOIN pub_documents d ON d.id = dv.document_id
        WHERE d.publication_id = ?
          AND dv.id IN (?, ?)
      `,
      [publicationId, leftVersionId, rightVersionId]
    )

    if (versions.length !== 2) {
      return res.status(404).json({ error: 'One or both document versions not found for this publication' })
    }

    const normalized = versions.map((version) => {
      const absolutePath = path.join(__dirname, '..', version.storagePath)
      let previewText = 'Binary preview not available for this file type.'
      const isLikelyText = String(version.fileName || '').toLowerCase().endsWith('.txt')

      if (isLikelyText && fs.existsSync(absolutePath)) {
        previewText = fs.readFileSync(absolutePath, 'utf8').slice(0, 4000)
      }

      return {
        ...version,
        downloadUrl: `/api/publications/documents/version/${version.id}/download`,
        previewText
      }
    })

    await writeAudit({
      tenantId: publication.tenantId,
      actorUserId: req.user.id,
      actionType: 'document.compare_viewed',
      entityType: 'publication',
      entityId: publicationId,
      metadata: { leftVersionId, rightVersionId }
    })

    res.json({
      publicationId,
      left: normalized.find((item) => Number(item.id) === leftVersionId) || null,
      right: normalized.find((item) => Number(item.id) === rightVersionId) || null,
      note: 'DOCX/PDF are shown side-by-side with metadata/download links. Inline binary diff is deferred.'
    })
  })
)

router.get(
  '/publications/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    const comments = await query(
      `
        SELECT
          c.id,
          c.parent_comment_id AS parentCommentId,
          c.document_version_id AS documentVersionId,
          c.page_number AS pageNumber,
          c.comment_text AS commentText,
          c.status,
          c.created_by AS createdBy,
          u.full_name AS createdByName,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt
        FROM pub_document_comments c
        LEFT JOIN pub_users u ON u.id = c.created_by
        WHERE c.publication_id = ?
        ORDER BY c.created_at ASC
      `,
      [publicationId]
    )

    res.json({ comments })
  })
)

router.post(
  '/publications/:id/comments',
  requireAuth,
  authorizeRoles(writerRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const documentVersionId = Number(req.body?.documentVersionId)
    const parentCommentId = req.body?.parentCommentId ? Number(req.body.parentCommentId) : null
    const pageNumber = Number(req.body?.pageNumber || 1)
    const commentText = String(req.body?.commentText || '').trim()

    if (!Number.isFinite(documentVersionId) || !commentText) {
      return res.status(400).json({ error: 'documentVersionId and commentText are required' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    const validVersion = await query(
      `
        SELECT dv.id
        FROM pub_document_versions dv
        JOIN pub_documents d ON d.id = dv.document_id
        WHERE dv.id = ? AND d.publication_id = ?
        LIMIT 1
      `,
      [documentVersionId, publicationId]
    )
    if (!validVersion[0]) {
      return res.status(404).json({ error: 'Document version not found for publication' })
    }

    const created = await query(
      `
        INSERT INTO pub_document_comments
        (tenant_id, publication_id, document_version_id, parent_comment_id, page_number, comment_text, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
      `,
      [publication.tenantId, publicationId, documentVersionId, parentCommentId, pageNumber, commentText, req.user.id]
    )

    await writeAudit({
      tenantId: publication.tenantId,
      actorUserId: req.user.id,
      actionType: parentCommentId ? 'document.comment_replied' : 'document.comment_added',
      entityType: 'publication',
      entityId: publicationId,
      metadata: { commentId: created.insertId, documentVersionId, parentCommentId, pageNumber }
    })

    res.status(201).json({ commentId: created.insertId })
  })
)

router.patch(
  '/comments/:commentId',
  requireAuth,
  authorizeRoles(writerRoles),
  asyncHandler(async (req, res) => {
    const commentId = Number(req.params.commentId)
    const status = String(req.body?.status || '').trim().toLowerCase()
    if (!Number.isFinite(commentId) || !['open', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Valid commentId and status(open/resolved) are required' })
    }

    const rows = await query(
      `SELECT id, tenant_id AS tenantId, publication_id AS publicationId FROM pub_document_comments WHERE id = ? LIMIT 1`,
      [commentId]
    )
    const comment = rows[0]
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    assertTenantScope(req, comment.tenantId)

    await query(
      `UPDATE pub_document_comments SET status = ? WHERE id = ?`,
      [status, commentId]
    )

    await writeAudit({
      tenantId: comment.tenantId,
      actorUserId: req.user.id,
      actionType: status === 'resolved' ? 'document.comment_resolved' : 'document.comment_reopened',
      entityType: 'publication',
      entityId: comment.publicationId,
      metadata: { commentId, status }
    })

    res.json({ commentId, status })
  })
)

router.get(
  '/templates',
  requireAuth,
  authorizeRoles(adminOrManagerRoles),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)
    const templates = await query(
      `
        SELECT
          id,
          template_name AS templateName,
          publication_type AS publicationType,
          default_target_venue AS defaultTargetVenue,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pub_publication_templates
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
      `,
      [tenantId]
    )
    res.json({ templates })
  })
)

router.post(
  '/templates',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)
    const templateName = String(req.body?.templateName || '').trim()
    const publicationType = String(req.body?.publicationType || '').trim().toLowerCase()
    const defaultTargetVenue = String(req.body?.defaultTargetVenue || '').trim() || null
    const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones : []
    const checklistItems = Array.isArray(req.body?.checklistItems) ? req.body.checklistItems : []
    const reviewerUserIds = Array.isArray(req.body?.reviewerUserIds) ? req.body.reviewerUserIds : []

    if (!templateName || !PUBLICATION_TYPES.includes(publicationType)) {
      return res.status(400).json({ error: 'templateName and valid publicationType are required' })
    }

    const createdTemplate = await withTransaction(async (tx) => {
      const insert = await tx.query(
        `
          INSERT INTO pub_publication_templates
          (tenant_id, template_name, publication_type, default_target_venue, created_by)
          VALUES (?, ?, ?, ?, ?)
        `,
        [tenantId, templateName, publicationType, defaultTargetVenue, req.user.id]
      )

      for (const milestone of milestones) {
        const milestoneName = String(milestone?.milestoneName || '').trim()
        const dueOffsetDays = Number(milestone?.dueOffsetDays || 0)
        if (!milestoneName || !Number.isFinite(dueOffsetDays)) continue
        await tx.query(
          `
            INSERT INTO pub_template_milestones (template_id, milestone_name, due_offset_days)
            VALUES (?, ?, ?)
          `,
          [insert.insertId, milestoneName, dueOffsetDays]
        )
      }

      for (const item of checklistItems) {
        const itemKey = String(item?.itemKey || '').trim()
        const itemText = String(item?.itemText || '').trim()
        if (!itemKey || !itemText) continue
        await tx.query(
          `
            INSERT INTO pub_template_checklist_items (template_id, item_key, item_text, is_required)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE item_text = VALUES(item_text), is_required = VALUES(is_required)
          `,
          [insert.insertId, itemKey, itemText, item?.isRequired ? 1 : 0]
        )
      }

      for (const reviewerUserId of reviewerUserIds) {
        const reviewerId = Number(reviewerUserId)
        if (!Number.isFinite(reviewerId)) continue
        await tx.query(
          `
            INSERT INTO pub_template_reviewers (template_id, reviewer_user_id)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE reviewer_user_id = VALUES(reviewer_user_id)
          `,
          [insert.insertId, reviewerId]
        )
      }

      return insert.insertId
    })

    await writeAudit({
      tenantId,
      actorUserId: req.user.id,
      actionType: 'template.created',
      entityType: 'template',
      entityId: createdTemplate,
      metadata: { templateName, publicationType }
    })

    res.status(201).json({ templateId: createdTemplate })
  })
)

router.post(
  '/publications/:id/templates/:templateId/apply',
  requireAuth,
  authorizeRoles(managerRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const templateId = Number(req.params.templateId)
    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    const templateRows = await query(
      `
        SELECT
          id,
          tenant_id AS tenantId,
          template_name AS templateName,
          publication_type AS publicationType,
          default_target_venue AS defaultTargetVenue
        FROM pub_publication_templates
        WHERE id = ?
        LIMIT 1
      `,
      [templateId]
    )
    const template = templateRows[0]
    if (!template) return res.status(404).json({ error: 'Template not found' })
    if (Number(template.tenantId) !== Number(publication.tenantId)) {
      return res.status(403).json({ error: 'Template is not in the same tenant' })
    }

    const [templateMilestones, templateChecklist, templateReviewers] = await Promise.all([
      query(
        `
          SELECT milestone_name AS milestoneName, due_offset_days AS dueOffsetDays
          FROM pub_template_milestones
          WHERE template_id = ?
          ORDER BY id ASC
        `,
        [templateId]
      ),
      query(
        `
          SELECT item_key AS itemKey, item_text AS itemText, is_required AS isRequired
          FROM pub_template_checklist_items
          WHERE template_id = ?
          ORDER BY id ASC
        `,
        [templateId]
      ),
      query(
        `
          SELECT reviewer_user_id AS reviewerUserId
          FROM pub_template_reviewers
          WHERE template_id = ?
          ORDER BY id ASC
        `,
        [templateId]
      )
    ])

    await withTransaction(async (tx) => {
      if (template.defaultTargetVenue) {
        await tx.query(
          `
            UPDATE pub_publications
            SET target_venue = COALESCE(target_venue, ?), updated_by = ?
            WHERE id = ?
          `,
          [template.defaultTargetVenue, req.user.id, publicationId]
        )
      }

      for (const milestone of templateMilestones) {
        await tx.query(
          `
            INSERT INTO pub_milestones
            (tenant_id, publication_id, milestone_name, due_date, owner_user_id, status)
            VALUES (?, ?, ?, DATE_ADD(CURRENT_DATE(), INTERVAL ? DAY), NULL, 'pending')
          `,
          [publication.tenantId, publicationId, milestone.milestoneName, Number(milestone.dueOffsetDays || 0)]
        )
      }

      for (const item of templateChecklist) {
        await tx.query(
          `
            INSERT INTO pub_gpp_checklist_items
            (tenant_id, publication_id, item_key, item_text, is_required, is_checked)
            VALUES (?, ?, ?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE item_text = VALUES(item_text), is_required = VALUES(is_required)
          `,
          [publication.tenantId, publicationId, item.itemKey, item.itemText, item.isRequired ? 1 : 0]
        )
      }

      for (const reviewer of templateReviewers) {
        await tx.query(
          `
            INSERT INTO pub_reviews
            (tenant_id, publication_id, reviewer_user_id, review_status)
            VALUES (?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE review_status = 'pending', comments = NULL, reviewed_at = NULL
          `,
          [publication.tenantId, publicationId, reviewer.reviewerUserId]
        )
      }
    })

    await writeAudit({
      tenantId: publication.tenantId,
      actorUserId: req.user.id,
      actionType: 'template.applied',
      entityType: 'publication',
      entityId: publicationId,
      metadata: { templateId, templateName: template.templateName }
    })

    res.json({
      publicationId,
      templateId,
      milestonesApplied: templateMilestones.length,
      checklistItemsApplied: templateChecklist.length,
      reviewersApplied: templateReviewers.length
    })
  })
)

router.get(
  '/conferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)
    const conferences = await query(
      `
        SELECT
          c.id,
          c.conference_name AS conferenceName,
          c.therapeutic_area AS therapeuticArea,
          c.abstract_deadline AS abstractDeadline,
          c.start_date AS startDate,
          c.end_date AS endDate,
          COUNT(pc.id) AS linkedPublicationCount
        FROM pub_conferences c
        LEFT JOIN pub_publication_conferences pc ON pc.conference_id = c.id
        WHERE c.tenant_id = ?
        GROUP BY c.id, c.conference_name, c.therapeutic_area, c.abstract_deadline, c.start_date, c.end_date
        ORDER BY c.start_date ASC
      `,
      [tenantId]
    )
    res.json({ conferences })
  })
)

router.post(
  '/conferences',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)
    const conferenceName = String(req.body?.conferenceName || '').trim()
    const therapeuticArea = String(req.body?.therapeuticArea || '').trim() || null
    const abstractDeadline = String(req.body?.abstractDeadline || '').trim() || null
    const startDate = String(req.body?.startDate || '').trim()
    const endDate = String(req.body?.endDate || '').trim()

    if (!conferenceName || !startDate || !endDate) {
      return res.status(400).json({ error: 'conferenceName, startDate, and endDate are required' })
    }

    const created = await query(
      `
        INSERT INTO pub_conferences
        (tenant_id, conference_name, therapeutic_area, abstract_deadline, start_date, end_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [tenantId, conferenceName, therapeuticArea, abstractDeadline, startDate, endDate, req.user.id]
    )

    await writeAudit({
      tenantId,
      actorUserId: req.user.id,
      actionType: 'conference.created',
      entityType: 'conference',
      entityId: created.insertId,
      metadata: { conferenceName, abstractDeadline, startDate, endDate }
    })

    res.status(201).json({ conferenceId: created.insertId })
  })
)

router.post(
  '/publications/:id/conferences/:conferenceId/link',
  requireAuth,
  authorizeRoles(managerRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const conferenceId = Number(req.params.conferenceId)
    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    const conferenceRows = await query(
      `SELECT id, tenant_id AS tenantId FROM pub_conferences WHERE id = ? LIMIT 1`,
      [conferenceId]
    )
    const conference = conferenceRows[0]
    if (!conference) return res.status(404).json({ error: 'Conference not found' })
    if (Number(conference.tenantId) !== Number(publication.tenantId)) {
      return res.status(403).json({ error: 'Conference is not in the same tenant' })
    }

    await query(
      `
        INSERT INTO pub_publication_conferences
        (tenant_id, publication_id, conference_id, linked_by)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE linked_by = VALUES(linked_by), linked_at = CURRENT_TIMESTAMP(6)
      `,
      [publication.tenantId, publicationId, conferenceId, req.user.id]
    )

    await writeAudit({
      tenantId: publication.tenantId,
      actorUserId: req.user.id,
      actionType: 'publication.conference_linked',
      entityType: 'publication',
      entityId: publicationId,
      metadata: { conferenceId }
    })

    res.json({ publicationId, conferenceId })
  })
)

router.get(
  '/mims/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const queryText = String(req.query.q || '').trim()
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)
    if (!queryText) return res.json({ source: 'empty', results: [] })

    const baseUrl = String(process.env.MIMS_API_BASE_URL || '').trim()
    if (baseUrl) {
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), 5000)
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/drugs/search?q=${encodeURIComponent(queryText)}`, {
          signal: abortController.signal
        })
        clearTimeout(timeout)
        if (!response.ok) {
          throw new Error(`MIMS search failed with ${response.status}`)
        }
        const data = await response.json()
        return res.json({ source: 'mims_api', results: data.results || [] })
      } catch (_error) {
        clearTimeout(timeout)
      }
    }

    const rows = await query(
      `
        SELECT DISTINCT drug_name AS drugName
        FROM pub_publications
        WHERE tenant_id = ?
          AND drug_name IS NOT NULL
          AND drug_name LIKE ?
        ORDER BY drug_name ASC
        LIMIT 20
      `,
      [tenantId, `%${queryText}%`]
    )

    const results = rows.map((row, index) => ({
      id: `fallback_${index + 1}`,
      name: row.drugName
    }))

    res.json({ source: 'fallback_local', results })
  })
)

router.post(
  '/publications/:id/mims-link',
  requireAuth,
  authorizeRoles(writerRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const mimsDrugId = String(req.body?.mimsDrugId || '').trim() || null
    const mimsDrugName = String(req.body?.mimsDrugName || '').trim() || null
    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    await query(
      `
        INSERT INTO pub_publication_integrations
        (tenant_id, publication_id, mims_drug_id, mims_drug_name)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          mims_drug_id = VALUES(mims_drug_id),
          mims_drug_name = VALUES(mims_drug_name)
      `,
      [publication.tenantId, publicationId, mimsDrugId, mimsDrugName]
    )

    await query(
      `UPDATE pub_publications SET drug_name = COALESCE(?, drug_name), updated_by = ? WHERE id = ?`,
      [mimsDrugName, req.user.id, publicationId]
    )

    await writeAudit({
      tenantId: publication.tenantId,
      actorUserId: req.user.id,
      actionType: 'publication.mims_linked',
      entityType: 'publication',
      entityId: publicationId,
      metadata: { mimsDrugId, mimsDrugName }
    })

    res.json({ publicationId, mimsDrugId, mimsDrugName })
  })
)

router.patch(
  '/publications/:id/safety',
  requireAuth,
  authorizeRoles(writerRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const safetyRelated = Boolean(req.body?.safetyRelated)
    const safetyCaseReference = String(req.body?.safetyCaseReference || '').trim() || null
    const publication = await getPublicationById(publicationId)
    if (!publication) return res.status(404).json({ error: 'Publication not found' })
    assertTenantScope(req, publication.tenantId)

    await query(
      `
        INSERT INTO pub_publication_integrations
        (tenant_id, publication_id, safety_related, safety_case_reference)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          safety_related = VALUES(safety_related),
          safety_case_reference = VALUES(safety_case_reference)
      `,
      [publication.tenantId, publicationId, safetyRelated ? 1 : 0, safetyCaseReference]
    )

    await writeAudit({
      tenantId: publication.tenantId,
      actorUserId: req.user.id,
      actionType: 'publication.safety_updated',
      entityType: 'publication',
      entityId: publicationId,
      metadata: { safetyRelated, safetyCaseReference }
    })

    if (safetyRelated && publication.status === 'journal_submission') {
      await query(
        `
          INSERT INTO pub_safety_event_queue
          (tenant_id, publication_id, payload_json, status, attempts, next_attempt_at)
          VALUES (?, ?, ?, 'queued', 0, CURRENT_TIMESTAMP(6))
        `,
        [
          publication.tenantId,
          publicationId,
          JSON.stringify({
            publicationId,
            publicationTitle: publication.title,
            status: publication.status,
            safetyCaseReference
          })
        ]
      )
    }

    res.json({ publicationId, safetyRelated, safetyCaseReference })
  })
)

async function runSafetyQueueOnce() {
  const webhookUrl = String(process.env.SAFETY_WEBHOOK_URL || '').trim()
  const rows = await query(
    `
      SELECT id, tenant_id AS tenantId, publication_id AS publicationId, payload_json AS payloadJson, attempts
      FROM pub_safety_event_queue
      WHERE status IN ('queued', 'retry')
        AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP(6))
      ORDER BY id ASC
      LIMIT 100
    `
  )

  let sent = 0
  let retried = 0
  let failed = 0

  for (const item of rows) {
    if (!webhookUrl) {
      await query(
        `
          UPDATE pub_safety_event_queue
          SET status = 'retry', attempts = attempts + 1, last_error = 'SAFETY_WEBHOOK_URL not configured', next_attempt_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 15 MINUTE)
          WHERE id = ?
        `,
        [item.id]
      )
      retried += 1
      continue
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payloadJson || {})
      })

      if (!response.ok) {
        throw new Error(`Safety webhook returned ${response.status}`)
      }

      await query(
        `UPDATE pub_safety_event_queue SET status = 'sent', attempts = attempts + 1, next_attempt_at = NULL, last_error = NULL WHERE id = ?`,
        [item.id]
      )
      await query(
        `
          UPDATE pub_publication_integrations
          SET safety_event_status = 'sent', safety_event_last_sent_at = CURRENT_TIMESTAMP(6)
          WHERE publication_id = ?
        `,
        [item.publicationId]
      )
      sent += 1
    } catch (error) {
      const attempts = Number(item.attempts || 0) + 1
      const nextStatus = attempts >= 5 ? 'failed' : 'retry'
      await query(
        `
          UPDATE pub_safety_event_queue
          SET status = ?, attempts = attempts + 1, last_error = ?, next_attempt_at = CASE WHEN ? = 'retry' THEN DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 15 MINUTE) ELSE NULL END
          WHERE id = ?
        `,
        [nextStatus, String(error.message || error), nextStatus, item.id]
      )
      if (nextStatus === 'failed') failed += 1
      else retried += 1
    }
  }

  return { queued: rows.length, sent, retried, failed }
}

router.post(
  '/safety/queue/run',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (_req, res) => {
    const result = await runSafetyQueueOnce()
    res.json({ result })
  })
)

router.post(
  '/automation/run',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (_req, res) => {
    const [deadlineAlerts, overdueScan, safetyQueue] = await Promise.all([
      runDeadlineAlertScan(),
      require('../services/milestoneNotifierService').runOverdueMilestoneScan(),
      runSafetyQueueOnce()
    ])
    res.json({ deadlineAlerts, overdueScan, safetyQueue })
  })
)

router.get(
  '/reports/portfolio',
  requireAuth,
  authorizeRoles(adminOrManagerRoles),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)
    const startDate = String(req.query.startDate || '').trim() || '2000-01-01'
    const endDate = String(req.query.endDate || '').trim() || '2100-12-31'
    const format = String(req.query.format || 'json').trim().toLowerCase()

    const byStatus = await query(
      `
        SELECT status, COUNT(*) AS count
        FROM pub_publications
        WHERE tenant_id = ?
          AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY status
        ORDER BY status ASC
      `,
      [tenantId, startDate, endDate]
    )

    const byType = await query(
      `
        SELECT publication_type AS publicationType, COUNT(*) AS count
        FROM pub_publications
        WHERE tenant_id = ?
          AND DATE(created_at) BETWEEN ? AND ?
        GROUP BY publication_type
        ORDER BY publication_type ASC
      `,
      [tenantId, startDate, endDate]
    )

    const gppRows = await query(
      `
        SELECT
          p.publication_type AS publicationType,
          ROUND(
            SUM(CASE WHEN g.is_checked = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(g.id), 0) * 100,
            2
          ) AS gppCompletionRate
        FROM pub_publications p
        JOIN pub_gpp_checklist_items g ON g.publication_id = p.id
        WHERE p.tenant_id = ?
          AND DATE(p.created_at) BETWEEN ? AND ?
        GROUP BY p.publication_type
      `,
      [tenantId, startDate, endDate]
    )

    const milestoneHitRate = await query(
      `
        SELECT
          ROUND(
            SUM(CASE WHEN status = 'completed' AND DATE(completed_at) <= due_date THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) * 100,
            2
          ) AS onTimePercent
        FROM pub_milestones
        WHERE tenant_id = ?
          AND due_date BETWEEN ? AND ?
      `,
      [tenantId, startDate, endDate]
    )

    const payload = {
      tenantId,
      startDate,
      endDate,
      byStatus,
      byType,
      gppByType: gppRows,
      milestoneHitRate: Number(milestoneHitRate[0]?.onTimePercent || 0)
    }

    if (format === 'csv') {
      const flatRows = [
        ...byStatus.map((item) => ({ section: 'status', key: item.status, value: item.count })),
        ...byType.map((item) => ({ section: 'type', key: item.publicationType, value: item.count })),
        ...gppRows.map((item) => ({ section: 'gpp', key: item.publicationType, value: item.gppCompletionRate })),
        { section: 'milestone', key: 'on_time_percent', value: payload.milestoneHitRate }
      ]

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="portfolio-report.csv"')
      return res.send(toCsv(flatRows))
    }

    return res.json(payload)
  })
)

router.get(
  '/reports/workload',
  requireAuth,
  authorizeRoles(adminOrManagerRoles),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)
    const format = String(req.query.format || 'json').trim().toLowerCase()

    const rows = await query(
      `
        SELECT
          u.id AS userId,
          u.full_name AS fullName,
          u.email,
          u.role,
          COUNT(DISTINCT CASE WHEN p.status <> 'published' THEN p.id END) AS activePublicationsOwned,
          COUNT(DISTINCT CASE WHEN r.review_status = 'approved' THEN r.id END) AS reviewsApproved,
          ROUND(AVG(CASE WHEN r.reviewed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, r.created_at, r.reviewed_at) END), 2) AS avgReviewTurnaroundHours
        FROM pub_users u
        LEFT JOIN pub_publications p ON p.tenant_id = u.tenant_id AND p.created_by = u.id
        LEFT JOIN pub_reviews r ON r.tenant_id = u.tenant_id AND r.reviewer_user_id = u.id
        WHERE u.tenant_id = ?
          AND u.is_active = 1
        GROUP BY u.id, u.full_name, u.email, u.role
        ORDER BY activePublicationsOwned DESC, reviewsApproved DESC, u.full_name ASC
      `,
      [tenantId]
    )

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', 'attachment; filename="workload-report.csv"')
      return res.send(toCsv(rows))
    }

    return res.json({ tenantId, rows })
  })
)

router.post(
  '/bulk/status',
  requireAuth,
  authorizeRoles(managerRoles),
  asyncHandler(async (req, res) => {
    const publicationIds = Array.isArray(req.body?.publicationIds) ? req.body.publicationIds.map((id) => Number(id)).filter(Number.isFinite) : []
    const status = String(req.body?.status || '').trim().toLowerCase()

    if (!publicationIds.length || !PUBLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'publicationIds and valid status are required' })
    }

    const publications = await query(
      `
        SELECT id, tenant_id AS tenantId, status AS currentStatus
        FROM pub_publications
        WHERE id IN (${publicationIds.map(() => '?').join(',')})
      `,
      publicationIds
    )
    if (!publications.length) {
      return res.status(404).json({ error: 'No publications found' })
    }

    for (const publication of publications) {
      assertTenantScope(req, publication.tenantId)
    }

    await withTransaction(async (tx) => {
      for (const publication of publications) {
        await tx.query(
          `UPDATE pub_publications SET status = ?, updated_by = ? WHERE id = ?`,
          [status, req.user.id, publication.id]
        )

        await tx.query(
          `
            INSERT INTO pub_publication_status_history
            (tenant_id, publication_id, from_status, to_status, changed_by, note)
            VALUES (?, ?, ?, ?, ?, 'Bulk status update')
          `,
          [publication.tenantId, publication.id, publication.currentStatus, status, req.user.id]
        )

        await tx.query(
          `
            INSERT INTO pub_audit_log
            (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
            VALUES (?, ?, 'publication.bulk_status_updated', 'publication', ?, ?)
          `,
          [publication.tenantId, req.user.id, String(publication.id), JSON.stringify({ fromStatus: publication.currentStatus, toStatus: status })]
        )
      }
    })

    res.json({ updatedCount: publications.length })
  })
)

router.post(
  '/bulk/reviewer-assign',
  requireAuth,
  authorizeRoles(managerRoles),
  asyncHandler(async (req, res) => {
    const publicationIds = Array.isArray(req.body?.publicationIds) ? req.body.publicationIds.map((id) => Number(id)).filter(Number.isFinite) : []
    const reviewerUserId = Number(req.body?.reviewerUserId)
    if (!publicationIds.length || !Number.isFinite(reviewerUserId)) {
      return res.status(400).json({ error: 'publicationIds and reviewerUserId are required' })
    }

    const publications = await query(
      `
        SELECT id, tenant_id AS tenantId
        FROM pub_publications
        WHERE id IN (${publicationIds.map(() => '?').join(',')})
      `,
      publicationIds
    )
    if (!publications.length) return res.status(404).json({ error: 'No publications found' })
    for (const publication of publications) {
      assertTenantScope(req, publication.tenantId)
    }

    await withTransaction(async (tx) => {
      for (const publication of publications) {
        await tx.query(
          `
            INSERT INTO pub_reviews
            (tenant_id, publication_id, reviewer_user_id, review_status)
            VALUES (?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE review_status = 'pending', comments = NULL, reviewed_at = NULL
          `,
          [publication.tenantId, publication.id, reviewerUserId]
        )

        await tx.query(
          `
            INSERT INTO pub_audit_log
            (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
            VALUES (?, ?, 'publication.bulk_reviewer_assigned', 'publication', ?, ?)
          `,
          [publication.tenantId, req.user.id, String(publication.id), JSON.stringify({ reviewerUserId })]
        )
      }
    })

    res.json({ updatedCount: publications.length, reviewerUserId })
  })
)

router.post(
  '/import/csv',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)
    const csvText = String(req.body?.csvText || '')
    const dryRun = req.body?.dryRun !== false
    const rows = parseCsvText(csvText)

    if (!rows.length) {
      return res.status(400).json({ error: 'No CSV rows found' })
    }

    const errors = []
    const validRows = []
    const seenTitles = new Set()

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      const title = String(row.title || '').trim()
      const publicationType = String(row.publicationType || '').trim().toLowerCase()
      if (!title) {
        errors.push({ row: i + 2, error: 'title is required' })
        continue
      }
      if (!PUBLICATION_TYPES.includes(publicationType)) {
        errors.push({ row: i + 2, error: `publicationType must be one of: ${PUBLICATION_TYPES.join(', ')}` })
        continue
      }
      const dedupeKey = title.toLowerCase()
      if (seenTitles.has(dedupeKey)) {
        errors.push({ row: i + 2, error: 'duplicate title in import file' })
        continue
      }
      seenTitles.add(dedupeKey)

      validRows.push({
        title,
        publicationType,
        drugName: String(row.drugName || '').trim() || null,
        therapeuticArea: String(row.therapeuticArea || '').trim() || null,
        targetVenue: String(row.targetVenue || '').trim() || null
      })
    }

    if (dryRun || errors.length) {
      return res.json({
        dryRun: true,
        totalRows: rows.length,
        validRows: validRows.length,
        errors,
        preview: validRows.slice(0, 20)
      })
    }

    const insertedIds = await withTransaction(async (tx) => {
      const ids = []
      for (const row of validRows) {
        const insert = await tx.query(
          `
            INSERT INTO pub_publications
            (tenant_id, title, publication_type, status, drug_name, therapeutic_area, target_venue, created_by, updated_by)
            VALUES (?, ?, ?, 'concept', ?, ?, ?, ?, ?)
          `,
          [tenantId, row.title, row.publicationType, row.drugName, row.therapeuticArea, row.targetVenue, req.user.id, req.user.id]
        )
        ids.push(insert.insertId)

        await tx.query(
          `
            INSERT INTO pub_publication_status_history
            (tenant_id, publication_id, from_status, to_status, changed_by, note)
            VALUES (?, ?, NULL, 'concept', ?, 'Imported from CSV')
          `,
          [tenantId, insert.insertId, req.user.id]
        )

        await tx.query(
          `
            INSERT INTO pub_audit_log
            (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
            VALUES (?, ?, 'publication.imported_csv', 'publication', ?, ?)
          `,
          [tenantId, req.user.id, String(insert.insertId), JSON.stringify({ title: row.title, publicationType: row.publicationType })]
        )
      }
      return ids
    })

    res.json({
      dryRun: false,
      importedCount: insertedIds.length,
      publicationIds: insertedIds
    })
  })
)

module.exports = router
