const fs = require('fs')
const path = require('path')
const express = require('express')
const multer = require('multer')
const { query, withTransaction } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const { authorizeRoles } = require('../middleware/authorize')
const { asyncHandler } = require('../utils/asyncHandler')
const { resolveTenantIdForRequest, assertTenantScope } = require('../utils/tenant')
const { sendUserNotification, sendEmailDirect } = require('../services/notificationService')
const {
  ROLES,
  PUBLICATION_STATUSES,
  NEXT_STATUS,
  PUBLICATION_TYPES,
  DEFAULT_GPP_ITEMS,
  DEFAULT_REQUIRED_GPP_ITEM_KEYS,
  DISCLOSURE_SIGNOFF_STATUSES,
  SUBMISSION_TYPES,
  JOURNAL_PEER_REVIEW_STATUSES,
  CONGRESS_DECISIONS,
  NOTIFICATION_EVENTS
} = require('../utils/constants')

const router = express.Router()

const publicationCreateRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER, ROLES.MEDICAL_WRITER]
const publicationUpdateRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER]
const publicationAuthorRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER, ROLES.MEDICAL_WRITER]
const reviewerAssignableRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER]
const disclosureManageRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER, ROLES.MEDICAL_WRITER]
const submissionManageRoles = [ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER, ROLES.MEDICAL_WRITER]
const gppItemKeyPattern = /^gpp_\d{1,3}$/

const storageRoot = path.join(__dirname, '..', 'storage', 'documents')
const maxUploadSize = Number(process.env.PUBLICATIONS_MAX_UPLOAD_BYTES || 50 * 1024 * 1024)

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const publicationId = Number(req.params.id)
      const tenantId = Number(req.publication?.tenantId || req.user?.tenantId || 0)
      const destination = path.join(storageRoot, `tenant_${tenantId}`, `publication_${publicationId}`)
      try {
        fs.mkdirSync(destination, { recursive: true })
        cb(null, destination)
      } catch (error) {
        cb(error)
      }
    },
    filename: (_req, file, cb) => {
      const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
      cb(null, `${Date.now()}-${safeOriginal}`)
    }
  }),
  limits: { fileSize: maxUploadSize },
  fileFilter: (_req, file, cb) => {
    const lowerName = String(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    const allowed =
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.docx') ||
      mime.includes('pdf') ||
      mime.includes('wordprocessingml')

    if (!allowed) {
      return cb(new Error('Only PDF and DOCX files are allowed'))
    }

    return cb(null, true)
  }
})

async function writeAuditWithClient(client, { tenantId, actorUserId, actionType, entityType, entityId, metadata }) {
  await client.query(
    `
      INSERT INTO pub_audit_log
      (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [tenantId, actorUserId, actionType, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata || {})]
  )
}

async function getPublicationById(id) {
  const rows = await query(
    `
      SELECT
        p.id,
        p.tenant_id AS tenantId,
        p.title,
        p.publication_type AS publicationType,
        p.status,
        p.drug_name AS drugName,
        p.therapeutic_area AS therapeuticArea,
        p.target_venue AS targetVenue,
        p.created_by AS createdBy,
        p.updated_by AS updatedBy,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        t.name AS tenantName
      FROM pub_publications p
      JOIN pub_tenants t ON t.id = p.tenant_id
      WHERE p.id = ?
      LIMIT 1
    `,
    [id]
  )
  return rows[0] || null
}

async function listPublicationRecipients(publicationId) {
  const rows = await query(
    `
      SELECT DISTINCT u.id
      FROM pub_users u
      WHERE u.id IN (
        SELECT p.created_by FROM pub_publications p WHERE p.id = ?
        UNION
        SELECT p.updated_by FROM pub_publications p WHERE p.id = ?
        UNION
        SELECT r.reviewer_user_id FROM pub_reviews r WHERE r.publication_id = ?
      )
        AND u.id IS NOT NULL
        AND u.is_active = 1
    `,
    [publicationId, publicationId, publicationId]
  )

  return rows.map((row) => Number(row.id)).filter(Number.isFinite)
}

async function notifyPublicationUsers({ tenantId, publicationId, eventKey, title, body, excludeUserIds = [] }) {
  const recipients = await listPublicationRecipients(publicationId)
  for (const recipientId of recipients) {
    if (excludeUserIds.includes(recipientId)) continue
    await sendUserNotification({
      tenantId,
      recipientUserId: recipientId,
      eventKey,
      title,
      body,
      context: { publicationId }
    })
  }
}

function buildFallbackGppDefaults() {
  return DEFAULT_GPP_ITEMS.map((itemText, index) => {
    const itemKey = `gpp_${index + 1}`
    return {
      itemKey,
      itemText,
      isRequired: DEFAULT_REQUIRED_GPP_ITEM_KEYS.includes(itemKey)
    }
  })
}

async function getTenantGppDefaults(tx, tenantId) {
  const rows = await tx.query(
    `
      SELECT item_key AS itemKey, item_text AS itemText, is_required AS isRequired
      FROM pub_tenant_gpp_defaults
      WHERE tenant_id = ?
      ORDER BY CAST(SUBSTRING_INDEX(item_key, '_', -1) AS UNSIGNED) ASC
    `,
    [tenantId]
  )

  if (!rows.length) {
    return buildFallbackGppDefaults()
  }

  return rows.map((row) => ({
    itemKey: row.itemKey,
    itemText: row.itemText,
    isRequired: Boolean(Number(row.isRequired))
  }))
}

async function getTransitionBlocksForJournalSubmission(tx, publicationId) {
  const [missingRequiredGppItems, pendingDisclosures] = await Promise.all([
    tx.query(
      `
        SELECT item_key AS itemKey, item_text AS itemText
        FROM pub_gpp_checklist_items
        WHERE publication_id = ?
          AND is_required = 1
          AND is_checked = 0
        ORDER BY CAST(SUBSTRING_INDEX(item_key, '_', -1) AS UNSIGNED) ASC
      `,
      [publicationId]
    ),
    tx.query(
      `
        SELECT
          a.id AS authorId,
          a.full_name AS authorName,
          COALESCE(
            ad.signoff_status,
            CASE WHEN a.disclosure_status = 'complete' THEN 'signed' ELSE 'pending' END
          ) AS signoffStatus
        FROM pub_publication_authors pa
        JOIN pub_authors a ON a.id = pa.author_id
        LEFT JOIN pub_author_disclosures ad
          ON ad.publication_id = pa.publication_id
          AND ad.author_id = pa.author_id
        WHERE pa.publication_id = ?
          AND COALESCE(
            ad.signoff_status,
            CASE WHEN a.disclosure_status = 'complete' THEN 'signed' ELSE 'pending' END
          ) NOT IN ('signed', 'waived')
        ORDER BY pa.author_order ASC
      `,
      [publicationId]
    )
  ])

  return { missingRequiredGppItems, pendingDisclosures }
}

async function transitionPublication(tx, publication, actorUserId, toStatus, note) {
  await tx.query(
    `UPDATE pub_publications SET status = ?, updated_by = ? WHERE id = ?`,
    [toStatus, actorUserId, publication.id]
  )

  await tx.query(
    `
      INSERT INTO pub_publication_status_history
      (tenant_id, publication_id, from_status, to_status, changed_by, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [publication.tenantId, publication.id, publication.status, toStatus, actorUserId, note || null]
  )

  await writeAuditWithClient(tx, {
    tenantId: publication.tenantId,
    actorUserId,
    actionType: 'publication.status_changed',
    entityType: 'publication',
    entityId: publication.id,
    metadata: { fromStatus: publication.status, toStatus, note: note || null }
  })

  if (toStatus === 'journal_submission') {
    const integrationRows = await tx.query(
      `
        SELECT safety_related AS safetyRelated, safety_case_reference AS safetyCaseReference
        FROM pub_publication_integrations
        WHERE publication_id = ?
        LIMIT 1
      `,
      [publication.id]
    )

    const integration = integrationRows[0]
    if (integration && Number(integration.safetyRelated) === 1) {
      await tx.query(
        `
          INSERT INTO pub_safety_event_queue
          (tenant_id, publication_id, payload_json, status, attempts, next_attempt_at)
          VALUES (?, ?, ?, 'queued', 0, CURRENT_TIMESTAMP(6))
        `,
        [
          publication.tenantId,
          publication.id,
          JSON.stringify({
            publicationId: publication.id,
            publicationTitle: publication.title,
            status: toStatus,
            safetyCaseReference: integration.safetyCaseReference || null
          })
        ]
      )
    }
  }
}

function requirePublicationUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) {
      const wrapped = new Error(error.message || 'Upload failed')
      wrapped.statusCode = 400
      return next(wrapped)
    }
    return next()
  })
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const clauses = []
    const params = []

    if (!req.user.isSuperadmin) {
      clauses.push('p.tenant_id = ?')
      params.push(req.user.tenantId)
    } else if (req.query.tenantId) {
      clauses.push('p.tenant_id = ?')
      params.push(Number(req.query.tenantId))
    }

    const status = String(req.query.status || '').trim()
    if (status) {
      clauses.push('p.status = ?')
      params.push(status)
    }

    const publicationType = String(req.query.publicationType || '').trim()
    if (publicationType) {
      clauses.push('p.publication_type = ?')
      params.push(publicationType)
    }

    const therapeuticArea = String(req.query.therapeuticArea || '').trim()
    if (therapeuticArea) {
      clauses.push('p.therapeutic_area = ?')
      params.push(therapeuticArea)
    }

    const search = String(req.query.search || '').trim()
    if (search) {
      clauses.push('(p.title LIKE ? OR p.drug_name LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

    const rows = await query(
      `
        SELECT
          p.id,
          p.tenant_id AS tenantId,
          p.title,
          p.publication_type AS publicationType,
          p.status,
          p.drug_name AS drugName,
          p.therapeutic_area AS therapeuticArea,
          p.target_venue AS targetVenue,
          p.updated_at AS updatedAt,
          t.name AS tenantName
        FROM pub_publications p
        JOIN pub_tenants t ON t.id = p.tenant_id
        ${whereSql}
        ORDER BY p.updated_at DESC
        LIMIT 200
      `,
      params
    )

    res.json({ publications: rows })
  })
)

router.post(
  '/',
  requireAuth,
  authorizeRoles(publicationCreateRoles),
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || '').trim()
    const publicationType = String(req.body?.publicationType || '').trim().toLowerCase()
    const drugName = String(req.body?.drugName || '').trim() || null
    const therapeuticArea = String(req.body?.therapeuticArea || '').trim() || null
    const targetVenue = String(req.body?.targetVenue || '').trim() || null
    const templateId = req.body?.templateId ? Number(req.body.templateId) : null

    if (!title || !publicationType) {
      return res.status(400).json({ error: 'title and publicationType are required' })
    }

    if (!PUBLICATION_TYPES.includes(publicationType)) {
      return res.status(400).json({ error: `publicationType must be one of: ${PUBLICATION_TYPES.join(', ')}` })
    }

    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)

    const publicationId = await withTransaction(async (tx) => {
      const insert = await tx.query(
        `
          INSERT INTO pub_publications
          (tenant_id, title, publication_type, status, drug_name, therapeutic_area, target_venue, created_by, updated_by)
          VALUES (?, ?, ?, 'concept', ?, ?, ?, ?, ?)
        `,
        [tenantId, title, publicationType, drugName, therapeuticArea, targetVenue, req.user.id, req.user.id]
      )

      const newId = insert.insertId

      await tx.query(
        `
          INSERT INTO pub_publication_status_history
          (tenant_id, publication_id, from_status, to_status, changed_by, note)
          VALUES (?, ?, NULL, 'concept', ?, 'Publication created')
        `,
        [tenantId, newId, req.user.id]
      )

      const gppDefaults = await getTenantGppDefaults(tx, tenantId)
      for (let i = 0; i < gppDefaults.length; i += 1) {
        const item = gppDefaults[i]
        await tx.query(
          `
            INSERT INTO pub_gpp_checklist_items
            (tenant_id, publication_id, item_key, item_text, is_required, is_checked)
            VALUES (?, ?, ?, ?, ?, 0)
          `,
          [tenantId, newId, item.itemKey, item.itemText, item.isRequired ? 1 : 0]
        )
      }

      if (Number.isFinite(templateId) && templateId > 0) {
        const templateRows = await tx.query(
          `
            SELECT id, tenant_id AS tenantId
            FROM pub_publication_templates
            WHERE id = ?
            LIMIT 1
          `,
          [templateId]
        )
        const template = templateRows[0]
        if (!template || Number(template.tenantId) !== Number(tenantId)) {
          const error = new Error('Invalid templateId for this tenant')
          error.statusCode = 400
          throw error
        }

        const [templateMilestones, templateChecklist, templateReviewers] = await Promise.all([
          tx.query(
            `
              SELECT milestone_name AS milestoneName, due_offset_days AS dueOffsetDays
              FROM pub_template_milestones
              WHERE template_id = ?
            `,
            [templateId]
          ),
          tx.query(
            `
              SELECT item_key AS itemKey, item_text AS itemText, is_required AS isRequired
              FROM pub_template_checklist_items
              WHERE template_id = ?
            `,
            [templateId]
          ),
          tx.query(
            `
              SELECT reviewer_user_id AS reviewerUserId
              FROM pub_template_reviewers
              WHERE template_id = ?
            `,
            [templateId]
          )
        ])

        for (const milestone of templateMilestones) {
          await tx.query(
            `
              INSERT INTO pub_milestones
              (tenant_id, publication_id, milestone_name, due_date, owner_user_id, status)
              VALUES (?, ?, ?, DATE_ADD(CURRENT_DATE(), INTERVAL ? DAY), NULL, 'pending')
            `,
            [tenantId, newId, milestone.milestoneName, Number(milestone.dueOffsetDays || 0)]
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
            [tenantId, newId, item.itemKey, item.itemText, item.isRequired ? 1 : 0]
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
            [tenantId, newId, reviewer.reviewerUserId]
          )
        }
      }

      await writeAuditWithClient(tx, {
        tenantId,
        actorUserId: req.user.id,
        actionType: 'publication.created',
        entityType: 'publication',
        entityId: newId,
        metadata: { title, publicationType, status: 'concept' }
      })

      return newId
    })

    const publication = await getPublicationById(publicationId)
    res.status(201).json({ publication })
  })
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    if (!Number.isFinite(publicationId)) {
      return res.status(400).json({ error: 'Invalid publication id' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }

    assertTenantScope(req, publication.tenantId)

    const [authors, milestones, checklist, statusHistory, reviews, documentVersions, submissionHistory] = await Promise.all([
      query(
        `
          SELECT
            pa.author_order AS authorOrder,
            pa.icmje_categories AS icmjeCategories,
            pa.is_corresponding AS isCorresponding,
            a.id,
            a.full_name AS fullName,
            a.email,
            a.affiliation,
            a.disclosure_status AS disclosureStatus,
            ad.signoff_status AS signoffStatus,
            ad.financial_interests AS financialInterests,
            ad.company_relationships AS companyRelationships,
            ad.coi_declaration AS coiDeclaration,
            ad.request_note AS requestNote,
            ad.requested_at AS requestedAt,
            ad.signed_at AS signedAt,
            ad.waived_at AS waivedAt
          FROM pub_publication_authors pa
          JOIN pub_authors a ON a.id = pa.author_id
          LEFT JOIN pub_author_disclosures ad
            ON ad.publication_id = pa.publication_id
            AND ad.author_id = pa.author_id
          WHERE pa.publication_id = ?
          ORDER BY pa.author_order ASC
        `,
        [publicationId]
      ),
      query(
        `
          SELECT
            id,
            milestone_name AS milestoneName,
            due_date AS dueDate,
            status,
            owner_user_id AS ownerUserId,
            completed_at AS completedAt,
            (due_date < CURRENT_DATE() AND status <> 'completed') AS isOverdue
          FROM pub_milestones
          WHERE publication_id = ?
          ORDER BY due_date ASC
        `,
        [publicationId]
      ),
      query(
        `
          SELECT
            item_key AS itemKey,
            item_text AS itemText,
            is_required AS isRequired,
            is_checked AS isChecked,
            checked_by AS checkedBy,
            checked_at AS checkedAt
          FROM pub_gpp_checklist_items
          WHERE publication_id = ?
          ORDER BY CAST(SUBSTRING_INDEX(item_key, '_', -1) AS UNSIGNED) ASC
        `,
        [publicationId]
      ),
      query(
        `
          SELECT
            from_status AS fromStatus,
            to_status AS toStatus,
            changed_by AS changedBy,
            note,
            changed_at AS changedAt
          FROM pub_publication_status_history
          WHERE publication_id = ?
          ORDER BY changed_at DESC
        `,
        [publicationId]
      ),
      query(
        `
          SELECT
            r.id,
            r.reviewer_user_id AS reviewerUserId,
            u.full_name AS reviewerName,
            r.review_status AS reviewStatus,
            r.comments,
            r.reviewed_at AS reviewedAt,
            r.created_at AS createdAt
          FROM pub_reviews r
          JOIN pub_users u ON u.id = r.reviewer_user_id
          WHERE r.publication_id = ?
          ORDER BY r.created_at ASC
        `,
        [publicationId]
      ),
      query(
        `
          SELECT
            dv.id,
            dv.document_id AS documentId,
            dv.version_no AS versionNo,
            dv.file_name AS fileName,
            dv.mime_type AS mimeType,
            dv.file_size AS fileSize,
            dv.storage_path AS storagePath,
            dv.uploaded_by AS uploadedBy,
            dv.uploaded_at AS uploadedAt
          FROM pub_document_versions dv
          JOIN pub_documents d ON d.id = dv.document_id
          WHERE d.publication_id = ?
          ORDER BY dv.version_no DESC
        `,
        [publicationId]
      ),
      query(
        `
          SELECT
            id,
            submission_type AS submissionType,
            attempt_no AS attemptNo,
            venue_name AS venueName,
            reference_id AS referenceId,
            submission_date AS submissionDate,
            peer_review_status AS peerReviewStatus,
            revision_round AS revisionRound,
            congress_decision AS congressDecision,
            notes,
            created_by AS createdBy,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM pub_submission_records
          WHERE publication_id = ?
          ORDER BY submission_date DESC, id DESC
        `,
        [publicationId]
      )
    ])

    const checkedCount = checklist.filter((item) => Number(item.isChecked) === 1).length
    const checklistCompletion = checklist.length ? Math.round((checkedCount / checklist.length) * 100) : 0

    res.json({
      publication,
      authors,
      milestones,
      gppChecklist: checklist,
      checklistCompletion,
      statusHistory,
      reviews,
      documentVersions,
      submissionHistory
    })
  })
)

router.patch(
  '/:id/status',
  requireAuth,
  authorizeRoles(publicationUpdateRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const newStatus = String(req.body?.status || '').trim().toLowerCase()
    const note = String(req.body?.note || '').trim() || null

    if (!PUBLICATION_STATUSES.includes(newStatus)) {
      return res.status(400).json({ error: `status must be one of: ${PUBLICATION_STATUSES.join(', ')}` })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }

    assertTenantScope(req, publication.tenantId)

    const expectedNext = NEXT_STATUS[publication.status]
    if (!req.user.isSuperadmin && newStatus !== expectedNext) {
      return res.status(400).json({
        error: `Only forward transition is allowed. Current status is ${publication.status}; next allowed is ${expectedNext || 'none'}`
      })
    }

    if (newStatus === 'journal_submission') {
      const transitionBlocks = await getTransitionBlocksForJournalSubmission({ query }, publicationId)
      if (transitionBlocks.missingRequiredGppItems.length || transitionBlocks.pendingDisclosures.length) {
        return res.status(400).json({
          error: 'Cannot move to journal_submission until required GPP items and author disclosures are complete',
          missingRequiredGppItems: transitionBlocks.missingRequiredGppItems,
          pendingDisclosures: transitionBlocks.pendingDisclosures
        })
      }
    }

    await withTransaction(async (tx) => {
      await transitionPublication(tx, publication, req.user.id, newStatus, note)
    })

    await notifyPublicationUsers({
      tenantId: publication.tenantId,
      publicationId: publication.id,
      eventKey: NOTIFICATION_EVENTS.STATUS_CHANGED,
      title: `Publication status changed: ${publication.title}`,
      body: `Status moved from ${publication.status} to ${newStatus}.`,
      excludeUserIds: [req.user.id]
    })

    const updated = await getPublicationById(publicationId)
    res.json({ publication: updated })
  })
)

router.post(
  '/:id/authors',
  requireAuth,
  authorizeRoles(publicationAuthorRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const fullName = String(req.body?.fullName || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase() || null
    const affiliation = String(req.body?.affiliation || '').trim() || null
    const disclosureStatus = String(req.body?.disclosureStatus || 'incomplete').trim().toLowerCase()
    const authorOrderInput = Number(req.body?.authorOrder)
    const isCorresponding = Boolean(req.body?.isCorresponding)
    const icmjeCategories = Array.isArray(req.body?.icmjeCategories)
      ? req.body.icmjeCategories.map((item) => String(item).trim()).filter(Boolean)
      : []

    if (!fullName) {
      return res.status(400).json({ error: 'fullName is required' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }

    assertTenantScope(req, publication.tenantId)

    const result = await withTransaction(async (tx) => {
      let authorId = null

      if (email) {
        const existingAuthors = await tx.query(
          `SELECT id FROM pub_authors WHERE tenant_id = ? AND email = ? LIMIT 1`,
          [publication.tenantId, email]
        )

        if (existingAuthors[0]) {
          authorId = existingAuthors[0].id
          await tx.query(
            `
              UPDATE pub_authors
              SET full_name = ?, affiliation = ?, disclosure_status = ?
              WHERE id = ?
            `,
            [fullName, affiliation, disclosureStatus, authorId]
          )
        }
      }

      if (!authorId) {
        const createdAuthor = await tx.query(
          `
            INSERT INTO pub_authors (tenant_id, full_name, email, affiliation, disclosure_status)
            VALUES (?, ?, ?, ?, ?)
          `,
          [publication.tenantId, fullName, email, affiliation, disclosureStatus]
        )
        authorId = createdAuthor.insertId
      }

      let authorOrder = authorOrderInput
      if (!Number.isFinite(authorOrder) || authorOrder <= 0) {
        const maxRows = await tx.query(
          `SELECT COALESCE(MAX(author_order), 0) AS maxOrder FROM pub_publication_authors WHERE publication_id = ?`,
          [publicationId]
        )
        authorOrder = Number(maxRows[0]?.maxOrder || 0) + 1
      }

      await tx.query(
        `
          INSERT INTO pub_publication_authors
          (tenant_id, publication_id, author_id, author_order, icmje_categories, is_corresponding)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [publication.tenantId, publicationId, authorId, authorOrder, JSON.stringify(icmjeCategories), isCorresponding ? 1 : 0]
      )

      const initialSignoffStatus = disclosureStatus === 'complete' ? 'signed' : 'pending'
      await tx.query(
        `
          INSERT INTO pub_author_disclosures
          (tenant_id, publication_id, author_id, signoff_status, signed_at)
          VALUES (?, ?, ?, ?, CASE WHEN ? = 'signed' THEN CURRENT_TIMESTAMP(6) ELSE NULL END)
          ON DUPLICATE KEY UPDATE
            signoff_status = VALUES(signoff_status),
            signed_at = CASE WHEN VALUES(signoff_status) = 'signed' THEN CURRENT_TIMESTAMP(6) ELSE signed_at END,
            waived_at = CASE WHEN VALUES(signoff_status) = 'waived' THEN CURRENT_TIMESTAMP(6) ELSE waived_at END
        `,
        [publication.tenantId, publicationId, authorId, initialSignoffStatus, initialSignoffStatus]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'publication.author_added',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { authorId, fullName, email, authorOrder }
      })

      return { authorId, authorOrder }
    })

    const authors = await query(
      `
        SELECT
          pa.author_order AS authorOrder,
          pa.icmje_categories AS icmjeCategories,
          pa.is_corresponding AS isCorresponding,
          a.id,
          a.full_name AS fullName,
          a.email,
          a.affiliation,
          a.disclosure_status AS disclosureStatus,
          ad.signoff_status AS signoffStatus,
          ad.financial_interests AS financialInterests,
          ad.company_relationships AS companyRelationships,
          ad.coi_declaration AS coiDeclaration,
          ad.request_note AS requestNote,
          ad.requested_at AS requestedAt,
          ad.signed_at AS signedAt,
          ad.waived_at AS waivedAt
        FROM pub_publication_authors pa
        JOIN pub_authors a ON a.id = pa.author_id
        LEFT JOIN pub_author_disclosures ad
          ON ad.publication_id = pa.publication_id
          AND ad.author_id = pa.author_id
        WHERE pa.publication_id = ?
        ORDER BY pa.author_order ASC
      `,
      [publicationId]
    )

    res.status(201).json({
      message: 'Author linked to publication',
      linkedAuthor: result,
      authors
    })
  })
)

router.post(
  '/:id/milestones',
  requireAuth,
  authorizeRoles(publicationUpdateRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const milestoneName = String(req.body?.milestoneName || '').trim()
    const dueDate = String(req.body?.dueDate || '').trim()
    const ownerUserId = req.body?.ownerUserId ? Number(req.body.ownerUserId) : null

    if (!milestoneName || !dueDate) {
      return res.status(400).json({ error: 'milestoneName and dueDate are required' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const result = await query(
      `
        INSERT INTO pub_milestones
        (tenant_id, publication_id, milestone_name, due_date, owner_user_id, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [publication.tenantId, publicationId, milestoneName, dueDate, ownerUserId]
    )

    await query(
      `
        INSERT INTO pub_audit_log
        (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
        VALUES (?, ?, 'milestone.created', 'publication', ?, ?)
      `,
      [publication.tenantId, req.user.id, String(publicationId), JSON.stringify({ milestoneId: result.insertId, milestoneName, dueDate, ownerUserId })]
    )

    res.status(201).json({ milestoneId: result.insertId })
  })
)

router.patch(
  '/:id/milestones/:milestoneId',
  requireAuth,
  authorizeRoles(publicationUpdateRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const milestoneId = Number(req.params.milestoneId)
    const status = String(req.body?.status || '').trim().toLowerCase()

    if (!['pending', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending or completed' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const result = await query(
      `
        UPDATE pub_milestones
        SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP(6) ELSE NULL END
        WHERE id = ? AND publication_id = ?
      `,
      [status, status, milestoneId, publicationId]
    )

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Milestone not found for this publication' })
    }

    await query(
      `
        INSERT INTO pub_audit_log
        (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
        VALUES (?, ?, 'milestone.status_changed', 'publication', ?, ?)
      `,
      [publication.tenantId, req.user.id, String(publicationId), JSON.stringify({ milestoneId, status })]
    )

    res.json({ milestoneId, status })
  })
)

router.patch(
  '/:id/gpp/:itemKey',
  requireAuth,
  authorizeRoles(publicationUpdateRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const itemKey = String(req.params.itemKey || '').trim()
    const isChecked = Boolean(req.body?.isChecked)

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const result = await query(
      `
        UPDATE pub_gpp_checklist_items
        SET is_checked = ?, checked_by = ?, checked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP(6) ELSE NULL END
        WHERE publication_id = ? AND item_key = ?
      `,
      [isChecked ? 1 : 0, isChecked ? req.user.id : null, isChecked ? 1 : 0, publicationId, itemKey]
    )

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Checklist item not found' })
    }

    await query(
      `
        INSERT INTO pub_audit_log
        (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
        VALUES (?, ?, 'gpp.item_updated', 'publication', ?, ?)
      `,
      [publication.tenantId, req.user.id, String(publicationId), JSON.stringify({ itemKey, isChecked })]
    )

    const checklist = await query(
      `
        SELECT item_key AS itemKey, is_checked AS isChecked
        FROM pub_gpp_checklist_items
        WHERE publication_id = ?
      `,
      [publicationId]
    )

    const checkedCount = checklist.filter((item) => Number(item.isChecked) === 1).length
    const checklistCompletion = checklist.length ? Math.round((checkedCount / checklist.length) * 100) : 0

    res.json({ itemKey, isChecked, checklistCompletion })
  })
)

router.patch(
  '/:id/gpp/:itemKey/required',
  requireAuth,
  authorizeRoles(publicationUpdateRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const itemKey = String(req.params.itemKey || '').trim()
    const isRequired = Boolean(req.body?.isRequired)

    if (!gppItemKeyPattern.test(itemKey)) {
      return res.status(400).json({ error: 'Invalid itemKey format' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const result = await query(
      `
        UPDATE pub_gpp_checklist_items
        SET is_required = ?
        WHERE publication_id = ? AND item_key = ?
      `,
      [isRequired ? 1 : 0, publicationId, itemKey]
    )

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Checklist item not found' })
    }

    await query(
      `
        INSERT INTO pub_audit_log
        (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
        VALUES (?, ?, 'gpp.requirement_updated', 'publication', ?, ?)
      `,
      [publication.tenantId, req.user.id, String(publicationId), JSON.stringify({ itemKey, isRequired })]
    )

    res.json({ itemKey, isRequired })
  })
)

router.post(
  '/:id/disclosures/request',
  requireAuth,
  authorizeRoles(disclosureManageRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const authorId = Number(req.body?.authorId)
    const requestNote = String(req.body?.requestNote || '').trim() || null

    if (!Number.isFinite(authorId)) {
      return res.status(400).json({ error: 'authorId is required' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const authorRows = await query(
      `
        SELECT a.id, a.full_name AS fullName, a.email
        FROM pub_publication_authors pa
        JOIN pub_authors a ON a.id = pa.author_id
        WHERE pa.publication_id = ? AND pa.author_id = ?
        LIMIT 1
      `,
      [publicationId, authorId]
    )

    const author = authorRows[0]
    if (!author) {
      return res.status(404).json({ error: 'Author is not linked to this publication' })
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `
          INSERT INTO pub_author_disclosures
          (tenant_id, publication_id, author_id, signoff_status, request_note, requested_at, requested_by, signed_at, waived_at)
          VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP(6), ?, NULL, NULL)
          ON DUPLICATE KEY UPDATE
            signoff_status = 'pending',
            request_note = VALUES(request_note),
            requested_at = CURRENT_TIMESTAMP(6),
            requested_by = VALUES(requested_by),
            signed_at = NULL,
            waived_at = NULL
        `,
        [publication.tenantId, publicationId, authorId, requestNote, req.user.id]
      )

      await tx.query(
        `UPDATE pub_authors SET disclosure_status = 'incomplete' WHERE id = ?`,
        [authorId]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'disclosure.requested',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { authorId, requestNote }
      })
    })

    if (author.email) {
      const disclosureLink = `${process.env.PUBLICATIONS_APP_BASE_URL || 'http://127.0.0.1:5179'}/publication/${publicationId}`
      await sendEmailDirect({
        toEmail: author.email,
        title: `Disclosure requested: ${publication.title}`,
        body: `Disclosure sign-off has been requested for publication "${publication.title}".\n${requestNote ? `Note: ${requestNote}\n` : ''}Link: ${disclosureLink}`,
        context: { publicationId, authorId, requestNote }
      })
    }

    await notifyPublicationUsers({
      tenantId: publication.tenantId,
      publicationId,
      eventKey: NOTIFICATION_EVENTS.DISCLOSURE_REQUESTED,
      title: `Disclosure requested for ${publication.title}`,
      body: `Disclosure sign-off requested for ${author.fullName}.`,
      excludeUserIds: [req.user.id]
    })

    res.json({
      message: 'Disclosure request sent',
      author: {
        id: author.id,
        fullName: author.fullName,
        email: author.email
      }
    })
  })
)

router.patch(
  '/:id/disclosures/:authorId',
  requireAuth,
  authorizeRoles(disclosureManageRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const authorId = Number(req.params.authorId)
    const signoffStatus = String(req.body?.signoffStatus || 'pending').trim().toLowerCase()
    const financialInterests = String(req.body?.financialInterests || '').trim() || null
    const companyRelationships = String(req.body?.companyRelationships || '').trim() || null
    const coiDeclaration = String(req.body?.coiDeclaration || '').trim() || null

    if (!Number.isFinite(authorId)) {
      return res.status(400).json({ error: 'Invalid authorId' })
    }

    if (!DISCLOSURE_SIGNOFF_STATUSES.includes(signoffStatus)) {
      return res.status(400).json({
        error: `signoffStatus must be one of: ${DISCLOSURE_SIGNOFF_STATUSES.join(', ')}`
      })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const authorRows = await query(
      `
        SELECT a.id, a.full_name AS fullName
        FROM pub_publication_authors pa
        JOIN pub_authors a ON a.id = pa.author_id
        WHERE pa.publication_id = ? AND pa.author_id = ?
        LIMIT 1
      `,
      [publicationId, authorId]
    )
    const author = authorRows[0]
    if (!author) {
      return res.status(404).json({ error: 'Author is not linked to this publication' })
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `
          INSERT INTO pub_author_disclosures
          (tenant_id, publication_id, author_id, signoff_status, financial_interests, company_relationships, coi_declaration, signed_at, waived_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'signed' THEN CURRENT_TIMESTAMP(6) ELSE NULL END, CASE WHEN ? = 'waived' THEN CURRENT_TIMESTAMP(6) ELSE NULL END)
          ON DUPLICATE KEY UPDATE
            signoff_status = VALUES(signoff_status),
            financial_interests = VALUES(financial_interests),
            company_relationships = VALUES(company_relationships),
            coi_declaration = VALUES(coi_declaration),
            signed_at = CASE WHEN VALUES(signoff_status) = 'signed' THEN CURRENT_TIMESTAMP(6) ELSE NULL END,
            waived_at = CASE WHEN VALUES(signoff_status) = 'waived' THEN CURRENT_TIMESTAMP(6) ELSE NULL END
        `,
        [
          publication.tenantId,
          publicationId,
          authorId,
          signoffStatus,
          financialInterests,
          companyRelationships,
          coiDeclaration,
          signoffStatus,
          signoffStatus
        ]
      )

      await tx.query(
        `
          UPDATE pub_authors
          SET disclosure_status = ?
          WHERE id = ?
        `,
        [signoffStatus === 'signed' || signoffStatus === 'waived' ? 'complete' : 'incomplete', authorId]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'disclosure.updated',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { authorId, signoffStatus }
      })
    })

    await notifyPublicationUsers({
      tenantId: publication.tenantId,
      publicationId,
      eventKey: NOTIFICATION_EVENTS.DISCLOSURE_UPDATED,
      title: `Disclosure updated for ${publication.title}`,
      body: `${author.fullName} disclosure status is now ${signoffStatus}.`,
      excludeUserIds: [req.user.id]
    })

    const disclosureRows = await query(
      `
        SELECT
          a.id AS authorId,
          a.full_name AS authorName,
          ad.signoff_status AS signoffStatus,
          ad.financial_interests AS financialInterests,
          ad.company_relationships AS companyRelationships,
          ad.coi_declaration AS coiDeclaration,
          ad.request_note AS requestNote,
          ad.requested_at AS requestedAt,
          ad.signed_at AS signedAt,
          ad.waived_at AS waivedAt
        FROM pub_author_disclosures ad
        JOIN pub_authors a ON a.id = ad.author_id
        WHERE ad.publication_id = ?
          AND ad.author_id = ?
        LIMIT 1
      `,
      [publicationId, authorId]
    )

    res.json({ disclosure: disclosureRows[0] || null })
  })
)

router.get(
  '/:id/submissions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const submissionHistory = await query(
      `
        SELECT
          id,
          submission_type AS submissionType,
          attempt_no AS attemptNo,
          venue_name AS venueName,
          reference_id AS referenceId,
          submission_date AS submissionDate,
          peer_review_status AS peerReviewStatus,
          revision_round AS revisionRound,
          congress_decision AS congressDecision,
          notes,
          created_by AS createdBy,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pub_submission_records
        WHERE publication_id = ?
        ORDER BY submission_date DESC, id DESC
      `,
      [publicationId]
    )

    res.json({ submissionHistory })
  })
)

router.post(
  '/:id/submissions',
  requireAuth,
  authorizeRoles(submissionManageRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const submissionType = String(req.body?.submissionType || '').trim().toLowerCase()
    const venueName = String(req.body?.venueName || '').trim()
    const referenceId = String(req.body?.referenceId || '').trim() || null
    const submissionDate = String(req.body?.submissionDate || '').trim()
    const peerReviewStatus = String(req.body?.peerReviewStatus || 'under_review').trim().toLowerCase()
    const revisionRound = Number(req.body?.revisionRound || 0)
    const congressDecision = String(req.body?.congressDecision || '').trim().toLowerCase() || null
    const notes = String(req.body?.notes || '').trim() || null

    if (!SUBMISSION_TYPES.includes(submissionType)) {
      return res.status(400).json({ error: `submissionType must be one of: ${SUBMISSION_TYPES.join(', ')}` })
    }
    if (!venueName || !submissionDate) {
      return res.status(400).json({ error: 'venueName and submissionDate are required' })
    }
    if (!Number.isFinite(revisionRound) || revisionRound < 0) {
      return res.status(400).json({ error: 'revisionRound must be 0 or higher' })
    }
    if (submissionType === 'journal' && !JOURNAL_PEER_REVIEW_STATUSES.includes(peerReviewStatus)) {
      return res.status(400).json({
        error: `peerReviewStatus must be one of: ${JOURNAL_PEER_REVIEW_STATUSES.join(', ')}`
      })
    }
    if (submissionType === 'congress' && congressDecision && !CONGRESS_DECISIONS.includes(congressDecision)) {
      return res.status(400).json({
        error: `congressDecision must be one of: ${CONGRESS_DECISIONS.join(', ')}`
      })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const created = await withTransaction(async (tx) => {
      const maxAttemptRows = await tx.query(
        `
          SELECT COALESCE(MAX(attempt_no), 0) AS maxAttempt
          FROM pub_submission_records
          WHERE publication_id = ? AND submission_type = ?
        `,
        [publicationId, submissionType]
      )
      const attemptNo = Number(maxAttemptRows[0]?.maxAttempt || 0) + 1

      const insert = await tx.query(
        `
          INSERT INTO pub_submission_records
          (tenant_id, publication_id, submission_type, attempt_no, venue_name, reference_id, submission_date, peer_review_status, revision_round, congress_decision, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          publication.tenantId,
          publicationId,
          submissionType,
          attemptNo,
          venueName,
          referenceId,
          submissionDate,
          submissionType === 'journal' ? peerReviewStatus : null,
          submissionType === 'journal' ? revisionRound : 0,
          submissionType === 'congress' ? congressDecision : null,
          notes,
          req.user.id
        ]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'submission.created',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { submissionId: insert.insertId, submissionType, attemptNo, venueName, submissionDate }
      })

      return {
        id: insert.insertId,
        submissionType,
        attemptNo,
        venueName,
        referenceId,
        submissionDate,
        peerReviewStatus: submissionType === 'journal' ? peerReviewStatus : null,
        revisionRound: submissionType === 'journal' ? revisionRound : 0,
        congressDecision: submissionType === 'congress' ? congressDecision : null,
        notes
      }
    })

    await notifyPublicationUsers({
      tenantId: publication.tenantId,
      publicationId,
      eventKey: NOTIFICATION_EVENTS.SUBMISSION_UPDATED,
      title: `Submission logged: ${publication.title}`,
      body: `Attempt ${created.attemptNo} (${created.submissionType}) was logged for ${created.venueName}.`,
      excludeUserIds: [req.user.id]
    })

    res.status(201).json({ submission: created })
  })
)

router.patch(
  '/:id/submissions/:submissionId',
  requireAuth,
  authorizeRoles(submissionManageRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const submissionId = Number(req.params.submissionId)

    if (!Number.isFinite(submissionId)) {
      return res.status(400).json({ error: 'Invalid submissionId' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const rows = await query(
      `
        SELECT
          id,
          submission_type AS submissionType,
          attempt_no AS attemptNo,
          venue_name AS venueName,
          reference_id AS referenceId,
          submission_date AS submissionDate,
          peer_review_status AS peerReviewStatus,
          revision_round AS revisionRound,
          congress_decision AS congressDecision,
          notes
        FROM pub_submission_records
        WHERE id = ? AND publication_id = ?
        LIMIT 1
      `,
      [submissionId, publicationId]
    )
    const existing = rows[0]
    if (!existing) {
      return res.status(404).json({ error: 'Submission record not found' })
    }

    const nextVenueName = String(req.body?.venueName || existing.venueName || '').trim()
    const nextReferenceId = String(req.body?.referenceId ?? existing.referenceId ?? '').trim() || null
    const nextSubmissionDate = String(req.body?.submissionDate || existing.submissionDate || '').trim()
    const nextPeerReviewStatus = String(req.body?.peerReviewStatus || existing.peerReviewStatus || '').trim().toLowerCase() || null
    const nextRevisionRound = Number(req.body?.revisionRound ?? existing.revisionRound ?? 0)
    const nextCongressDecision = String(req.body?.congressDecision || existing.congressDecision || '').trim().toLowerCase() || null
    const nextNotes = String(req.body?.notes ?? existing.notes ?? '').trim() || null

    if (!nextVenueName || !nextSubmissionDate) {
      return res.status(400).json({ error: 'venueName and submissionDate are required' })
    }
    if (!Number.isFinite(nextRevisionRound) || nextRevisionRound < 0) {
      return res.status(400).json({ error: 'revisionRound must be 0 or higher' })
    }
    if (existing.submissionType === 'journal' && !JOURNAL_PEER_REVIEW_STATUSES.includes(nextPeerReviewStatus)) {
      return res.status(400).json({
        error: `peerReviewStatus must be one of: ${JOURNAL_PEER_REVIEW_STATUSES.join(', ')}`
      })
    }
    if (existing.submissionType === 'congress' && nextCongressDecision && !CONGRESS_DECISIONS.includes(nextCongressDecision)) {
      return res.status(400).json({
        error: `congressDecision must be one of: ${CONGRESS_DECISIONS.join(', ')}`
      })
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `
          UPDATE pub_submission_records
          SET
            venue_name = ?,
            reference_id = ?,
            submission_date = ?,
            peer_review_status = ?,
            revision_round = ?,
            congress_decision = ?,
            notes = ?
          WHERE id = ? AND publication_id = ?
        `,
        [
          nextVenueName,
          nextReferenceId,
          nextSubmissionDate,
          existing.submissionType === 'journal' ? nextPeerReviewStatus : null,
          existing.submissionType === 'journal' ? nextRevisionRound : 0,
          existing.submissionType === 'congress' ? nextCongressDecision : null,
          nextNotes,
          submissionId,
          publicationId
        ]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'submission.updated',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { submissionId, submissionType: existing.submissionType }
      })
    })

    await notifyPublicationUsers({
      tenantId: publication.tenantId,
      publicationId,
      eventKey: NOTIFICATION_EVENTS.SUBMISSION_UPDATED,
      title: `Submission updated: ${publication.title}`,
      body: `Submission attempt ${existing.attemptNo} (${existing.submissionType}) was updated.`,
      excludeUserIds: [req.user.id]
    })

    res.json({
      submission: {
        id: submissionId,
        submissionType: existing.submissionType,
        attemptNo: existing.attemptNo,
        venueName: nextVenueName,
        referenceId: nextReferenceId,
        submissionDate: nextSubmissionDate,
        peerReviewStatus: existing.submissionType === 'journal' ? nextPeerReviewStatus : null,
        revisionRound: existing.submissionType === 'journal' ? nextRevisionRound : 0,
        congressDecision: existing.submissionType === 'congress' ? nextCongressDecision : null,
        notes: nextNotes
      }
    })
  })
)

router.post(
  '/:id/reviews/assign',
  requireAuth,
  authorizeRoles(reviewerAssignableRoles),
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const reviewerUserIds = Array.isArray(req.body?.reviewerUserIds)
      ? req.body.reviewerUserIds.map((id) => Number(id)).filter(Number.isFinite)
      : []

    if (!reviewerUserIds.length) {
      return res.status(400).json({ error: 'reviewerUserIds is required' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }

    assertTenantScope(req, publication.tenantId)

    if (publication.status !== 'internal_review') {
      return res.status(400).json({ error: 'Reviewer assignment is allowed only at internal_review stage' })
    }

    const validReviewers = await query(
      `
        SELECT id
        FROM pub_users
        WHERE tenant_id = ?
          AND is_active = 1
          AND role = ?
          AND id IN (${reviewerUserIds.map(() => '?').join(',')})
      `,
      [publication.tenantId, ROLES.REVIEWER, ...reviewerUserIds]
    )

    const validIds = validReviewers.map((row) => Number(row.id))
    if (!validIds.length) {
      return res.status(400).json({ error: 'No valid active reviewers found for assignment' })
    }

    await withTransaction(async (tx) => {
      for (const reviewerId of validIds) {
        await tx.query(
          `
            INSERT INTO pub_reviews
            (tenant_id, publication_id, reviewer_user_id, review_status)
            VALUES (?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE review_status = 'pending', comments = NULL, reviewed_at = NULL
          `,
          [publication.tenantId, publicationId, reviewerId]
        )
      }

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'review.assigned',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { reviewerUserIds: validIds }
      })
    })

    for (const reviewerId of validIds) {
      await sendUserNotification({
        tenantId: publication.tenantId,
        recipientUserId: reviewerId,
        eventKey: NOTIFICATION_EVENTS.REVIEW_ASSIGNED,
        title: `Review assigned: ${publication.title}`,
        body: `You have been assigned to review publication "${publication.title}".`,
        context: { publicationId }
      })
    }

    const reviews = await query(
      `
        SELECT id, reviewer_user_id AS reviewerUserId, review_status AS reviewStatus
        FROM pub_reviews
        WHERE publication_id = ?
        ORDER BY id ASC
      `,
      [publicationId]
    )

    res.json({ reviews })
  })
)

router.post(
  '/:id/reviews/:reviewId/decision',
  requireAuth,
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const reviewId = Number(req.params.reviewId)
    const decision = String(req.body?.decision || '').trim().toLowerCase()
    const comments = String(req.body?.comments || '').trim() || null

    if (!['approved', 'returned'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approved or returned' })
    }

    if (decision === 'returned' && !comments) {
      return res.status(400).json({ error: 'comments are required when returning a review' })
    }

    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const reviewRows = await query(
      `
        SELECT id, reviewer_user_id AS reviewerUserId, review_status AS reviewStatus
        FROM pub_reviews
        WHERE id = ? AND publication_id = ?
        LIMIT 1
      `,
      [reviewId, publicationId]
    )

    const review = reviewRows[0]
    if (!review) {
      return res.status(404).json({ error: 'Review assignment not found' })
    }

    const canAct = req.user.isSuperadmin || req.user.role === ROLES.ORG_ADMIN || Number(review.reviewerUserId) === Number(req.user.id)
    if (!canAct) {
      return res.status(403).json({ error: 'Only assigned reviewer or admin can submit this decision' })
    }

    const decisionResult = await withTransaction(async (tx) => {
      await tx.query(
        `
          UPDATE pub_reviews
          SET review_status = ?, comments = ?, reviewed_at = CURRENT_TIMESTAMP(6)
          WHERE id = ?
        `,
        [decision, comments, reviewId]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'review.decision_submitted',
        entityType: 'publication',
        entityId: publicationId,
        metadata: { reviewId, decision, comments }
      })

      if (decision === 'returned') {
        if (publication.status !== 'writing') {
          await transitionPublication(tx, publication, req.user.id, 'writing', 'Returned by reviewer')
        }
        return {
          publicationStatus: 'writing',
          transitionBlocked: false,
          missingRequiredGppItems: [],
          pendingDisclosures: []
        }
      }

      const pendingRows = await tx.query(
        `
          SELECT COUNT(*) AS pendingCount
          FROM pub_reviews
          WHERE publication_id = ? AND review_status <> 'approved'
        `,
        [publicationId]
      )

      const pendingCount = Number(pendingRows[0]?.pendingCount || 0)
      if (pendingCount === 0 && publication.status === 'internal_review') {
        const transitionBlocks = await getTransitionBlocksForJournalSubmission(tx, publicationId)
        if (transitionBlocks.missingRequiredGppItems.length || transitionBlocks.pendingDisclosures.length) {
          await writeAuditWithClient(tx, {
            tenantId: publication.tenantId,
            actorUserId: req.user.id,
            actionType: 'publication.transition_blocked',
            entityType: 'publication',
            entityId: publicationId,
            metadata: {
              blockedFrom: 'journal_submission',
              missingRequiredGppItems: transitionBlocks.missingRequiredGppItems.map((item) => item.itemKey),
              pendingDisclosureAuthorIds: transitionBlocks.pendingDisclosures.map((item) => item.authorId)
            }
          })

          return {
            publicationStatus: publication.status,
            transitionBlocked: true,
            missingRequiredGppItems: transitionBlocks.missingRequiredGppItems,
            pendingDisclosures: transitionBlocks.pendingDisclosures
          }
        }

        await transitionPublication(tx, publication, req.user.id, 'journal_submission', 'All reviewers approved')
        return {
          publicationStatus: 'journal_submission',
          transitionBlocked: false,
          missingRequiredGppItems: [],
          pendingDisclosures: []
        }
      }

      return {
        publicationStatus: publication.status,
        transitionBlocked: false,
        missingRequiredGppItems: [],
        pendingDisclosures: []
      }
    })

    if (decision === 'returned') {
      await notifyPublicationUsers({
        tenantId: publication.tenantId,
        publicationId,
        eventKey: NOTIFICATION_EVENTS.REVIEW_RETURNED,
        title: `Review returned: ${publication.title}`,
        body: `A reviewer returned the publication with comments: ${comments || 'No comment'}`,
        excludeUserIds: [req.user.id]
      })
    } else {
      await notifyPublicationUsers({
        tenantId: publication.tenantId,
        publicationId,
        eventKey: NOTIFICATION_EVENTS.REVIEW_APPROVED,
        title: `Review approved: ${publication.title}`,
        body: `A reviewer approved publication "${publication.title}".`,
        excludeUserIds: [req.user.id]
      })
    }

    res.json({
      reviewId,
      decision,
      publicationStatus: decisionResult.publicationStatus,
      transitionBlocked: decisionResult.transitionBlocked,
      missingRequiredGppItems: decisionResult.missingRequiredGppItems,
      pendingDisclosures: decisionResult.pendingDisclosures
    })
  })
)

router.post(
  '/:id/documents/upload',
  requireAuth,
  authorizeRoles(publicationAuthorRoles),
  asyncHandler(async (req, _res, next) => {
    const publicationId = Number(req.params.id)
    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return _res.status(404).json({ error: 'Publication not found' })
    }

    assertTenantScope(req, publication.tenantId)
    req.publication = publication
    return next()
  }),
  requirePublicationUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' })
    }

    const publication = req.publication

    const uploadResult = await withTransaction(async (tx) => {
      let documentRows = await tx.query(
        `SELECT id, current_version AS currentVersion FROM pub_documents WHERE publication_id = ? LIMIT 1`,
        [publication.id]
      )

      let documentId
      let currentVersion = 0
      if (!documentRows[0]) {
        const createdDoc = await tx.query(
          `
            INSERT INTO pub_documents (tenant_id, publication_id, current_version, created_by)
            VALUES (?, ?, 0, ?)
          `,
          [publication.tenantId, publication.id, req.user.id]
        )
        documentId = createdDoc.insertId
      } else {
        documentId = documentRows[0].id
        currentVersion = Number(documentRows[0].currentVersion || 0)
      }

      const nextVersion = currentVersion + 1
      const relativePath = path.relative(path.join(__dirname, '..'), req.file.path)

      const versionInsert = await tx.query(
        `
          INSERT INTO pub_document_versions
          (tenant_id, document_id, version_no, file_name, mime_type, file_size, storage_path, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          publication.tenantId,
          documentId,
          nextVersion,
          req.file.originalname,
          req.file.mimetype || null,
          req.file.size || null,
          relativePath,
          req.user.id
        ]
      )

      await tx.query(
        `UPDATE pub_documents SET current_version = ? WHERE id = ?`,
        [nextVersion, documentId]
      )

      await writeAuditWithClient(tx, {
        tenantId: publication.tenantId,
        actorUserId: req.user.id,
        actionType: 'document.uploaded',
        entityType: 'publication',
        entityId: publication.id,
        metadata: {
          documentId,
          versionId: versionInsert.insertId,
          versionNo: nextVersion,
          fileName: req.file.originalname,
          fileSize: req.file.size || null
        }
      })

      return {
        documentId,
        versionId: versionInsert.insertId,
        versionNo: nextVersion,
        fileName: req.file.originalname,
        fileSize: req.file.size || null,
        mimeType: req.file.mimetype || null
      }
    })

    await notifyPublicationUsers({
      tenantId: publication.tenantId,
      publicationId: publication.id,
      eventKey: NOTIFICATION_EVENTS.DOCUMENT_UPLOADED,
      title: `Document uploaded: ${publication.title}`,
      body: `A new document version (${uploadResult.versionNo}) was uploaded for publication "${publication.title}".`,
      excludeUserIds: [req.user.id]
    })

    res.status(201).json({ upload: uploadResult })
  })
)

router.get(
  '/:id/documents',
  requireAuth,
  asyncHandler(async (req, res) => {
    const publicationId = Number(req.params.id)
    const publication = await getPublicationById(publicationId)
    if (!publication) {
      return res.status(404).json({ error: 'Publication not found' })
    }
    assertTenantScope(req, publication.tenantId)

    const versions = await query(
      `
        SELECT
          dv.id,
          dv.document_id AS documentId,
          dv.version_no AS versionNo,
          dv.file_name AS fileName,
          dv.mime_type AS mimeType,
          dv.file_size AS fileSize,
          dv.storage_path AS storagePath,
          dv.uploaded_by AS uploadedBy,
          dv.uploaded_at AS uploadedAt
        FROM pub_document_versions dv
        JOIN pub_documents d ON d.id = dv.document_id
        WHERE d.publication_id = ?
        ORDER BY dv.version_no DESC
      `,
      [publicationId]
    )

    res.json({ versions })
  })
)

router.get(
  '/documents/version/:versionId/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const versionId = Number(req.params.versionId)
    if (!Number.isFinite(versionId)) {
      return res.status(400).json({ error: 'Invalid version id' })
    }

    const rows = await query(
      `
        SELECT
          dv.id,
          dv.file_name AS fileName,
          dv.storage_path AS storagePath,
          d.publication_id AS publicationId,
          p.tenant_id AS tenantId
        FROM pub_document_versions dv
        JOIN pub_documents d ON d.id = dv.document_id
        JOIN pub_publications p ON p.id = d.publication_id
        WHERE dv.id = ?
        LIMIT 1
      `,
      [versionId]
    )

    const version = rows[0]
    if (!version) {
      return res.status(404).json({ error: 'Document version not found' })
    }

    assertTenantScope(req, version.tenantId)

    const absolutePath = path.join(__dirname, '..', version.storagePath)
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Document file missing from storage' })
    }

    res.download(absolutePath, version.fileName)
  })
)

module.exports = router
