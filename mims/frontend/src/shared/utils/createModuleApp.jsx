import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '../context/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import ModuleAccessGuard from '../components/ModuleAccessGuard'
import SessionTimeoutModal from '../components/SessionTimeoutModal'
import { useIdleTimer } from '../hooks/useIdleTimer'

/**
 * Factory for Admin / Content / DV module apps.
 * Each module passes its main page component + login branding + moduleKey for access control.
 */
export default function createModuleApp({ MainPage, appName, appTagline, moduleKey, storageKeyPrefix, fallbackPrefixes, allowUsername }) {
  function ModuleRoutes() {
    const { user, sessionTimeout, logout } = useAuth()
    const navigate = useNavigate()
    const [showWarning, setShowWarning] = useState(false)
    const [warnSeconds, setWarnSeconds] = useState(120)

    const { reset } = useIdleTimer({
      timeoutMinutes: user ? sessionTimeout : 0,
      onWarning: (secs) => { setWarnSeconds(secs); setShowWarning(true) },
      onTimeout: async () => {
        setShowWarning(false)
        await logout()
        navigate('/login', { replace: true })
      }
    })

    function handleStay() {
      setShowWarning(false)
      reset()
    }

    return (
      <>
        <SessionTimeoutModal visible={showWarning} remainingSeconds={warnSeconds} onStay={handleStay} />
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
        <HashRouter>
          <ModuleRoutes />
        </HashRouter>
      </AuthProvider>
    )
  }
}
