const { pool } = require('../database/db')

const WORKFLOW_RBAC_CONFIG_KEY = 'workflow_rbac_policy_v1'

const DEFAULT_ACTION_ROLE_MATRIX = {
  task_reassign: ['admin', 'reviewer', 'approver'],
  task_delegate: ['admin', 'reviewer', 'approver'],
  task_comment_view: ['admin', 'author', 'reviewer', 'approver', 'viewer'],
  task_comment_create: ['admin', 'author', 'reviewer', 'approver'],
  task_sign: ['admin', 'reviewer', 'approver'],
  task_start: ['admin', 'author', 'reviewer', 'approver'],
  task_start_from_template: ['admin', 'author', 'reviewer', 'approver']
}

function normalizeRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return []
  return Array.from(new Set(
    rawRoles
      .map(role => String(role || '').trim().toLowerCase())
      .filter(role => ['admin', 'author', 'reviewer', 'approver', 'viewer'].includes(role))
  ))
}

function normalizeMatrix(rawMatrix) {
  const normalized = {}
  for (const action of Object.keys(DEFAULT_ACTION_ROLE_MATRIX)) {
    const roles = normalizeRoles(rawMatrix?.[action])
    normalized[action] = roles.length ? roles : DEFAULT_ACTION_ROLE_MATRIX[action]
  }
  return normalized
}

function defaultPolicy() {
  return {
    version: 1,
    action_role_matrix: normalizeMatrix(DEFAULT_ACTION_ROLE_MATRIX)
  }
}

async function getWorkflowRbacPolicy(orgId) {
  const [[row]] = await pool.execute(
    `SELECT config_value
     FROM org_config
     WHERE org_id = ? AND config_key = ?
     LIMIT 1`,
    [orgId, WORKFLOW_RBAC_CONFIG_KEY]
  )
  if (!row?.config_value) return defaultPolicy()

  try {
    const parsed = JSON.parse(row.config_value)
    return {
      version: Number.isInteger(parsed?.version) ? parsed.version : 1,
      action_role_matrix: normalizeMatrix(parsed?.action_role_matrix)
    }
  } catch {
    return defaultPolicy()
  }
}

async function setWorkflowRbacPolicy(orgId, payload) {
  const previous = await getWorkflowRbacPolicy(orgId)
  const nextVersion = Number(previous.version || 1) + 1
  const policy = {
    version: nextVersion,
    action_role_matrix: normalizeMatrix(payload?.action_role_matrix)
  }
  await pool.execute(
    `INSERT INTO org_config (org_id, config_key, config_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
    [orgId, WORKFLOW_RBAC_CONFIG_KEY, JSON.stringify(policy)]
  )
  return policy
}

async function isWorkflowActionAllowed(orgId, role, action) {
  const policy = await getWorkflowRbacPolicy(orgId)
  const roleNormalized = String(role || '').toLowerCase()
  const allowedRoles = policy.action_role_matrix[action] || []
  return {
    allowed: allowedRoles.includes(roleNormalized),
    allowed_roles: allowedRoles,
    policy_version: policy.version
  }
}

module.exports = {
  WORKFLOW_RBAC_CONFIG_KEY,
  DEFAULT_ACTION_ROLE_MATRIX,
  getWorkflowRbacPolicy,
  setWorkflowRbacPolicy,
  isWorkflowActionAllowed
}
