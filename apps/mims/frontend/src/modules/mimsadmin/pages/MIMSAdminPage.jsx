import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSAdminShell from '../components/MIMSAdminShell'

export default function MIMSAdminPage() {
  const [searchParams] = useSearchParams()
  const standalone = searchParams.get('standalone') === '1'

  if (!standalone) {
    return (
      <MIMSLayout showStatStrip={false} bodyClassName="no-scroll mims-admin-page-body" surfaceVariant="admin" compact>
        <MIMSAdminShell />
      </MIMSLayout>
    )
  }

  return (
    <div className="mims-admin-standalone">
      <MIMSAdminStandaloneHeader />
      <MIMSAdminShell />
    </div>
  )
}

function MIMSAdminStandaloneHeader() {
  const { user, logout, getInitials, formatRole } = useAuth()
  const navigate = useNavigate()
  const [userOpen, setUserOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/mims-admin/login', { replace: true })
  }

  return (
    <header className="mims-admin-standalone-header">
      <div className="mims-admin-standalone-brand">
        <div className="mims-admin-standalone-logo">M</div>
        <div>
          <div className="mims-admin-standalone-title">MIMS Admin</div>
          <div className="mims-admin-standalone-subtitle">Administration Console</div>
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
            <span className="mims-admin-standalone-caret">▾</span>
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
  )
}
