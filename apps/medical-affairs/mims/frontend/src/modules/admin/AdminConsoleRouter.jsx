/**
 * AdminConsoleRouter.jsx — Sub-router for /admin-console/*
 * index  → AdminConsoleOverview (card grid)
 * :section → AdminConsolePage (section detail with back button)
 */

import { Routes, Route } from 'react-router-dom'
import AdminConsolePage from './pages/AdminConsolePage'
import AdminConsoleOverview from './pages/AdminConsoleOverview'

export default function AdminConsoleRouter() {
  return (
    <Routes>
      <Route index element={<AdminConsoleOverview />} />
      <Route path=":section" element={<AdminConsolePage />} />
    </Routes>
  )
}
