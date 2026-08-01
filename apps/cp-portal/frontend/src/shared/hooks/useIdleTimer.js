import { useEffect, useRef, useCallback } from 'react'

/**
 * useIdleTimer — detects user inactivity and fires warning + logout callbacks.
 * Ported from MIMS (apps/mims/frontend/src/shared/hooks/useIdleTimer.js) for CP-64
 * HIPAA §164.312(a)(2)(iii) automatic-logoff. Framework-agnostic, no app deps.
 *
 * @param {number}   timeoutMinutes  - Total idle minutes before logout. 0 = disabled.
 * @param {function} onWarning       - Called with (remainingSeconds) when warning threshold is reached.
 * @param {function} onTimeout       - Called when idle period expires (trigger logout).
 * @param {number}   warningMinutes  - Minutes before timeout to show the warning (default 2).
 *
 * @returns {{ reset: function }} - Call reset() to restart the idle timer (e.g. "Stay Logged In").
 */
export function useIdleTimer({ timeoutMinutes, onWarning, onTimeout, warningMinutes = 2 }) {
  const logoutTimerRef  = useRef(null)
  const warningTimerRef = useRef(null)
  const isWarningRef    = useRef(false)

  const reset = useCallback(() => {
    clearTimeout(logoutTimerRef.current)
    clearTimeout(warningTimerRef.current)
    isWarningRef.current = false

    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const totalMs  = timeoutMinutes * 60 * 1000
    const warnMins = Math.min(warningMinutes, timeoutMinutes - 1)
    const warnAtMs = totalMs - warnMins * 60 * 1000

    if (warnAtMs > 0) {
      warningTimerRef.current = setTimeout(() => {
        isWarningRef.current = true
        onWarning(warnMins * 60)
      }, warnAtMs)
    }

    logoutTimerRef.current = setTimeout(() => { onTimeout() }, totalMs)
  }, [timeoutMinutes, onWarning, onTimeout, warningMinutes])

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const EVENTS = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart', 'click']

    function handleActivity() {
      if (isWarningRef.current) return // freeze during warning — user must click "Stay Logged In"
      reset()
    }

    EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    reset()

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
      clearTimeout(logoutTimerRef.current)
      clearTimeout(warningTimerRef.current)
    }
  }, [timeoutMinutes, reset])

  return { reset }
}
