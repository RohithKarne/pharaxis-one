/**
 * CloneCaseButton — Theme 8 (Wave 4) one-click case clone.
 *
 * Props:
 *   caseId      — source case
 *   onCloned?   — (new_case_id) => void
 *   variant?    — 'primary' (default) | 'ghost'
 */

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function CloneCaseButton({ caseId, onCloned, variant = 'primary', label = 'Clone' }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme8_smart_actions')
  const [busy, setBusy] = useState(false)

  async function clone() {
    if (!confirm('Create a copy of this case as a new draft?')) return
    setBusy(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const d = await r.json()
      if (d.new_case_id) onCloned?.(d.new_case_id)
      else alert(d.error || 'Clone failed')
    } finally { setBusy(false) }
  }

  if (!enabled) return null
  const style = variant === 'ghost'
    ? { background: 'transparent', color: '#1a4f9c', border: '1px solid #1a4f9c' }
    : { background: '#1a4f9c', color: '#fff', border: '1px solid #1a4f9c' }
  return (
    <button onClick={clone} disabled={busy} style={{
      padding: '6px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600,
      cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, ...style,
    }}>📋 {busy ? 'Cloning…' : label}</button>
  )
}
