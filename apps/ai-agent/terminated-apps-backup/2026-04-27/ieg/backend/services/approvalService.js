const { query } = require('../database/db')

function amountInRange({ amount, minValue, maxValue }) {
  const numericAmount = Number(amount || 0)
  const min = minValue === null || minValue === undefined ? Number.NEGATIVE_INFINITY : Number(minValue)
  const max = maxValue === null || maxValue === undefined ? Number.POSITIVE_INFINITY : Number(maxValue)
  return numericAmount >= min && numericAmount <= max
}

async function resolveApprovalMatrix({ moduleKey, requestType, geography = 'US', amount = 0 }) {
  const { rows } = await query(
    `
      SELECT *
      FROM ieg_approval_matrix
      WHERE module_key = $1 AND request_type = $2 AND geography = $3 AND is_active = TRUE
      ORDER BY created_at DESC
    `,
    [moduleKey, requestType, geography]
  )

  const matched = rows.find((row) => amountInRange({ amount, minValue: row.min_value, maxValue: row.max_value }))
  return matched || null
}

async function usersForRole({ moduleKey, role }) {
  const { rows } = await query(
    `
      SELECT u.id, u.email, u.full_name, u.role
      FROM ieg_users u
      INNER JOIN ieg_user_modules um ON um.user_id = u.id
      WHERE um.module_key = $1 AND u.role = $2 AND u.is_active = TRUE
      ORDER BY u.id ASC
    `,
    [moduleKey, role]
  )

  return rows
}

module.exports = {
  resolveApprovalMatrix,
  usersForRole
}
