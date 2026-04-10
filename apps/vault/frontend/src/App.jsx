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
import LifecycleRulesPage from './modules/admin/pages/LifecycleRulesPage'
import RetentionPoliciesPage from './modules/admin/pages/RetentionPoliciesPage'
import ContentChannelsPage from './modules/admin/pages/ContentChannelsPage'
import AdminConsolePage from './modules/admin/pages/AdminConsolePage'
import SuperadminDashboardPage from './modules/superadmin/pages/SuperadminDashboardPage'
import SuperadminOrgsPage from './modules/superadmin/pages/SuperadminOrgsPage'
import SuperadminOrgDetailPage from './modules/superadmin/pages/SuperadminOrgDetailPage'
import ContentSlotsPage from './modules/vault/pages/ContentSlotsPage'
import DossiersPage from './modules/vault/pages/DossiersPage'
import ExpiryDashboardPage from './modules/vault/pages/ExpiryDashboardPage'
import {
  OrgAuthGuard,
  OrgRoleGuard,
  SuperadminGuard
} from './modules/common/components/RouteGuards'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/superadmin" element={<SuperadminLoginPage />} />

        <Route
          path="/superadmin/dashboard"
          element={
            <SuperadminGuard>
              <SuperadminDashboardPage />
            </SuperadminGuard>
          }
        />
        <Route
          path="/superadmin/orgs"
          element={
            <SuperadminGuard>
              <SuperadminOrgsPage />
            </SuperadminGuard>
          }
        />
        <Route
          path="/superadmin/orgs/:id"
          element={
            <SuperadminGuard>
              <SuperadminOrgDetailPage />
            </SuperadminGuard>
          }
        />

        <Route
          path="/vault"
          element={
            <OrgAuthGuard>
              <VaultHomePage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/upload"
          element={
            <OrgAuthGuard>
              <UploadPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/content/:id"
          element={
            <OrgAuthGuard>
              <ContentDetailPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/content/:id/viewer"
          element={
            <OrgAuthGuard>
              <DocumentViewerPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/content/:id/versions/:versionId/viewer"
          element={
            <OrgAuthGuard>
              <DocumentViewerPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/search"
          element={
            <OrgAuthGuard>
              <SearchPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/slots"
          element={
            <OrgAuthGuard>
              <ContentSlotsPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/dossiers"
          element={
            <OrgAuthGuard>
              <DossiersPage />
            </OrgAuthGuard>
          }
        />
        <Route
          path="/vault/expiry"
          element={
            <OrgAuthGuard>
              <ExpiryDashboardPage />
            </OrgAuthGuard>
          }
        />

        <Route
          path="/admin"
          element={
            <OrgRoleGuard roles={['admin']}>
              <AdminConsolePage />
            </OrgRoleGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <OrgRoleGuard roles={['admin']}>
              <UsersPage />
            </OrgRoleGuard>
          }
        />
        <Route
          path="/admin/taxonomy"
          element={
            <OrgRoleGuard roles={['admin']}>
              <TaxonomyPage />
            </OrgRoleGuard>
          }
        />
        <Route
          path="/admin/lifecycle"
          element={
            <OrgRoleGuard roles={['admin']}>
              <LifecycleRulesPage />
            </OrgRoleGuard>
          }
        />
        <Route
          path="/admin/retention"
          element={
            <OrgRoleGuard roles={['admin']}>
              <RetentionPoliciesPage />
            </OrgRoleGuard>
          }
        />
        <Route
          path="/admin/channels"
          element={
            <OrgRoleGuard roles={['admin']}>
              <ContentChannelsPage />
            </OrgRoleGuard>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <OrgRoleGuard roles={['admin']}>
              <AuditPage />
            </OrgRoleGuard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
