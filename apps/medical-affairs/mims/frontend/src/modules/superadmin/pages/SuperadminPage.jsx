import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'
import { setSessionExpiryHandler } from '../utils/guardedFetch'

import DashboardView       from '../components/DashboardView'
import OrganisationsView   from '../components/OrganisationsView'
import TwoFactorConfigView from '../components/TwoFactorConfigView'
import UsersView           from '../components/UsersView'
import AlertsView          from '../components/AlertsView'
import NotificationsView   from '../components/NotificationsView'
import AuditView           from '../components/AuditView'
import LoginAuditView      from '../components/LoginAuditView'
import IntegrationsView    from '../components/IntegrationsView'
import ReportsAccessView   from '../components/ReportsAccessView'
import HelpContentView     from '../components/HelpContentView'
import CopyDivisionView    from '../components/CopyDivisionView'

const PAGE_TITLES = {
  'dashboard':      'Dashboard',
  'organizations':  'Organisations & Sites',
  '2fa-config':     '2FA Configuration',
  'users':          'User Management',
  'reports-access': 'Reports Access',
  'help-content':   'Help Content',
  'alerts':         'Alerts',
  'notifications':  'Notifications',
  'audit':          'Audit Trail',
  'login-audit':    'Login Audit',
  'integrations':   'Integrations',
  'copy-division':  'Copy Division',
}

export default function SuperadminPage() {
  const [activePage, setActivePage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('mims_sidebar_collapsed') === 'true'
  )
  const [theme, setThemeState] = useState(() =>
    localStorage.getItem('mims_theme') || 'light'
  )
  const [msg, setMsg] = useState({ text: '', type: '' })

  const navigate = useNavigate()
  const { token, logout } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    let handling = false
    setSessionExpiryHandler(async () => {
      if (handling) return
      handling = true
      try {
        await logout()
      } finally {
        navigate('/login', { replace: true })
      }
    })
    return () => setSessionExpiryHandler(null)
  }, [logout, navigate])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('mims_sidebar_collapsed', next)
  }

  return (
    <div className="app-wrapper">
      <Sidebar
        collapsed={collapsed}
        onCollapse={toggleSidebar}
        theme={theme}
        setTheme={setThemeState}
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <div className="main-content">
        <Topbar title={`Superadmin Console — ${PAGE_TITLES[activePage]}`} onToggleSidebar={toggleSidebar} />
        <main className="page-content">
          {msg.text && (
            <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginBottom: 12 }}>
              {msg.text}
            </div>
          )}
          {activePage === 'dashboard'      && <DashboardView H={H} setActivePage={setActivePage} />}
          {activePage === 'organizations'  && <OrganisationsView H={H} flash={flash} />}
          {activePage === '2fa-config'     && <TwoFactorConfigView H={H} flash={flash} />}
          {activePage === 'users'          && <UsersView H={H} flash={flash} />}
          {activePage === 'alerts'         && <AlertsView H={H} flash={flash} />}
          {activePage === 'notifications'  && <NotificationsView H={H} flash={flash} />}
          {activePage === 'audit'          && <AuditView H={H} endpoint="/api/superadmin/audit" />}
          {activePage === 'login-audit'    && <LoginAuditView H={H} />}
          {activePage === 'integrations'   && <IntegrationsView H={H} flash={flash} />}
          {activePage === 'reports-access' && <ReportsAccessView H={H} flash={flash} />}
          {activePage === 'help-content'   && <HelpContentView H={H} flash={flash} />}
          {activePage === 'copy-division'  && <CopyDivisionView H={H} flash={flash} />}
        </main>
      </div>
    </div>
  )
}
