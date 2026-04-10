const { pool } = require('../database/db')

const DEFAULT_STATES = [
  { state_name: 'Draft', state_code: 'draft', is_initial: 1, is_terminal: 0 },
  { state_name: 'In Review', state_code: 'in_review', is_initial: 0, is_terminal: 0 },
  { state_name: 'Approved', state_code: 'approved', is_initial: 0, is_terminal: 0 },
  { state_name: 'Published', state_code: 'published', is_initial: 0, is_terminal: 0 },
  { state_name: 'Archived', state_code: 'archived', is_initial: 0, is_terminal: 1 }
]

const DEFAULT_TRANSITIONS = [
  { from_state: 'draft', to_state: 'in_review', allowed_roles: 'author,admin' },
  { from_state: 'in_review', to_state: 'approved', allowed_roles: 'approver,admin' },
  { from_state: 'in_review', to_state: 'draft', allowed_roles: 'reviewer,approver,admin' },
  { from_state: 'approved', to_state: 'published', allowed_roles: 'admin,approver' },
  { from_state: 'published', to_state: 'archived', allowed_roles: 'admin' },
  { from_state: 'archived', to_state: 'draft', allowed_roles: 'admin' }
]

function roleAllowed(allowedRolesCsv, role) {
  if (!allowedRolesCsv) return false
  const set = new Set(
    String(allowedRolesCsv)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )
  return set.has(role)
}

async function ensureDefaultLifecycleForType(orgId, contentTypeId, connectionArg = null) {
  const connection = connectionArg || (await pool.getConnection())
  const ownsConnection = !connectionArg

  try {
    if (ownsConnection) await connection.beginTransaction()

    const [[stateCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM lifecycle_states WHERE org_id = ? AND content_type_id = ?',
      [orgId, contentTypeId]
    )

    if (Number(stateCount.total) === 0) {
      for (const state of DEFAULT_STATES) {
        await connection.execute(
          `INSERT INTO lifecycle_states (org_id, content_type_id, state_name, state_code, is_initial, is_terminal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orgId, contentTypeId, state.state_name, state.state_code, state.is_initial, state.is_terminal]
        )
      }
    }

    const [[transitionCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM lifecycle_transitions WHERE org_id = ? AND content_type_id = ?',
      [orgId, contentTypeId]
    )

    if (Number(transitionCount.total) === 0) {
      for (const transition of DEFAULT_TRANSITIONS) {
        await connection.execute(
          `INSERT INTO lifecycle_transitions (org_id, content_type_id, from_state, to_state, allowed_roles)
           VALUES (?, ?, ?, ?, ?)`,
          [orgId, contentTypeId, transition.from_state, transition.to_state, transition.allowed_roles]
        )
      }
    }

    if (ownsConnection) await connection.commit()
    return true
  } catch (error) {
    if (ownsConnection) await connection.rollback()
    throw error
  } finally {
    if (ownsConnection) connection.release()
  }
}

async function transition(orgId, contentId, toState, userId, role, connectionArg = null) {
  const connection = connectionArg || (await pool.getConnection())
  const ownsConnection = !connectionArg

  try {
    if (ownsConnection) await connection.beginTransaction()

    const [[content]] = await connection.execute(
      `SELECT id, org_id, content_type_id, lifecycle_state
       FROM vault_content
       WHERE id = ? AND org_id = ?
       FOR UPDATE`,
      [contentId, orgId]
    )

    if (!content) {
      const error = new Error('Content not found')
      error.code = 'NOT_FOUND'
      throw error
    }

    if (content.lifecycle_state === toState) {
      if (ownsConnection) await connection.commit()
      return {
        content,
        changed: false,
        before_state: content.lifecycle_state,
        after_state: toState
      }
    }

    const [[rule]] = await connection.execute(
      `SELECT id, allowed_roles
       FROM lifecycle_transitions
       WHERE org_id = ?
         AND content_type_id = ?
         AND from_state = ?
         AND to_state = ?`,
      [orgId, content.content_type_id, content.lifecycle_state, toState]
    )

    if (!rule || !roleAllowed(rule.allowed_roles, role)) {
      const error = new Error('Transition not allowed for this role')
      error.code = 'FORBIDDEN'
      throw error
    }

    await connection.execute(
      'UPDATE vault_content SET lifecycle_state = ?, updated_at = NOW() WHERE id = ? AND org_id = ?',
      [toState, contentId, orgId]
    )

    const [[updated]] = await connection.execute(
      `SELECT id, org_id, content_type_id, lifecycle_state
       FROM vault_content
       WHERE id = ? AND org_id = ?`,
      [contentId, orgId]
    )

    if (ownsConnection) await connection.commit()

    return {
      content: updated,
      changed: true,
      before_state: content.lifecycle_state,
      after_state: updated.lifecycle_state,
      user_id: userId,
      role
    }
  } catch (error) {
    if (ownsConnection) await connection.rollback()
    throw error
  } finally {
    if (ownsConnection) connection.release()
  }
}

module.exports = {
  ensureDefaultLifecycleForType,
  transition
}
