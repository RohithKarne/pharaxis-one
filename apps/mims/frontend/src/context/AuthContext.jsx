/**
 * AuthContext.jsx — Global Authentication State
 *
 * WHAT IS CONTEXT?
 * In React, if you want to share data between multiple components,
 * you use Context. Think of it as a global variable that any
 * component in the app can read.
 *
 * WHAT THIS FILE DOES:
 * - Stores the currently logged-in user (name, email, role, token)
 * - Provides login() and logout() functions any component can call
 * - Reads saved user from localStorage on app startup (so refresh = stay logged in)
 */

import { createContext, useContext, useState } from 'react';

// Create the context (an empty container for now)
const AuthContext = createContext(null);

// AuthProvider wraps the whole app — any component inside can access auth data
export function AuthProvider({ children }) {
  // Initialize from localStorage — so user stays logged in after refresh
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mims_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem('mims_token') || null);

  // Called after successful login — saves user + token
  function login(userData, authToken) {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('mims_user', JSON.stringify(userData));
    localStorage.setItem('mims_token', authToken);
  }

  // Called on sign out — records logout in audit trail (AUD-03) then clears session
  async function logout() {
    try {
      const savedToken = localStorage.getItem('mims_token');
      if (savedToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${savedToken}` }
        });
      }
    } catch { /* silent — logout proceeds even if API fails */ }
    setUser(null);
    setToken(null);
    localStorage.removeItem('mims_user');
    localStorage.removeItem('mims_token');
  }

  // Helper: get initials from name (e.g. "John Smith" → "JS")
  function getInitials() {
    if (!user?.name) return '?';
    return user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // Helper: format role for display
  function formatRole(role) {
    const labels = {
      admin: 'Administrator',
      agent: 'MI Agent',
      reviewer: 'Reviewer',
      content_manager: 'Content Manager'
    };
    return labels[role] || role;
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, getInitials, formatRole }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — any component calls useAuth() to get user/login/logout
export function useAuth() {
  return useContext(AuthContext);
}
