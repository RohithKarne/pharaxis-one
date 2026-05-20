/**
 * Organizations.jsx — MIMS Admin top-level tab
 *
 * Manages tenants (organisations) + sites + per-org 2FA + session timeout + logos.
 * Reuses OrganisationsView from the legacy admin-compatibility folder (will be moved
 * inline once the platform admin module cleanup is complete). Canonical backend route
 * is `/api/admin/platform/orgs*`.
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import OrganisationsView from '../OrganisationsView'

export default function Organizations() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const [flash, setFlash] = useState(null)

  // Auto-clear flash after 3s
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(id)
  }, [flash])

  function showFlash(text, type = 'success') {
    setFlash({ text, type })
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
      {flash && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 7,
          fontSize: 13, fontWeight: 600,
          background: flash.type === 'error' ? '#fdecea' : '#e6f9ee',
          color:      flash.type === 'error' ? '#b91c1c' : '#1a7a3f',
          border:     `1px solid ${flash.type === 'error' ? '#f5c6c6' : '#a7f3c1'}`,
        }}>
          {flash.text}
        </div>
      )}
      <OrganisationsView H={H} flash={showFlash} />
    </div>
  )
}
