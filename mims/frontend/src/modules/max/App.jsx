import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '../../shared/context/AuthContext'
import ProtectedRoute from '../../shared/components/ProtectedRoute'
import ModuleAccessGuard from '../../shared/components/ModuleAccessGuard'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import InboxPage from './pages/InboxPage'
import AdminConsoleRouter from '../admin/AdminConsoleRouter'
import ContentPage from '../content/pages/ContentPage'
import AnalyticsPage from '../dv/pages/AnalyticsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
          <Route path="*" element={
            <ProtectedRoute>
              <Navigate to="/dashboard" replace />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
