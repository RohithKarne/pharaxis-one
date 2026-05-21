/**
 * LockedFieldBadge — Theme 9 (Wave 5) lock indicator for any field.
 *
 * Probes /api/compliance/field-locks/check for a given (section,field,status).
 * Renders a small 🔒 chip when the field is locked.
 *
 * Props:
 *   section, field — required
 *   caseStatus     — the case's current status (drives lock evaluation)
 *   onLockChange?  — (lockInfo) => void  (caller can disable the input)
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function LockedFieldBadge({ section, field, caseStatus, onLockChange }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme9_compliance')
  const [info, setInfo] = useState({ locked: false })

  useEffect(() => {
    if (!enabled || !section || !field || !caseStatus) return
    httpFetch('/api/compliance/field-locks/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ section, field, status: caseStatus }),
    })
      .then(r => r.json())
      .then(d => { setInfo(d); onLockChange?.(d) })
      .catch(() => setInfo({ locked: false }))
  }, [enabled, section, field, caseStatus, token, onLockChange])

  if (!enabled || !section || !field || !caseStatus || !info.locked) return null
  return (
    <span title={info.reason || 'Locked by compliance rule'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      marginLeft: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700,
      borderRadius: 10, background: '#fff4d6', color: '#8a6a00',
      border: '1px solid #ffe082',
    }}>🔒 {info.mode === 'admin_only' ? 'admin-only' : info.mode === 'frozen' ? 'frozen' : 'read-only'}</span>
  )
}
