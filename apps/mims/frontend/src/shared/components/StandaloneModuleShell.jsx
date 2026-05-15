import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function StandaloneModuleShell({ title, subtitle, logo = 'M', loginPath, children }) {
  const { user, logout, getInitials, formatRole } = useAuth()
  const navigate = useNavigate()
  const [userOpen, setUserOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate(loginPath, { replace: true })
  }

  return (
    <div className="mims-admin-standalone">
      <header className="mims-admin-standalone-header">
        <div className="mims-admin-standalone-brand">
          <div className="mims-admin-standalone-logo">{logo}</div>
          <div>
            <div className="mims-admin-standalone-title">{title}</div>
            <div className="mims-admin-standalone-subtitle">{subtitle}</div>
          </div>
        </div>

        <div className="mims-admin-standalone-meta">
          <div className="mims-admin-standalone-user">
            <button
              type="button"
              className="mims-admin-standalone-user-btn"
              onClick={() => setUserOpen(open => !open)}
            >
              <span className="mims-admin-standalone-avatar">{getInitials()}</span>
              <span className="mims-admin-standalone-user-copy">
                <strong>{user?.name || user?.email || 'Admin User'}</strong>
                <small>{formatRole(user?.role || 'admin')}</small>
              </span>
              <span className="mims-admin-standalone-caret">v</span>
            </button>

            {userOpen && (
              <div className="mims-admin-standalone-menu">
                <div className="mims-admin-standalone-menu-item">
                  Profile
                  <small>{user?.email || 'No email available'}</small>
                </div>
                <button type="button" className="mims-admin-standalone-menu-action" onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="standalone-module-content">
        {children}
      </div>
    </div>
  )
}
