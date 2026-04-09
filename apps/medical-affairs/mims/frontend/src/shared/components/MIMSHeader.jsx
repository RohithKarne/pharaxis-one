/**
 * MIMSHeader.jsx — Top header bar
 * Logo | Date | User dropdown | Org | Primary Site | ⚙️ Settings | 🔔 Bell | ❓ Help | Logout
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function MIMSHeader({ onBellClick }) {
  const { user, token, orgName, orgId, siteName, allOrgs, switchOrg, refreshOrgAccess, logout, getInitials, hasModuleAccess } = useAuth()
  const navigate = useNavigate()

  const [orgLogoUrl, setOrgLogoUrl] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userOpen,     setUserOpen]     = useState(false)
  const [orgOpen,      setOrgOpen]      = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const settingsRef = useRef(null)
  const userRef     = useRef(null)
  const orgRef      = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false)
      if (userRef.current    && !userRef.current.contains(e.target))    setUserOpen(false)
      if (orgRef.current     && !orgRef.current.contains(e.target))     setOrgOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    refreshOrgAccess()
  }, [refreshOrgAccess])

  useEffect(() => {
    if (!token) return
    fetch('/api/auth/org-logo', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.logo_url) setOrgLogoUrl(data.logo_url) })
      .catch(() => {})
  }, [orgId, token])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })

  function handleLogout() {
    logout()
    navigate('/login')
  }

  async function handleChangePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return setPasswordMsg({ type: 'error', text: 'New password and confirm password must match.' })
    }
    if ((passwordForm.newPassword || '').length < 8) {
      return setPasswordMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
    }

    setSavingPassword(true)
    setPasswordMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return setPasswordMsg({ type: 'error', text: data.error || 'Could not change password.' })
      }
      setPasswordMsg({ type: 'success', text: data.message || 'Password updated successfully.' })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => {
        setPasswordOpen(false)
        setPasswordMsg({ type: '', text: '' })
      }, 1200)
    } catch {
      setPasswordMsg({ type: 'error', text: 'Cannot connect to server.' })
    } finally {
      setSavingPassword(false)
    }
  }

  const canAccessAdmin   = hasModuleAccess('admin_console')
  const canAccessContent = hasModuleAccess('content_mgmt')

  return (
    <header className="mims-header">
      {/* Logo */}
      <div className="mims-header-logo">
        {orgLogoUrl ? (
          <img
            src={orgLogoUrl}
            alt={orgName || 'Organisation logo'}
            style={{ height: 32, maxWidth: 120, objectFit: 'contain', borderRadius: 4 }}
          />
        ) : (
          <>
            <div className="mims-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" fill="#e8890c" stroke="#e8890c" strokeWidth="1"/>
              </svg>
            </div>
            <span className="mims-logo-text">MIMS</span>
          </>
        )}
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
              <div className="mims-dropdown-item" onClick={() => {
                setUserOpen(false)
                setPasswordOpen(true)
                setPasswordMsg({ type: '', text: '' })
              }}>
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

        {/* Org — clickable switcher if user has multiple orgs */}
        <div className="mims-header-meta" ref={orgRef}
          style={{ cursor: allOrgs.length > 1 ? 'pointer' : 'default', position: 'relative', userSelect: 'none' }}
          onClick={() => allOrgs.length > 1 && setOrgOpen(o => !o)}
        >
          <span className="mims-meta-label">
            Organization {allOrgs.length > 1 && <span style={{ fontSize: 10 }}>▾</span>}
          </span>
          <span className="mims-meta-value">
            {orgName || 'MIMS'}
          </span>
          {orgOpen && allOrgs.length > 1 && (
            <div className="mims-dropdown" style={{ minWidth: 180, top: '100%', left: 0 }}>
              {allOrgs.map(o => (
                <div key={o.orgId} className="mims-dropdown-item"
                  style={{ fontWeight: o.orgName === orgName ? 700 : 400 }}
                  onClick={() => { setOrgOpen(false); if (o.orgName !== orgName) switchOrg(o.orgId) }}
                >
                  {o.orgName === orgName && <span style={{ marginRight: 6 }}>✓</span>}
                  {o.orgName}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Primary Site */}
        <div className="mims-header-meta">
          <span className="mims-meta-label">Primary Site</span>
          <span className="mims-meta-value">{siteName || 'Global'}</span>
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

      {passwordOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
        }}>
          <div style={{
            width: '100%', maxWidth: 420, background: '#fff', borderRadius: 12,
            border: '1px solid #ddd', padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Change Password</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Update your MIMS password from inside the application.
            </div>

            {passwordMsg.text && (
              <div className={`alert alert-${passwordMsg.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: 12 }}>
                {passwordMsg.text}
              </div>
            )}

            <div className="form-group">
              <label>Current Password</label>
              <input
                className="form-control"
                type="password"
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                className="form-control"
                type="password"
                minLength={8}
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                className="form-control"
                type="password"
                minLength={8}
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" type="button" onClick={handleChangePassword} disabled={savingPassword}>
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => {
                setPasswordOpen(false)
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                setPasswordMsg({ type: '', text: '' })
              }} disabled={savingPassword}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
