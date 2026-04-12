function resolveTenantIdForRequest(req, explicitTenantId) {
  if (req.user?.isSuperadmin) {
    const tenantId = Number(explicitTenantId)
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      const error = new Error('tenantId is required for super admin context')
      error.statusCode = 400
      throw error
    }
    return tenantId
  }

  const tenantId = Number(req.user?.tenantId)
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    const error = new Error('Tenant context is missing for this user')
    error.statusCode = 403
    throw error
  }

  return tenantId
}

function assertTenantScope(req, recordTenantId) {
  if (req.user?.isSuperadmin) return
  if (Number(recordTenantId) !== Number(req.user?.tenantId)) {
    const error = new Error('Record not found')
    error.statusCode = 404
    throw error
  }
}

module.exports = {
  resolveTenantIdForRequest,
  assertTenantScope
}
