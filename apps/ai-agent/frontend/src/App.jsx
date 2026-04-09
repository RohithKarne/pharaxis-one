import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import SuperadminLayout from './components/SuperadminLayout'
import DashboardPage from './pages/DashboardPage'
import OrgsPage from './pages/OrgsPage'
import UsagePage from './pages/UsagePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SuperadminLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="orgs" element={<OrgsPage />} />
          <Route path="usage" element={<UsagePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
