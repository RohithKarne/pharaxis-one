import { useEffect, useState } from 'react'

/**
 * SessionTimeoutModal — warns before auto-logout with a live countdown.
 * "Stay Logged In" resets the idle timer. Self-styled (inline) so it renders
 * identically in both the admin console and the portal. Ported from MIMS for CP-64.
 */
export default function SessionTimeoutModal({ visible, remainingSeconds, onStay }) {
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  // Re-anchor the countdown each time the warning appears.
  useEffect(() => { if (visible) { const t = Date.now(); setStartedAt(t); setNow(t) } }, [visible])

  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [visible])

  if (!visible) return null

  const elapsed   = Math.floor((now - startedAt) / 1000)
  const countdown = Math.max(0, remainingSeconds - elapsed)
  const mins = Math.floor(countdown / 60)
  const secs = String(countdown % 60).padStart(2, '0')
  const isUrgent = countdown <= 60

  return (
    <div role="dialog" aria-modal="true" aria-label="Session expiring"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
               display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', borderRadius: 10, padding: '36px 32px', maxWidth: 400, width: '90%',
                    textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                    border: `2px solid ${isUrgent ? '#dc3545' : '#dee2e6'}` }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>⏱</div>
        <h3 style={{ margin: '0 0 8px', color: '#212529' }}>Session Expiring Soon</h3>
        <p style={{ color: '#6c757d', marginBottom: 20, fontSize: 14 }}>
          You've been inactive. You'll be automatically logged out in:
        </p>
        <div style={{ fontSize: 52, fontWeight: 700, color: isUrgent ? '#dc3545' : '#212529',
                      marginBottom: 24, fontVariantNumeric: 'tabular-nums' }}>
          {mins}:{secs}
        </div>
        <button type="button" onClick={onStay}
          style={{ width: '100%', fontSize: 15, padding: '11px 0', border: 'none', borderRadius: 8,
                   background: '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          Stay Logged In
        </button>
      </div>
    </div>
  )
}
