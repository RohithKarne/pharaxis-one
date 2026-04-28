/**
 * Topbar.jsx — Top Header Bar (Sprint 7: Org Switcher)
 * Shows: sidebar toggle | page title | org switcher | date | status | user profile | sign out
 * Org switcher: "Organization [Name] ▼" — dropdown for multi-org users, static for single-org
 * Superadmin: no org switcher shown
 */

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { httpFetch } from '../api/httpFetch.js'

export default function Topbar({ title, onToggleSidebar }) {
  const { user, logout, getInitials, formatRole, orgId, orgName, allOrgs, switchOrg } = useAuth()
  const navigate = useNavigate()
  const [backendOnline, setBackendOnline]     = useState(null)
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false)
  const [switching, setSwitching]             = useState(false)
  const dropdownRef = useRef(null)

  function handleLogout() { logout(); navigate('/login') }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const res = await httpFetch('/api/health', { cache: 'no-store' })
        if (!cancelled) setBackendOnline(res.ok)
      } catch { if (!cancelled) setBackendOnline(false) }
    }
    ping()
    const id = setInterval(ping, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setOrgDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSwitchOrg(newOrgId) {
    if (newOrgId === orgId) { setOrgDropdownOpen(false); return }
    setSwitching(true)
    setOrgDropdownOpen(false)
    await switchOrg(newOrgId)
  }

  const isMultiOrg      = allOrgs && allOrgs.length > 1
  const isSuperadmin    = user?.role === 'superadmin'
  const showOrgSwitcher = !isSuperadmin && orgName

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="btn-sidebar-toggle" onClick={onToggleSidebar} title="Toggle Sidebar">☰</button>
        <div className="topbar-title">{title}</div>
      </div>

      <div className="topbar-actions">

        {/* Org Switcher */}
        {showOrgSwitcher && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <div
              onClick={() => isMultiOrg && !switching && setOrgDropdownOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 13, color: 'var(--text-primary)',
                cursor: isMultiOrg ? 'pointer' : 'default',
                padding: '4px 8px', borderRadius: 6,
                background: orgDropdownOpen ? 'var(--bg-secondary)' : 'transparent',
                userSelect: 'none'
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Organization</span>
              <span style={{ fontWeight: 700, marginLeft: 4 }}>
                {switching ? 'Switching…' : orgName}
              </span>
              {isMultiOrg && !switching && (
                <span style={{ fontSize: 10, marginLeft: 2, color: 'var(--text-muted)' }}>▼</span>
              )}
            </div>

            {orgDropdownOpen && isMultiOrg && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 200, overflow: 'hidden'
              }}>
                {allOrgs.map(org => (
                  <div
                    key={org.orgId}
                    onClick={() => handleSwitchOrg(org.orgId)}
                    style={{
                      padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                      background: org.orgId === orgId ? 'var(--primary-light, #e8f0fe)' : 'transparent',
                      fontWeight: org.orgId === orgId ? 700 : 400,
                      color: org.orgId === orgId ? 'var(--primary)' : 'var(--text-primary)',
                      borderBottom: '1px solid var(--border)'
                    }}
                    onMouseEnter={e => { if (org.orgId !== orgId) e.currentTarget.style.background = 'var(--bg-secondary)' }}
                    onMouseLeave={e => { if (org.orgId !== orgId) e.currentTarget.style.background = 'transparent' }}
                  >
                    {org.orgName}
                    {org.orgId === orgId && <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>✓ Active</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="topbar-divider"></div>

        <span className="text-muted text-small">{today}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on />Frontend: On
          </span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot on={backendOnline} />Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
          </span>
        </div>

        <div className="topbar-divider"></div>

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

function StatusDot({ on }) {
  const color = on === null ? '#999' : (on ? '#1f9d55' : '#e01e5a')
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: color, marginRight: 6 }} />
}
