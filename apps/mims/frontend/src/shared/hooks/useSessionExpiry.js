'use strict'
import { useEffect, useRef, useCallback } from 'react'

/**
 * useSessionExpiry — fires a warning before the JWT's absolute expiry, and a
 * final callback at expiry. Independent of useIdleTimer (which tracks
 * inactivity). This tracks the hard `exp` baked into the token at login.
 *
 * @param {string}   token          - Current JWT. Read-only decode of its `exp`.
 * @param {function} onWarning      - Called with (remainingSeconds) at exp - warningMinutes.
 * @param {function} onExpire       - Called when the token reaches `exp` (trigger logout).
 * @param {number}   warningMinutes - Minutes before expiry to warn (default: 5).
 *
 * @returns {{ reset: function }} - Call reset(newToken) after a refresh to re-arm.
 */
export function useSessionExpiry({ token, onWarning, onExpire, warningMinutes = 5 }) {
  const warnTimerRef   = useRef(null)
  const expireTimerRef = useRef(null)

  // Decode the `exp` (seconds since epoch) from a JWT without verifying it.
  // Frontend never validates signatures — the backend does. We only read timing.
  const readExpiryMs = useCallback((jwtToken) => {
    if (!jwtToken || typeof jwtToken !== 'string') return null
    const parts = jwtToken.split('.')
    if (parts.length !== 3) return null
    try {
      const json = JSON.parse(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      )
      return Number.isFinite(json?.exp) ? json.exp * 1000 : null
    } catch {
      return null
    }
  }, [])

  const arm = useCallback((jwtToken) => {
    clearTimeout(warnTimerRef.current)
    clearTimeout(expireTimerRef.current)

    const expiryMs = readExpiryMs(jwtToken)
    if (!expiryMs) return

    const now      = Date.now()
    const warnMs   = expiryMs - warningMinutes * 60 * 1000
    const msToWarn = warnMs - now
    const msToExp  = expiryMs - now

    if (msToExp <= 0) {
      // Already expired — let the next API call's 401 handler take over.
      return
    }

    if (msToWarn > 0) {
      warnTimerRef.current = setTimeout(() => {
        onWarning(Math.max(1, Math.round((expiryMs - Date.now()) / 1000)))
      }, msToWarn)
    } else {
      // Inside the warning window already — warn immediately.
      onWarning(Math.max(1, Math.round(msToExp / 1000)))
    }

    expireTimerRef.current = setTimeout(() => {
      onExpire()
    }, msToExp)
  }, [readExpiryMs, warningMinutes, onWarning, onExpire])

  const reset = useCallback((newToken) => {
    arm(newToken)
  }, [arm])

  useEffect(() => {
    arm(token)
    return () => {
      clearTimeout(warnTimerRef.current)
      clearTimeout(expireTimerRef.current)
    }
  }, [token, arm])

  return { reset }
}
