const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess, canAccessClient } = require('../middleware/rbac')
const { MODULES, ROLES } = require('../constants')
const { resolveClientScope } = require('../services/tenantScopeService')
const { getConfigValue } = require('../services/configService')

const router = express.Router()

const SERIOUSNESS_OPTIONS = new Set(['non_serious', 'serious'])
const CAUSALITY_OPTIONS = new Set(['related', 'not_related', 'unknown'])
const PRIORITY_OPTIONS = new Set(['low', 'medium', 'high', 'critical'])
const STATUS_OPTIONS = new Set(['new', 'triaged', 'in_review', 'closed', 'exception'])
const REG_CLOCK_ACTIONS = new Set(['pause', 'resume', 'stop', 'start'])
const LISTEDNESS_OPTIONS = new Set(['listed', 'unlisted', 'unknown'])
const EXPECTEDNESS_OPTIONS = new Set(['expected', 'unexpected', 'unknown'])

const STATUS_TRANSITIONS_BY_ROLE = {
  [ROLES.SUPER_ADMIN]: {
    new: new Set(['triaged', 'exception']),
    triaged: new Set(['in_review', 'closed', 'exception']),
    in_review: new Set(['closed', 'exception', 'triaged']),
    closed: new Set(['in_review', 'exception']),
    exception: new Set(['in_review', 'closed', 'triaged'])
  },
  [ROLES.CRO_ADMIN]: {
    new: new Set(['triaged', 'exception']),
    triaged: new Set(['in_review', 'closed', 'exception']),
    in_review: new Set(['closed', 'exception']),
    closed: new Set(['in_review']),
    exception: new Set(['in_review', 'closed'])
  },
  [ROLES.SAFETY_SCIENTIST]: {
    new: new Set(['triaged']),
    triaged: new Set(['in_review']),
    in_review: new Set(['exception']),
    closed: new Set(),
    exception: new Set(['in_review'])
  },
  [ROLES.MEDICAL_REVIEWER]: {
    new: new Set(),
    triaged: new Set(['in_review']),
    in_review: new Set(['closed', 'exception']),
    closed: new Set(['in_review']),
    exception: new Set(['in_review', 'closed'])
  },
  [ROLES.READ_ONLY]: {
    new: new Set(),
    triaged: new Set(),
    in_review: new Set(),
    closed: new Set(),
    exception: new Set()
  }
}

function toDbJson(value) {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

function parseJsonField(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
}

function canWriteCase(role) {
  return role !== ROLES.READ_ONLY
}

function canAssignReviewer(role) {
  return [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN].includes(role)
}

function canTriage(role) {
  return [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN, ROLES.SAFETY_SCIENTIST, ROLES.MEDICAL_REVIEWER].includes(role)
}

function validateStatus(status) {
  return STATUS_OPTIONS.has(String(status || '').trim())
}

function canTransition(role, fromStatus, toStatus) {
  const roleMap = STATUS_TRANSITIONS_BY_ROLE[role] || {}
  return Boolean(roleMap[fromStatus] && roleMap[fromStatus].has(toStatus))
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000))
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num
}

function normalizeSex(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (['male', 'female', 'other'].includes(normalized)) return normalized
  return null
}

function parseDateOnly(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return raw
}

function daysBetweenDateOnly(leftDateOnly, rightDateOnly) {
  if (!leftDateOnly || !rightDateOnly) return null
  const left = new Date(`${leftDateOnly}T00:00:00.000Z`)
  const right = new Date(`${rightDateOnly}T00:00:00.000Z`)
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null
  return Math.abs(Math.round((left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000)))
}

function parseDuplicateWindowDays(rawValue) {
  const value = Number(rawValue)
  if (!Number.isInteger(value)) return 30
  return Math.min(90, Math.max(1, value))
}

function parseAttachments(payload) {
  const list = Array.isArray(payload) ? payload : []
  const normalized = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const name = String(item.name || '').trim().slice(0, 160)
    const url = String(item.url || '').trim().slice(0, 500)
    if (!name || !url) continue
    normalized.push({
      name,
      url,
      type: String(item.type || '').trim().slice(0, 60) || 'external_link',
      sizeKb: Number.isFinite(Number(item.sizeKb)) ? Number(item.sizeKb) : null,
      uploadedAt: new Date().toISOString()
    })
  }
  return normalized
}

function parseIntakeSections(body) {
  const reporter = {
    name: String(body.reporterName || '').trim(),
    email: String(body.reporterEmail || '').trim().toLowerCase(),
    country: String(body.reporterCountry || '').trim(),
    qualification: String(body.reporterQualification || '').trim()
  }
  const patient = {
    reference: String(body.patientReference || '').trim(),
    ageYears: body.patientAgeYears !== undefined && body.patientAgeYears !== null && body.patientAgeYears !== ''
      ? Number(body.patientAgeYears)
      : null,
    sex: normalizeSex(body.patientSex),
    weightKg: toNumberOrNull(body.patientWeightKg),
    dateOfBirth: parseDateOnly(body.patientDateOfBirth)
  }
  const ae = {
    description: String(body.aeDescription || '').trim(),
    onsetDate: parseDateOnly(body.aeOnsetDate)
  }
  const product = {
    suspectProductId: Number(body.suspectProductId),
    suspectProductName: String(body.suspectProductName || '').trim() || null,
    dose: String(body.dose || '').trim() || null,
    route: String(body.route || '').trim() || null
  }

  return { reporter, patient, ae, product }
}

function validateCaseInputs(body) {
  const sections = parseIntakeSections(body)
  if (!sections.reporter.name) return { error: 'reporterName is required' }
  if (!sections.patient.reference) return { error: 'patientReference is required' }
  if (!sections.ae.description) return { error: 'aeDescription is required' }
  if (!Number.isInteger(sections.product.suspectProductId) || sections.product.suspectProductId <= 0) {
    return { error: 'suspectProductId is required and must be a valid id' }
  }

  const seriousness = String(body.seriousness || 'non_serious').trim()
  const causality = String(body.causality || 'unknown').trim()
  let priority = String(body.priority || 'medium').trim()
  if (!SERIOUSNESS_OPTIONS.has(seriousness)) {
    return { error: 'seriousness must be non_serious or serious' }
  }
  if (!CAUSALITY_OPTIONS.has(causality)) {
    return { error: 'causality must be related, not_related, or unknown' }
  }
  if (!PRIORITY_OPTIONS.has(priority)) {
    return { error: 'priority must be low, medium, high, or critical' }
  }

  if (sections.patient.ageYears !== null && (!Number.isInteger(sections.patient.ageYears) || sections.patient.ageYears < 0 || sections.patient.ageYears > 130)) {
    return { error: 'patientAgeYears must be an integer between 0 and 130' }
  }
  if (sections.patient.weightKg !== null && (sections.patient.weightKg <= 0 || sections.patient.weightKg > 400)) {
    return { error: 'patientWeightKg must be between 0 and 400' }
  }
  if (body.patientDateOfBirth && !sections.patient.dateOfBirth) {
    return { error: 'patientDateOfBirth must be a valid date (YYYY-MM-DD)' }
  }
  if (body.aeOnsetDate && !sections.ae.onsetDate) {
    return { error: 'aeOnsetDate must be a valid date (YYYY-MM-DD)' }
  }

  let receivedAt = new Date()
  if (body.receivedAt) {
    const parsed = new Date(body.receivedAt)
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'receivedAt must be a valid datetime' }
    }
    receivedAt = parsed
  }

  const regulatoryClockDays = body.regulatoryClockDays !== undefined
    ? Number(body.regulatoryClockDays)
    : 15
  if (!Number.isInteger(regulatoryClockDays) || regulatoryClockDays < 1 || regulatoryClockDays > 90) {
    return { error: 'regulatoryClockDays must be between 1 and 90' }
  }

  const timezone = String(body.timezone || 'UTC').trim().slice(0, 64) || 'UTC'
  const attachments = parseAttachments(body.attachments)

  const ruleSuggestion = applyTriageRules({
    seriousness,
    causality,
    priority,
    hasMedicallyImportantTerm: normalizeText(sections.ae.description).includes('hospital')
  })
  priority = ruleSuggestion.finalPriority

  return {
    payload: {
      reporter: sections.reporter,
      patient: sections.patient,
      ae: sections.ae,
      product: sections.product,
      seriousness,
      causality,
      priority,
      receivedAt,
      regulatoryClockDays,
      timezone,
      attachments,
      triageRuleMeta: ruleSuggestion
    }
  }
}

function applyTriageRules({ seriousness, causality, priority, hasMedicallyImportantTerm = false }) {
  let finalPriority = priority
  const ruleHits = []

  if (seriousness === 'serious' && ['low', 'medium'].includes(finalPriority)) {
    finalPriority = 'high'
    ruleHits.push('seriousness_priority_floor_high')
  }

  if (causality === 'related' && finalPriority === 'low') {
    finalPriority = 'medium'
    ruleHits.push('related_priority_floor_medium')
  }

  if (hasMedicallyImportantTerm && finalPriority !== 'critical') {
    finalPriority = finalPriority === 'high' ? 'critical' : 'high'
    ruleHits.push('medically_important_term_escalation')
  }

  return {
    finalPriority,
    ruleHits
  }
}

function mapCaseRow(row) {
  if (!row) return null
  return {
    ...row,
    ae_onset_date: parseDateOnly(row.ae_onset_date),
    reporter_json: parseJsonField(row.reporter_json),
    patient_json: parseJsonField(row.patient_json),
    ae_json: parseJsonField(row.ae_json),
    product_json: parseJsonField(row.product_json),
    attachments_json: parseJsonField(row.attachments_json) || [],
    duplicate_flags_json: parseJsonField(row.duplicate_flags_json) || []
  }
}

async function generateCaseNumber(connection, orgId) {
  const [[config]] = await connection.execute(
    `SELECT case_prefix, sequence_padding
     FROM case_id_config
     WHERE org_id = ? AND is_active = 1
     FOR UPDATE`,
    [orgId]
  )

  if (!config) {
    throw new Error('Case ID configuration is missing or inactive for this organisation')
  }

  const caseYear = new Date().getUTCFullYear()
  await connection.execute(
    `INSERT INTO case_id_sequences (org_id, case_year, last_sequence)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE last_sequence = LAST_INSERT_ID(last_sequence + 1)`,
    [orgId, caseYear]
  )

  const [[seqRow]] = await connection.execute('SELECT LAST_INSERT_ID() AS next_sequence')
  const nextSequence = Number(seqRow.next_sequence)
  if (!Number.isInteger(nextSequence) || nextSequence <= 0) {
    throw new Error('Failed to allocate case sequence')
  }

  return `${config.case_prefix}-${caseYear}-${String(nextSequence).padStart(config.sequence_padding, '0')}`
}

async function logCaseAudit({
  connection,
  casePkId,
  orgId,
  clientId,
  actorUserId,
  actionType,
  beforeValue = null,
  afterValue = null,
  metadata = null
}) {
  await connection.execute(
    `INSERT INTO case_record_audit
      (case_pk_id, org_id, client_id, actor_user_id, action_type, before_value, after_value, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      casePkId,
      orgId,
      clientId,
      actorUserId,
      actionType,
      toDbJson(beforeValue),
      toDbJson(afterValue),
      toDbJson(metadata)
    ]
  )
}

async function getCaseById(caseId) {
  const [[row]] = await pool.execute(
    `SELECT
      c.case_pk_id,
      c.org_id,
      c.client_id,
      cl.client_name,
      c.case_number,
      c.reporter_name,
      c.reporter_email,
      c.reporter_json,
      c.patient_reference,
      c.patient_json,
      c.ae_description,
      c.ae_json,
      c.ae_onset_date,
      c.suspect_product_id,
      p.product_name AS suspect_product_name,
      c.product_json,
      c.attachments_json,
      c.duplicate_flags_json,
      c.seriousness,
      c.causality,
      c.priority,
      c.status,
      c.received_at,
      c.regulatory_clock_days,
      c.regulatory_due_at,
      c.regulatory_clock_status,
      c.regulatory_paused_at,
      c.regulatory_total_paused_minutes,
      c.regulatory_timezone,
      c.assigned_medical_reviewer_id,
      reviewer.full_name AS assigned_medical_reviewer_name,
      c.exception_reason,
      c.created_by,
      c.created_at,
      c.updated_at
     FROM safety_cases c
     LEFT JOIN pharma_clients cl ON cl.client_id = c.client_id
     LEFT JOIN products p ON p.product_id = c.suspect_product_id
     LEFT JOIN users reviewer ON reviewer.user_id = c.assigned_medical_reviewer_id
     WHERE c.case_pk_id = ?`,
    [caseId]
  )
  return mapCaseRow(row)
}

function assertCaseScope(req, res, row) {
  if (!assertOrgAccess(req, res, row.org_id)) return false
  if (!canAccessClient(req.user, row.client_id)) {
    res.status(403).json({ error: 'Client scope access denied' })
    return false
  }
  return true
}

async function findPotentialDuplicates({
  orgId,
  clientId = null,
  patientReference,
  patientSex = null,
  patientAgeYears = null,
  patientWeightKg = null,
  aeOnsetDate = null,
  onsetDateWindowDays = 30,
  suspectProductId,
  aeDescription,
  excludeCaseId = null,
  limit = 20
}) {
  const clauses = ['org_id = ?']
  const params = [orgId]

  if (clientId) {
    clauses.push('client_id = ?')
    params.push(clientId)
  }
  if (excludeCaseId) {
    clauses.push('case_pk_id <> ?')
    params.push(excludeCaseId)
  }

  if (aeOnsetDate) {
    clauses.push('(patient_reference = ? OR suspect_product_id = ? OR (ae_onset_date IS NOT NULL AND ABS(DATEDIFF(ae_onset_date, ?)) <= ?))')
    params.push(patientReference, suspectProductId, aeOnsetDate, onsetDateWindowDays)
  } else {
    clauses.push('(patient_reference = ? OR suspect_product_id = ?)')
    params.push(patientReference, suspectProductId)
  }

  const [rows] = await pool.execute(
    `SELECT
      case_pk_id,
      case_number,
      patient_reference,
      patient_json,
      suspect_product_id,
      ae_description,
      ae_onset_date,
      seriousness,
      priority,
      status,
      created_at
     FROM safety_cases
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${Number.isFinite(limit) ? limit : 20}`,
    params
  )

  const incomingAe = normalizeText(aeDescription)
  const incomingSex = normalizeSex(patientSex)
  const incomingAge = toNumberOrNull(patientAgeYears)
  const incomingWeight = toNumberOrNull(patientWeightKg)
  const incomingOnsetDate = parseDateOnly(aeOnsetDate)

  return rows.map((row) => {
    const patientJson = parseJsonField(row.patient_json) || {}
    const existingSex = normalizeSex(patientJson.sex)
    const existingAge = toNumberOrNull(patientJson.ageYears)
    const existingWeight = toNumberOrNull(patientJson.weightKg)
    const existingOnsetDate = parseDateOnly(row.ae_onset_date)

    const patientReferenceMatch = row.patient_reference === patientReference
    const productMatch = Number(row.suspect_product_id) === Number(suspectProductId)

    const demographicChecks = []
    if (incomingSex && existingSex) demographicChecks.push(incomingSex === existingSex)
    if (incomingAge !== null && existingAge !== null) demographicChecks.push(Math.abs(incomingAge - existingAge) <= 2)
    if (incomingWeight !== null && existingWeight !== null) {
      const tolerance = Math.max(2, incomingWeight * 0.1)
      demographicChecks.push(Math.abs(incomingWeight - existingWeight) <= tolerance)
    }
    const demographicsMatch = demographicChecks.length ? demographicChecks.every(Boolean) : false

    const existingAe = normalizeText(row.ae_description)
    const overlappingTokens = incomingAe && existingAe
      ? [...new Set(existingAe.split(' ').filter((token) => token.length > 3 && incomingAe.includes(token)))]
      : []
    const overlapCount = overlappingTokens.length
    const aeTermOverlap = overlapCount > 0

    const onsetDiffDays = daysBetweenDateOnly(incomingOnsetDate, existingOnsetDate)
    const onsetDateWithinWindow = onsetDiffDays !== null && onsetDiffDays <= onsetDateWindowDays

    const isPotentialDuplicate = (patientReferenceMatch || demographicsMatch) && aeTermOverlap && productMatch && onsetDateWithinWindow

    const criteria = {
      patientReferenceMatch,
      demographicsMatch,
      aeTermOverlap,
      productMatch,
      onsetDateWithinWindow,
      onsetDiffDays,
      onsetDateWindowDays,
      demographicChecksApplied: {
        sex: incomingSex && existingSex ? incomingSex === existingSex : null,
        ageTolerance2Years: incomingAge !== null && existingAge !== null ? Math.abs(incomingAge - existingAge) <= 2 : null,
        weightTolerance: incomingWeight !== null && existingWeight !== null
          ? Math.abs(incomingWeight - existingWeight) <= Math.max(2, incomingWeight * 0.1)
          : null
      },
      overlappingAeTokens: overlappingTokens
    }

    const score = (patientReferenceMatch ? 0.35 : 0)
      + (demographicsMatch ? 0.25 : 0)
      + (aeTermOverlap ? Math.min(0.2, overlapCount * 0.04) : 0)
      + (productMatch ? 0.1 : 0)
      + (onsetDateWithinWindow ? 0.1 : 0)
    const matchedCriteria = Object.entries({
      patientReference: patientReferenceMatch,
      demographics: demographicsMatch,
      aeTermOverlap,
      suspectProduct: productMatch,
      onsetDateWithinWindow
    }).filter(([, value]) => value).map(([key]) => key)

    return {
      ...row,
      duplicateScore: Number(score.toFixed(2)),
      isPotentialDuplicate,
      matchedCriteria,
      criteria
    }
  }).sort((a, b) => b.duplicateScore - a.duplicateScore)
}

function escapeCsvCell(value) {
  const raw = String(value === null || value === undefined ? '' : value)
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

async function maybeCreateRegulatoryAlert(connection, { casePkId, orgId, clientId, alertType, alertMessage }) {
  const [[existing]] = await connection.execute(
    `SELECT alert_id
     FROM case_regulatory_alerts
     WHERE case_pk_id = ? AND alert_type = ? AND resolved_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [casePkId, alertType]
  )
  if (existing) return false

  await connection.execute(
    `INSERT INTO case_regulatory_alerts
      (case_pk_id, org_id, client_id, alert_type, alert_message)
     VALUES (?, ?, ?, ?, ?)`,
    [casePkId, orgId, clientId, alertType, alertMessage]
  )
  return true
}

async function runRegulatoryAlertEvaluation(targetOrgId, targetClientId = null) {
  const connection = await pool.getConnection()
  let created = 0
  try {
    await connection.beginTransaction()
    const where = ['org_id = ?', "status <> 'closed'", 'regulatory_due_at IS NOT NULL']
    const params = [targetOrgId]
    if (targetClientId) {
      where.push('client_id = ?')
      params.push(targetClientId)
    }

    const [rows] = await connection.execute(
      `SELECT case_pk_id, org_id, client_id, case_number, status, regulatory_due_at
       FROM safety_cases
       WHERE ${where.join(' AND ')}`,
      params
    )

    const now = Date.now()
    for (const row of rows) {
      const dueMs = new Date(row.regulatory_due_at).getTime()
      if (Number.isNaN(dueMs)) continue
      const diffDays = Math.floor((dueMs - now) / (24 * 60 * 60 * 1000))

      if (diffDays < 0) {
        if (await maybeCreateRegulatoryAlert(connection, {
          casePkId: row.case_pk_id,
          orgId: row.org_id,
          clientId: row.client_id,
          alertType: 'overdue',
          alertMessage: `Case ${row.case_number} is overdue by ${Math.abs(diffDays)} day(s)`
        })) {
          created += 1
        }
        if (diffDays <= -2 && await maybeCreateRegulatoryAlert(connection, {
          casePkId: row.case_pk_id,
          orgId: row.org_id,
          clientId: row.client_id,
          alertType: 'escalated',
          alertMessage: `Escalation: Case ${row.case_number} is overdue by ${Math.abs(diffDays)} day(s)`
        })) {
          created += 1
        }
      } else if (diffDays <= 2 && await maybeCreateRegulatoryAlert(connection, {
        casePkId: row.case_pk_id,
        orgId: row.org_id,
        clientId: row.client_id,
        alertType: 'due_soon',
        alertMessage: `Case ${row.case_number} due in ${diffDays} day(s)`
      })) {
        created += 1
      }
    }

    if (targetClientId) {
      await connection.execute(
        `UPDATE case_regulatory_alerts a
         INNER JOIN safety_cases c ON c.case_pk_id = a.case_pk_id
         SET a.resolved_at = NOW()
         WHERE c.org_id = ? AND c.client_id = ? AND c.status = 'closed' AND a.resolved_at IS NULL`,
        [targetOrgId, targetClientId]
      )
    } else {
      await connection.execute(
        `UPDATE case_regulatory_alerts a
         INNER JOIN safety_cases c ON c.case_pk_id = a.case_pk_id
         SET a.resolved_at = NOW()
         WHERE c.org_id = ? AND c.status = 'closed' AND a.resolved_at IS NULL`,
        [targetOrgId]
      )
    }

    await connection.commit()
    return { created }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

function scopedOrgIdForRequest(req, inputOrgId) {
  if (req.user.role === ROLES.SUPER_ADMIN) {
    return Number(inputOrgId || req.user.orgId)
  }
  return req.user.orgId
}

function scopedClientForRequest(req, requestedClientId = null) {
  if (req.user.clientId && [ROLES.SAFETY_SCIENTIST, ROLES.MEDICAL_REVIEWER, ROLES.READ_ONLY].includes(req.user.role)) {
    return req.user.clientId
  }
  return requestedClientId
}

router.use(authenticate)
router.use(requireModule(MODULES.CASE_MANAGEMENT))

router.get('/dashboard/summary', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined

  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const where = ['c.org_id = ?']
    const params = [targetOrgId]
    if (scopedClientId) {
      where.push('c.client_id = ?')
      params.push(scopedClientId)
    }

    const [totals] = await pool.execute(
      `SELECT
        COUNT(*) AS total_cases,
        SUM(CASE WHEN c.status <> 'closed' THEN 1 ELSE 0 END) AS open_cases,
        SUM(CASE WHEN c.status <> 'closed' AND c.regulatory_due_at < NOW() THEN 1 ELSE 0 END) AS overdue_cases
       FROM safety_cases c
       WHERE ${where.join(' AND ')}`,
      params
    )

    const [byStatus] = await pool.execute(
      `SELECT c.status, COUNT(*) AS count
       FROM safety_cases c
       WHERE ${where.join(' AND ')}
       GROUP BY c.status`,
      params
    )

    const [byPriority] = await pool.execute(
      `SELECT c.priority, COUNT(*) AS count
       FROM safety_cases c
       WHERE ${where.join(' AND ')}
       GROUP BY c.priority`,
      params
    )

    const [byClient] = await pool.execute(
      `SELECT
        COALESCE(cl.client_name, 'Direct') AS client_name,
        c.client_id,
        COUNT(*) AS count
       FROM safety_cases c
       LEFT JOIN pharma_clients cl ON cl.client_id = c.client_id
       WHERE ${where.join(' AND ')}
       GROUP BY c.client_id, client_name
       ORDER BY count DESC`,
      params
    )

    const [overdueBuckets] = await pool.execute(
      `SELECT
        SUM(CASE WHEN c.status <> 'closed' AND c.regulatory_due_at < NOW() THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN c.status <> 'closed' AND c.regulatory_due_at >= NOW() AND TIMESTAMPDIFF(DAY, NOW(), c.regulatory_due_at) BETWEEN 0 AND 2 THEN 1 ELSE 0 END) AS due_0_2_days,
        SUM(CASE WHEN c.status <> 'closed' AND TIMESTAMPDIFF(DAY, NOW(), c.regulatory_due_at) BETWEEN 3 AND 7 THEN 1 ELSE 0 END) AS due_3_7_days,
        SUM(CASE WHEN c.status <> 'closed' AND TIMESTAMPDIFF(DAY, NOW(), c.regulatory_due_at) > 7 THEN 1 ELSE 0 END) AS due_8_plus_days
       FROM safety_cases c
       WHERE ${where.join(' AND ')}`,
      params
    )

    const alertWhere = ['a.org_id = ?', 'a.resolved_at IS NULL']
    const alertParams = [targetOrgId]
    if (scopedClientId) {
      alertWhere.push('c.client_id = ?')
      alertParams.push(scopedClientId)
    }
    const [alertCounts] = await pool.execute(
      `SELECT a.alert_type, COUNT(*) AS count
       FROM case_regulatory_alerts a
       INNER JOIN safety_cases c ON c.case_pk_id = a.case_pk_id
       WHERE ${alertWhere.join(' AND ')}
       GROUP BY a.alert_type`,
      alertParams
    )

    const summary = totals[0] || { total_cases: 0, open_cases: 0, overdue_cases: 0 }
    return res.json({
      totalCases: Number(summary.total_cases || 0),
      openCases: Number(summary.open_cases || 0),
      overdueCases: Number(summary.overdue_cases || 0),
      byStatus: byStatus.map((row) => ({ status: row.status, count: Number(row.count || 0) })),
      byPriority: byPriority.map((row) => ({ priority: row.priority, count: Number(row.count || 0) })),
      byClient: byClient.map((row) => ({
        clientId: row.client_id,
        clientName: row.client_name,
        count: Number(row.count || 0)
      })),
      overdueBuckets: {
        overdue: Number(overdueBuckets[0]?.overdue || 0),
        due_0_2_days: Number(overdueBuckets[0]?.due_0_2_days || 0),
        due_3_7_days: Number(overdueBuckets[0]?.due_3_7_days || 0),
        due_8_plus_days: Number(overdueBuckets[0]?.due_8_plus_days || 0)
      },
      activeAlerts: alertCounts.map((row) => ({
        type: row.alert_type,
        count: Number(row.count || 0)
      }))
    })
  } catch (error) {
    console.error('Fetch case dashboard summary failed:', error)
    return res.status(500).json({ error: 'Failed to fetch dashboard summary' })
  }
})

router.get('/dashboard/filters', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const where = ['org_id = ?', 'created_by = ?']
    const params = [targetOrgId, req.user.userId]
    if (scopedClientId) {
      where.push('client_id = ?')
      params.push(scopedClientId)
    }
    const [rows] = await pool.execute(
      `SELECT filter_id, filter_name, filter_payload, created_at
       FROM case_dashboard_filters
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    )

    return res.json(rows.map((row) => ({
      ...row,
      filter_payload: parseJsonField(row.filter_payload)
    })))
  } catch (error) {
    console.error('List dashboard filters failed:', error)
    return res.status(500).json({ error: 'Failed to list dashboard filters' })
  }
})

router.post('/dashboard/filters', async (req, res) => {
  const targetOrgId = scopedOrgIdForRequest(req, req.body.orgId)
  const requestedClientId = req.body.clientId !== undefined && req.body.clientId !== null && req.body.clientId !== ''
    ? Number(req.body.clientId)
    : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  const filterName = String(req.body.filterName || '').trim().slice(0, 120)
  const filterPayload = req.body.filterPayload && typeof req.body.filterPayload === 'object'
    ? req.body.filterPayload
    : null
  if (!filterName || !filterPayload) {
    return res.status(400).json({ error: 'filterName and filterPayload are required' })
  }

  try {
    const scope = await resolveClientScope({
      orgId: targetOrgId,
      clientId: scopedClientId,
      requireClientForCro: false,
      allowInactiveClient: false
    })
    if (scope.error && scopedClientId) return res.status(400).json({ error: scope.error })

    await pool.execute(
      `INSERT INTO case_dashboard_filters (org_id, client_id, created_by, filter_name, filter_payload)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE filter_payload = VALUES(filter_payload), created_at = CURRENT_TIMESTAMP`,
      [targetOrgId, scope.resolvedClientId || null, req.user.userId, filterName, JSON.stringify(filterPayload)]
    )
    return res.status(201).json({ message: 'Dashboard filter saved' })
  } catch (error) {
    console.error('Save dashboard filter failed:', error)
    return res.status(500).json({ error: 'Failed to save dashboard filter' })
  }
})

router.delete('/dashboard/filters/:filterId', async (req, res) => {
  const filterId = Number(req.params.filterId)
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  if (!Number.isInteger(filterId) || filterId <= 0) return res.status(400).json({ error: 'Invalid filter id' })
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined

  try {
    const [[ownedFilter]] = await pool.execute(
      `SELECT filter_id, org_id, client_id
       FROM case_dashboard_filters
       WHERE filter_id = ? AND created_by = ?`,
      [filterId, req.user.userId]
    )
    if (!ownedFilter) return res.status(404).json({ error: 'Filter not found' })
    if (Number(ownedFilter.org_id) !== Number(targetOrgId)) {
      return res.status(403).json({ error: 'Cross-organisation filter access is not allowed' })
    }
    if (ownedFilter.client_id && !canAccessClient(req.user, ownedFilter.client_id)) {
      return res.status(403).json({ error: 'Client scope access denied' })
    }

    const [result] = await pool.execute(
      `DELETE FROM case_dashboard_filters
       WHERE filter_id = ? AND created_by = ? AND org_id = ?`,
      [filterId, req.user.userId, targetOrgId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Filter not found' })
    return res.json({ message: 'Dashboard filter deleted' })
  } catch (error) {
    console.error('Delete dashboard filter failed:', error)
    return res.status(500).json({ error: 'Failed to delete dashboard filter' })
  }
})

router.post('/precheck/duplicates', async (req, res) => {
  const targetOrgId = scopedOrgIdForRequest(req, req.body.orgId)
  const requestedClientId = req.body.clientId !== undefined && req.body.clientId !== null && req.body.clientId !== ''
    ? Number(req.body.clientId)
    : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  const patientReference = String(req.body.patientReference || '').trim()
  const patientSex = normalizeSex(req.body.patientSex)
  const patientAgeYears = toNumberOrNull(req.body.patientAgeYears)
  const patientWeightKg = toNumberOrNull(req.body.patientWeightKg)
  const aeDescription = String(req.body.aeDescription || '').trim()
  const aeOnsetDate = parseDateOnly(req.body.aeOnsetDate)
  const suspectProductId = Number(req.body.suspectProductId)

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }
  const hasDemographics = Boolean(patientSex || patientAgeYears !== null || patientWeightKg !== null)
  if ((!patientReference && !hasDemographics) || !aeDescription || !Number.isInteger(suspectProductId) || suspectProductId <= 0 || !aeOnsetDate) {
    return res.status(400).json({ error: 'Provide patientReference or demographics (sex/age/weight), plus aeDescription, aeOnsetDate (YYYY-MM-DD), and suspectProductId' })
  }
  if (patientAgeYears !== null && (!Number.isInteger(patientAgeYears) || patientAgeYears < 0 || patientAgeYears > 130)) {
    return res.status(400).json({ error: 'patientAgeYears must be an integer between 0 and 130' })
  }
  if (patientWeightKg !== null && (patientWeightKg <= 0 || patientWeightKg > 400)) {
    return res.status(400).json({ error: 'patientWeightKg must be between 0 and 400' })
  }

  try {
    const scope = await resolveClientScope({
      orgId: targetOrgId,
      clientId: scopedClientId,
      requireClientForCro: true,
      allowInactiveClient: false
    })
    if (scope.error) return res.status(400).json({ error: scope.error })

    const onsetWindowDays = parseDuplicateWindowDays(
      await getConfigValue(targetOrgId, 'duplicate_precheck_onset_window_days', '30')
    )

    const duplicates = await findPotentialDuplicates({
      orgId: targetOrgId,
      clientId: scope.resolvedClientId,
      patientReference,
      patientSex,
      patientAgeYears,
      patientWeightKg,
      aeOnsetDate,
      onsetDateWindowDays: onsetWindowDays,
      suspectProductId,
      aeDescription,
      limit: 25
    })

    return res.json({
      duplicateCount: duplicates.length,
      probableDuplicates: duplicates.filter((row) => row.isPotentialDuplicate),
      onsetDateWindowDays: onsetWindowDays,
      allCandidates: duplicates
    })
  } catch (error) {
    console.error('Duplicate precheck failed:', error)
    return res.status(500).json({ error: 'Failed to run duplicate precheck' })
  }
})

router.get('/drafts', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const where = ['org_id = ?', 'created_by = ?']
    const params = [targetOrgId, req.user.userId]
    if (scopedClientId) {
      where.push('client_id = ?')
      params.push(scopedClientId)
    }
    const [rows] = await pool.execute(
      `SELECT draft_id, draft_key, draft_payload, created_at, updated_at
       FROM case_intake_drafts
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC`,
      params
    )
    return res.json(rows.map((row) => ({
      ...row,
      draft_payload: parseJsonField(row.draft_payload)
    })))
  } catch (error) {
    console.error('List intake drafts failed:', error)
    return res.status(500).json({ error: 'Failed to list intake drafts' })
  }
})

router.put('/drafts/:draftKey', async (req, res) => {
  if (!canWriteCase(req.user.role)) {
    return res.status(403).json({ error: 'Read-only users cannot save intake drafts' })
  }
  const targetOrgId = scopedOrgIdForRequest(req, req.body.orgId)
  const draftKey = String(req.params.draftKey || '').trim().slice(0, 80)
  const payload = req.body.draftPayload && typeof req.body.draftPayload === 'object'
    ? req.body.draftPayload
    : req.body

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (!draftKey) return res.status(400).json({ error: 'draftKey is required' })
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'draftPayload object is required' })
  }

  try {
    const requestedClientId = payload.clientId !== undefined && payload.clientId !== null && payload.clientId !== ''
      ? Number(payload.clientId)
      : null
    const scopedClientId = scopedClientForRequest(req, requestedClientId)
    if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
      return res.status(403).json({ error: 'Client scope access denied' })
    }

    const scope = await resolveClientScope({
      orgId: targetOrgId,
      clientId: scopedClientId,
      requireClientForCro: false,
      allowInactiveClient: false
    })
    if (scope.error && scopedClientId) return res.status(400).json({ error: scope.error })

    await pool.execute(
      `INSERT INTO case_intake_drafts
        (org_id, client_id, draft_key, draft_payload, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         draft_payload = VALUES(draft_payload),
         client_id = VALUES(client_id),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        targetOrgId,
        scope.resolvedClientId || null,
        draftKey,
        JSON.stringify(payload),
        req.user.userId,
        req.user.userId
      ]
    )

    return res.json({ message: 'Case intake draft saved', draftKey })
  } catch (error) {
    console.error('Save intake draft failed:', error)
    return res.status(500).json({ error: 'Failed to save intake draft' })
  }
})

router.delete('/drafts/:draftKey', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  const draftKey = String(req.params.draftKey || '').trim().slice(0, 80)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }
  if (!draftKey) return res.status(400).json({ error: 'draftKey is required' })

  try {
    const [[ownedDraft]] = await pool.execute(
      `SELECT draft_id, client_id
       FROM case_intake_drafts
       WHERE org_id = ? AND draft_key = ? AND created_by = ?`,
      [targetOrgId, draftKey, req.user.userId]
    )
    if (!ownedDraft) return res.status(404).json({ error: 'Draft not found' })
    if (scopedClientId && Number(ownedDraft.client_id || 0) !== Number(scopedClientId)) {
      return res.status(403).json({ error: 'Draft client scope does not match requested client scope' })
    }

    const [result] = await pool.execute(
      `DELETE FROM case_intake_drafts
       WHERE org_id = ? AND draft_key = ? AND created_by = ?`,
      [targetOrgId, draftKey, req.user.userId]
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Draft not found' })
    return res.json({ message: 'Draft deleted' })
  } catch (error) {
    console.error('Delete intake draft failed:', error)
    return res.status(500).json({ error: 'Failed to delete draft' })
  }
})

router.get('/regulatory/alerts', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  const alertType = req.query.alertType ? String(req.query.alertType).trim() : null
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 150)))
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const params = [targetOrgId]
    const where = ['a.org_id = ?']
    if (alertType) {
      where.push('a.alert_type = ?')
      params.push(alertType)
    }
    if (scopedClientId) {
      where.push('c.client_id = ?')
      params.push(scopedClientId)
    }

    const [rows] = await pool.execute(
      `SELECT
        a.alert_id,
        a.case_pk_id,
        c.case_number,
        a.alert_type,
        a.alert_message,
        a.resolved_at,
        a.created_at
       FROM case_regulatory_alerts a
       INNER JOIN safety_cases c ON c.case_pk_id = a.case_pk_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ${Number.isFinite(limit) ? limit : 150}`,
      params
    )

    return res.json(rows)
  } catch (error) {
    console.error('List regulatory alerts failed:', error)
    return res.status(500).json({ error: 'Failed to list regulatory alerts' })
  }
})

router.post('/regulatory/alerts/run', async (req, res) => {
  const targetOrgId = scopedOrgIdForRequest(req, req.body.orgId)
  const requestedClientId = req.body.clientId !== undefined && req.body.clientId !== null && req.body.clientId !== ''
    ? Number(req.body.clientId)
    : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }
  if (![ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN, ROLES.MEDICAL_REVIEWER].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/reviewer roles can run alert evaluation' })
  }

  try {
    const result = await runRegulatoryAlertEvaluation(targetOrgId, scopedClientId)
    return res.json({ message: 'Regulatory alert evaluation completed', ...result })
  } catch (error) {
    console.error('Run regulatory alert evaluation failed:', error)
    return res.status(500).json({ error: 'Failed to run regulatory alert evaluation' })
  }
})

router.get('/audit', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  const actionType = req.query.actionType ? String(req.query.actionType).trim() : null
  const actorUserId = req.query.actorUserId ? Number(req.query.actorUserId) : null
  const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : null
  const toDate = req.query.toDate ? String(req.query.toDate).trim() : null
  const search = req.query.search ? String(req.query.search).trim().toLowerCase() : null
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 300)))

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const params = [targetOrgId]
    const where = ['a.org_id = ?']

    if (actionType) {
      where.push('a.action_type = ?')
      params.push(actionType)
    }
    if (actorUserId && Number.isInteger(actorUserId)) {
      where.push('a.actor_user_id = ?')
      params.push(actorUserId)
    }
    if (fromDate) {
      where.push('a.created_at >= ?')
      params.push(fromDate)
    }
    if (toDate) {
      where.push('a.created_at <= ?')
      params.push(toDate)
    }
    if (search) {
      where.push('(LOWER(a.action_type) LIKE ? OR LOWER(c.case_number) LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (scopedClientId) {
      where.push('a.client_id = ?')
      params.push(scopedClientId)
    }

    const [rows] = await pool.execute(
      `SELECT
        a.audit_id,
        a.case_pk_id,
        c.case_number,
        a.actor_user_id,
        u.full_name AS actor_name,
        a.action_type,
        a.before_value,
        a.after_value,
        a.metadata,
        a.created_at
       FROM case_record_audit a
       LEFT JOIN safety_cases c ON c.case_pk_id = a.case_pk_id
       LEFT JOIN users u ON u.user_id = a.actor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ${Number.isFinite(limit) ? limit : 300}`,
      params
    )

    return res.json(rows.map((row) => ({
      ...row,
      before_value: parseJsonField(row.before_value),
      after_value: parseJsonField(row.after_value),
      metadata: parseJsonField(row.metadata)
    })))
  } catch (error) {
    console.error('List case audit failed:', error)
    return res.status(500).json({ error: 'Failed to list case audit' })
  }
})

router.get('/audit/export', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
    return res.status(403).json({ error: 'Client scope access denied' })
  }

  try {
    const where = ['a.org_id = ?']
    const params = [targetOrgId]
    if (scopedClientId) {
      where.push('a.client_id = ?')
      params.push(scopedClientId)
    }

    const [rows] = await pool.execute(
      `SELECT
        a.audit_id,
        c.case_number,
        a.action_type,
        a.actor_user_id,
        u.full_name AS actor_name,
        a.created_at
       FROM case_record_audit a
       LEFT JOIN safety_cases c ON c.case_pk_id = a.case_pk_id
       LEFT JOIN users u ON u.user_id = a.actor_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT 2000`,
      params
    )

    const header = ['audit_id', 'case_number', 'action_type', 'actor_user_id', 'actor_name', 'created_at']
    const csv = [header.join(',')]
    for (const row of rows) {
      csv.push([
        escapeCsvCell(row.audit_id),
        escapeCsvCell(row.case_number),
        escapeCsvCell(row.action_type),
        escapeCsvCell(row.actor_user_id),
        escapeCsvCell(row.actor_name),
        escapeCsvCell(row.created_at ? new Date(row.created_at).toISOString() : '')
      ].join(','))
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="case_audit_export_org_${targetOrgId}.csv"`)
    return res.send(csv.join('\n'))
  } catch (error) {
    console.error('Export case audit failed:', error)
    return res.status(500).json({ error: 'Failed to export case audit' })
  }
})

router.get('/', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null
  const status = req.query.status ? String(req.query.status).trim() : null
  const priority = req.query.priority ? String(req.query.priority).trim() : null
  const seriousness = req.query.seriousness ? String(req.query.seriousness).trim() : null
  const causality = req.query.causality ? String(req.query.causality).trim() : null
  const dueBucket = req.query.dueBucket ? String(req.query.dueBucket).trim() : null
  const search = req.query.search ? String(req.query.search).trim().toLowerCase() : null
  const savedFilterId = req.query.savedFilterId ? Number(req.query.savedFilterId) : null
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 150)))

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined

  let effectiveStatus = status
  let effectivePriority = priority
  let effectiveSeriousness = seriousness
  let effectiveCausality = causality
  let effectiveDueBucket = dueBucket
  let effectiveSearch = search

  try {
    if (savedFilterId) {
      const [[savedFilter]] = await pool.execute(
        `SELECT filter_payload
         FROM case_dashboard_filters
         WHERE filter_id = ? AND org_id = ? AND created_by = ?`,
        [savedFilterId, targetOrgId, req.user.userId]
      )
      if (savedFilter) {
        const payload = parseJsonField(savedFilter.filter_payload) || {}
        effectiveStatus = payload.status || effectiveStatus
        effectivePriority = payload.priority || effectivePriority
        effectiveSeriousness = payload.seriousness || effectiveSeriousness
        effectiveCausality = payload.causality || effectiveCausality
        effectiveDueBucket = payload.dueBucket || effectiveDueBucket
        effectiveSearch = payload.search || effectiveSearch
      }
    }
  } catch (error) {
    console.error('Load saved filter failed:', error)
    return res.status(500).json({ error: 'Failed to load saved filter' })
  }

  if (effectiveStatus && !validateStatus(effectiveStatus)) return res.status(400).json({ error: 'Invalid status filter' })
  if (effectivePriority && !PRIORITY_OPTIONS.has(effectivePriority)) return res.status(400).json({ error: 'Invalid priority filter' })
  if (effectiveSeriousness && !SERIOUSNESS_OPTIONS.has(effectiveSeriousness)) return res.status(400).json({ error: 'Invalid seriousness filter' })
  if (effectiveCausality && !CAUSALITY_OPTIONS.has(effectiveCausality)) return res.status(400).json({ error: 'Invalid causality filter' })
  if (effectiveDueBucket && !['overdue', 'due_0_2', 'due_3_7', 'due_8_plus'].includes(effectiveDueBucket)) {
    return res.status(400).json({ error: 'Invalid dueBucket filter' })
  }

  const scopedClientId = scopedClientForRequest(req, requestedClientId)
  if (scopedClientId && !canAccessClient(req.user, scopedClientId)) return res.status(403).json({ error: 'Client scope access denied' })

  try {
    const where = ['c.org_id = ?']
    const params = [targetOrgId]
    if (scopedClientId) {
      where.push('c.client_id = ?')
      params.push(scopedClientId)
    }
    if (effectiveStatus) {
      where.push('c.status = ?')
      params.push(effectiveStatus)
    }
    if (effectivePriority) {
      where.push('c.priority = ?')
      params.push(effectivePriority)
    }
    if (effectiveSeriousness) {
      where.push('c.seriousness = ?')
      params.push(effectiveSeriousness)
    }
    if (effectiveCausality) {
      where.push('c.causality = ?')
      params.push(effectiveCausality)
    }
    if (effectiveSearch) {
      where.push('(LOWER(c.case_number) LIKE ? OR LOWER(c.patient_reference) LIKE ? OR LOWER(c.reporter_name) LIKE ? OR LOWER(c.ae_description) LIKE ?)')
      params.push(`%${effectiveSearch}%`, `%${effectiveSearch}%`, `%${effectiveSearch}%`, `%${effectiveSearch}%`)
    }
    if (effectiveDueBucket === 'overdue') {
      where.push("c.status <> 'closed' AND c.regulatory_due_at < NOW()")
    }
    if (effectiveDueBucket === 'due_0_2') {
      where.push("c.status <> 'closed' AND c.regulatory_due_at >= NOW() AND TIMESTAMPDIFF(DAY, NOW(), c.regulatory_due_at) BETWEEN 0 AND 2")
    }
    if (effectiveDueBucket === 'due_3_7') {
      where.push("c.status <> 'closed' AND TIMESTAMPDIFF(DAY, NOW(), c.regulatory_due_at) BETWEEN 3 AND 7")
    }
    if (effectiveDueBucket === 'due_8_plus') {
      where.push("c.status <> 'closed' AND TIMESTAMPDIFF(DAY, NOW(), c.regulatory_due_at) > 7")
    }

    const [rows] = await pool.execute(
      `SELECT
        c.case_pk_id,
        c.case_number,
        c.org_id,
        c.client_id,
        cl.client_name,
        c.reporter_name,
        c.patient_reference,
        c.suspect_product_id,
        p.product_name AS suspect_product_name,
        c.seriousness,
        c.causality,
        c.priority,
        c.status,
        c.ae_onset_date,
        c.regulatory_clock_status,
        c.regulatory_timezone,
        c.assigned_medical_reviewer_id,
        reviewer.full_name AS assigned_medical_reviewer_name,
        c.received_at,
        c.regulatory_clock_days,
        c.regulatory_due_at,
        c.created_at,
        c.updated_at
       FROM safety_cases c
       LEFT JOIN pharma_clients cl ON cl.client_id = c.client_id
       LEFT JOIN products p ON p.product_id = c.suspect_product_id
       LEFT JOIN users reviewer ON reviewer.user_id = c.assigned_medical_reviewer_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT ${Number.isFinite(limit) ? limit : 150}`,
      params
    )

    return res.json(rows)
  } catch (error) {
    console.error('List cases failed:', error)
    return res.status(500).json({ error: 'Failed to list cases' })
  }
})

router.post('/', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot create cases' })

  const targetOrgId = scopedOrgIdForRequest(req, req.body.orgId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!assertOrgAccess(req, res, targetOrgId)) return undefined

  const input = validateCaseInputs(req.body)
  if (input.error) return res.status(400).json({ error: input.error })

  try {
    const requestedClientId = req.body.clientId !== undefined && req.body.clientId !== null && req.body.clientId !== ''
      ? Number(req.body.clientId)
      : null
    const scopedClientId = scopedClientForRequest(req, requestedClientId)
    if (scopedClientId && !canAccessClient(req.user, scopedClientId)) {
      return res.status(403).json({ error: 'Client scope access denied' })
    }

    const scope = await resolveClientScope({
      orgId: targetOrgId,
      clientId: scopedClientId,
      requireClientForCro: true,
      allowInactiveClient: false
    })
    if (scope.error) return res.status(400).json({ error: scope.error })

    const [[product]] = await pool.execute(
      `SELECT product_id, org_id, client_id, status, product_name
       FROM products
       WHERE product_id = ?`,
      [input.payload.product.suspectProductId]
    )
    if (!product || product.status !== 'active') {
      return res.status(400).json({ error: 'Suspect product not found or inactive' })
    }
    if (Number(product.org_id) !== Number(targetOrgId)) {
      return res.status(400).json({ error: 'Suspect product does not belong to target org' })
    }
    if (product.client_id && Number(product.client_id) !== Number(scope.resolvedClientId)) {
      return res.status(400).json({ error: 'Suspect product does not belong to selected client scope' })
    }

    const onsetWindowDays = parseDuplicateWindowDays(
      await getConfigValue(targetOrgId, 'duplicate_precheck_onset_window_days', '30')
    )

    const duplicates = await findPotentialDuplicates({
      orgId: targetOrgId,
      clientId: scope.resolvedClientId,
      patientReference: input.payload.patient.reference,
      patientSex: input.payload.patient.sex,
      patientAgeYears: input.payload.patient.ageYears,
      patientWeightKg: input.payload.patient.weightKg,
      aeOnsetDate: input.payload.ae.onsetDate,
      onsetDateWindowDays: onsetWindowDays,
      suspectProductId: input.payload.product.suspectProductId,
      aeDescription: input.payload.ae.description,
      limit: 25
    })

    const duplicateFlags = duplicates.filter((row) => row.isPotentialDuplicate).map((row) => ({
      casePkId: row.case_pk_id,
      caseNumber: row.case_number,
      score: row.duplicateScore,
      matchedCriteria: row.matchedCriteria
    }))

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const caseNumber = await generateCaseNumber(connection, targetOrgId)
      const [insertResult] = await connection.execute(
        `INSERT INTO safety_cases
          (org_id, client_id, case_number, reporter_name, reporter_email, reporter_json, patient_reference, patient_json, ae_description, ae_json,
           suspect_product_id, product_json, attachments_json, duplicate_flags_json, seriousness, causality, priority, status,
           received_at, regulatory_clock_days, regulatory_due_at, regulatory_clock_status, regulatory_total_paused_minutes, regulatory_timezone, ae_onset_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, NULL, 'running', 0, ?, ?, ?)`,
        [
          targetOrgId,
          scope.resolvedClientId,
          caseNumber,
          input.payload.reporter.name,
          input.payload.reporter.email || null,
          JSON.stringify(input.payload.reporter),
          input.payload.patient.reference,
          JSON.stringify(input.payload.patient),
          input.payload.ae.description,
          JSON.stringify(input.payload.ae),
          input.payload.product.suspectProductId,
          JSON.stringify({
            ...input.payload.product,
            suspectProductName: product.product_name
          }),
          JSON.stringify(input.payload.attachments),
          JSON.stringify(duplicateFlags),
          input.payload.seriousness,
          input.payload.causality,
          input.payload.priority,
          input.payload.receivedAt,
          input.payload.regulatoryClockDays,
          input.payload.timezone,
          input.payload.ae.onsetDate || null,
          req.user.userId
        ]
      )

      const casePkId = insertResult.insertId

      await connection.execute(
        `INSERT INTO case_workflow_events
          (case_pk_id, org_id, client_id, from_status, to_status, transition_note, changed_by)
         VALUES (?, ?, ?, NULL, 'new', ?, ?)`,
        [casePkId, targetOrgId, scope.resolvedClientId, 'case_created', req.user.userId]
      )

      await connection.execute(
        `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref, created_by)
         VALUES (?, ?, 'api', ?, ?)`,
        [targetOrgId, scope.resolvedClientId, caseNumber, req.user.userId]
      )

      await logCaseAudit({
        connection,
        casePkId,
        orgId: targetOrgId,
        clientId: scope.resolvedClientId,
        actorUserId: req.user.userId,
        actionType: 'case_created',
        afterValue: {
          caseNumber,
          seriousness: input.payload.seriousness,
          causality: input.payload.causality,
          priority: input.payload.priority,
          status: 'new'
        },
        metadata: {
          draftUsed: Boolean(req.body.draftKey),
          triageRuleHits: input.payload.triageRuleMeta.ruleHits,
          probableDuplicates: duplicateFlags
        }
      })

      await connection.commit()
      const created = await getCaseById(casePkId)
      return res.status(201).json({
        ...created,
        duplicatePrecheck: duplicateFlags
      })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicate case number or duplicate constrained field' })
    }
    console.error('Create case failed:', error)
    return res.status(500).json({ error: error.message || 'Failed to create case' })
  }
})

router.get('/:caseId', async (req, res) => {
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const row = await getCaseById(caseId)
    if (!row) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, row)) return undefined
    return res.json(row)
  } catch (error) {
    console.error('Fetch case failed:', error)
    return res.status(500).json({ error: 'Failed to fetch case' })
  }
})

router.patch('/:caseId/intake', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot edit intake' })
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    const sections = parseIntakeSections(req.body)
    const mergedReporter = { ...(existing.reporter_json || {}), ...sections.reporter }
    const mergedPatient = { ...(existing.patient_json || {}), ...sections.patient }
    const mergedAe = { ...(existing.ae_json || {}), ...sections.ae }
    const mergedProduct = { ...(existing.product_json || {}), ...sections.product }
    const attachments = req.body.attachments
      ? parseAttachments(req.body.attachments)
      : (existing.attachments_json || [])

    await pool.execute(
      `UPDATE safety_cases
       SET reporter_name = ?, reporter_email = ?, reporter_json = ?, patient_reference = ?, patient_json = ?,
           ae_description = ?, ae_json = ?, ae_onset_date = ?, product_json = ?, attachments_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [
        mergedReporter.name || existing.reporter_name,
        mergedReporter.email || existing.reporter_email,
        JSON.stringify(mergedReporter),
        mergedPatient.reference || existing.patient_reference,
        JSON.stringify(mergedPatient),
        mergedAe.description || existing.ae_description,
        JSON.stringify(mergedAe),
        mergedAe.onsetDate || existing.ae_onset_date || null,
        JSON.stringify(mergedProduct),
        JSON.stringify(attachments),
        caseId
      ]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_intake_updated',
      beforeValue: {
        reporter: existing.reporter_json,
        patient: existing.patient_json,
        ae: existing.ae_json
      },
      afterValue: {
        reporter: mergedReporter,
        patient: mergedPatient,
        ae: mergedAe
      }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Update intake failed:', error)
    return res.status(500).json({ error: 'Failed to update intake' })
  }
})

router.post('/:caseId/attachments', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot add attachments' })
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })

  const incoming = parseAttachments(req.body.attachments || [req.body])
  if (!incoming.length) return res.status(400).json({ error: 'At least one valid attachment is required' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    const nextAttachments = [...(existing.attachments_json || []), ...incoming]
    await pool.execute(
      `UPDATE safety_cases
       SET attachments_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [JSON.stringify(nextAttachments), caseId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_attachment_added',
      metadata: { addedCount: incoming.length }
    })

    return res.status(201).json({ message: 'Attachment(s) added', count: incoming.length })
  } catch (error) {
    console.error('Add attachment failed:', error)
    return res.status(500).json({ error: 'Failed to add attachment' })
  }
})

router.patch('/:caseId/assign-reviewer', async (req, res) => {
  const caseId = Number(req.params.caseId)
  const reviewerUserId = Number(req.body.reviewerUserId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  if (!Number.isInteger(reviewerUserId) || reviewerUserId <= 0) return res.status(400).json({ error: 'Invalid reviewerUserId' })
  if (!canAssignReviewer(req.user.role)) return res.status(403).json({ error: 'Only admin roles can assign reviewers' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    const [[reviewer]] = await pool.execute(
      `SELECT user_id, org_id, client_id, role, status
       FROM users
       WHERE user_id = ?`,
      [reviewerUserId]
    )
    if (!reviewer || reviewer.status !== 'active') {
      return res.status(400).json({ error: 'Reviewer is not active' })
    }
    if (reviewer.role !== ROLES.MEDICAL_REVIEWER) {
      return res.status(400).json({ error: 'Selected user is not a Medical Reviewer' })
    }
    if (Number(reviewer.org_id) !== Number(existing.org_id)) {
      return res.status(400).json({ error: 'Reviewer must belong to the same organisation' })
    }
    if (existing.client_id && reviewer.client_id && Number(reviewer.client_id) !== Number(existing.client_id)) {
      return res.status(400).json({ error: 'Reviewer client scope does not match case client scope' })
    }

    await pool.execute(
      `UPDATE safety_cases
       SET assigned_medical_reviewer_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [reviewerUserId, caseId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_reviewer_assigned',
      beforeValue: { assigned_medical_reviewer_id: existing.assigned_medical_reviewer_id },
      afterValue: { assigned_medical_reviewer_id: reviewerUserId }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Assign reviewer failed:', error)
    return res.status(500).json({ error: 'Failed to assign reviewer' })
  }
})

router.patch('/:caseId/triage', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot update triage' })
  if (!canTriage(req.user.role)) return res.status(403).json({ error: 'Your role cannot triage cases' })

  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })

  const seriousness = req.body.seriousness ? String(req.body.seriousness).trim() : null
  const causality = req.body.causality ? String(req.body.causality).trim() : null
  const priority = req.body.priority ? String(req.body.priority).trim() : null

  if (seriousness && !SERIOUSNESS_OPTIONS.has(seriousness)) return res.status(400).json({ error: 'Invalid seriousness' })
  if (causality && !CAUSALITY_OPTIONS.has(causality)) return res.status(400).json({ error: 'Invalid causality' })
  if (priority && !PRIORITY_OPTIONS.has(priority)) return res.status(400).json({ error: 'Invalid priority' })
  if (!seriousness && !causality && !priority) return res.status(400).json({ error: 'At least one triage field is required' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    if (existing.status === 'closed' && req.user.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Closed cases are triage-locked for this role' })
    }
    if (existing.assigned_medical_reviewer_id && req.user.role === ROLES.SAFETY_SCIENTIST) {
      return res.status(403).json({ error: 'Triage is locked after reviewer assignment for Safety Scientist role' })
    }

    const rules = applyTriageRules({
      seriousness: seriousness || existing.seriousness,
      causality: causality || existing.causality,
      priority: priority || existing.priority,
      hasMedicallyImportantTerm: normalizeText(existing.ae_description).includes('hospital')
    })

    const nextStatus = existing.status === 'new' ? 'triaged' : existing.status
    await pool.execute(
      `UPDATE safety_cases
       SET seriousness = COALESCE(?, seriousness),
           causality = COALESCE(?, causality),
           priority = ?,
           status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [seriousness, causality, rules.finalPriority, nextStatus, caseId]
    )

    if (nextStatus !== existing.status) {
      await pool.execute(
        `INSERT INTO case_workflow_events
          (case_pk_id, org_id, client_id, from_status, to_status, transition_note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [caseId, existing.org_id, existing.client_id, existing.status, nextStatus, 'triage_completed', req.user.userId]
      )
    }

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_triage_updated',
      beforeValue: {
        seriousness: existing.seriousness,
        causality: existing.causality,
        priority: existing.priority,
        status: existing.status
      },
      afterValue: {
        seriousness: seriousness || existing.seriousness,
        causality: causality || existing.causality,
        priority: rules.finalPriority,
        status: nextStatus
      },
      metadata: { triageRuleHits: rules.ruleHits }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Update case triage failed:', error)
    return res.status(500).json({ error: 'Failed to update case triage' })
  }
})

router.post('/:caseId/status', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot update case status' })
  const caseId = Number(req.params.caseId)
  const toStatus = String(req.body.status || '').trim()
  const note = String(req.body.note || '').slice(0, 255)

  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  if (!validateStatus(toStatus)) return res.status(400).json({ error: 'Invalid target status' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    if (existing.status === toStatus) return res.json({ message: 'No change applied', case: existing })
    if (!canTransition(req.user.role, existing.status, toStatus)) {
      return res.status(400).json({ error: `Role ${req.user.role} cannot transition ${existing.status} -> ${toStatus}` })
    }

    await pool.execute(
      `UPDATE safety_cases
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [toStatus, caseId]
    )

    await pool.execute(
      `INSERT INTO case_workflow_events
        (case_pk_id, org_id, client_id, from_status, to_status, transition_note, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [caseId, existing.org_id, existing.client_id, existing.status, toStatus, note || 'status_transition', req.user.userId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_status_updated',
      beforeValue: { status: existing.status },
      afterValue: { status: toStatus },
      metadata: { note: note || null }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Update case status failed:', error)
    return res.status(500).json({ error: 'Failed to update case status' })
  }
})

router.post('/:caseId/exception', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot mark exceptions' })
  const caseId = Number(req.params.caseId)
  const reason = String(req.body.reason || '').trim().slice(0, 255)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  if (!reason) return res.status(400).json({ error: 'reason is required' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined
    if (!canTransition(req.user.role, existing.status, 'exception')) {
      return res.status(400).json({ error: `Role ${req.user.role} cannot move case to exception from ${existing.status}` })
    }

    await pool.execute(
      `UPDATE safety_cases
       SET status = 'exception', exception_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [reason, caseId]
    )

    await pool.execute(
      `INSERT INTO case_workflow_events
        (case_pk_id, org_id, client_id, from_status, to_status, transition_note, changed_by)
       VALUES (?, ?, ?, ?, 'exception', ?, ?)`,
      [caseId, existing.org_id, existing.client_id, existing.status, reason, req.user.userId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_exception_marked',
      beforeValue: { status: existing.status, exception_reason: existing.exception_reason },
      afterValue: { status: 'exception', exception_reason: reason }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Mark exception failed:', error)
    return res.status(500).json({ error: 'Failed to mark case exception' })
  }
})

router.patch('/:caseId/regulatory-clock', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot update regulatory clock' })
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })

  const clockDays = req.body.clockDays !== undefined ? Number(req.body.clockDays) : null
  const receivedAtInput = req.body.receivedAt ? new Date(req.body.receivedAt) : null
  const timezone = req.body.timezone ? String(req.body.timezone).trim().slice(0, 64) : null
  if (clockDays !== null && (!Number.isInteger(clockDays) || clockDays < 1 || clockDays > 90)) {
    return res.status(400).json({ error: 'clockDays must be between 1 and 90' })
  }
  if (receivedAtInput && Number.isNaN(receivedAtInput.getTime())) return res.status(400).json({ error: 'receivedAt must be a valid datetime' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    const nextReceivedAt = receivedAtInput || new Date(existing.received_at)
    const nextClockDays = clockDays || Number(existing.regulatory_clock_days || 15)
    const pausedMinutes = Number(existing.regulatory_total_paused_minutes || 0)
    const nextTimezone = timezone || existing.regulatory_timezone || 'UTC'

    await pool.execute(
      `UPDATE safety_cases
       SET received_at = ?, regulatory_clock_days = ?, regulatory_timezone = ?, updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [nextReceivedAt, nextClockDays, nextTimezone, caseId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_regulatory_clock_updated',
      beforeValue: {
        received_at: existing.received_at,
        regulatory_clock_days: existing.regulatory_clock_days,
        regulatory_due_at: existing.regulatory_due_at,
        regulatory_timezone: existing.regulatory_timezone
      },
      afterValue: {
        received_at: nextReceivedAt,
        regulatory_clock_days: nextClockDays,
        regulatory_timezone: nextTimezone
      }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Update regulatory clock failed:', error)
    return res.status(500).json({ error: 'Failed to update regulatory clock' })
  }
})

router.post('/:caseId/regulatory-clock/action', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot update regulatory clock action' })
  const caseId = Number(req.params.caseId)
  const action = String(req.body.action || '').trim().toLowerCase()
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  if (!REG_CLOCK_ACTIONS.has(action)) return res.status(400).json({ error: 'action must be pause, resume, stop, or start' })

  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    let nextStatus = existing.regulatory_clock_status || 'running'
    let pausedAt = existing.regulatory_paused_at ? new Date(existing.regulatory_paused_at) : null
    let pausedMinutes = Number(existing.regulatory_total_paused_minutes || 0)

    if (action === 'pause' && nextStatus === 'running') {
      nextStatus = 'paused'
      pausedAt = new Date()
    }
    if (action === 'resume' && nextStatus === 'paused') {
      const resumeAt = new Date()
      const diffMin = pausedAt ? Math.max(0, Math.round((resumeAt.getTime() - pausedAt.getTime()) / (60 * 1000))) : 0
      pausedMinutes += diffMin
      nextStatus = 'running'
      pausedAt = null
    }
    if (action === 'stop') {
      nextStatus = 'stopped'
      pausedAt = null
    }
    if (action === 'start') {
      nextStatus = 'running'
      pausedAt = null
    }

    await pool.execute(
      `UPDATE safety_cases
       SET regulatory_clock_status = ?,
           regulatory_paused_at = ?,
           regulatory_total_paused_minutes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE case_pk_id = ?`,
      [nextStatus, pausedAt, pausedMinutes, caseId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: existing.org_id,
      clientId: existing.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_regulatory_clock_action',
      beforeValue: {
        regulatory_clock_status: existing.regulatory_clock_status,
        regulatory_total_paused_minutes: existing.regulatory_total_paused_minutes
      },
      afterValue: {
        regulatory_clock_status: nextStatus,
        regulatory_total_paused_minutes: pausedMinutes
      },
      metadata: { action }
    })

    const updated = await getCaseById(caseId)
    return res.json(updated)
  } catch (error) {
    console.error('Regulatory clock action failed:', error)
    return res.status(500).json({ error: 'Failed to run regulatory clock action' })
  }
})

router.get('/:caseId/sla-checkpoints', async (req, res) => {
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })

  try {
    const row = await getCaseById(caseId)
    if (!row) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, row)) return undefined

    const receivedAt = new Date(row.received_at)
    const checkpoints = [
      {
        code: 'intake_complete',
        label: 'Intake Complete',
        targetAt: addDays(receivedAt, 1),
        met: Boolean(row.case_pk_id)
      },
      {
        code: 'triage_complete',
        label: 'Triage Complete',
        targetAt: addDays(receivedAt, 2),
        met: ['triaged', 'in_review', 'closed', 'exception'].includes(row.status)
      },
      {
        code: 'medical_review_started',
        label: 'Medical Review Started',
        targetAt: addDays(receivedAt, 3),
        met: ['in_review', 'closed'].includes(row.status)
      },
      {
        code: 'regulatory_due',
        label: 'Regulatory Due',
        targetAt: row.regulatory_due_at ? new Date(row.regulatory_due_at) : null,
        met: row.status === 'closed'
      }
    ].map((item) => ({
      ...item,
      targetAt: item.targetAt ? item.targetAt.toISOString() : null,
      isBreached: !item.met && item.targetAt ? new Date(item.targetAt).getTime() < Date.now() : false
    }))

    return res.json({ caseId, checkpoints })
  } catch (error) {
    console.error('Fetch SLA checkpoints failed:', error)
    return res.status(500).json({ error: 'Failed to fetch SLA checkpoints' })
  }
})

router.get('/:caseId/workflow', async (req, res) => {
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    const [rows] = await pool.execute(
      `SELECT event_id, from_status, to_status, transition_note, changed_by, changed_at
       FROM case_workflow_events
       WHERE case_pk_id = ?
       ORDER BY changed_at DESC`,
      [caseId]
    )
    return res.json(rows)
  } catch (error) {
    console.error('Fetch case workflow failed:', error)
    return res.status(500).json({ error: 'Failed to fetch case workflow' })
  }
})

router.get('/:caseId/audit', async (req, res) => {
  const caseId = Number(req.params.caseId)
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)))
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const existing = await getCaseById(caseId)
    if (!existing) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, existing)) return undefined

    const [rows] = await pool.execute(
      `SELECT audit_id, actor_user_id, action_type, before_value, after_value, metadata, created_at
       FROM case_record_audit
       WHERE case_pk_id = ?
       ORDER BY created_at DESC
       LIMIT ${Number.isFinite(limit) ? limit : 200}`,
      [caseId]
    )
    return res.json(rows.map((row) => ({
      ...row,
      before_value: parseJsonField(row.before_value),
      after_value: parseJsonField(row.after_value),
      metadata: parseJsonField(row.metadata)
    })))
  } catch (error) {
    console.error('Fetch case audit failed:', error)
    return res.status(500).json({ error: 'Failed to fetch case audit' })
  }
})

router.get('/:caseId/duplicates', async (req, res) => {
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const row = await getCaseById(caseId)
    if (!row) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, row)) return undefined

    const onsetWindowDays = parseDuplicateWindowDays(
      await getConfigValue(row.org_id, 'duplicate_precheck_onset_window_days', '30')
    )

    const matches = await findPotentialDuplicates({
      orgId: row.org_id,
      clientId: row.client_id,
      patientReference: row.patient_reference,
      patientSex: row.patient_json?.sex || null,
      patientAgeYears: row.patient_json?.ageYears ?? null,
      patientWeightKg: row.patient_json?.weightKg ?? null,
      aeOnsetDate: row.ae_onset_date || row.ae_json?.onsetDate || null,
      onsetDateWindowDays: onsetWindowDays,
      suspectProductId: row.suspect_product_id,
      aeDescription: row.ae_description,
      excludeCaseId: row.case_pk_id
    })
    return res.json(matches)
  } catch (error) {
    console.error('Fetch case duplicates failed:', error)
    return res.status(500).json({ error: 'Failed to fetch case duplicates' })
  }
})

router.get('/:caseId/narrative', async (req, res) => {
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const row = await getCaseById(caseId)
    if (!row) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, row)) return undefined

    const [rows] = await pool.execute(
      `SELECT narrative_id, narrative_version, narrative_text, generated_by, approved_by, approved_at, created_at
       FROM case_narratives
       WHERE case_pk_id = ?
       ORDER BY narrative_version DESC`,
      [caseId]
    )
    return res.json(rows)
  } catch (error) {
    console.error('Fetch case narrative failed:', error)
    return res.status(500).json({ error: 'Failed to fetch case narrative' })
  }
})

router.post('/:caseId/narrative/generate', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot generate narrative' })
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const row = await getCaseById(caseId)
    if (!row) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, row)) return undefined

    const [[versionRow]] = await pool.execute(
      'SELECT COALESCE(MAX(narrative_version), 0) AS max_version FROM case_narratives WHERE case_pk_id = ?',
      [caseId]
    )
    const nextVersion = Number(versionRow.max_version || 0) + 1

    const narrativeText = [
      `Case ${row.case_number} was received on ${new Date(row.received_at).toISOString()}.`,
      `Reporter: ${row.reporter_name}; Patient reference: ${row.patient_reference}.`,
      `Adverse event: ${row.ae_description}.`,
      `Suspect product: ${row.suspect_product_name || row.suspect_product_id}.`,
      `Triage: seriousness=${row.seriousness}, causality=${row.causality}, priority=${row.priority}.`,
      `Current workflow status: ${row.status}.`
    ].join(' ')

    const [result] = await pool.execute(
      `INSERT INTO case_narratives
        (case_pk_id, org_id, client_id, narrative_version, narrative_text, generated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [caseId, row.org_id, row.client_id, nextVersion, narrativeText, req.user.userId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: row.org_id,
      clientId: row.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_narrative_generated',
      metadata: { narrativeVersion: nextVersion }
    })

    return res.status(201).json({
      narrative_id: result.insertId,
      narrative_version: nextVersion,
      narrative_text: narrativeText
    })
  } catch (error) {
    console.error('Generate case narrative failed:', error)
    return res.status(500).json({ error: 'Failed to generate case narrative' })
  }
})

router.patch('/:caseId/narrative/:narrativeId', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot update narrative' })
  const caseId = Number(req.params.caseId)
  const narrativeId = Number(req.params.narrativeId)
  if (!Number.isInteger(caseId) || caseId <= 0 || !Number.isInteger(narrativeId) || narrativeId <= 0) {
    return res.status(400).json({ error: 'Invalid ids' })
  }

  const narrativeText = req.body.narrativeText ? String(req.body.narrativeText) : null
  const approve = Boolean(req.body.approve)
  if (!narrativeText && !approve) {
    return res.status(400).json({ error: 'narrativeText or approve=true is required' })
  }

  try {
    const caseRow = await getCaseById(caseId)
    if (!caseRow) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, caseRow)) return undefined

    const [[currentNarrative]] = await pool.execute(
      `SELECT narrative_id, narrative_text, approved_by, approved_at
       FROM case_narratives
       WHERE narrative_id = ? AND case_pk_id = ?`,
      [narrativeId, caseId]
    )
    if (!currentNarrative) return res.status(404).json({ error: 'Narrative not found' })

    await pool.execute(
      `UPDATE case_narratives
       SET narrative_text = COALESCE(?, narrative_text),
           approved_by = CASE WHEN ? THEN ? ELSE approved_by END,
           approved_at = CASE WHEN ? THEN NOW() ELSE approved_at END
       WHERE narrative_id = ?`,
      [narrativeText, approve ? 1 : 0, req.user.userId, approve ? 1 : 0, narrativeId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: caseRow.org_id,
      clientId: caseRow.client_id,
      actorUserId: req.user.userId,
      actionType: approve ? 'case_narrative_approved' : 'case_narrative_updated',
      beforeValue: { narrative_text: currentNarrative.narrative_text, approved_by: currentNarrative.approved_by },
      afterValue: { narrative_text: narrativeText || currentNarrative.narrative_text, approved_by: approve ? req.user.userId : currentNarrative.approved_by }
    })

    return res.json({ message: 'Narrative updated' })
  } catch (error) {
    console.error('Update narrative failed:', error)
    return res.status(500).json({ error: 'Failed to update narrative' })
  }
})

router.get('/:caseId/listedness', async (req, res) => {
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })
  try {
    const caseRow = await getCaseById(caseId)
    if (!caseRow) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, caseRow)) return undefined

    const [rows] = await pool.execute(
      `SELECT assessment_id, expectedness, listedness, source_label, rationale, assessed_by, assessed_at
       FROM case_listedness_assessments
       WHERE case_pk_id = ?
       ORDER BY assessed_at DESC`,
      [caseId]
    )
    return res.json(rows)
  } catch (error) {
    console.error('Fetch listedness failed:', error)
    return res.status(500).json({ error: 'Failed to fetch listedness' })
  }
})

router.post('/:caseId/listedness', async (req, res) => {
  if (!canWriteCase(req.user.role)) return res.status(403).json({ error: 'Read-only users cannot assess listedness' })
  const caseId = Number(req.params.caseId)
  if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json({ error: 'Invalid case id' })

  const listedness = String(req.body.listedness || '').trim().toLowerCase()
  const expectedness = String(req.body.expectedness || '').trim().toLowerCase()
  const sourceReference = String(req.body.sourceReference || req.body.sourceLabel || '').trim().slice(0, 160)
  const rationale = String(req.body.rationale || '').trim()

  if (!LISTEDNESS_OPTIONS.has(listedness)) {
    return res.status(400).json({ error: 'listedness must be listed, unlisted, or unknown' })
  }
  if (!EXPECTEDNESS_OPTIONS.has(expectedness)) {
    return res.status(400).json({ error: 'expectedness must be expected, unexpected, or unknown' })
  }
  if (!sourceReference) {
    return res.status(400).json({ error: 'sourceReference is required' })
  }

  try {
    const caseRow = await getCaseById(caseId)
    if (!caseRow) return res.status(404).json({ error: 'Case not found' })
    if (!assertCaseScope(req, res, caseRow)) return undefined

    const [result] = await pool.execute(
      `INSERT INTO case_listedness_assessments
        (case_pk_id, org_id, client_id, expectedness, listedness, source_label, rationale, assessed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [caseId, caseRow.org_id, caseRow.client_id, expectedness, listedness, sourceReference, rationale || null, req.user.userId]
    )

    await logCaseAudit({
      connection: pool,
      casePkId: caseId,
      orgId: caseRow.org_id,
      clientId: caseRow.client_id,
      actorUserId: req.user.userId,
      actionType: 'case_listedness_assessed',
      afterValue: { expectedness, listedness, sourceReference }
    })

    return res.status(201).json({
      assessment_id: result.insertId,
      expectedness,
      listedness,
      source_label: sourceReference
    })
  } catch (error) {
    console.error('Assess listedness failed:', error)
    return res.status(500).json({ error: 'Failed to assess listedness' })
  }
})

module.exports = router
