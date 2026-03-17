import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import { useEffect } from 'react'

const NAV_ITEMS = [
  { to: '/admin',          label: 'Dashboard',      icon: '🏠', exact: true },
  { to: '/admin/clients',  label: 'Clients',        icon: '🏢' },
]

const CLIENT_NAV = (id) => [
  { to: `/admin/clients/${id}`,             label: 'Overview',    icon: '📋' },
  { to: `/admin/clients/${id}/branding`,    label: 'Branding',    icon: '🎨' },
  { to: `/admin/clients/${id}/features`,    label: 'Features',    icon: '⚙️' },
  { to: `/admin/clients/${id}/content`,     label: 'Content',     icon: '📄' },
  { to: `/admin/clients/${id}/forms`,       label: 'Forms',       icon: '📝' },
  { to: `/admin/clients/${id}/msls`,        label: 'MSL Directory', icon: '👤' },
  { to: `/admin/clients/${id}/integration`, label: 'Integration', icon: '🔗' },
  { to: `/admin/clients/${id}/users`,       label: 'Portal Users', icon: '👥' },
  { to: `/admin/clients/${id}/chatbox`,     label: 'Chatbox AI',  icon: '🤖' },
  { to: `/admin/clients/${id}/gate`,        label: 'User Gate',   icon: '🚪' },
  { to: `/admin/clients/${id}/safety`,      label: 'Safety Alerts', icon: '⚠️' },
  { to: `/admin/clients/${id}/news`,        label: 'News',          icon: '📰' },
  { to: `/admin/clients/${id}/documents`,   label: 'Documents',     icon: '📁' },
  { to: `/admin/clients/${id}/compliance`,  label: 'Compliance',    icon: '🔒' },
]

const SEGMENT_TITLES = {
  branding:    'Branding',
  content:     'Content',
  news:        'News',
  safety:      'Safety',
  documents:   'Documents',
  forms:       'Forms',
  features:    'Features',
  gate:        'Access Gate',
  integration: 'Integration',
  chatbox:     'Chatbox',
  compliance:  'Compliance',
  users:       'Portal Users',
  msls:        'MSL Management',
  clients:     'Clients',
}

function deriveTitle(pathname) {
  if (pathname === '/admin' || pathname === '/admin/') return 'Dashboard'
  const lastSegment = pathname.split('/').filter(Boolean).pop() || ''
  return SEGMENT_TITLES[lastSegment] || 'Admin'
}

export default function AdminLayout({ children }) {
  const { admin, logout } = useAdminAuth()
  const navigate = useNavigate()
  const { clientId } = useParams()
  const location = useLocation()

  const pageTitle = deriveTitle(location.pathname)

  useEffect(() => {
    document.title = `${pageTitle} | CP Admin`
  }, [pageTitle])

  function handleLogout() { logout(); navigate('/admin/login') }

  return (
    <div className="cp-admin-wrapper">
      <aside className="cp-admin-sidebar">
        <div className="cp-sidebar-brand">
          <span className="cp-brand-icon">&#9877;</span>
          <span className="cp-brand-name">CP Portal<br /><span className="cp-brand-small">Admin Console</span></span>
        </div>

        <nav className="cp-sidebar-nav">
          <div className="cp-nav-section-label">Main</div>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => `cp-nav-item ${isActive ? 'active' : ''}`}
              end={item.exact}>
              <span className="cp-nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {clientId && (
            <>
              <div className="cp-nav-section-label" style={{ marginTop: 16 }}>Client Config</div>
              {CLIENT_NAV(clientId).map(item => (
                <NavLink key={item.to} to={item.to}
                  className={({ isActive }) => `cp-nav-item ${isActive ? 'active' : ''}`}>
                  <span className="cp-nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="cp-sidebar-footer">
          <div className="cp-admin-name">{admin?.name}</div>
          <div className="cp-admin-role">{admin?.role}</div>
          <button className="cp-logout-btn" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="cp-admin-main">
        <div className="cp-admin-topbar">
          <h1 className="cp-topbar-title">{pageTitle}</h1>
        </div>
        <div className="cp-admin-content">
          {children}
        </div>
      </div>
    </div>
  )
}
