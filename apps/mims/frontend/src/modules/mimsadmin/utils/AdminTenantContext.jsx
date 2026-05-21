/**
 * AdminTenantContext — shared "currently selected tenant" across MIMS admin tabs.
 *
 * Persisted in localStorage (key: mims_admin_tenant_id) so the picker remembers
 * the last tenant across sessions. Falls back to the first active tenant on
 * first load.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const KEY = 'mims_admin_tenant_id'

const AdminTenantCtx = createContext({
  tenantId: '',
  tenants: [],
  setTenantId: () => {},
  loading: true,
})

export function AdminTenantProvider({ token, children }) {
  const [tenantId, setTenantIdState] = useState(() => {
    try { return localStorage.getItem(KEY) || '' } catch { return '' }
  })
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    const H = { Authorization: `Bearer ${token}` }
    httpFetch('/api/admin/users/orgs', { headers: H })
      .then(r => r.json())
      .then(d => {
        const list = (d.orgs || []).filter(t => t.is_active)
        setTenants(list)
        // If no tenant currently chosen, or chosen one is no longer active, pick first.
        const isValid = list.some(t => String(t.id) === String(tenantId))
        if (!isValid && list.length) {
          const fallback = String(list[0].id)
          setTenantIdState(fallback)
          try { localStorage.setItem(KEY, fallback) } catch { /* localStorage unavailable */ }
        }
      })
      .catch(() => setTenants([]))
      .finally(() => setLoading(false))
  }, [tenantId, token])

  const setTenantId = useCallback((id) => {
    setTenantIdState(String(id))
    try { localStorage.setItem(KEY, String(id)) } catch { /* localStorage unavailable */ }
  }, [])

  const value = useMemo(() => ({ tenantId, tenants, setTenantId, loading: token ? loading : false }), [tenantId, tenants, setTenantId, loading, token])
  return <AdminTenantCtx.Provider value={value}>{children}</AdminTenantCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminTenant() {
  return useContext(AdminTenantCtx)
}
