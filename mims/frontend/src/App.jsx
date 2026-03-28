/**
 * App.jsx — Root Component & Router
 *
 * WHAT THIS FILE DOES:
 * Defines all the URL routes for the app.
 * Think of it as the "table of contents" — which URL shows which page.
 *
 * ROUTES:
 *   /           → redirects to /login
 *   /login      → LoginPage (public)
 *   /dashboard  → DashboardPage (protected — login required)
 *   /inbox      → InboxPage (protected)
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import InboxPage from './pages/InboxPage'
import AdminConsolePage from './pages/AdminConsolePage'
import CasesPage from './modules/cases/pages/CasesPage'
import CaseFormPage from './modules/cases/pages/CaseFormPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminConsolePage /></ProtectedRoute>} />
      <Route path="/cases" element={<ProtectedRoute><CasesPage /></ProtectedRoute>} />
      <Route path="/cases/:id" element={<ProtectedRoute><CaseFormPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
