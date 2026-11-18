import { useMemo } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'

// Existing Admin consumers use tenantId to scope their requests. The signed-in
// organisation is the only source of that scope.
export function useAdminTenant() {
  const { orgId, allOrgs } = useAuth()
  const tenants = useMemo(() => allOrgs.map(org => ({ id: org.orgId, name: org.orgName })), [allOrgs])
  return { tenantId: orgId == null ? '' : String(orgId), tenants }
}
