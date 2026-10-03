import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const AdminAuthContext = createContext(null)
const PENDING_SIGNOUT = 'cp_admin_signout_pending' // CPPM-40

export function AdminAuthProvider({ children }) {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  // One plain notice when the server cannot be reached or fails on a load or a save, shown
  // once however many requests fail together, so a failed load is never read as "nothing
  // here" and a failed save never as done. Screens still handle the failure their own way.
  const [failNotice, setFailNotice] = useState('')
  const lastNotice = useRef(0)
  function noticeFailure(text) {
    const now = Date.now()
    if (now - lastNotice.current < 30000) return
    lastNotice.current = now
    setFailNotice(text)
    setTimeout(() => setFailNotice(''), 10000)
  }

  function login(_token, adminData) {
    localStorage.removeItem('cp_admin_token')
    localStorage.removeItem(PENDING_SIGNOUT)
    localStorage.setItem('cp_admin', JSON.stringify(adminData))
    setAdmin(adminData)
    setAuthLoading(false)
  }

  function logout() {
    localStorage.removeItem('cp_admin_token')
    localStorage.removeItem('cp_admin')
    setAdmin(null)
    setAuthLoading(false)
  }

  // CPPM-40: Sign Out and the idle timeout also end the session on the server (the
  // cookie is httpOnly). Same shape as the portal: an unreachable server is remembered
  // and finished before the next session check; logout() stays browser-only.
  function endServerSession() {
    return fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin', keepalive: true })
      .then(res => { if (res.ok) localStorage.removeItem(PENDING_SIGNOUT) })
      .catch(() => {})
  }

  function signOut() {
    localStorage.setItem(PENDING_SIGNOUT, '1')
    endServerSession()
    logout()
  }

  // AUTH-06: central fetch helper — attaches admin auth header and auto-logs out on 401
  async function adminFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
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

  // AUTH-06b: global 401 safety net for the raw page-level fetches that don't go
  // through adminFetch. Every /api/admin/* endpoint is authed, so a 401 there always
  // means the session expired → log out and bounce to login instead of leaving the
  // page stuck on an empty/error state. Scoped to /api/admin/ so it never affects
  // portal fetches (which have public-optional endpoints), and it excludes the auth
  // routes so a bad-login 401 keeps showing its own inline error.
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    let active = true
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '')
      const isAdminApi = url.includes('/api/admin/')
      let res
      try {
        res = await originalFetch(...args)
      } catch (err) {
        if (active && isAdminApi && err?.name !== 'AbortError') noticeFailure('Could not reach the server. Check your connection, then reload.')
        throw err
      }
      try {
        const method = String(args[1]?.method || 'GET').toUpperCase()
        if (active && isAdminApi && res.status >= 500) {
          noticeFailure(method === 'GET'
            ? 'Could not load everything on this page: the server reported an error. Try again in a moment.'
            : 'The server reported an error, so your last change may not have been saved. Check it and try again.')
        }
        if (active && res.status === 401 && url.includes('/api/admin/') && !url.includes('/api/admin/auth/')) {
          logout()
          navigate('/admin/login', { replace: true })
        }
      } catch { /* an interceptor must never break the underlying request */ }
      return res
    }
    return () => { active = false; window.fetch = originalFetch }
  }, [])

  // Restore admin session from server on mount — handles case where localStorage
  // was cleared but the auth cookie / token is still valid.
  // NOTE: this probe uses a RAW fetch, not adminFetch, on purpose. AdminAuthProvider
  // wraps the whole app (admin console AND every public portal page), so this runs on
  // every load. adminFetch redirects to /admin/login on any 401 — which would hijack
  // anonymous portal visitors (who correctly get 401 here). The restore must be silent:
  // 200 → set admin; anything else → clear state and stay put. Admin routes are still
  // guarded by AdminGuard, which is what actually redirects unauthenticated admins.
  useEffect(() => {
    setAuthLoading(true)
    localStorage.removeItem('cp_admin_token')
    const pending = localStorage.getItem(PENDING_SIGNOUT) ? endServerSession() : Promise.resolve()
    pending
      .then(() => fetch('/api/admin/auth/me', { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }))
      .then(async (res) => {
        if (res.status === 200) {
          const d = await res.json()
          setAdmin(d.admin)
        } else {
          logout()
        }
      })
      .catch(() => logout())
      .finally(() => setAuthLoading(false))
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
  // CPPM-60: may this person change things in an area (the first part of the API
  // path, e.g. 'faq', 'branding')? The server sends its own table with the session,
  // so the screens offer only what the server will accept. An area it does not
  // list is admin only, as on the server.
  function canChange(area) {
    const known = admin?.can_change?.[area]
    return known === undefined ? hasRole('superadmin', 'admin') : known
  }

  return (
    <AdminAuthContext.Provider value={{ admin, authLoading, login, logout, signOut, adminFetch, hasRole, canWrite, canApprove, canPublish, canChange }}>
      {children}
      {failNotice && (
        <div className="cp-fail-notice" role="alert">
          <span>{failNotice}</span>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
          <button type="button" aria-label="Dismiss" onClick={() => setFailNotice('')}>×</button>
        </div>
      )}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() { return useContext(AdminAuthContext) }

export function adminHeaders() {
  return { 'Content-Type': 'application/json' }
}
