/**
 * MIMSHeader.jsx — Top header bar
 * Logo | Date | User dropdown | Org | Primary Site | ⚙️ Settings | 🔔 Bell | ❓ Help | Logout
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function MIMSHeader({ onBellClick }) {
  const { user, logout, getInitials, hasModuleAccess } = useAuth()
  const navigate = useNavigate()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const settingsRef = useRef(null)
  const userRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false)
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const canAccessAdmin   = hasModuleAccess('admin_console')
  const canAccessContent = hasModuleAccess('content_mgmt')

  return (
    <header className="mims-header">
      {/* Logo */}
      <div className="mims-header-logo">
        <div className="mims-logo-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" fill="#e8890c" stroke="#e8890c" strokeWidth="1"/>
          </svg>
        </div>
        <span className="mims-logo-text">MIMS</span>
      </div>

      {/* Date */}
      <div className="mims-header-date">{today}</div>

      {/* Right side: user, org, site, icons */}
      <div className="mims-header-right">

        {/* User dropdown */}
        <div className="mims-header-user" ref={userRef} onClick={() => setUserOpen(o => !o)}>
          <div className="mims-user-avatar">{getInitials()}</div>
          <span className="mims-user-name">{user?.name || user?.email}</span>
          <span className="mims-dropdown-arrow">▾</span>
          {userOpen && (
            <div className="mims-dropdown">
              <div className="mims-dropdown-item" onClick={() => { setUserOpen(false) }}>
                👤 My Profile
              </div>
              <div className="mims-dropdown-item" onClick={() => { setUserOpen(false) }}>
                🔑 Change Password
              </div>
              <div className="mims-dropdown-divider" />
              <div className="mims-dropdown-item mims-dropdown-logout" onClick={() => { setUserOpen(false); handleLogout() }}>
                🚪 Sign Out
              </div>
            </div>
          )}
        </div>

        <div className="mims-header-divider" />

        {/* Org */}
        <div className="mims-header-meta">
          <span className="mims-meta-label">Organization</span>
          <span className="mims-meta-value">{user?.org_name || 'MIMS'}</span>
        </div>

        {/* Primary Site */}
        <div className="mims-header-meta">
          <span className="mims-meta-label">Primary Site</span>
          <span className="mims-meta-value">{user?.site_name || 'Global'}</span>
        </div>

        <div className="mims-header-divider" />

        {/* Bell — notification overlay */}
        <div className="mims-icon-btn" title="Notifications" onClick={onBellClick}>
          🔔
        </div>

        {/* Help */}
        <div className="mims-icon-btn" title="Help">
          ❓
        </div>

        {/* Settings gear — Admin Console + Content Management (always visible, rightmost) */}
        <div className="mims-icon-btn" ref={settingsRef} title="Settings"
          onClick={() => (canAccessAdmin || canAccessContent) && setSettingsOpen(o => !o)}
          style={{ opacity: (canAccessAdmin || canAccessContent) ? 1 : 0.4, cursor: (canAccessAdmin || canAccessContent) ? 'pointer' : 'default' }}
        >
          ⚙️
          {settingsOpen && (
            <div className="mims-dropdown mims-dropdown-right">
              {canAccessAdmin && (
                <div className="mims-dropdown-item" onClick={() => { setSettingsOpen(false); navigate('/admin-console') }}>
                  ⚙️ Admin Console
                </div>
              )}
              {canAccessContent && (
                <div className="mims-dropdown-item" onClick={() => { setSettingsOpen(false); navigate('/content') }}>
                  📄 Content Management
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
