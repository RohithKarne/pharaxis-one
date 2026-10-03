import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAdminAuth, adminHeaders } from '../context/AdminAuthContext'
import PageLoader from './PageLoader'
import Icon from '../../shared/components/Icon'

const NAV_ITEMS = [
  // CPPM-133: platformOnly — a client's own staff cannot read these, so they are not offered.
  { to: '/admin',                  label: 'Dashboard',       icon: 'grid', exact: true, platformOnly: true },
  { to: '/admin/clients',          label: 'Clients',         icon: 'building', platformOnly: true },
  // CPPM-62: records that belong to no client (platform-admin sign-ins, failed
  // sign-ins for unknown emails). Shown to the platform admin only.
  { to: '/admin/audit',            label: 'Platform Audit Trail', icon: 'clipboard', exact: true, superadminOnly: true },
]

// CPPM-123: seven main screens. The sidebar lists the screens; each screen's
// sub-screens show as tabs along the top. Every sub-screen keeps its own address
// (`path` after /admin/clients/:id/), so old links still land on the right tab.
//
// CPPM-124: `area` is the write area in middleware/adminWritePolicy.js. A tab
// shows only to roles that may change it; with no area (Overview, Analytics,
// Audit Trail: screens for reading) everyone sees it. Sync Health's one action,
// retry, is a submissions change, so it follows the submissions area.
const CLIENT_SECTIONS = [
  { key: 'overview', label: 'Overview', icon: 'clipboard', tabs: [
    { path: '',              label: 'Overview' },
  ] },
  { key: 'inbox', label: 'Inbox', icon: 'inbox', tabs: [
    { path: 'submissions',   label: 'Submissions', area: 'submissions', keywords: 'inquiries enquiries questions' },
    { path: 'safety-queue',  label: 'Safety Queue', badge: 'safety', area: 'ae-review', keywords: 'adverse events unwell' },
    { path: 'review-queue',  label: 'Review Queue', badge: 'review', area: 'review-queue' },
    { path: 'access-requests', label: 'Access Requests', badge: 'access', area: 'users' }, // CPPM-128
    { path: 'feedback',      label: 'Feedback', area: 'feedback' },
    { path: 'chat-records',  label: 'Chat Conversations', area: 'chat-records' },
    { path: 'data-requests', label: 'Data Requests', area: 'data-requests', keywords: 'erasure deletion privacy gdpr' },
  ] },
  { key: 'content', label: 'Content', icon: 'file', tabs: [
    { path: 'content',       label: 'Library', area: 'content', keywords: 'therapeutic areas drugs events resources' },
    { path: 'news',          label: 'News', area: 'news' },
    { path: 'documents',     label: 'Documents', area: 'documents' },
    { path: 'safety',        label: 'Safety Alerts', area: 'safety' },
    { path: 'trials',        label: 'Clinical Trials', area: 'trials' },
    { path: 'training',      label: 'CME & Training', area: 'training' },
    { path: 'msls',          label: 'MSL Directory', area: 'msls' },
    { path: 'faq',           label: 'FAQ', area: 'faq' },
  ] },
  { key: 'setup', label: 'Portal setup', icon: 'sliders', tabs: [
    { path: 'branding',      label: 'Branding', area: 'branding' },
    { path: 'features',      label: 'Features', area: 'features', keywords: 'pages switches' },
    { path: 'gate',          label: 'User Gate', area: 'gate' },
    { path: 'forms',         label: 'Forms', area: 'forms' },
    { path: 'email-settings', label: 'Email Settings', area: 'email-config', keywords: 'smtp mail' },
    { path: 'chatbox',       label: 'Chatbox AI', area: 'chatbox' },
  ] },
  { key: 'people', label: 'People', icon: 'users', tabs: [
    { path: 'users',         label: 'Portal Users', area: 'users', keywords: 'doctors hcp' },
    { path: 'admin-users',   label: 'Admin Users', area: 'admin-users', keywords: 'staff roles' },
  ] },
  { key: 'connections', label: 'Connections', icon: 'link', tabs: [
    { path: 'integration',   label: 'Integration', area: 'integration' },
    { path: 'sync-health',   label: 'Sync Health', area: 'submissions' },
    { path: 'sso',           label: 'Single Sign-On', area: 'sso', keywords: 'sso login oidc' },
  ] },
  { key: 'reports', label: 'Reports', icon: 'chart', tabs: [
    { path: 'analytics',     label: 'Analytics' },
    { path: 'audit',         label: 'Audit Trail' },
    { path: 'safety-confirmations', label: 'Safety Confirmations' }, // CPPM-127: for reading, so no area
    { path: 'compliance',    label: 'Compliance', area: 'compliance', keywords: 'consent privacy' },
  ] },
]

const SEGMENT_TITLES = {
  branding:       'Branding',
  content:        'Library',
  news:           'News',
  safety:         'Safety Alerts', // CPPM-123: one name, same as the tab
  documents:      'Documents',
  forms:          'Forms',
  features:       'Features',
  gate:           'User Gate',
  integration:    'Integration',
  'sync-health':  'Sync Health',
  'data-requests': 'Data Requests',
  chatbox:        'Chatbox AI',
  'chat-records': 'Chat Conversations',
  compliance:     'Compliance',
  users:          'Portal Users',
  submissions:    'Submissions',
  'safety-queue': 'Safety Queue',
  msls:           'MSL Directory',
  clients:        'Clients',
  audit:          'Audit Trail',
  'admin-users':  'Admin Users',
  'review-queue':    'Review Queue',
  'email-settings':  'Email Settings',
  analytics:      'Analytics',
  feedback:       'Feedback',
  faq:            'FAQ',
  'access-requests': 'Access Requests',
  'safety-confirmations': 'Safety Confirmations',
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

// CPPM-131: "Go to…" — type part of a screen's name and jump to it. It offers
// only what this person's menu offers. "/" anywhere outside a field focuses it.
function QuickSearch({ items }) {
  const navigate = useNavigate()
  const [q, setQ]     = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef      = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      e.preventDefault(); inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = words.length
    ? items.filter(it => { const hay = `${it.label} ${it.section} ${it.keywords || ''}`.toLowerCase(); return words.every(w => hay.includes(w)) }).slice(0, 8)
    : []
  function go(it) { setQ(''); setIdx(0); inputRef.current?.blur(); navigate(it.to) }
  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && matches[idx]) { e.preventDefault(); go(matches[idx]) }
    else if (e.key === 'Escape') { setQ(''); inputRef.current?.blur() }
  }
  return (
    <div className="cp-quick-search">
      <input
        ref={inputRef} type="search" value={q} placeholder="Go to… ( / )" aria-label="Go to a screen"
        role="combobox" aria-expanded={matches.length > 0} aria-controls="cp-quick-search-list"
        aria-activedescendant={matches[idx] ? `cp-qs-${idx}` : undefined}
        onChange={e => { setQ(e.target.value); setIdx(0) }} onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQ(''), 150)}
      />
      {words.length > 0 && (
        <ul id="cp-quick-search-list" role="listbox" className="cp-quick-search-list">
          {matches.length === 0 ? <li className="cp-quick-search-empty">No screen matches</li> : matches.map((it, i) => (
            <li key={it.to} id={`cp-qs-${i}`} role="option" aria-selected={i === idx}
              className={i === idx ? 'active' : ''} onMouseDown={e => { e.preventDefault(); go(it) }}>
              <span>{it.label}</span><span className="cp-quick-search-where">{it.section}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AdminLayout({ children }) {
  const { admin, signOut, hasRole, canChange } = useAdminAuth()
  const navigate  = useNavigate()
  const { clientId } = useParams()
  const location  = useLocation()
  const pageTitle = deriveTitle(location.pathname)
  // CPPM-123: which main screen and tab the address belongs to.
  const currentPath = clientId ? (location.pathname.split('/')[4] || '') : null
  const currentSection = CLIENT_SECTIONS.find(sec => sec.tabs.some(t => t.path === currentPath))
  // CPPM-124: a viewer may change nothing but is meant to look at everything.
  // The tab you are on always shows, even if your role cannot change it.
  const showTab = (t) => !t.area || hasRole('viewer') || canChange(t.area) || t.path === currentPath
  const sections = CLIENT_SECTIONS
    .map(sec => ({ ...sec, tabs: sec.tabs.filter(showTab) }))
    .filter(sec => sec.tabs.length > 0)
  const shownSection = sections.find(sec => sec.key === currentSection?.key)
  const mainItems = NAV_ITEMS.filter(item => (!item.superadminOnly || admin?.role === 'superadmin') && !(item.platformOnly && admin?.clientId))
  const tabUrl = (t) => `/admin/clients/${clientId}${t.path ? '/' + t.path : ''}`
  // CPPM-131: what "Go to…" offers — the person's own menu. A client's own staff
  // get their client's screens from anywhere.
  const searchClient = clientId || admin?.clientId
  const searchItems = [
    ...mainItems.map(it => ({ label: it.label, section: 'Main', to: it.to })),
    ...(searchClient ? sections.flatMap(sec => sec.tabs.map(t => ({
      label: t.label, section: sec.label, keywords: t.keywords,
      to: `/admin/clients/${searchClient}${t.path ? '/' + t.path : ''}`,
    }))) : []),
  ]
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    const saved = sessionStorage.getItem('cp_sidebar_compact')
    // CPPM-126: on a phone the full sidebar leaves the page too little room.
    return saved !== null ? saved === 'true' : window.innerWidth < 768
  })

  // Sidebar badge counts, keyed by the `badge` name on each nav item.
  //   review — S4-8: content awaiting editorial review
  //   safety — PD-2: portal submissions where someone reported becoming unwell
  //   safetyMine — CPPM-6: how many of those the signed-in person holds
  //   access — CPPM-128: doctors waiting for access
  const [badges, setBadges] = useState({ review: 0, safety: 0, safetyMine: 0, reviewMine: 0, access: 0 })
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
      get(`/api/admin/users/${clientId}/access-requests/count`),
    ]).then(([review, safety, access]) => setBadges({
      review: review?.count || 0, safety: safety?.count || 0, safetyMine: safety?.mine || 0,
      reviewMine: review?.mine || 0, // CPPM-61
      access: access?.count || 0,
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
    signOut()
    navigate('/admin/login')
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
          {mainItems.length > 0 && <div className="cp-nav-section-label" style={{ marginBottom: 4 }}>Main</div>}
          {mainItems.map(item => (
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
              <div style={{ marginTop: 12 }} />
              {sections.map(sec => {
                const count = sec.tabs.reduce((n, t) => n + (t.badge ? badges[t.badge] : 0), 0)
                const mine  = sec.tabs.reduce((n, t) => n + (t.badge ? badges[`${t.badge}Mine`] || 0 : 0), 0)
                return (
                  <NavLink
                    key={sec.key} to={tabUrl(sec.tabs[0])} end
                    title={sec.label}
                    className={`cp-nav-item${sec.key === currentSection?.key ? ' active' : ''}`}
                  >
                    <span className="cp-nav-icon"><Icon name={sec.icon} size={17} /></span>
                    <span className="cp-nav-text">{sec.label}</span>
                    {count > 0 && (
                      <span className="cp-nav-badge">
                        {mine > 0 && !sidebarCompact ? `${mine} yours · ${count}` : count}
                      </span>
                    )}
                  </NavLink>
                )
              })}
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
          <QuickSearch items={searchItems} />
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
          {shownSection && shownSection.tabs.length > 1 && (
            <nav className="cp-subnav" aria-label={shownSection.label}>
              {shownSection.tabs.map(t => (
                <NavLink
                  key={t.path} to={tabUrl(t)} end
                  className={`cp-subnav-tab${t.path === currentPath ? ' active' : ''}`}
                >
                  {t.label}
                  {t.badge && badges[t.badge] > 0 && (
                    <span className="cp-nav-badge">
                      {t.badge === 'safety' && badges.safetyMine > 0
                        ? `${badges.safetyMine} yours · ${badges.safety} open`
                        : t.badge === 'review' && badges.reviewMine > 0
                          ? `${badges.reviewMine} yours · ${badges.review} to review`
                          : badges[t.badge]}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
