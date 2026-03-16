import { Routes, Route, Navigate } from 'react-router-dom'
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

// Portal pages
import { PortalProvider }       from './portal/context/PortalContext'
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

function AdminGuard({ children }) {
  const { admin } = useAdminAuth()
  return admin ? children : <Navigate to="/admin/login" replace />
}

function PortalRoutes() {
  return (
    <PortalProvider>
      <PortalLayout>
        <Routes>
          <Route index                    element={<PortalHomePage />} />
          <Route path="login"             element={<PortalLoginPage />} />
          <Route path="submit"            element={<SubmitPage />} />
          <Route path="therapeutic-areas" element={<TherapeuticAreasPage />} />
          <Route path="events"            element={<EventsPage />} />
          <Route path="resources"         element={<ResourcesPage />} />
          <Route path="drug-info"         element={<DrugInfoPage />} />
          <Route path="find-msl"          element={<FindMSLPage />} />
          <Route path="my-submissions"    element={<MySubmissionsPage />} />
          <Route path="contact"           element={<ContactPage />} />
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

        {/* Public Portal — multi-tenant by clientCode */}
        <Route path="/portal/:clientCode/*" element={<PortalRoutes />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminAuthProvider>
  )
}
