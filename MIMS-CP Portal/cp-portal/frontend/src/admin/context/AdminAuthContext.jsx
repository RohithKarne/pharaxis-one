import { createContext, useContext, useState } from 'react'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_admin') || 'null') } catch { return null }
  })

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

  return (
    <AdminAuthContext.Provider value={{ admin, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() { return useContext(AdminAuthContext) }

export function adminHeaders() {
  const token = localStorage.getItem('cp_admin_token')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}
