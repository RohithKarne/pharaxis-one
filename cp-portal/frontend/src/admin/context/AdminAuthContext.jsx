import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)

  function login(token, adminData) {
    localStorage.setItem('cp_admin_token', token)
    localStorage.setItem('cp_admin', JSON.stringify(adminData))
    setAdmin(adminData)
  }

  function logout() {
    localStorage.removeItem('cp_admin_token')
    localStorage.removeItem('cp_admin')
    setAdmin(null)
  }

  // AUTH-06: central fetch helper — attaches admin auth header and auto-logs out on 401
  async function adminFetch(url, options = {}) {
    const token = localStorage.getItem('cp_admin_token')
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    if (res.status === 401) {
      logout()
      navigate('/admin/login', { replace: true })
      return res
    }
    return res
  }

  // Restore admin session from server on mount — handles case where localStorage
  // was cleared but the auth cookie / token is still valid.
  useEffect(() => {
    adminFetch('/api/admin/auth/me')
      .then(async (res) => {
        if (res.status === 200) {
          const d = await res.json()
          setAdmin(d.admin)
        } else {
          logout()
        }
      })
      .catch(() => logout())
  }, [])

  // S4-10: role helper — true if the signed-in admin has one of the given roles
  function hasRole(...roles) {
    return roles.includes(admin?.role);
  }

  // S4-10: true if admin can write content (create/edit/publish)
  const canWrite    = hasRole('superadmin', 'admin', 'content_manager');
  // S4-10: true if admin can approve/reject review queue items
  const canApprove  = hasRole('superadmin', 'admin', 'reviewer');
  // S4-10: true if admin can publish / archive content
  const canPublish  = hasRole('superadmin', 'admin');

  return (
    <AdminAuthContext.Provider value={{ admin, login, logout, adminFetch, hasRole, canWrite, canApprove, canPublish }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() { return useContext(AdminAuthContext) }

export function adminHeaders() {
  const token = localStorage.getItem('cp_admin_token')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}
