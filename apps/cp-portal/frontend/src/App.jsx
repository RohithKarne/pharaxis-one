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
import SyncHealthPage       from './admin/pages/SyncHealthPage'
import SsoConfigPage        from './admin/pages/SsoConfigPage'
import PortalUsersPage      from './admin/pages/PortalUsersPage'
import ChatboxConfigPage    from './admin/pages/ChatboxConfigPage'
import GatePage             from './admin/pages/GatePage'
import SafetyAdminPage      from './admin/pages/SafetyPage'
import NewsAdminPage        from './admin/pages/NewsPage'
import DocumentsAdminPage   from './admin/pages/DocumentsPage'
import CompliancePage       from './admin/pages/CompliancePage'
import AuditTrailPage       from './admin/pages/AuditTrailPage'
import SubmissionsPage      from './admin/pages/SubmissionsPage'
import AdminUsersPage      from './admin/pages/AdminUsersPage'
import ReviewQueuePage     from './admin/pages/ReviewQueuePage'

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
import SavedItemsPage           from './portal/pages/SavedItemsPage'
import VerifyEmailPage          from './portal/pages/VerifyEmailPage'
import SsoCompletePage           from './portal/pages/SsoCompletePage'
import PreferencesPage         from './portal/pages/PreferencesPage'
import SearchResultsPage        from './portal/pages/SearchResultsPage'
import MyActivityPage           from './portal/pages/MyActivityPage'
import ProfilePage              from './portal/pages/ProfilePage'
import ForgotPasswordPage       from './portal/pages/ForgotPasswordPage'
import ResetPasswordPage        from './portal/pages/ResetPasswordPage'
import { ToastProvider }        from './shared/components/Toast'
import AnalyticsPage            from './admin/pages/AnalyticsPage'
import FeedbackPage             from './admin/pages/FeedbackPage'
import EmailSettingsPage        from './admin/pages/EmailSettingsPage'
import FAQAdminPage            from './admin/pages/FAQPage'
import FAQPortalPage           from './portal/pages/FAQPage'

function AdminGuard({ children }) {
  const { admin, authLoading } = useAdminAuth()
  const location = useLocation()
  if (authLoading) return <div className="cp-loading">Restoring admin session...</div>
  return admin ? children : <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
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
      <ToastProvider>
      <PortalLayout>
        <Routes>
          <Route index                    element={<PortalHomePage />} />
          <Route path="login"             element={<PortalLoginPage />} />
          <Route path="forgot-password"   element={<ForgotPasswordPage />} />
          <Route path="reset-password"    element={<ResetPasswordPage />} />
          <Route path="verify-email"     element={<VerifyEmailPage />} />
          <Route path="sso-complete"      element={<SsoCompletePage />} />
          <Route path="submit"            element={<FeatureGuard featureKey="medical_inquiry"><SubmitPage /></FeatureGuard>} />
          <Route path="therapeutic-areas" element={<FeatureGuard featureKey="therapeutic_areas"><TherapeuticAreasPage /></FeatureGuard>} />
          <Route path="events"            element={<FeatureGuard featureKey="events"><EventsPage /></FeatureGuard>} />
          <Route path="resources"         element={<FeatureGuard featureKey="resources"><ResourcesPage /></FeatureGuard>} />
          <Route path="drug-info"         element={<FeatureGuard featureKey="drug_info"><DrugInfoPage /></FeatureGuard>} />
          <Route path="find-msl"          element={<FeatureGuard featureKey="find_msl"><FindMSLPage /></FeatureGuard>} />
          <Route path="my-submissions"    element={<PortalAuthGuard><MySubmissionsPage /></PortalAuthGuard>} />
          <Route path="my-activity"       element={<PortalAuthGuard><MyActivityPage /></PortalAuthGuard>} />
          <Route path="contact"           element={<ContactPage />} />
          <Route path="safety"            element={<SafetyPortalPage />} />
          <Route path="news"              element={<FeatureGuard featureKey="news_announcements"><NewsPortalPage /></FeatureGuard>} />
          <Route path="news/:postId"      element={<FeatureGuard featureKey="news_announcements"><NewsDetailPage /></FeatureGuard>} />
          <Route path="documents"         element={<FeatureGuard featureKey="document_library"><DocumentsPortalPage /></FeatureGuard>} />
          <Route path="saved"             element={<PortalAuthGuard><SavedItemsPage /></PortalAuthGuard>} />
          <Route path="preferences"     element={<PortalAuthGuard><PreferencesPage /></PortalAuthGuard>} />
          <Route path="profile"          element={<PortalAuthGuard><ProfilePage /></PortalAuthGuard>} />
          <Route path="faq"             element={<FAQPortalPage />} />
          <Route path="search"          element={<SearchResultsPage />} />
          <Route path="*"                 element={<PortalNotFoundPage />} />
        </Routes>
      </PortalLayout>
      </ToastProvider>
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
        <Route path="/admin/clients/:clientId/sync-health" element={<AdminGuard><SyncHealthPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/sso" element={<AdminGuard><SsoConfigPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/users" element={<AdminGuard><PortalUsersPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/chatbox" element={<AdminGuard><ChatboxConfigPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/gate"       element={<AdminGuard><GatePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/safety"     element={<AdminGuard><SafetyAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/news"       element={<AdminGuard><NewsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/documents"  element={<AdminGuard><DocumentsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/compliance"   element={<AdminGuard><CompliancePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/audit"       element={<AdminGuard><AuditTrailPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/submissions" element={<AdminGuard><SubmissionsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/analytics"    element={<AdminGuard><AnalyticsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/feedback"     element={<AdminGuard><FeedbackPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/admin-users"  element={<AdminGuard><AdminUsersPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/review-queue"    element={<AdminGuard><ReviewQueuePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/email-settings" element={<AdminGuard><EmailSettingsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/faq"           element={<AdminGuard><FAQAdminPage /></AdminGuard>} />

        {/* Public Portal — multi-tenant by clientCode */}
        <Route path="/portal/:clientCode/*" element={<PortalRoutes />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminAuthProvider>
  )
}
