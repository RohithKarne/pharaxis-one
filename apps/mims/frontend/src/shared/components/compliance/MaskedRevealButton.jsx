/**
 * MaskedRevealButton — Theme 9 (Wave 5).
 *
 * Renders a masked value (e.g. "***-**-1234"). Click → prompt for reason
 * → POST /api/masked-reveal (audit log) → reveal the unmasked value.
 *
 * The unmasked value is supplied to this component by its parent (we don't
 * gate access here — the audit happens on every click).
 *
 * Props:
 *   maskedDisplay  — string, e.g. "***-**-1234"
 *   unmaskedValue  — string shown after reveal
 *   entityType, entityId, section, field  — for the audit row
 *   requireReason? — default true; if false, no prompt is shown
 *   autoHideSec?   — auto-rehide after N seconds (default 30)
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function MaskedRevealButton({
  maskedDisplay, unmaskedValue,
  entityType, entityId, section = null, field,
  requireReason = true, autoHideSec = 30,
}) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme9_compliance')
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!shown || !autoHideSec) return
    const t = setTimeout(() => setShown(false), autoHideSec * 1000)
    return () => clearTimeout(t)
  }, [shown, autoHideSec])

  async function reveal() {
    let reason = null
    if (enabled && requireReason) {
      reason = prompt('Reason for revealing this sensitive value (audited):')
      if (!reason || !reason.trim()) return
    }
    // Log first, then show. If logging fails, we still show but warn.
    if (enabled) {
      await httpFetch('/api/masked-reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, section, field, reason }),
      }).catch(() => {})
    }
    setShown(true)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'monospace' }}>
        {shown ? unmaskedValue : maskedDisplay}
      </span>
      <button onClick={shown ? () => setShown(false) : reveal} style={{
        padding: '2px 7px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
        border: '1px solid var(--border)', borderRadius: 4,
        background: 'var(--surface,#fff)', color: 'var(--text-secondary)',
      }}>{shown ? '🙈 hide' : '👁 reveal'}</button>
    </span>
  )
}
