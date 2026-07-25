import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import SuperadminLoginPage from './modules/superadmin/pages/SuperadminLoginPage'
import SuperadminDashboardPage from './modules/superadmin/pages/SuperadminDashboardPage'
import SuperadminOrgsPage from './modules/superadmin/pages/SuperadminOrgsPage'
import SuperadminOrgDetailPage from './modules/superadmin/pages/SuperadminOrgDetailPage'
import SuperadminAuditPage from './modules/superadmin/pages/SuperadminAuditPage'
import SuperadminDomainPage from './modules/superadmin/pages/SuperadminDomainPage'
import { SuperadminGuard } from './modules/common/components/RouteGuards'

import ErrorBoundary from './modules/common/components/ErrorBoundary'

export default function SuperadminApp() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<SuperadminLoginPage />} />

          <Route
            path="/dashboard"
            element={
              <SuperadminGuard>
                <SuperadminDashboardPage />
              </SuperadminGuard>
            }
          />
          <Route
            path="/orgs"
            element={
              <SuperadminGuard>
                <SuperadminOrgsPage />
              </SuperadminGuard>
            }
          />
          <Route
            path="/orgs/:id"
            element={
              <SuperadminGuard>
                <SuperadminOrgDetailPage />
              </SuperadminGuard>
            }
          />
          <Route
            path="/orgs/:id/domain"
            element={
              <SuperadminGuard>
                <SuperadminDomainPage />
              </SuperadminGuard>
            }
          />
          <Route
            path="/audit"
            element={
              <SuperadminGuard>
                <SuperadminAuditPage />
              </SuperadminGuard>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
