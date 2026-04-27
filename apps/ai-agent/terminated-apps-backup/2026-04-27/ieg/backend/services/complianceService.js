const { query } = require('../database/db')

async function seedDefaultRulesIfMissing() {
  const { rows } = await query('SELECT COUNT(*)::int AS count FROM ieg_compliance_rules')
  if (rows[0].count > 0) return

  const defaults = [
    {
      jurisdiction: 'US',
      moduleKey: 'grants',
      ruleKey: 'open_payments_high_value',
      severity: 'medium',
      threshold: { maxAmountUSD: 250000 },
      message: 'Requested amount crosses Open Payments baseline threshold.'
    },
    {
      jurisdiction: 'US',
      moduleKey: 'grants',
      ruleKey: 'coi_declared',
      severity: 'high',
      threshold: { requireAcknowledgement: true },
      message: 'COI declared by applicant/reviewer. Acknowledge before proceeding.'
    },
    {
      jurisdiction: 'US',
      moduleKey: 'iit',
      ruleKey: 'fmv_out_of_range',
      severity: 'high',
      threshold: { maxVariancePercent: 20 },
      message: 'IIT budget variance is outside FMV benchmark range.'
    }
  ]

  for (const rule of defaults) {
    await query(
      `
        INSERT INTO ieg_compliance_rules
        (jurisdiction, module_key, rule_key, severity, threshold, message)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [rule.jurisdiction, rule.moduleKey, rule.ruleKey, rule.severity, JSON.stringify(rule.threshold), rule.message]
    )
  }
}

function calculateVariancePercent(reference, actual) {
  if (!reference || Number(reference) === 0) return 0
  return Math.abs((Number(actual) - Number(reference)) / Number(reference)) * 100
}

async function evaluateGrantCompliance({ requestedAmount, coiDeclared }) {
  const warnings = []
  const { rows: rules } = await query(
    `SELECT * FROM ieg_compliance_rules WHERE is_active = TRUE AND module_key IN ('grants', 'shared')`
  )

  for (const rule of rules) {
    if (rule.rule_key === 'open_payments_high_value') {
      const maxAmount = Number(rule.threshold?.maxAmountUSD || 0)
      if (Number(requestedAmount) > maxAmount) {
        warnings.push({ ruleKey: rule.rule_key, message: rule.message, severity: rule.severity })
      }
    }

    if (rule.rule_key === 'coi_declared' && coiDeclared) {
      warnings.push({ ruleKey: rule.rule_key, message: rule.message, severity: rule.severity })
    }
  }

  return warnings
}

async function evaluateIitCompliance({ requestedAmount, fmvReferenceValue }) {
  const warnings = []
  const { rows: rules } = await query(
    `SELECT * FROM ieg_compliance_rules WHERE is_active = TRUE AND module_key IN ('iit', 'shared')`
  )

  for (const rule of rules) {
    if (rule.rule_key === 'fmv_out_of_range') {
      const maxVariance = Number(rule.threshold?.maxVariancePercent || 20)
      const variance = calculateVariancePercent(fmvReferenceValue, requestedAmount)
      if (variance > maxVariance) {
        warnings.push({
          ruleKey: rule.rule_key,
          message: `${rule.message} Variance: ${variance.toFixed(2)}%.`,
          severity: rule.severity,
          variancePercent: variance
        })
      }
    }
  }

  return warnings
}

module.exports = {
  seedDefaultRulesIfMissing,
  evaluateGrantCompliance,
  evaluateIitCompliance
}
