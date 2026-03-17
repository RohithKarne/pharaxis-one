import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './admin/context/AdminAuthContext'

// Admin pages
import AdminLoginPage       from './admin/pages/LoginPage'
import AdminDashboard       from './admin/pages/DashboardPage'
import ClientsPage          from './admin/pages/ClientsPage'
import ClientDetailPage     from './admin/pages/ClientDetailPage'
import BrandingPage         from './admin/pages/BrandingPage'
import FeaturesPage         from './admin/pages/FeaturesPage'
import ContentPage          from './admin/pages/ContentPage'
import FormsPage            from './admin/pages/FormsPage'
import MSLPage              from './admin/pages/MSLPage'
import IntegrationPage      from './admin/pages/IntegrationPage'
import PortalUsersPage      from './admin/pages/PortalUsersPage'
import ChatboxConfigPage    from './admin/pages/ChatboxConfigPage'
import GatePage             from './admin/pages/GatePage'
import SafetyAdminPage      from './admin/pages/SafetyPage'
import NewsAdminPage        from './admin/pages/NewsPage'
import DocumentsAdminPage   from './admin/pages/DocumentsPage'
import CompliancePage       from './admin/pages/CompliancePage'

// Portal pages
import { PortalProvider }       from './portal/context/PortalContext'
import { usePortal }            from './portal/context/PortalContext'
import PortalLayout             from './portal/components/PortalLayout'
import PortalHomePage           from './portal/pages/PortalHomePage'
import PortalLoginPage          from './portal/pages/LoginPage'
import SubmitPage               from './portal/pages/SubmitPage'
import TherapeuticAreasPage     from './portal/pages/TherapeuticAreasPage'
import EventsPage               from './portal/pages/EventsPage'
import ResourcesPage            from './portal/pages/ResourcesPage'
import DrugInfoPage             from './portal/pages/DrugInfoPage'
import FindMSLPage              from './portal/pages/FindMSLPage'
import MySubmissionsPage        from './portal/pages/MySubmissionsPage'
import ContactPage              from './portal/pages/ContactPage'
import PortalNotFoundPage       from './portal/pages/PortalNotFoundPage'
import SafetyPortalPage         from './portal/pages/SafetyPage'
import NewsPortalPage           from './portal/pages/NewsPage'
import NewsDetailPage           from './portal/pages/NewsDetailPage'
import DocumentsPortalPage      from './portal/pages/DocumentsPage'

function AdminGuard({ children }) {
  const { admin } = useAdminAuth()
  return admin ? children : <Navigate to="/admin/login" replace />
}

function FeatureGuard({ featureKey, children }) {
  const { isFeatureEnabled, clientCode, loading } = usePortal()
  if (loading) return <div className="pp-loading">Loading…</div>
  if (!isFeatureEnabled(featureKey)) return <Navigate to={`/portal/${clientCode}`} replace />
  return children
}

function PortalAuthGuard({ children }) {
  const { user, clientCode, loading } = usePortal()
  const location = useLocation()
  if (loading) return <div className="pp-loading">Loading…</div>
  if (!user) return <Navigate to={`/portal/${clientCode}/login`} replace state={{ from: location.pathname }} />
  return children
}

function PortalRoutes() {
  return (
    <PortalProvider>
      <PortalLayout>
        <Routes>
          <Route index                    element={<PortalHomePage />} />
          <Route path="login"             element={<PortalLoginPage />} />
          <Route path="submit"            element={<FeatureGuard featureKey="medical_inquiry"><SubmitPage /></FeatureGuard>} />
          <Route path="therapeutic-areas" element={<FeatureGuard featureKey="therapeutic_areas"><TherapeuticAreasPage /></FeatureGuard>} />
          <Route path="events"            element={<FeatureGuard featureKey="events"><EventsPage /></FeatureGuard>} />
          <Route path="resources"         element={<FeatureGuard featureKey="resources"><ResourcesPage /></FeatureGuard>} />
          <Route path="drug-info"         element={<FeatureGuard featureKey="drug_information"><DrugInfoPage /></FeatureGuard>} />
          <Route path="find-msl"          element={<FeatureGuard featureKey="find_msl"><FindMSLPage /></FeatureGuard>} />
          <Route path="my-submissions"    element={<PortalAuthGuard><MySubmissionsPage /></PortalAuthGuard>} />
          <Route path="contact"           element={<ContactPage />} />
          <Route path="safety"            element={<SafetyPortalPage />} />
          <Route path="news"              element={<FeatureGuard featureKey="news_announcements"><NewsPortalPage /></FeatureGuard>} />
          <Route path="news/:postId"      element={<FeatureGuard featureKey="news_announcements"><NewsDetailPage /></FeatureGuard>} />
          <Route path="documents"         element={<FeatureGuard featureKey="document_library"><DocumentsPortalPage /></FeatureGuard>} />
          <Route path="*"                 element={<PortalNotFoundPage />} />
        </Routes>
      </PortalLayout>
    </PortalProvider>
  )
}

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        {/* Admin Console */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
        <Route path="/admin/clients" element={<AdminGuard><ClientsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId" element={<AdminGuard><ClientDetailPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/branding" element={<AdminGuard><BrandingPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/features" element={<AdminGuard><FeaturesPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/content" element={<AdminGuard><ContentPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/forms" element={<AdminGuard><FormsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/msls" element={<AdminGuard><MSLPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/integration" element={<AdminGuard><IntegrationPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/users" element={<AdminGuard><PortalUsersPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/chatbox" element={<AdminGuard><ChatboxConfigPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/gate"       element={<AdminGuard><GatePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/safety"     element={<AdminGuard><SafetyAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/news"       element={<AdminGuard><NewsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/documents"  element={<AdminGuard><DocumentsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/compliance" element={<AdminGuard><CompliancePage /></AdminGuard>} />

        {/* Public Portal — multi-tenant by clientCode */}
        <Route path="/portal/:clientCode/*" element={<PortalRoutes />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminAuthProvider>
  )
}
