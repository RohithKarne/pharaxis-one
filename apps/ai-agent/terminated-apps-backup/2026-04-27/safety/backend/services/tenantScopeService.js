const { pool } = require('../database/db')
const { ROLES } = require('../constants')

async function getOrganisation(orgId) {
  const [[org]] = await pool.execute(
    'SELECT org_id, org_name, org_type, status FROM organisations WHERE org_id = ?',
    [orgId]
  )
  return org || null
}

async function getClient(clientId) {
  const [[client]] = await pool.execute(
    'SELECT client_id, parent_org_id, client_name, status FROM pharma_clients WHERE client_id = ?',
    [clientId]
  )
  return client || null
}

function requiresClientForCroRole(role) {
  return [ROLES.SAFETY_SCIENTIST, ROLES.MEDICAL_REVIEWER, ROLES.READ_ONLY].includes(role)
}

async function resolveClientScope({
  orgId,
  clientId,
  requireClientForCro = false,
  allowInactiveClient = false
}) {
  const org = await getOrganisation(orgId)
  if (!org) {
    return { error: 'Organisation not found' }
  }

  if (org.status !== 'active') {
    return { error: 'Organisation is inactive' }
  }

  if (org.org_type !== 'CRO') {
    if (clientId !== null && clientId !== undefined && clientId !== '') {
      return {
        error: `clientId is only valid for CRO organisations. ${org.org_name} is ${org.org_type}`
      }
    }
    return { org, client: null, resolvedClientId: null }
  }

  if (clientId === null || clientId === undefined || clientId === '') {
    if (requireClientForCro) {
      return { error: 'clientId is required for CRO records in this operation' }
    }
    return { org, client: null, resolvedClientId: null }
  }

  const numericClientId = Number(clientId)
  if (!Number.isInteger(numericClientId) || numericClientId <= 0) {
    return { error: 'Invalid client id' }
  }

  const client = await getClient(numericClientId)
  if (!client || Number(client.parent_org_id) !== Number(orgId)) {
    return { error: 'Client does not belong to the selected organisation' }
  }

  if (!allowInactiveClient && client.status !== 'active') {
    return { error: 'Cannot use inactive client' }
  }

  return { org, client, resolvedClientId: numericClientId }
}

module.exports = {
  getOrganisation,
  getClient,
  resolveClientScope,
  requiresClientForCroRole
}
