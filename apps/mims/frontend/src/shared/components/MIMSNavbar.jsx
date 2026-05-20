/**
 * MIMSNavbar.jsx — Left sidebar navigation
 * Collapsed (icons only, 56px) / Expanded (icons + labels, 220px)
 * User toggle persisted in localStorage via MIMSLayout.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'
import { hasGlobalAdminScope, isAdminUser } from '../utils/adminScope.js'

const CASE_MGMT_ROUTES = { 'My Cases': '/cases?tab=my', 'Unassigned Cases': '/cases?tab=unassigned', 'Deleted Cases': '/cases?tab=deleted' }
const CASE_MGMT_ITEMS  = ['My Cases', 'Unassigned Cases', 'Deleted Cases']
const COMING_SOON      = ['CDR Log', 'Schedule CDR', 'Non Relevant Emails']

function NavItem({ to, icon, label, active, disabled, onClick, collapsed }) {
  const cls = `mims-sidenav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`
  const content = (
    <>
      <span className="mims-sidenav-icon">{icon}</span>
      {!collapsed && <span className="mims-sidenav-label">{label}</span>}
    </>
  )
  if (disabled) return <div className={cls} title={collapsed ? label : undefined}>{content}</div>
  if (onClick) return <div className={cls} onClick={onClick} title={collapsed ? label : undefined}>{content}</div>
  return (
    <Link to={to} className={cls} title={collapsed ? label : undefined}>
      {content}
    </Link>
  )
}

function NavSection({ title, collapsed }) {
  if (collapsed) return <div className="mims-sidenav-section-spacer" aria-hidden="true" />
  return <div className="mims-sidenav-section">{title}</div>
}

export default function MIMSNavbar({ collapsed, onToggle }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { hasModuleAccess, hasSystemOption, hasCaseOption, user, token } = useAuth()

  const [caseMgmtOpen,  setCaseMgmtOpen]  = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const [processExplorerEnabled, setProcessExplorerEnabled] = useState(hasGlobalAdminScope(user))
  const userRole = user?.role
  const userId = user?.id
  const userEmail = user?.email

  // Close accordions when sidebar collapses
  useEffect(() => {
    if (!collapsed) return
    const frame = requestAnimationFrame(() => {
      setCaseMgmtOpen(false)
      setUtilitiesOpen(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [collapsed])

  useEffect(() => {
    let alive = true
    async function load() {
      if (!token || !userRole) return
      if (hasGlobalAdminScope(userRole)) { if (alive) setProcessExplorerEnabled(true); return }
      try {
        const res = await httpFetch('/api/admin/process-logs/config', { headers: { Authorization: `Bearer ${token}` } })
        if (!alive) return
        setProcessExplorerEnabled(res.ok ? !!(await res.json()).allowed : false)
      } catch { if (alive) setProcessExplorerEnabled(false) }
    }
    load()
    return () => { alive = false }
  }, [token, userRole, userId, userEmail])

  function isActive(path)  { return location.pathname === path }
  function isCasesActive() { return location.pathname === '/cases' || location.pathname.startsWith('/cases/') }
  function isUtilitiesActive() {
    return ['/session-management', '/process-explorer', '/regression', '/response-log', '/response-error-log', '/case-audit-trail', '/cm-audit-trail', '/transmission-error-log', '/transmission-audit-trail', '/copy-division', '/dppr'].some(p => location.pathname === p)
  }

  function canAccess(k)         { return hasModuleAccess(k) }
  function canAccessAny(...ks)  { return ks.some(k => hasModuleAccess(k)) }
  function canUseSystem(section, option) { return hasSystemOption ? hasSystemOption(section, option) : true }
  function canUseCase(section, option) { return hasCaseOption ? hasCaseOption(section, option) : true }
  const isAdmin = isAdminUser(userRole)
  const canCreateCase = canAccessAny('mims_core', 'case_mgmt') && canUseCase('case_entry_options', 'add_new_case')

  return (
    <nav className={`mims-sidenav${collapsed ? ' collapsed' : ''}`}>

      {/* Toggle button */}
      <button className="mims-sidenav-toggle" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <span className="mims-sidenav-icon">{collapsed ? '›' : '‹'}</span>
        {!collapsed && <span className="mims-sidenav-label" style={{ fontSize: 11, opacity: 0.7 }}>Collapse</span>}
      </button>

      <div className="mims-sidenav-divider" />

      {/* Home */}
      <NavSection collapsed={collapsed} title="Work" />
      <NavItem collapsed={collapsed} to="/dashboard" icon="⊞" label="Overview" active={isActive('/dashboard')} />

      {/* Inbox */}
      <NavItem collapsed={collapsed} to="/inbox" icon="📥" label="Inbox"
        active={isActive('/inbox')}
        disabled={!canAccess('mims_core')} />

      {/* Chat */}
      <NavItem collapsed={collapsed} to="/chat" icon="💬" label="Chat"
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
      <NavItem collapsed={collapsed} to="/case-query" icon="🔍" label="Case Query"
        active={isActive('/case-query')}
        disabled={!canAccess('mims_core')} />

      {/* Utilities — accordion */}
      <NavItem collapsed={collapsed} to="/transmissions" icon="📤" label="Transmissions"
        active={isActive('/transmissions')}
        disabled={!canAccess('transmissions')} />

      <NavSection collapsed={collapsed} title="Knowledge" />

      {/* Browse Content */}
      <NavItem collapsed={collapsed} to="/browse-content" icon="📚" label="Browse Content"
        active={isActive('/browse-content')}
        disabled={!canAccessAny('browse_content', 'content_mgmt')} />

      {/* Content Management */}
      {(isAdmin && canAccess('content_mgmt')) && (
        <a
          href="/mims/content?standalone=1"
          target="_blank"
          rel="noopener noreferrer"
          className="mims-sidenav-item"
          title={collapsed ? 'Content Management' : undefined}
          style={{ textDecoration: 'none' }}
        >
          <span className="mims-sidenav-icon">📄</span>
          {!collapsed && <span className="mims-sidenav-label">Content Management</span>}
          {!collapsed && <span className="mims-external-mark">↗</span>}
        </a>
      )}

      {/* Reports */}
      {(isAdmin && canAccess('reports')) && (
        <a
          href="/mims/reports?standalone=1"
          target="_blank"
          rel="noopener noreferrer"
          className="mims-sidenav-item"
          title={collapsed ? 'Reports' : undefined}
          style={{ textDecoration: 'none' }}
        >
          <span className="mims-sidenav-icon">📈</span>
          {!collapsed && <span className="mims-sidenav-label">Reports</span>}
          {!collapsed && <span className="mims-external-mark">↗</span>}
        </a>
      )}

      <NavSection collapsed={collapsed} title="Control" />

      <div className={`mims-sidenav-item${isUtilitiesActive() ? ' active' : ''}`}
        title={collapsed ? 'Control Tools' : undefined}
        onClick={() => !collapsed && setUtilitiesOpen(o => !o)}>
        <span className="mims-sidenav-icon">🔧</span>
        {!collapsed && <span className="mims-sidenav-label">Control Tools</span>}
        {!collapsed && <span className="mims-sidenav-arrow">{utilitiesOpen ? '▴' : '▾'}</span>}
      </div>
      {utilitiesOpen && !collapsed && (
        <div className="mims-sidenav-sub">
          {canAccess('mims_core') && <Link to="/session-management" className={`mims-sidenav-sub-item${isActive('/session-management') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Session Management</Link>}
          {canAccess('mims_core') && <Link to="/response-log" className={`mims-sidenav-sub-item${isActive('/response-log') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>📋 Response Log</Link>}
          {isAdmin && canUseSystem('general', 'service_configurations') && <Link to="/response-error-log" className={`mims-sidenav-sub-item${isActive('/response-error-log') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Response Error Log</Link>}
          {isAdmin && canUseSystem('general', 'service_configurations') && (processExplorerEnabled
            ? <Link to="/process-explorer" className={`mims-sidenav-sub-item${isActive('/process-explorer') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Process Explorer</Link>
            : <div className="mims-sidenav-sub-item coming-soon">Process Explorer <span className="mims-coming-tag">Off</span></div>
          )}
          {isAdmin && canUseSystem('general', 'service_configurations') && <Link to="/regression" className={`mims-sidenav-sub-item${isActive('/regression') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>🧪 Regression Testing</Link>}
          {isAdmin && canUseSystem('general', 'view_data') && <Link to="/case-audit-trail" className={`mims-sidenav-sub-item${isActive('/case-audit-trail') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Case Audit Trail</Link>}
          {isAdmin && canUseSystem('general', 'view_data') && <Link to="/cm-audit-trail" className={`mims-sidenav-sub-item${isActive('/cm-audit-trail') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>CM Audit Trail</Link>}
          {isAdmin && canUseSystem('general', 'view_data') && <Link to="/transmission-error-log" className={`mims-sidenav-sub-item${isActive('/transmission-error-log') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Transmission Error Log</Link>}
          {isAdmin && canUseSystem('general', 'view_data') && <Link to="/transmission-audit-trail" className={`mims-sidenav-sub-item${isActive('/transmission-audit-trail') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Transmission Audit Trail</Link>}
          {hasGlobalAdminScope(userRole) && canUseSystem('maintenance', 'copy_division') && <Link to="/copy-division" className={`mims-sidenav-sub-item${isActive('/copy-division') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>Copy Division</Link>}
          {isAdmin && canUseSystem('setup', 'data_protection_rules') && <Link to="/dppr" className={`mims-sidenav-sub-item${isActive('/dppr') ? ' active' : ''}`} onClick={() => setUtilitiesOpen(false)}>🔒 Data Privacy (DPPR)</Link>}
          <div className="mims-sidenav-sub-divider" />
          {COMING_SOON.map(item => (
            <div key={item} className="mims-sidenav-sub-item coming-soon">{item} <span className="mims-coming-tag">Soon</span></div>
          ))}
        </div>
      )}

      {/* MIMS Admin */}
      {(isAdmin && canAccess('admin_console')) && (
        <a
          href="/mims/mims-admin?standalone=1"
          target="_blank"
          rel="noopener noreferrer"
          className="mims-sidenav-item"
          title={collapsed ? 'MIMS Admin' : undefined}
          style={{ textDecoration: 'none' }}
        >
          <span className="mims-sidenav-icon">🛡️</span>
          {!collapsed && <span className="mims-sidenav-label">MIMS Admin</span>}
          {!collapsed && <span className="mims-external-mark">↗</span>}
        </a>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* + New Case */}
      <div className="mims-sidenav-new-case">
        <button className="mims-new-case-btn" style={{ width: collapsed ? 36 : '100%', padding: collapsed ? '6px 0' : '6px 16px', fontSize: collapsed ? 16 : 13 }}
          onClick={() => canCreateCase && navigate('/cases')}
          disabled={!canCreateCase}
          title={!canCreateCase ? 'Your security group does not allow Add New Case.' : undefined}>
          {collapsed ? '+' : '+ New Case'}
        </button>
      </div>

    </nav>
  )
}
