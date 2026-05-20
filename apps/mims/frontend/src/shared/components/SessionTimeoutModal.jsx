'use strict'
import { useState, useEffect } from 'react'

/**
 * SessionTimeoutModal — warns user before auto-logout with a countdown.
 *
 * Two modes:
 *  - 'idle'   (default): inactivity timeout. Single "Stay Logged In" button → onStay.
 *  - 'expiry'          : absolute JWT expiry. "Continue working" → onContinue,
 *                        "Sign out" → onSignout.
 */
export default function SessionTimeoutModal({
  visible,
  remainingSeconds,
  mode = 'idle',
  onStay,
  onContinue,
  onSignout,
}) {
  const [countdown, setCountdown] = useState(remainingSeconds)

  useEffect(() => {
    if (!visible) return
    setCountdown(remainingSeconds)
    const interval = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [visible, remainingSeconds])

  if (!visible) return null

  const mins = Math.floor(countdown / 60)
  const secs = String(countdown % 60).padStart(2, '0')
  const isUrgent = countdown <= 60
  const isExpiry = mode === 'expiry'

  const heading = isExpiry ? 'Your session will expire soon' : 'Session Expiring Soon'
  const body = isExpiry
    ? "For security reasons, you'll be signed out in:"
    : "You've been inactive. You'll be automatically logged out in:"

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
          {heading}
        </h3>
        <p style={{ color: 'var(--text-muted, #6c757d)', marginBottom: 20, fontSize: 14 }}>
          {body}
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

        {isExpiry ? (
          <>
            <button
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 15, padding: '10px 0', marginBottom: 10 }}
              onClick={onContinue}
            >
              Continue working
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: 14, padding: '9px 0' }}
              onClick={onSignout}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 15, padding: '10px 0' }}
            onClick={onStay}
          >
            Stay Logged In
          </button>
        )}
      </div>
    </div>
  )
}
