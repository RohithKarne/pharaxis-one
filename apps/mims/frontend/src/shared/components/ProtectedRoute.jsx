/**
 * ProtectedRoute.jsx (shared)
 * Works with both BrowserRouter (Max) and HashRouter (Admin, Content, DV).
 * If no token → redirects to /login within the current module's router.
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, loginPath = '/login' }) {
  const { token, restoring } = useAuth()
  // A cookie-backed session may still be rehydrating (the JWT is httpOnly-cookie
  // only — never in localStorage), so wait instead of bouncing a valid session
  // to /login on every hard refresh.
  if (restoring) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8', fontSize: 14 }}>
        Restoring session…
      </div>
    )
  }
  if (!token) return <Navigate to={loginPath} replace />
  return children
}
