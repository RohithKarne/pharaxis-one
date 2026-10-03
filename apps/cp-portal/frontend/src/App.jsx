import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './admin/context/AdminAuthContext'
import IdleTimeout from './shared/components/IdleTimeout'

// CP-64 — HIPAA §164.312(a)(2)(iii) automatic-logoff idle timeouts (minutes).
// Admin console carries higher privilege → shorter idle window than the portal.
const ADMIN_IDLE_MINUTES  = 15
const PORTAL_IDLE_MINUTES = 30

// Admin pages
const AdminLoginPage       = lazy(() => import('./admin/pages/LoginPage'))
const AdminDashboard       = lazy(() => import('./admin/pages/DashboardPage'))
const ClientsPage          = lazy(() => import('./admin/pages/ClientsPage'))
const ClientDetailPage     = lazy(() => import('./admin/pages/ClientDetailPage'))
const BrandingPage         = lazy(() => import('./admin/pages/BrandingPage'))
const FeaturesPage         = lazy(() => import('./admin/pages/FeaturesPage'))
const ContentPage          = lazy(() => import('./admin/pages/ContentPage'))
const FormsPage            = lazy(() => import('./admin/pages/FormsPage'))
const MSLPage              = lazy(() => import('./admin/pages/MSLPage'))
const IntegrationPage      = lazy(() => import('./admin/pages/IntegrationPage'))
const SyncHealthPage       = lazy(() => import('./admin/pages/SyncHealthPage'))
const DataRequestsPage     = lazy(() => import('./admin/pages/DataRequestsPage'))
const SsoConfigPage        = lazy(() => import('./admin/pages/SsoConfigPage'))
const PortalUsersPage      = lazy(() => import('./admin/pages/PortalUsersPage'))
const ChatboxConfigPage    = lazy(() => import('./admin/pages/ChatboxConfigPage'))
const ChatRecordsPage      = lazy(() => import('./admin/pages/ChatRecordsPage'))
const GatePage             = lazy(() => import('./admin/pages/GatePage'))
const SafetyAdminPage      = lazy(() => import('./admin/pages/SafetyPage'))
const NewsAdminPage        = lazy(() => import('./admin/pages/NewsPage'))
const DocumentsAdminPage   = lazy(() => import('./admin/pages/DocumentsPage'))
const CompliancePage       = lazy(() => import('./admin/pages/CompliancePage'))
const AuditTrailPage       = lazy(() => import('./admin/pages/AuditTrailPage'))
const SubmissionsPage      = lazy(() => import('./admin/pages/SubmissionsPage'))
const SafetyQueuePage      = lazy(() => import('./admin/pages/SafetyQueuePage'))
const AdminUsersPage      = lazy(() => import('./admin/pages/AdminUsersPage'))
const ReviewQueuePage     = lazy(() => import('./admin/pages/ReviewQueuePage'))

// Portal pages
import { PortalProvider }       from './portal/context/PortalContext'
import { usePortal }            from './portal/context/PortalContext'
import PortalLayout             from './portal/components/PortalLayout'
const PortalHomePage           = lazy(() => import('./portal/pages/PortalHomePage'))
const PortalLoginPage          = lazy(() => import('./portal/pages/LoginPage'))
const SubmitPage               = lazy(() => import('./portal/pages/SubmitPage'))
const TherapeuticAreasPage     = lazy(() => import('./portal/pages/TherapeuticAreasPage'))
const EventsPage               = lazy(() => import('./portal/pages/EventsPage'))
const EventDetailPage          = lazy(() => import('./portal/pages/EventDetailPage'))
const ResourcesPage            = lazy(() => import('./portal/pages/ResourcesPage'))
const DrugInfoPage             = lazy(() => import('./portal/pages/DrugInfoPage'))
const FindMSLPage              = lazy(() => import('./portal/pages/FindMSLPage'))
const MySubmissionsPage        = lazy(() => import('./portal/pages/MySubmissionsPage'))
const ContactPage              = lazy(() => import('./portal/pages/ContactPage'))
const PortalNotFoundPage       = lazy(() => import('./portal/pages/PortalNotFoundPage'))
const PortalUnavailablePage   = lazy(() => import('./portal/pages/PortalUnavailablePage'))
const SafetyPortalPage         = lazy(() => import('./portal/pages/SafetyPage'))
const NewsPortalPage           = lazy(() => import('./portal/pages/NewsPage'))
const NewsDetailPage           = lazy(() => import('./portal/pages/NewsDetailPage'))
const DocumentsPortalPage      = lazy(() => import('./portal/pages/DocumentsPage'))
const SavedItemsPage           = lazy(() => import('./portal/pages/SavedItemsPage'))
const VerifyEmailPage          = lazy(() => import('./portal/pages/VerifyEmailPage'))
const SsoCompletePage           = lazy(() => import('./portal/pages/SsoCompletePage'))
const PreferencesPage         = lazy(() => import('./portal/pages/PreferencesPage'))
const SearchResultsPage        = lazy(() => import('./portal/pages/SearchResultsPage'))
const MyActivityPage           = lazy(() => import('./portal/pages/MyActivityPage'))
const ProfilePage              = lazy(() => import('./portal/pages/ProfilePage'))
const ForgotPasswordPage       = lazy(() => import('./portal/pages/ForgotPasswordPage'))
const ResetPasswordPage        = lazy(() => import('./portal/pages/ResetPasswordPage'))
import { ToastProvider }        from './shared/components/Toast'
const AnalyticsPage            = lazy(() => import('./admin/pages/AnalyticsPage'))
const FeedbackPage             = lazy(() => import('./admin/pages/FeedbackPage'))
const EmailSettingsPage        = lazy(() => import('./admin/pages/EmailSettingsPage'))
const FAQAdminPage            = lazy(() => import('./admin/pages/FAQPage'))
const FAQPortalPage           = lazy(() => import('./portal/pages/FAQPage'))

const ClinicalTrialsPage      = lazy(() => import('./portal/pages/ClinicalTrialsPage'))
const TrainingPage            = lazy(() => import('./portal/pages/TrainingPage'))
const TrainingModulePage      = lazy(() => import('./portal/pages/TrainingModulePage'))

const TrialsAdminPage         = lazy(() => import('./admin/pages/TrialsAdminPage'))
const TrainingAdminPage       = lazy(() => import('./admin/pages/TrainingAdminPage'))

function AdminGuard({ children }) {
  const { admin, authLoading, signOut } = useAdminAuth()
  const location = useLocation()
  if (authLoading) return <div className="cp-loading">Restoring admin session...</div>
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  // CP-64: idle auto-logoff active only while authenticated in the admin console.
  // CPPM-40: signOut, so the server session ends too.
  return <><IdleTimeout timeoutMinutes={ADMIN_IDLE_MINUTES} onTimeout={signOut} />{children}</>
}

function FeatureGuard({ featureKey, children }) {
  const { isFeatureEnabled, clientCode, loading } = usePortal()
  if (loading) return <div className="pp-loading">Loading…</div>
  if (!isFeatureEnabled(featureKey)) return <Navigate to={`/portal/${clientCode}`} replace />
  return children
}

function PortalAuthGuard({ children }) {
  const { user, clientCode, loading, authLoading } = usePortal()
  const location = useLocation()
  // CPPM-59: wait for the sign-in check as well as the settings before redirecting.
  if (loading || authLoading) return <div className="pp-loading">Loading…</div>
  if (!user) return <Navigate to={`/portal/${clientCode}/login`} replace state={{ from: location.pathname }} />
  return children
}

// CP-64: portal idle auto-logoff — active only when a portal user is logged in
// (anonymous browsing has no session to expire). Reads user/logout from context.
function PortalIdleTimeout() {
  const { user, signOut } = usePortal()
  return <IdleTimeout timeoutMinutes={user ? PORTAL_IDLE_MINUTES : 0} onTimeout={signOut} />
}

// PortalContext records a failed config load in `error` and, until 2026-09-14,
// nothing read it — so an unknown client code rendered the default portal shell
// instead of saying the portal does not exist. This gate is that reader.
function PortalConfigGate({ children }) {
  const { error } = usePortal()
  if (error) return <PortalUnavailablePage />
  return children
}

function PortalRoutes() {
  return (
    <PortalProvider>
      <ToastProvider>
      <PortalConfigGate>
      <PortalIdleTimeout />
      <PortalLayout>
        <Suspense fallback={<div className="pp-loading">Loading…</div>}>
        <Routes>
          <Route index                    element={<PortalHomePage />} />
          <Route path="login"             element={<PortalLoginPage />} />
          <Route path="forgot-password"   element={<ForgotPasswordPage />} />
          <Route path="reset-password"    element={<ResetPasswordPage />} />
          <Route path="verify-email"     element={<VerifyEmailPage />} />
          <Route path="sso-complete"      element={<SsoCompletePage />} />
          {/* CPPM-106: any request form opens this page — SubmitPage itself shows only
              the forms that are switched on, and says so when none are. */}
          <Route path="submit"            element={<SubmitPage />} />
          <Route path="therapeutic-areas" element={<FeatureGuard featureKey="therapeutic_areas"><TherapeuticAreasPage /></FeatureGuard>} />
          <Route path="events"            element={<FeatureGuard featureKey="events"><EventsPage /></FeatureGuard>} />
          <Route path="events/:eventId"   element={<FeatureGuard featureKey="events"><EventDetailPage /></FeatureGuard>} />
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
          <Route path="trials"          element={<FeatureGuard featureKey="clinical_trials"><ClinicalTrialsPage /></FeatureGuard>} />
          <Route path="training"        element={<FeatureGuard featureKey="cme_training"><TrainingPage /></FeatureGuard>} />
          <Route path="training/:moduleId" element={<FeatureGuard featureKey="cme_training"><PortalAuthGuard><TrainingModulePage /></PortalAuthGuard></FeatureGuard>} />
          <Route path="*"                 element={<PortalNotFoundPage />} />
        </Routes>
        </Suspense>
      </PortalLayout>
      </PortalConfigGate>
      </ToastProvider>
    </PortalProvider>
  )
}

// CPPM-92: the admin sign-in check runs only for admin pages. It used to wrap the
// whole app, so every public portal page asked the server whether the visitor was
// signed in to the admin console.
export default function App() {
  return (
    // Pages load on demand, so a portal visitor never downloads the admin console.
    <Suspense fallback={<div className="cp-loading">Loading…</div>}>
    <Routes>
      {/* Public Portal — multi-tenant by clientCode */}
      <Route path="/portal/:clientCode/*" element={<PortalRoutes />} />
      <Route path="*" element={<AdminAuthProvider><AdminRoutes /></AdminAuthProvider>} />
    </Routes>
    </Suspense>
  )
}

function AdminRoutes() {
  return (
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
        <Route path="/admin/clients/:clientId/data-requests" element={<AdminGuard><DataRequestsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/sso" element={<AdminGuard><SsoConfigPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/users" element={<AdminGuard><PortalUsersPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/chatbox" element={<AdminGuard><ChatboxConfigPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/chat-records" element={<AdminGuard><ChatRecordsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/gate"       element={<AdminGuard><GatePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/safety"     element={<AdminGuard><SafetyAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/news"       element={<AdminGuard><NewsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/documents"  element={<AdminGuard><DocumentsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/compliance"   element={<AdminGuard><CompliancePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/audit"       element={<AdminGuard><AuditTrailPage /></AdminGuard>} />
        <Route path="/admin/audit" element={<AdminGuard><AuditTrailPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/submissions" element={<AdminGuard><SubmissionsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/safety-queue" element={<AdminGuard><SafetyQueuePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/analytics"    element={<AdminGuard><AnalyticsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/feedback"     element={<AdminGuard><FeedbackPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/admin-users"  element={<AdminGuard><AdminUsersPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/review-queue"    element={<AdminGuard><ReviewQueuePage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/email-settings" element={<AdminGuard><EmailSettingsPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/faq"           element={<AdminGuard><FAQAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/trials"        element={<AdminGuard><TrialsAdminPage /></AdminGuard>} />
        <Route path="/admin/clients/:clientId/training"      element={<AdminGuard><TrainingAdminPage /></AdminGuard>} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
  )
}
