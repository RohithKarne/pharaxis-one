import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './modules/auth/pages/LoginPage'
import SuperadminLoginPage from './modules/superadmin/pages/SuperadminLoginPage'
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
import SuperadminDashboardPage from './modules/superadmin/pages/SuperadminDashboardPage'
import SuperadminOrgsPage from './modules/superadmin/pages/SuperadminOrgsPage'
import SuperadminOrgDetailPage from './modules/superadmin/pages/SuperadminOrgDetailPage'
import ContentSlotsPage from './modules/vault/pages/ContentSlotsPage'
import DossiersPage from './modules/vault/pages/DossiersPage'
import ExpiryDashboardPage from './modules/vault/pages/ExpiryDashboardPage'
import MyTasksPage from './modules/vault/pages/MyTasksPage'
import NotificationsPage from './modules/vault/pages/NotificationsPage'
import {
  OrgAuthGuard,
  OrgRoleGuard,
  SuperadminGuard
} from './modules/common/components/RouteGuards'
import WorkspaceShell from './modules/common/components/WorkspaceShell'

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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/control-tower/login" element={<SuperadminLoginPage />} />
        <Route path="/superadmin" element={<Navigate to="/control-tower/login" replace />} />

        <Route
          path="/control-tower/dashboard"
          element={
            <SuperadminGuard>
              <SuperadminDashboardPage />
            </SuperadminGuard>
          }
        />
        <Route
          path="/control-tower/orgs"
          element={
            <SuperadminGuard>
              <SuperadminOrgsPage />
            </SuperadminGuard>
          }
        />
        <Route
          path="/control-tower/orgs/:id"
          element={
            <SuperadminGuard>
              <SuperadminOrgDetailPage />
            </SuperadminGuard>
          }
        />

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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
