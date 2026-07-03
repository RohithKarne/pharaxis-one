import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAdminAuth, adminHeaders } from '../context/AdminAuthContext'
import PageLoader from './PageLoader'

const NAV_ITEMS = [
  { to: '/admin',                  label: 'Dashboard',       icon: '🏠', exact: true },
  { to: '/admin/clients',          label: 'Clients',         icon: '🏢' },
]

// ── #1 Grouped + collapsible client nav ───────────────────────────────────
const CLIENT_NAV_GROUPS = (id) => [
  {
    key: 'overview',
    label: null, // no header — always visible
    items: [
      { to: `/admin/clients/${id}`, label: 'Overview', icon: '📋', exact: true },
    ],
  },
  {
    key: 'experience',
    label: 'Branding & Experience',
    items: [
      { to: `/admin/clients/${id}/branding`,  label: 'Branding',   icon: '🎨' },
      { to: `/admin/clients/${id}/features`,  label: 'Features',   icon: '⚙️' },
      { to: `/admin/clients/${id}/gate`,      label: 'User Gate',  icon: '🚪' },
      { to: `/admin/clients/${id}/chatbox`,   label: 'Chatbox AI', icon: '🤖' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    items: [
      { to: `/admin/clients/${id}/content`,      label: 'Content',       icon: '📄' },
      { to: `/admin/clients/${id}/news`,         label: 'News',          icon: '📰' },
      { to: `/admin/clients/${id}/safety`,       label: 'Safety Alerts', icon: '⚠️' },
      { to: `/admin/clients/${id}/documents`,    label: 'Documents',     icon: '📁' },
      { to: `/admin/clients/${id}/msls`,         label: 'MSL Directory', icon: '👤' },
      { to: `/admin/clients/${id}/faq`,          label: 'FAQ',           icon: '❓' },
      { to: `/admin/clients/${id}/review-queue`, label: 'Review Queue',  icon: '🔍', badge: true },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance & Forms',
    items: [
      { to: `/admin/clients/${id}/compliance`,     label: 'Compliance',     icon: '🔒' },
      { to: `/admin/clients/${id}/forms`,          label: 'Forms',          icon: '📝' },
      { to: `/admin/clients/${id}/email-settings`, label: 'Email Settings', icon: '✉️' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { to: `/admin/clients/${id}/users`,        label: 'Portal Users', icon: '👥' },
      { to: `/admin/clients/${id}/submissions`,  label: 'Submissions',  icon: '📨' },
      { to: `/admin/clients/${id}/integration`,  label: 'Integration',  icon: '🔗' },
      { to: `/admin/clients/${id}/audit`,        label: 'Audit Trail',    icon: '📋' },
      { to: `/admin/clients/${id}/analytics`,   label: 'Analytics',      icon: '📊' },
      { to: `/admin/clients/${id}/feedback`,    label: 'Feedback',       icon: '💬' },
      { to: `/admin/clients/${id}/admin-users`, label: 'Admin Users',    icon: '🔑' },
    ],
  },
]

const SEGMENT_TITLES = {
  branding:       'Branding',
  content:        'Content',
  news:           'News',
  safety:         'Safety',
  documents:      'Documents',
  forms:          'Forms',
  features:       'Features',
  gate:           'Access Gate',
  integration:    'Integration',
  chatbox:        'Chatbox',
  compliance:     'Compliance',
  users:          'Portal Users',
  submissions:    'Submissions',
  msls:           'MSL Management',
  clients:        'Clients',
  audit:          'Audit Trail',
  'admin-users':  'Admin Users',
  'review-queue':    'Review Queue',
  'email-settings':  'Email Settings',
  analytics:      'Analytics',
  feedback:       'Feedback',
  faq:            'FAQ',
}

function deriveTitle(pathname) {
  if (pathname === '/admin' || pathname === '/admin/') return 'Dashboard'
  const lastSegment = pathname.split('/').filter(Boolean).pop() || ''
  return SEGMENT_TITLES[lastSegment] || 'Admin'
}

export default function AdminLayout({ children }) {
  const { admin, logout } = useAdminAuth()
  const navigate  = useNavigate()
  const { clientId } = useParams()
  const location  = useLocation()
  const pageTitle = deriveTitle(location.pathname)
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    const saved = sessionStorage.getItem('cp_sidebar_compact')
    return saved !== null ? saved === 'true' : false
  })

  // ── #1 Collapsible sidebar groups — default all open ────────────────────
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const saved = sessionStorage.getItem('cp_nav_groups')
      return saved ? JSON.parse(saved) : { experience: true, content: true, compliance: true, operations: true }
    } catch { return { experience: true, content: true, compliance: true, operations: true } }
  })

  // S4-8: Review queue badge count — fetch total items in 'review' status
  const [reviewCount, setReviewCount] = useState(0)
  useEffect(() => {
    if (!clientId) return
    fetch(`/api/admin/review-queue/${clientId}/count`, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count != null) setReviewCount(d.count) })
      .catch(() => {})
  }, [clientId, location.pathname])

  // Client logo — fetch branding when a client is selected
  const [clientLogo, setClientLogo] = useState(null)
  const [clientName, setClientName] = useState(null)
  useEffect(() => {
    if (!clientId) { setClientLogo(null); setClientName(null); return }
    fetch(`/api/admin/branding/${clientId}`, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setClientLogo(d?.branding?.logo_url || null); setClientName(d?.branding?.portal_name || null) })
      .catch(() => {})
  }, [clientId])

  useEffect(() => {
    document.title = `${pageTitle} | CP Admin`
  }, [pageTitle])

  function handleLogout() {
    sessionStorage.removeItem('cp_sidebar_compact')
    sessionStorage.removeItem('cp_nav_groups')
    logout()
    navigate('/admin/login')
  }

  function toggleGroup(key) {
    setOpenGroups(g => {
      const next = { ...g, [key]: !g[key] }
      sessionStorage.setItem('cp_nav_groups', JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="cp-admin-wrapper">
      <PageLoader />
      <aside className={`cp-admin-sidebar${sidebarCompact ? ' compact' : ''}`}>
        <div className="cp-sidebar-brand">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
            <rect width="32" height="32" rx="7" fill="#6B3FA0"/>
            <rect x="13" y="6" width="6" height="20" rx="2.5" fill="white"/>
            <rect x="6" y="13" width="20" height="6" rx="2.5" fill="white"/>
          </svg>
          <span className="cp-brand-name">
            CP Portal
            <span className="cp-brand-small">Admin Console</span>
          </span>
        </div>

        <nav className="cp-sidebar-nav">
          <div className="cp-nav-section-label" style={{ marginBottom: 4 }}>Main</div>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to} to={item.to} end={item.exact}
              title={item.label}
              className={({ isActive }) => `cp-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="cp-nav-icon">{item.icon}</span>
              <span className="cp-nav-text">{item.label}</span>
            </NavLink>
          ))}

          {clientId && clientLogo && (
            <div style={{
              margin: '12px 8px 0',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 48,
            }}>
              <img
                src={clientLogo}
                alt={clientName || 'Client logo'}
                style={{ maxHeight: 32, maxWidth: 100, objectFit: 'contain', borderRadius: 4 }}
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              {clientName && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {clientName}
                </span>
              )}
            </div>
          )}

          {clientId && (
            <div className="cp-client-nav-groups">
              {CLIENT_NAV_GROUPS(clientId).map(group => (
                <div key={group.key}>
                  {/* Groups with a label are collapsible */}
                  {group.label ? (
                    <button
                      className="cp-nav-group-header"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <span className="cp-nav-group-label">{group.label}</span>
                      <span className="cp-nav-group-toggle">
                        {openGroups[group.key] ? '▾' : '▸'}
                      </span>
                    </button>
                  ) : (
                    <div style={{ marginTop: 12 }} />
                  )}

                  {(group.label ? (sidebarCompact ? true : openGroups[group.key]) : true) && (
                    <div className={group.label ? 'cp-nav-group-items' : ''}>
                      {group.items.map(item => (
                        <NavLink
                          key={item.to} to={item.to} end={item.exact}
                          title={item.label}
                          className={({ isActive }) => `cp-nav-item${isActive ? ' active' : ''}`}
                        >
                          <span className="cp-nav-icon">{item.icon}</span>
                          <span className="cp-nav-text">{item.label}</span>
                          {item.badge && reviewCount > 0 && (
                            <span style={{
                              marginLeft: 'auto', background: '#DC2626', color: '#fff',
                              borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700,
                            }}>
                              {reviewCount}
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
          <button
            className="cp-sidebar-toggle"
            onClick={() => setSidebarCompact(c => { const next = !c; sessionStorage.setItem('cp_sidebar_compact', next); return next })}
            aria-label={sidebarCompact ? 'Expand menu' : 'Collapse menu'}
            title={sidebarCompact ? 'Expand menu' : 'Collapse menu'}
          >
            {sidebarCompact ? '⟩⟩' : '⟨⟨'}
          </button>
          <h1 className="cp-topbar-title">{pageTitle}</h1>
        </div>
        <div className="cp-admin-content">
          {children}
        </div>
      </div>
    </div>
  )
}
