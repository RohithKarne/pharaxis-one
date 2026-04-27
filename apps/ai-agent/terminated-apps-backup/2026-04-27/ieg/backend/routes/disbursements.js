const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { logAudit } = require('../services/auditService')
const { actorFromAuth } = require('../utils/actor')

const router = express.Router()
router.use(requireAuth, requireInternal)

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

function xmlEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value)
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

router.get('/', async (req, res) => {
  const moduleKey = req.query.moduleKey
  const params = []
  let where = ''
  if (moduleKey) {
    params.push(moduleKey)
    where = `WHERE module_key = $${params.length}`
  }
  const { rows } = await query(`SELECT * FROM ieg_disbursements ${where} ORDER BY created_at DESC`, params)
  return res.json({ disbursements: rows })
})

router.post('/', async (req, res) => {
  const {
    moduleKey,
    entityType,
    entityId,
    milestoneName,
    amount,
    currency = 'USD',
    status = 'approved',
    externalReference = null,
    payload = {}
  } = req.body || {}

  if (!moduleKey || !entityType || !entityId || !amount) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId, amount are required' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_disbursements
      (module_key, entity_type, entity_id, milestone_name, amount, currency, status, external_reference, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `,
    [moduleKey, entityType, String(entityId), milestoneName, amount, currency, status, externalReference, JSON.stringify(payload)]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType: 'disbursement',
    entityId: String(rows[0].id),
    action: 'disbursement_record_created',
    metadata: rows[0]
  })

  return res.status(201).json({ disbursement: rows[0] })
})

router.get('/open-payments-export', async (_req, res) => {
  const format = String(_req.query.format || 'json').toLowerCase()
  const { rows } = await query(
    `
      SELECT
        ga.application_code,
        ga.applicant_name,
        ga.country_code,
        gd.decision,
        COALESCE(gd.approved_amount, ga.requested_amount) AS funded_amount,
        d.status AS disbursement_status,
        d.created_at AS recorded_at
      FROM ieg_grant_applications ga
      LEFT JOIN ieg_grant_decisions gd ON gd.grant_application_id = ga.id
      LEFT JOIN ieg_disbursements d ON d.entity_type = 'grant_application' AND d.entity_id = ga.id::text
      ORDER BY ga.created_at DESC
    `
  )

  const mapped = rows.map((row) => ({
    applicationCode: row.application_code,
    recipientName: row.applicant_name,
    countryCode: row.country_code,
    decision: row.decision || 'pending',
    fundedAmountUsd: Number(row.funded_amount || 0),
    disbursementStatus: row.disbursement_status || 'not_recorded',
    recordedAt: row.recorded_at
  }))

  if (format === 'csv') {
    const header = [
      'applicationCode',
      'recipientName',
      'countryCode',
      'decision',
      'fundedAmountUsd',
      'disbursementStatus',
      'recordedAt'
    ]
    const body = mapped.map((record) => header.map((key) => csvEscape(record[key])).join(',')).join('\n')
    const csv = `${header.join(',')}\n${body}`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=\"open-payments-export.csv\"')
    return res.send(csv)
  }

  if (format === 'xml') {
    const xmlRows = mapped.map((record) => (
      `  <record>
    <applicationCode>${xmlEscape(record.applicationCode)}</applicationCode>
    <recipientName>${xmlEscape(record.recipientName)}</recipientName>
    <countryCode>${xmlEscape(record.countryCode)}</countryCode>
    <decision>${xmlEscape(record.decision)}</decision>
    <fundedAmountUsd>${xmlEscape(record.fundedAmountUsd)}</fundedAmountUsd>
    <disbursementStatus>${xmlEscape(record.disbursementStatus)}</disbursementStatus>
    <recordedAt>${xmlEscape(record.recordedAt)}</recordedAt>
  </record>`
    )).join('\n')
    const xml = `<openPaymentsExport generatedAt=\"${xmlEscape(new Date().toISOString())}\">\n${xmlRows}\n</openPaymentsExport>`
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=\"open-payments-export.xml\"')
    return res.send(xml)
  }

  return res.json({
    format: 'open_payments_us_v1',
    generatedAt: new Date().toISOString(),
    records: mapped
  })
})

module.exports = router
