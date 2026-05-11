/**
 * MIMSNavbar.jsx — Left sidebar navigation
 * Collapsed (icons only, 56px) / Expanded (icons + labels, 220px)
 * User toggle persisted in localStorage via MIMSLayout.
 */

import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

const CASE_MGMT_ROUTES = { 'My Cases': '/cases?tab=my', 'Unassigned Cases': '/cases?tab=unassigned', 'Deleted Cases': '/cases?tab=deleted' }
const CASE_MGMT_ITEMS  = ['My Cases', 'Unassigned Cases', 'Deleted Cases']
const COMING_SOON      = ['CDR Log', 'Schedule CDR', 'Non Relevant Emails']

export default function MIMSNavbar({ collapsed, onToggle }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { hasModuleAccess, user, token } = useAuth()

  const [caseMgmtOpen,  setCaseMgmtOpen]  = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const [processExplorerEnabled, setProcessExplorerEnabled] = useState(user?.role === 'superadmin')

  // Close accordions when sidebar collapses
  useEffect(() => {
    if (collapsed) { setCaseMgmtOpen(false); setUtilitiesOpen(false) }
  }, [collapsed])

  useEffect(() => {
    let alive = true
    async function load() {
      if (!token || !user) return
      if (user.role === 'superadmin') { if (alive) setProcessExplorerEnabled(true); return }
      try {
        const res = await httpFetch('/api/admin/process-logs/config', { headers: { Authorization: `Bearer ${token}` } })
        if (!alive) return
        setProcessExplorerEnabled(res.ok ? !!(await res.json()).allowed : false)
      } catch { if (alive) setProcessExplorerEnabled(false) }
    }
    load()
    return () => { alive = false }
  }, [token, user?.role, user?.id, user?.email])

  function isActive(path)  { return location.pathname === path }
  function isCasesActive() { return location.pathname === '/cases' || location.pathname.startsWith('/cases/') }
  function isUtilitiesActive() {
    return ['/exceptions', '/session-management', '/process-explorer', '/regression', '/response-log', '/response-error-log', '/case-audit-trail', '/cm-audit-trail', '/transmission-error-log', '/transmission-audit-trail', '/copy-division', '/dppr'].some(p => location.pathname === p)
  }

  function canAccess(k)         { return hasModuleAccess(k) }
  function canAccessAny(...ks)  { return ks.some(k => hasModuleAccess(k)) }
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  function NavItem({ to, icon, label, active, disabled, onClick }) {
    const cls = `mims-sidenav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`
    const content = (
      <>
        <span className="mims-sidenav-icon">{icon}</span>
        {!collapsed && <span className="mims-sidenav-label">{label}</span>}
      </>
    )
    if (disabled) return <div className={cls} title={collapsed ? label : undefined}>{content}</div>
    if (onClick)  return <div className={cls} onClick={onClick} title={collapsed ? label : undefined}>{content}</div>
    return (
      <Link to={to} className={cls} title={collapsed ? label : undefined}>
        {content}
      </Link>
    )
  }

  return (
    <nav className={`mims-sidenav${collapsed ? ' collapsed' : ''}`}>

      {/* Toggle button */}
      <button className="mims-sidenav-toggle" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <span className="mims-sidenav-icon">{collapsed ? '›' : '‹'}</span>
        {!collapsed && <span className="mims-sidenav-label" style={{ fontSize: 11, opacity: 0.7 }}>Collapse</span>}
      </button>

      <div className="mims-sidenav-divider" />

      {/* Home */}
      <NavItem to="/dashboard" icon="⊞" label="Home" active={isActive('/dashboard')} />

      {/* Inbox */}
      <NavItem to="/inbox" icon="📥" label="Inbox"
        active={isActive('/inbox')}
        disabled={!canAccess('mims_core')} />

      {/* Chat */}
      <NavItem to="/chat" icon="💬" label="Chat"
        active={isActive('/chat')}
        disabled={!canAccess('mims_core')} />

      {/* Case Management — accordion */}
      <div className={`mims-sidenav-item${isCasesActive() ? ' active' : ''}${!canAccessAny('mims_core', 'case_mgmt') ? ' disabled' : ''}`}
        title={collapsed ? 'Case Management' : undefined}
        onClick={() => !collapsed && canAccessAny('mims_core', 'case_mgmt') && setCaseMgmtOpen(o => !o)}>
        <span className="mims-sidenav-icon">📁</span>
        {!collapsed && <span className="mims-sidenav-label">Case Management</span>}
        {!collapsed && canAccessAny('mims_core', 'case_mgmt') && (
          <span className="mims-sidenav-arrow">{caseMgmtOpen ? '▴' : '▾'}</span>
        )}
      </div>
      {caseMgmtOpen && !collapsed && (
        <div className="mims-sidenav-sub">
          {CASE_MGMT_ITEMS.map(item => (
            <Link key={item} to={CASE_MGMT_ROUTES[item]}
              className={`mims-sidenav-sub-item${location.pathname + location.search === CASE_MGMT_ROUTES[item] ? ' active' : ''}`}
              onClick={() => setCaseMgmtOpen(false)}>
              {item}
            </Link>
          ))}
        </div>
      )}

      {/* Case Query */}
      <NavItem to="/case-query" icon="🔍" label="Case Query"
        active={isActive('/case-query')}
        disabled={!canAccess('mims_core')} />

      {/* Utilities — accordion */}
      <div className={`mims-sidenav-item${isUtilitiesActive() ? ' active' : ''}`}
        title={collapsed ? 'Utilities' : undefined}
        onClick={() => !collapsed && setUtilitiesOpen(o => !o)}>
        <span className="mims-sidenav-icon">🔧</span>
        {!collapsed && <span className="mims-sidenav-label">Utilities</span>}
        {!collapsed && <span className="mims-sidenav-arrow">{utilitiesOpen ? '▴' : '▾'}</span>}
      </div>
      {utilitiesOpen && !collapsed && (
        <div className="mims-sidenav-sub">
          {canAccess('mims_core') && <Link to="/exceptions" className={`mims-sidenav-sub-item${isActive('/exceptions') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Exception Log</Link>}
          {canAccess('mims_core') && <Link to="/session-management" className={`mims-sidenav-sub-item${isActive('/session-management') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Session Management</Link>}
          {canAccess('mims_core') && <Link to="/response-log" className={`mims-sidenav-sub-item${isActive('/response-log') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>📋 Response Log</Link>}
          {isAdmin && <Link to="/response-error-log" className={`mims-sidenav-sub-item${isActive('/response-error-log') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Response Error Log</Link>}
          {isAdmin && (processExplorerEnabled
            ? <Link to="/process-explorer" className={`mims-sidenav-sub-item${isActive('/process-explorer') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Process Explorer</Link>
            : <div className="mims-sidenav-sub-item coming-soon">Process Explorer <span className="mims-coming-tag">Off</span></div>
          )}
          {isAdmin && <Link to="/regression" className={`mims-sidenav-sub-item${isActive('/regression') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>🧪 Regression Testing</Link>}
          {isAdmin && <Link to="/case-audit-trail" className={`mims-sidenav-sub-item${isActive('/case-audit-trail') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Case Audit Trail</Link>}
          {isAdmin && <Link to="/cm-audit-trail" className={`mims-sidenav-sub-item${isActive('/cm-audit-trail') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>CM Audit Trail</Link>}
          {isAdmin && <Link to="/transmission-error-log" className={`mims-sidenav-sub-item${isActive('/transmission-error-log') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Transmission Error Log</Link>}
          {isAdmin && <Link to="/transmission-audit-trail" className={`mims-sidenav-sub-item${isActive('/transmission-audit-trail') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Transmission Audit Trail</Link>}
          {user?.role === 'superadmin' && <Link to="/copy-division" className={`mims-sidenav-sub-item${isActive('/copy-division') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Copy Division</Link>}
          {isAdmin && <Link to="/dppr" className={`mims-sidenav-sub-item${isActive('/dppr') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>🔒 Data Privacy (DPPR)</Link>}
          <div className="mims-sidenav-sub-divider" />
          {COMING_SOON.map(item => (
            <div key={item} className="mims-sidenav-sub-item coming-soon">{item} <span className="mims-coming-tag">Soon</span></div>
          ))}
        </div>
      )}

      {/* Transmissions */}
      <NavItem to="/transmissions" icon="📤" label="Transmissions"
        active={isActive('/transmissions')}
        disabled={!canAccess('transmissions')} />

      {/* Browse Content */}
      <NavItem to="/browse-content" icon="📚" label="Browse Content"
        active={isActive('/browse-content')}
        disabled={!canAccessAny('browse_content', 'content_mgmt')} />

      {/* Reports */}
      <NavItem to="/reports" icon="📈" label="Reports"
        active={isActive('/reports')}
        disabled={!canAccess('reports')} />

      {/* MIMS Admin (new) */}
      {canAccess('admin_console') && (
        <NavItem to="/mims-admin" icon="🛡️" label="MIMS Admin"
          active={isActive('/mims-admin')} />
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* + New Case */}
      <div className="mims-sidenav-new-case">
        <button className="mims-new-case-btn" style={{ width: collapsed ? 36 : '100%', padding: collapsed ? '6px 0' : '6px 16px', fontSize: collapsed ? 16 : 13 }}
          onClick={() => navigate('/cases')}>
          {collapsed ? '+' : '+ New Case'}
        </button>
      </div>

    </nav>
  )
}
