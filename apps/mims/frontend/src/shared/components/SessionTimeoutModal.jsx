'use strict'
import { useEffect, useState } from 'react'

/**
 * SessionTimeoutModal — warns user before auto-logout.
 * Shows a countdown. "Stay Logged In" resets the idle timer.
 */
export default function SessionTimeoutModal({ visible, remainingSeconds, onStay }) {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const elapsed = visible ? Math.floor((now - startedAt) / 1000) : 0
  const countdown = Math.max(0, remainingSeconds - elapsed)

  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [visible])

  if (!visible) return null

  const mins = Math.floor(countdown / 60)
  const secs = String(countdown % 60).padStart(2, '0')
  const isUrgent = countdown <= 60

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--bg-primary, #ffffff)',
        borderRadius: 10,
        padding: '36px 32px',
        maxWidth: 400, width: '90%',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        border: `2px solid ${isUrgent ? '#dc3545' : 'var(--border, #dee2e6)'}`
      }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>⏱</div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary, #212529)' }}>
          Session Expiring Soon
        </h3>
        <p style={{ color: 'var(--text-muted, #6c757d)', marginBottom: 20, fontSize: 14 }}>
          You've been inactive. You'll be automatically logged out in:
        </p>
        <div style={{
          fontSize: 52,
          fontWeight: 700,
          color: isUrgent ? '#dc3545' : 'var(--text-primary, #212529)',
          marginBottom: 24,
          fontVariantNumeric: 'tabular-nums'
        }}>
          {mins}:{secs}
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%', fontSize: 15, padding: '10px 0' }}
          onClick={onStay}
        >
          Stay Logged In
        </button>
      </div>
    </div>
  )
}
