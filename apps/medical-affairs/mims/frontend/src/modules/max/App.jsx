import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '../../shared/context/AuthContext'
import ProtectedRoute from '../../shared/components/ProtectedRoute'
import ModuleAccessGuard from '../../shared/components/ModuleAccessGuard'
import { useIdleTimer } from '../../shared/hooks/useIdleTimer'
import SessionTimeoutModal from '../../shared/components/SessionTimeoutModal'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SessionManagementPage from './pages/SessionManagementPage'
import InboxPage from './pages/InboxPage'
import AdminConsoleRouter from '../admin/AdminConsoleRouter'
import ContentPage from '../content/pages/ContentPage'
import AnalyticsPage from '../dv/pages/AnalyticsPage'
import ProcessExplorerPage from '../dv/pages/ProcessExplorerPage'
import ReportsPage from '../reports/pages/ReportsPage'
import CasesPage from '../cases/pages/CasesPage'
import CaseFormPage from '../cases/pages/CaseFormPage'
import CaseQueryPage from '../cases/pages/CaseQueryPage'
import ExceptionLogsPage from './pages/ExceptionLogsPage'
import NoAccessPage from '../../pages/NoAccessPage'
import ResetPasswordPage from '../../pages/ResetPasswordPage'
import ExceptionToast from '../../shared/components/ExceptionToast'

function AppRoutes() {
  const { user, sessionTimeout, logout } = useAuth()
  const [showWarning, setShowWarning]     = useState(false)
  const [warnSeconds, setWarnSeconds]     = useState(120)

  const { reset } = useIdleTimer({
    timeoutMinutes: user ? sessionTimeout : 0,
    onWarning: (secs) => { setWarnSeconds(secs); setShowWarning(true) },
    onTimeout: () => { setShowWarning(false); logout() }
  })

  function handleStay() {
    setShowWarning(false)
    reset()
  }

  return (
    <>
      <SessionTimeoutModal visible={showWarning} remainingSeconds={warnSeconds} onStay={handleStay} />
      <ExceptionToast />
      <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <DashboardPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/inbox" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <InboxPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/session-management" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <SessionManagementPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/admin-console/*" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <AdminConsoleRouter />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/content" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="content_mgmt">
                <ContentPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/analytics" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="data_visualization">
                <AnalyticsPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/process-explorer" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <ProcessExplorerPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/cases" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <CasesPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/cases/:id" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <CaseFormPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/case-query" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <CaseQueryPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="reports">
                <ReportsPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/exceptions" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <ExceptionLogsPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/no-access"       element={<NoAccessPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="*" element={
            <ProtectedRoute>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          } />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/mims">
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
