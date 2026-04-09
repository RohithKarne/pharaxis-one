/**
 * ProtectedRoute.jsx (shared)
 * Works with both BrowserRouter (Max) and HashRouter (Admin, Content, DV).
 * If no token → redirects to /login within the current module's router.
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}
