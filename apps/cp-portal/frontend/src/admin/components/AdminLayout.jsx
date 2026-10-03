import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAdminAuth, adminHeaders } from '../context/AdminAuthContext'
import PageLoader from './PageLoader'
import Icon from '../../shared/components/Icon'

const NAV_ITEMS = [
  { to: '/admin',                  label: 'Dashboard',       icon: 'grid', exact: true },
  { to: '/admin/clients',          label: 'Clients',         icon: 'building' },
  // CPPM-62: records that belong to no client (platform-admin sign-ins, failed
  // sign-ins for unknown emails). Shown to the platform admin only.
  { to: '/admin/audit',            label: 'Platform Audit Trail', icon: 'clipboard', exact: true, superadminOnly: true },
]

// ── #1 Grouped + collapsible client nav ───────────────────────────────────
const CLIENT_NAV_GROUPS = (id) => [
  {
    key: 'overview',
    label: null, // no header — always visible
    items: [
      { to: `/admin/clients/${id}`, label: 'Overview', icon: 'clipboard', exact: true },
    ],
  },
  {
    key: 'experience',
    label: 'Branding & Experience',
    items: [
      { to: `/admin/clients/${id}/branding`,  label: 'Branding',   icon: 'palette' },
      { to: `/admin/clients/${id}/features`,  label: 'Features',   icon: 'sliders' },
      { to: `/admin/clients/${id}/gate`,      label: 'User Gate',  icon: 'gate' },
      { to: `/admin/clients/${id}/chatbox`,   label: 'Chatbox AI', icon: 'message' },
      { to: `/admin/clients/${id}/chat-records`, label: 'Chat Conversations', icon: 'message' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    items: [
      { to: `/admin/clients/${id}/content`,      label: 'Content',       icon: 'file' },
      { to: `/admin/clients/${id}/news`,         label: 'News',          icon: 'news' },
      { to: `/admin/clients/${id}/safety`,       label: 'Safety Alerts', icon: 'shield' },
      { to: `/admin/clients/${id}/documents`,    label: 'Documents',     icon: 'folder' },
      { to: `/admin/clients/${id}/trials`,       label: 'Clinical Trials', icon: 'beaker' },
      { to: `/admin/clients/${id}/training`,     label: 'CME & Training',  icon: 'book' },
      { to: `/admin/clients/${id}/msls`,         label: 'MSL Directory', icon: 'users' },
      { to: `/admin/clients/${id}/faq`,          label: 'FAQ',           icon: 'help' },
      { to: `/admin/clients/${id}/review-queue`, label: 'Review Queue',  icon: 'search', badge: 'review' },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance & Forms',
    items: [
      { to: `/admin/clients/${id}/compliance`,     label: 'Compliance',     icon: 'lock' },
      { to: `/admin/clients/${id}/forms`,          label: 'Forms',          icon: 'form' },
      { to: `/admin/clients/${id}/email-settings`, label: 'Email Settings', icon: 'mail' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { to: `/admin/clients/${id}/users`,        label: 'Portal Users', icon: 'users' },
      { to: `/admin/clients/${id}/submissions`,  label: 'Submissions',  icon: 'inbox' },
      { to: `/admin/clients/${id}/safety-queue`, label: 'Safety Queue', icon: 'shield', badge: 'safety' },
      { to: `/admin/clients/${id}/integration`,  label: 'Integration',  icon: 'link' },
      { to: `/admin/clients/${id}/sync-health`,  label: 'Sync Health',  icon: 'chart' },
      { to: `/admin/clients/${id}/audit`,        label: 'Audit Trail',    icon: 'list' },
      { to: `/admin/clients/${id}/data-requests`, label: 'Data Requests', icon: 'shield' },
      { to: `/admin/clients/${id}/analytics`,   label: 'Analytics',      icon: 'chart' },
      { to: `/admin/clients/${id}/feedback`,    label: 'Feedback',       icon: 'message' },
      { to: `/admin/clients/${id}/admin-users`, label: 'Admin Users',    icon: 'key' },
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
  'sync-health':  'Sync Health',
  'data-requests': 'Data Requests',
  chatbox:        'Chatbox',
  'chat-records': 'Chat Conversations',
  compliance:     'Compliance',
  users:          'Portal Users',
  submissions:    'Submissions',
  'safety-queue': 'Safety Queue',
  msls:           'MSL Management',
  clients:        'Clients',
  audit:          'Audit Trail',
  'admin-users':  'Admin Users',
  'review-queue':    'Review Queue',
  'email-settings':  'Email Settings',
  analytics:      'Analytics',
  feedback:       'Feedback',
  faq:            'FAQ',
  trials:         'Clinical Trials', // CPPM-125
  training:       'CME & Training',
  sso:            'Single Sign-On',
}

function deriveTitle(pathname) {
  if (pathname === '/admin' || pathname === '/admin/') return 'Dashboard'
  if (/^\/admin\/clients\/[^/]+\/?$/.test(pathname)) return 'Overview'
  if (pathname === '/admin/audit' || pathname === '/admin/audit/') return 'Platform Audit Trail' // CPPM-62
  const lastSegment = pathname.split('/').filter(Boolean).pop() || ''
  return SEGMENT_TITLES[lastSegment] || 'Admin'
}

export default function AdminLayout({ children }) {
  const { admin, signOut } = useAdminAuth()
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

  // Sidebar badge counts, keyed by the `badge` name on each nav item.
  //   review — S4-8: content awaiting editorial review
  //   safety — PD-2: portal submissions where someone reported becoming unwell
  //   safetyMine — CPPM-6: how many of those the signed-in person holds
  const [badges, setBadges] = useState({ review: 0, safety: 0, safetyMine: 0, reviewMine: 0 })
  // CPPM-6: a page says when it changed a count (a task taken, handed over or
  // closed), so the sidebar does not wait for the next page change to catch up.
  const [badgeTick, setBadgeTick] = useState(0)
  useEffect(() => {
    const refresh = () => setBadgeTick(t => t + 1)
    window.addEventListener('cp:badges-changed', refresh)
    return () => window.removeEventListener('cp:badges-changed', refresh)
  }, [])
  useEffect(() => {
    if (!clientId) return
    const get = (url) => fetch(url, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
    Promise.all([
      get(`/api/admin/review-queue/${clientId}/count`),
      get(`/api/admin/ae-review/${clientId}/count`),
    ]).then(([review, safety]) => setBadges({
      review: review?.count || 0, safety: safety?.count || 0, safetyMine: safety?.mine || 0,
      reviewMine: review?.mine || 0, // CPPM-61
    }))
  }, [clientId, location.pathname, badgeTick])

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

  // CPPM-44: a stopped virus scanner holds every portal attachment and refuses admin
  // uploads. Say so on every admin page, and say when the virus list last updated.
  const [scanner, setScanner] = useState(null)
  useEffect(() => {
    fetch('/api/admin/scanner', { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(setScanner)
      .catch(() => setScanner(null))
  }, [location.pathname])
  const listDate = scanner?.listDate ? new Date(scanner.listDate).toLocaleDateString() : null

  function handleLogout() {
    sessionStorage.removeItem('cp_sidebar_compact')
    sessionStorage.removeItem('cp_nav_groups')
    signOut()
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
          {NAV_ITEMS.filter(item => !item.superadminOnly || admin?.role === 'superadmin').map(item => (
            <NavLink
              key={item.to} to={item.to} end={item.exact}
              title={item.label}
              className={({ isActive }) => `cp-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="cp-nav-icon"><Icon name={item.icon} size={17} /></span>
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
                          <span className="cp-nav-icon"><Icon name={item.icon} size={17} /></span>
                          <span className="cp-nav-text">{item.label}</span>
                          {item.badge && badges[item.badge] > 0 && (
                            <span style={{
                              marginLeft: 'auto', background: '#DC2626', color: '#fff',
                              borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700,
                            }}>
                              {item.badge === 'safety' && badges.safetyMine > 0 && !sidebarCompact
                                ? `${badges.safetyMine} yours · ${badges.safety} open`
                                : item.badge === 'review' && badges.reviewMine > 0 && !sidebarCompact
                                  ? `${badges.reviewMine} yours · ${badges.review} to review`
                                  : badges[item.badge]}
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
          <div className="cp-admin-role">{String(admin?.role || '').replace(/_/g, ' ')}</div>
          <button className="cp-logout-btn" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="cp-admin-main">
        {clientId && <div className="cp-brandbar" />}
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
          {clientId && clientName && (
            <span className="cp-client-chip" title={`Configuring ${clientName}`}>
              <span className="cp-client-avatar">{clientName.charAt(0).toUpperCase()}</span>
              {clientName}
            </span>
          )}
        </div>
        <div className="cp-admin-content">
          {scanner && !scanner.up && (
            <div className="cp-error" role="alert" style={{ marginBottom: 16 }}>
              The virus scanner is not running. Portal attachments are held and admin uploads are refused until it starts. It starts with the portal (npm run dev or npm start in apps/cp-portal/backend).
            </div>
          )}
          {scanner?.up && scanner.listAgeDays >= 2 && (
            <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', fontSize: 13 }}>
              The virus list was last updated on {listDate} ({scanner.listAgeDays} days ago). It should refresh itself several times a day.
            </div>
          )}
          {scanner?.up && location.pathname === '/admin' && listDate && scanner.listAgeDays < 2 && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#4B5563' }}>
              Virus scanner running · virus list updated {listDate}
            </div>
          )}
          {/* CPPM-60: one notice for every screen. A viewer can open everything; the
              server refuses every change, and this says so before they try. */}
          {admin?.role === 'viewer' && (
            <div role="note" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1', fontSize: 13 }}>
              Your role is view-only. You can look at everything here, but changes will not be saved. Ask an admin if you need to make changes.
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
