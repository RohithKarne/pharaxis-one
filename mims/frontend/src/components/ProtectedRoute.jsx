/**
 * ProtectedRoute.jsx — Auth Guard Component
 *
 * WHAT THIS DOES:
 * Wraps any page that requires login.
 * If no token → redirects to /login automatically.
 * If logged in → shows the page normally.
 *
 * HOW TO USE:
 * In App.jsx:
 *   <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../shared/context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { token } = useAuth();

  if (!token) {
    // Not logged in — redirect to login page
    return <Navigate to="/login" replace />;
  }

  return children;
}
