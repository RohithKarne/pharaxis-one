import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '../../shared/context/AuthContext'
import { setSessionExpiryHandler } from '../../shared/api/httpFetch'
import ProtectedRoute from '../../shared/components/ProtectedRoute'
import ModuleAccessGuard from '../../shared/components/ModuleAccessGuard'
import { useIdleTimer } from '../../shared/hooks/useIdleTimer'
import SessionTimeoutModal from '../../shared/components/SessionTimeoutModal'
import ToastContainer from '../../shared/components/ToastContainer'
import ConfirmModal from '../../shared/components/ConfirmModal'
import ExceptionToast from '../../shared/components/ExceptionToast'

// ── Eagerly loaded — part of the critical navigation path ────────────────────
import LoginPage            from './pages/LoginPage'
import SsoCompletePage      from './pages/SsoCompletePage'
import DashboardPage        from './pages/DashboardPage'
import InboxPage            from './pages/InboxPage'
import CasesPage            from '../cases/pages/CasesPage'
import CaseFormPage         from '../cases/pages/CaseFormPage'
import ICSRBuilderPage      from '../cases/pages/ICSRBuilderPage'
import CaseQueryPage        from '../cases/pages/CaseQueryPage'
import SessionManagementPage from './pages/SessionManagementPage'
import NoAccessPage         from '../../pages/NoAccessPage'
import ResetPasswordPage    from '../../pages/ResetPasswordPage'

// ── Lazily loaded — heavy or rarely-visited pages (loaded on demand) ─────────
// Each becomes its own JS chunk; only downloaded when the user navigates there.
const ChatPage                 = lazy(() => import('./pages/ChatPage'))
const ContentPage              = lazy(() => import('../content/pages/ContentPage'))
const AnalyticsPage            = lazy(() => import('../dv/pages/AnalyticsPage'))
const ProcessExplorerPage      = lazy(() => import('../dv/pages/ProcessExplorerPage'))
const ReportsPage              = lazy(() => import('../reports/pages/ReportsPage'))
const ExceptionLogsPage        = lazy(() => import('./pages/ExceptionLogsPage'))
const RegressionPage           = lazy(() => import('../regression/pages/RegressionPage'))
const TransmissionsPage        = lazy(() => import('../transmissions/pages/TransmissionsPage'))
const BrowseContentPage        = lazy(() => import('../browse/pages/BrowseContentPage'))
const ResponseLogPage          = lazy(() => import('../responselog/pages/ResponseLogPage'))
const CaseAuditTrailPage       = lazy(() => import('../audittrail/pages/CaseAuditTrailPage'))
const CMAuditTrailPage         = lazy(() => import('../audittrail/pages/CMAuditTrailPage'))
const ResponseErrorLogPage     = lazy(() => import('../responselog/pages/ResponseErrorLogPage'))
const TransmissionErrorLogPage = lazy(() => import('../transmissions/pages/TransmissionErrorLogPage'))
const TransmissionAuditTrailPage = lazy(() => import('../transmissions/pages/TransmissionAuditTrailPage'))
const CopyDivisionPage         = lazy(() => import('../admin/pages/CopyDivisionPage'))
const DPPRPage                 = lazy(() => import('../admin/pages/DPPRPage'))
const MIMSAdminPage            = lazy(() => import('../mimsadmin/pages/MIMSAdminPage'))
const DeveloperPortalPage      = lazy(() => import('../devportal/DeveloperPortalPage'))

// Shared Suspense fallback — minimal spinner so Suspense boundary doesn't flash
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8', fontSize: 14 }}>
      Loading…
    </div>
  )
}

function AdminRoleGuard({ children }) {
  const { user } = useAuth()
  if (user?.role === 'admin' || user?.role === 'superadmin') return children
  return <Navigate to="/no-access" replace />
}

function AppRoutes() {
  const { user, sessionTimeout, logout } = useAuth()
  const navigate = useNavigate()
  const [showWarning, setShowWarning]     = useState(false)
  const [warnSeconds, setWarnSeconds]     = useState(120)

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
    onTimeout: () => { setShowWarning(false); logout() }
  })

  function handleStay() {
    setShowWarning(false)
    reset()
  }

  return (
    <>
      <SessionTimeoutModal visible={showWarning} remainingSeconds={warnSeconds} onStay={handleStay} />
      <ToastContainer />
      <ConfirmModal />
      <ExceptionToast />
      <Suspense fallback={<PageLoader />}>
      <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/mims-admin/login" element={<LoginPage adminMode />} />
          <Route path="/content/login" element={<LoginPage moduleMode="content" />} />
          <Route path="/reports/login" element={<LoginPage moduleMode="reports" />} />
          <Route path="/auth/sso-complete" element={<SsoCompletePage />} />
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
          <Route path="/chat" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <ChatPage />
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
          {/* /admin-console retired — superseded by /mims-admin */}
          <Route path="/admin-console" element={<Navigate to="/mims-admin" replace />} />
          <Route path="/admin-console/*" element={<Navigate to="/mims-admin" replace />} />
          <Route path="/mims-admin" element={
            <ProtectedRoute loginPath="/mims-admin/login">
              <ModuleAccessGuard moduleKey="admin_console">
                <MIMSAdminPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/content" element={
            <ProtectedRoute loginPath="/content/login">
              <ModuleAccessGuard moduleKey="content_mgmt">
                <AdminRoleGuard>
                  <ContentPage />
                </AdminRoleGuard>
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
          <Route path="/icsr/:id" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <ICSRBuilderPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/developer" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <DeveloperPortalPage />
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
            <ProtectedRoute loginPath="/reports/login">
              <ModuleAccessGuard moduleKey="reports">
                <AdminRoleGuard>
                  <ReportsPage />
                </AdminRoleGuard>
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
          <Route path="/regression" element={
            <ProtectedRoute>
              <RegressionPage />
            </ProtectedRoute>
          } />
          <Route path="/response-log" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <ResponseLogPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/case-audit-trail" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <CaseAuditTrailPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/cm-audit-trail" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <CMAuditTrailPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/response-error-log" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <ResponseErrorLogPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/transmission-error-log" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <TransmissionErrorLogPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/transmission-audit-trail" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <TransmissionAuditTrailPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/copy-division" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <CopyDivisionPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/dppr" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="admin_console">
                <DPPRPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/transmissions" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <TransmissionsPage />
              </ModuleAccessGuard>
            </ProtectedRoute>
          } />
          <Route path="/browse-content" element={
            <ProtectedRoute>
              <ModuleAccessGuard moduleKey="mims_core">
                <BrowseContentPage />
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
      </Suspense>
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
