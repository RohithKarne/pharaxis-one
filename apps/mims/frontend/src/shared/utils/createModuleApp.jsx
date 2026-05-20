import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { FeatureFlagsProvider } from '../context/FeatureFlagsContext'
import { setSessionExpiryHandler, httpFetch } from '../api/httpFetch'
import ProtectedRoute from '../components/ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import ModuleAccessGuard from '../components/ModuleAccessGuard'
import SessionTimeoutModal from '../components/SessionTimeoutModal'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import { useIdleTimer } from '../hooks/useIdleTimer'
import { useSessionExpiry } from '../hooks/useSessionExpiry'

/**
 * Factory for Admin / Content / DV module apps.
 * Each module passes its main page component + login branding + moduleKey for access control.
 */
export default function createModuleApp({ MainPage, appName, appTagline, moduleKey, storageKeyPrefix, fallbackPrefixes, allowUsername }) {
  function ModuleRoutes() {
    const { user, token, sessionTimeout, logout, applyRefreshedToken } = useAuth()
    const navigate = useNavigate()
    const [showWarning, setShowWarning] = useState(false)
    const [warnSeconds, setWarnSeconds] = useState(120)
    const [showExpiry, setShowExpiry] = useState(false)
    const [expirySeconds, setExpirySeconds] = useState(300)
    const [capReached, setCapReached] = useState(false)

    useEffect(() => {
      setSessionExpiryHandler(async () => {
        await logout()
        navigate('/login', { replace: true })
      })
      return () => setSessionExpiryHandler(null)
    }, [logout, navigate])

    const { reset } = useIdleTimer({
      timeoutMinutes: user ? sessionTimeout : 0,
      onWarning: (secs) => { setWarnSeconds(secs); setShowWarning(true) },
      onTimeout: async () => {
        setShowWarning(false)
        await logout()
        navigate('/login', { replace: true })
      }
    })

    // Absolute JWT expiry warning (independent of idle timeout).
    const { reset: resetExpiry } = useSessionExpiry({
      token: user ? token : null,
      warningMinutes: 5,
      onWarning: (secs) => { setExpirySeconds(secs); setShowExpiry(true) },
      onExpire: async () => {
        setShowExpiry(false)
        await logout()
        navigate('/login', { replace: true })
      }
    })

    function handleStay() {
      setShowWarning(false)
      reset()
    }

    async function handleContinue() {
      try {
        const res = await httpFetch('/api/auth/refresh-session', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          applyRefreshedToken(data.token)
          resetExpiry(data.token)
          setShowExpiry(false)
          return
        }
        // 12h cap reached (403) or any failure — surface, then force re-login.
        const detail = await res.json().catch(() => ({}))
        if (res.status === 403 && detail.error_code === 'session_cap_reached') {
          setCapReached(true)
          return
        }
        setShowExpiry(false)
        await logout()
        navigate('/login', { replace: true })
      } catch {
        setShowExpiry(false)
        await logout()
        navigate('/login', { replace: true })
      }
    }

    async function handleExpirySignout() {
      setShowExpiry(false)
      setCapReached(false)
      await logout()
      navigate('/login', { replace: true })
    }

    return (
      <>
        <SessionTimeoutModal visible={showWarning} remainingSeconds={warnSeconds} onStay={handleStay} />
        <SessionTimeoutModal
          visible={showExpiry && !capReached}
          mode="expiry"
          remainingSeconds={expirySeconds}
          onContinue={handleContinue}
          onSignout={handleExpirySignout}
        />
        {capReached && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{
              background: 'var(--bg-primary, #ffffff)', borderRadius: 10, padding: '36px 32px',
              maxWidth: 400, width: '90%', textAlign: 'center',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)', border: '2px solid var(--border, #dee2e6)'
            }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
              <h3 style={{ margin: '0 0 8px' }}>Session limit reached</h3>
              <p style={{ color: 'var(--text-muted, #6c757d)', marginBottom: 24, fontSize: 14 }}>
                You've been signed in for 12 hours. For security, please sign in again.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', fontSize: 15, padding: '10px 0' }}
                onClick={handleExpirySignout}>
                Sign in again
              </button>
            </div>
          </div>
        )}
        <ToastContainer />
        <ConfirmModal />
        <Routes>
          <Route path="/login" element={<LoginPage redirectTo="/" appName={appName} appTagline={appTagline} allowUsername={allowUsername} />} />
          <Route path="/" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey={moduleKey}>
                <MainPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </>
    )
  }

  return function App() {
    return (
      <AuthProvider storageKeyPrefix={storageKeyPrefix} fallbackPrefixes={fallbackPrefixes}>
        <FeatureFlagsProvider>
          <HashRouter>
            <ModuleRoutes />
          </HashRouter>
        </FeatureFlagsProvider>
      </AuthProvider>
    )
  }
}
