/**
 * ProtectedRoute.jsx (shared)
 * Works with both BrowserRouter (Max) and HashRouter (Admin, Content, DV).
 * If no token → redirects to /login within the current module's router.
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, loginPath = '/login' }) {
  const { token, restoring, serverUnreachable } = useAuth()
  const boxStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: '60vh', color: '#94a3b8', fontSize: 14 }
  // A cookie-backed session may still be rehydrating (the JWT is httpOnly-cookie
  // only — never in localStorage), so wait instead of bouncing a valid session
  // to /login on every hard refresh.
  if (restoring) {
    return (
      <div style={boxStyle} role="status">
        {serverUnreachable ? 'The MIMS server is restarting — reconnecting…' : 'Restoring session…'}
      </div>
    )
  }
  // Still unreachable after about a minute: say so, rather than showing the
  // sign-in page as if the session had ended (M-51).
  if (!token && serverUnreachable) {
    return (
      <div style={boxStyle} role="alert">
        The MIMS server isn’t responding.
        <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>Try again</button>
      </div>
    )
  }
  if (!token) return <Navigate to={loginPath} replace />
  return children
}
