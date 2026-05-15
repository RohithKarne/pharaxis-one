/**
 * SetupFieldConfiguration.jsx — MIMS Admin > System > Setup > Field Configuration
 *
 * Advanced field-level admin: field type, custom label, help text, max length,
 * default value, picklist source binding, lookup target, sensitive + masking,
 * and flex field add/delete.
 *
 * Pairs with Customize Forms — that screen is per-tenant tuning (required /
 * disabled / sort / label), this screen is the structural config layer.
 *
 * Wraps AdminPicklistsSection contentSection="field-setup" from legacy admin.
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import AdminPicklistsSection from '../../../admin/components/AdminPicklistsSection'

export default function SetupFieldConfiguration() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [flash, setFlash] = useState(null)
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(id)
  }, [flash])

  function showFlash(text, type = 'success') { setFlash({ text, type }) }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
      {flash && (
        <div style={{
          padding: '10px 14px', marginBottom: 14, borderRadius: 7,
          fontSize: 13, fontWeight: 600,
          background: flash.type === 'error' ? '#fdecea' : '#e6f9ee',
          color:      flash.type === 'error' ? '#b91c1c' : '#1a7a3f',
          border:     `1px solid ${flash.type === 'error' ? '#f5c6c6' : '#a7f3c1'}`,
        }}>{flash.text}</div>
      )}
      <AdminPicklistsSection contentSection="field-setup" H={H} flash={showFlash} />
    </div>
  )
}
