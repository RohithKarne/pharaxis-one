import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './modules/auth/pages/LoginPage'
import VaultHomePage from './modules/vault/pages/VaultHomePage'
import UsersPage from './modules/admin/pages/UsersPage'
import TaxonomyPage from './modules/admin/pages/TaxonomyPage'
import UploadPage from './modules/vault/pages/UploadPage'
import ContentDetailPage from './modules/vault/pages/ContentDetailPage'
import SearchPage from './modules/vault/pages/SearchPage'
import DocumentViewerPage from './modules/vault/pages/DocumentViewerPage'
import AuditPage from './modules/admin/pages/AuditPage'
import AdminWorkflowQueuePage from './modules/admin/pages/AdminWorkflowQueuePage'
import LifecycleRulesPage from './modules/admin/pages/LifecycleRulesPage'
import RetentionPoliciesPage from './modules/admin/pages/RetentionPoliciesPage'
import ContentChannelsPage from './modules/admin/pages/ContentChannelsPage'
import AdminIntegrationsPage from './modules/admin/pages/AdminIntegrationsPage'
import AdminSecurityPage from './modules/admin/pages/AdminSecurityPage'
import AdminConsolePage from './modules/admin/pages/AdminConsolePage'
import AdminSetupWizardPage from './modules/admin/pages/AdminSetupWizardPage'
import ContentSlotsPage from './modules/vault/pages/ContentSlotsPage'
import DossiersPage from './modules/vault/pages/DossiersPage'
import ExpiryDashboardPage from './modules/vault/pages/ExpiryDashboardPage'
import MyTasksPage from './modules/vault/pages/MyTasksPage'
import NotificationsPage from './modules/vault/pages/NotificationsPage'
import ReachScorePage from './modules/vault/pages/ReachScorePage'
import SignOffCertificatePage from './modules/vault/pages/SignOffCertificatePage'
import ContentIntelligencePage from './modules/vault/pages/ContentIntelligencePage'
import BulkOperationsPage from './modules/vault/pages/BulkOperationsPage'
import ReportsPage from './modules/vault/pages/ReportsPage'
import TrainingAssignmentsPage from './modules/vault/pages/TrainingAssignmentsPage'
import ExternalSharePage from './modules/vault/pages/ExternalSharePage'
import {
  OrgAuthGuard,
  OrgRoleGuard
} from './modules/common/components/RouteGuards'
import ErrorBoundary from './modules/common/components/ErrorBoundary'

function WorkspaceRoute({ children }) {
  return (
    <OrgAuthGuard>
      <WorkspaceShell>{children}</WorkspaceShell>
    </OrgAuthGuard>
  )
}

function AdminWorkspaceRoute({ children }) {
  return (
    <OrgRoleGuard roles={['admin']}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </OrgRoleGuard>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/external/vault-share/:token" element={<ExternalSharePage />} />

        <Route
          path="/vault"
          element={
            <WorkspaceRoute>
              <VaultHomePage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/upload"
          element={
            <WorkspaceRoute>
              <UploadPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/content/:id"
          element={
            <WorkspaceRoute>
              <ContentDetailPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/content/:id/viewer"
          element={
            <WorkspaceRoute>
              <DocumentViewerPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/content/:id/versions/:versionId/viewer"
          element={
            <WorkspaceRoute>
              <DocumentViewerPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/search"
          element={
            <WorkspaceRoute>
              <SearchPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/slots"
          element={
            <WorkspaceRoute>
              <ContentSlotsPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/dossiers"
          element={
            <WorkspaceRoute>
              <DossiersPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/expiry"
          element={
            <WorkspaceRoute>
              <ExpiryDashboardPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/tasks"
          element={
            <WorkspaceRoute>
              <MyTasksPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/notifications"
          element={
            <WorkspaceRoute>
              <NotificationsPage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/training"
          element={
            <WorkspaceRoute>
              <TrainingAssignmentsPage />
            </WorkspaceRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <AdminWorkspaceRoute>
              <AdminConsolePage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/wizard"
          element={
            <AdminWorkspaceRoute>
              <AdminSetupWizardPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminWorkspaceRoute>
              <UsersPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/taxonomy"
          element={
            <AdminWorkspaceRoute>
              <TaxonomyPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/lifecycle"
          element={
            <AdminWorkspaceRoute>
              <LifecycleRulesPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/retention"
          element={
            <AdminWorkspaceRoute>
              <RetentionPoliciesPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/channels"
          element={
            <AdminWorkspaceRoute>
              <ContentChannelsPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/integrations"
          element={
            <AdminWorkspaceRoute>
              <AdminIntegrationsPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/security"
          element={
            <AdminWorkspaceRoute>
              <AdminSecurityPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <AdminWorkspaceRoute>
              <AuditPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/admin/workflows"
          element={
            <AdminWorkspaceRoute>
              <AdminWorkflowQueuePage />
            </AdminWorkspaceRoute>
          }
        />

        <Route
          path="/vault/reach"
          element={
            <WorkspaceRoute>
              <ReachScorePage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/content/:id/signoff"
          element={
            <WorkspaceRoute>
              <SignOffCertificatePage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/intelligence"
          element={
            <WorkspaceRoute>
              <ContentIntelligencePage />
            </WorkspaceRoute>
          }
        />
        <Route
          path="/vault/bulk"
          element={
            <AdminWorkspaceRoute>
              <BulkOperationsPage />
            </AdminWorkspaceRoute>
          }
        />
        <Route
          path="/vault/reports"
          element={
            <AdminWorkspaceRoute>
              <ReportsPage />
            </AdminWorkspaceRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
