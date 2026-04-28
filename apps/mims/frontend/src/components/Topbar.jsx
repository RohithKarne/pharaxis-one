/**
 * Topbar.jsx — Top Header Bar Component
 */

import { useAuth } from '../shared/context/AuthContext'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { httpFetch } from '../shared/api/httpFetch.js'

export default function Topbar({ title, onToggleSidebar }) {
  const { user, orgName, logout, getInitials, formatRole } = useAuth()
  const navigate = useNavigate()
  const [backendOnline, setBackendOnline] = useState(null)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const res = await httpFetch('/api/health', { cache: 'no-store' })
        if (!res.ok) throw new Error('health not ok')
        if (!cancelled) setBackendOnline(true)
      } catch {
        if (!cancelled) setBackendOnline(false)
      }
    }
    ping()
    const id = setInterval(ping, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  function StatusDot({ on }) {
    const color = on === null ? '#999' : (on ? '#1f9d55' : '#e01e5a')
    return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: color, marginRight: 6 }} />
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="btn-sidebar-toggle" onClick={onToggleSidebar} title="Toggle Sidebar">☰</button>
        <div className="topbar-title">{title}</div>
      </div>

      <div className="topbar-actions">
        <span className="text-muted text-small">{today}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on />
            Frontend: On
          </span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on={backendOnline} />
            Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
          </span>
        </div>
        <div className="topbar-divider"></div>
        {orgName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'var(--primary-light, #e8f0fe)', borderRadius: 6, fontSize: 12, color: 'var(--primary, #4f46e5)', fontWeight: 600 }}>
            <span>🏢</span>
            <span>{orgName}</span>
          </div>
        )}
        <div className="topbar-profile">
          <div className="topbar-avatar">{getInitials()}</div>
          <div className="topbar-user-info">
            <div className="topbar-user-name">{user?.name || user?.email}</div>
            <div className="topbar-user-role">{formatRole(user?.role)}</div>
          </div>
        </div>
        <button className="btn-signout" onClick={handleLogout}>Sign Out</button>
      </div>
    </header>
  )
}
