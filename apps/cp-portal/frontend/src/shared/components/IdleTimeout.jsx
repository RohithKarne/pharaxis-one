import { useState, useCallback } from 'react'
import { useIdleTimer } from '../hooks/useIdleTimer'
import SessionTimeoutModal from './SessionTimeoutModal'

/**
 * IdleTimeout — CP-64 HIPAA automatic-logoff wrapper. Drops the idle timer + the
 * warning modal into an authenticated area. When idle exceeds `timeoutMinutes`
 * it calls `onTimeout` (the app's logout); a warning modal appears `warningMinutes`
 * before, and "Stay Logged In" resets the clock. Pass timeoutMinutes={0} to disable
 * (e.g. an anonymous portal visitor).
 */
export default function IdleTimeout({ timeoutMinutes, onTimeout, warningMinutes = 2 }) {
  const [warningSeconds, setWarningSeconds] = useState(null)

  const handleWarning = useCallback((remaining) => setWarningSeconds(remaining), [])
  const handleTimeout = useCallback(() => { setWarningSeconds(null); onTimeout() }, [onTimeout])

  const { reset } = useIdleTimer({ timeoutMinutes, onWarning: handleWarning, onTimeout: handleTimeout, warningMinutes })

  return (
    <SessionTimeoutModal
      visible={warningSeconds != null}
      remainingSeconds={warningSeconds || 0}
      onStay={() => { setWarningSeconds(null); reset() }}
    />
  )
}
