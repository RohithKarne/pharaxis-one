import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './modules/auth/pages/LoginPage'
import SuperadminLoginPage from './modules/superadmin/pages/SuperadminLoginPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/vault" element={<div style={{padding:'40px'}}>Vault Dashboard — Coming in next prompt</div>} />
        <Route path="/superadmin" element={<SuperadminLoginPage />} />
        <Route path="/superadmin/dashboard" element={<div style={{padding:'40px'}}>SuperAdmin Dashboard — Coming in next prompt</div>} />
      </Routes>
    </BrowserRouter>
  )
}
