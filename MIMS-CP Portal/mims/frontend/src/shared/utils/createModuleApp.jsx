import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import ModuleAccessGuard from '../components/ModuleAccessGuard'

/**
 * Factory for Admin / Content / DV module apps.
 * Each module passes its main page component + login branding + moduleKey for access control.
 */
export default function createModuleApp({ MainPage, appName, appTagline, moduleKey, storageKeyPrefix, fallbackPrefixes, allowUsername }) {
  return function App() {
    return (
      <AuthProvider storageKeyPrefix={storageKeyPrefix} fallbackPrefixes={fallbackPrefixes}>
        <HashRouter>
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
        </HashRouter>
      </AuthProvider>
    )
  }
}
