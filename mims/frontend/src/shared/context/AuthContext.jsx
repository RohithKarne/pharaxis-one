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
export function AuthProvider({ children, storageKeyPrefix = 'mims', fallbackPrefixes = [] }) {
  const disableFallbackKey = `${storageKeyPrefix}_disable_fallback`;

  function loadFromPrefix(prefix) {
    const savedUser = localStorage.getItem(`${prefix}_user`);
    if (!savedUser) return null;
    return {
      user: JSON.parse(savedUser),
      token: localStorage.getItem(`${prefix}_token`) || null,
      modules: JSON.parse(localStorage.getItem(`${prefix}_modules`) || '[]'),
      prefix
    };
  }

  // Initialize from localStorage — so user stays logged in after refresh
  const [user, setUser] = useState(() => {
    const primary = loadFromPrefix(storageKeyPrefix);
    if (primary) return primary.user;
    const disableFallback = localStorage.getItem(disableFallbackKey) === '1';
    if (!disableFallback) {
      for (const p of fallbackPrefixes) {
        const fallback = loadFromPrefix(p);
        if (fallback) return fallback.user;
      }
    }
    return null;
  });

  const [token, setToken] = useState(() => {
    const primary = loadFromPrefix(storageKeyPrefix);
    if (primary) return primary.token;
    const disableFallback = localStorage.getItem(disableFallbackKey) === '1';
    if (!disableFallback) {
      for (const p of fallbackPrefixes) {
        const fallback = loadFromPrefix(p);
        if (fallback) return fallback.token;
      }
    }
    return null;
  });

  const [modules, setModules] = useState(() => {
    const primary = loadFromPrefix(storageKeyPrefix);
    if (primary) return primary.modules;
    const disableFallback = localStorage.getItem(disableFallbackKey) === '1';
    if (!disableFallback) {
      for (const p of fallbackPrefixes) {
        const fallback = loadFromPrefix(p);
        if (fallback) return fallback.modules;
      }
    }
    return [];
  });

  // Called after successful login — saves user + token + allowed modules
  function login(userData, authToken, allowedModules = []) {
    setUser(userData);
    setToken(authToken);
    setModules(allowedModules);
    localStorage.setItem(`${storageKeyPrefix}_user`, JSON.stringify(userData));
    localStorage.setItem(`${storageKeyPrefix}_token`, authToken);
    localStorage.setItem(`${storageKeyPrefix}_modules`, JSON.stringify(allowedModules));
    localStorage.removeItem(disableFallbackKey);
  }

  // Called on sign out — records logout in audit trail (AUD-03) then clears session
  async function logout() {
    try {
      const savedToken = localStorage.getItem(`${storageKeyPrefix}_token`);
      if (savedToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${savedToken}` }
        });
      }
    } catch { /* silent — logout proceeds even if API fails */ }
    setUser(null);
    setToken(null);
    setModules([]);
    localStorage.removeItem(`${storageKeyPrefix}_user`);
    localStorage.removeItem(`${storageKeyPrefix}_token`);
    localStorage.removeItem(`${storageKeyPrefix}_modules`);
    if (fallbackPrefixes.length > 0) {
      localStorage.setItem(disableFallbackKey, '1');
    }
  }

  // Helper: get initials from name (e.g. "John Smith" → "JS")
  function getInitials() {
    if (!user?.name) return '?';
    return user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // Helper: format role for display
  function formatRole(role) {
    const labels = {
      superadmin: 'Super Administrator',
      admin: 'Administrator',
      agent: 'MI Agent',
      reviewer: 'Reviewer',
      content_manager: 'Content Manager'
    };
    return labels[role] || role;
  }

  // Helper: check if user has access to a given module key
  function hasModuleAccess(module) {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    return modules.includes(module);
  }

  return (
    <AuthContext.Provider value={{ user, token, modules, login, logout, getInitials, formatRole, hasModuleAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — any component calls useAuth() to get user/login/logout
export function useAuth() {
  return useContext(AuthContext);
}
