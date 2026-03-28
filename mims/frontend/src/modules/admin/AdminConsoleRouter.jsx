/**
 * AdminConsoleRouter.jsx — Sub-router for /admin-console/*
 * index  → AdminConsoleOverview (card grid)
 * :section → AdminConsolePage (section detail with back button)
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import AdminConsolePage from './pages/AdminConsolePage'

export default function AdminConsoleRouter() {
  return (
    <Routes>
      <Route index element={<Navigate to="sites-setup" replace />} />
      <Route path=":section" element={<AdminConsolePage />} />
    </Routes>
  )
}
