/**
 * MIMSNavbar.jsx — Horizontal navigation bar
 * Grid Home | 1 Inbox | 2 Case Management ▾ | 3 Case Query | 4 Utilities ▾ |
 * 5 Transmissions | 6 Browse Content | 7 Reports     + New Case
 *
 * Utilities dropdown contains:
 *   — Exception Log, Session Management (all authenticated users)
 *   — Process Explorer (admin/superadmin, org-config gated)
 *   — Regression Testing (admin/superadmin only)
 *   — Coming-soon items
 */

import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

const CASE_MGMT_ROUTES = { 'My Cases': '/cases?tab=my', 'Unassigned Cases': '/cases?tab=unassigned', 'Deleted Cases': '/cases?tab=deleted' }
const CASE_MGMT_ITEMS  = ['My Cases', 'Unassigned Cases', 'Deleted Cases']
const COMING_SOON      = ['CDR Log', 'Schedule CDR', 'Non Relevant Emails']

export default function MIMSNavbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { hasModuleAccess, user, token } = useAuth()

  const [caseMgmtOpen,  setCaseMgmtOpen]  = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)
  const [processExplorerEnabled, setProcessExplorerEnabled] = useState(user?.role === 'superadmin')

  const caseMgmtRef  = useRef(null)
  const utilitiesRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (caseMgmtRef.current  && !caseMgmtRef.current.contains(e.target))  setCaseMgmtOpen(false)
      if (utilitiesRef.current && !utilitiesRef.current.contains(e.target)) setUtilitiesOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    let alive = true
    async function loadProcessExplorerConfig() {
      if (!token || !user) return
      if (user.role === 'superadmin') { if (alive) setProcessExplorerEnabled(true); return }
      try {
        const res = await httpFetch('/api/admin/process-logs/config', { headers: { Authorization: `Bearer ${token}` } })
        if (!alive) return
        setProcessExplorerEnabled(res.ok ? !!(await res.json()).allowed : false)
      } catch (_) { if (alive) setProcessExplorerEnabled(false) }
    }
    loadProcessExplorerConfig()
    return () => { alive = false }
  }, [token, user?.role, user?.id, user?.email])

  function isActive(path)  { return location.pathname === path }
  function isCasesActive() { return location.pathname === '/cases' || location.pathname.startsWith('/cases/') }

  // True if any utility sub-path is currently active
  function isUtilitiesActive() {
    return ['/exceptions', '/session-management', '/process-explorer', '/regression', '/response-log', '/response-error-log', '/case-audit-trail', '/cm-audit-trail', '/transmission-error-log', '/transmission-audit-trail', '/copy-division', '/dppr'].some(p => location.pathname === p)
  }

  function canAccess(moduleKey)        { return hasModuleAccess(moduleKey) }
  function canAccessAny(...moduleKeys) { return moduleKeys.some(k => hasModuleAccess(k)) }

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  function navItem(moduleKey, path, label) {
    if (!canAccess(moduleKey)) {
      return <button key={path} className="mims-nav-tab disabled" title="Access restricted">{label}</button>
    }
    return (
      <Link key={path} to={path} className={`mims-nav-tab ${isActive(path) ? 'active' : ''}`}>
        {label}
      </Link>
    )
  }

  return (
    <nav className="mims-navbar">
      {/* Home grid icon */}
      <Link to="/dashboard" className={`mims-nav-tab mims-nav-home ${isActive('/dashboard') ? 'active' : ''}`} title="Home">
        ⊞
      </Link>

      {/* Inbox */}
      {navItem('mims_core', '/inbox', 'Inbox')}

      {/* Chat */}
      {navItem('mims_core', '/chat', 'Chat')}

      {/* Case Management — dropdown */}
      <div className="mims-nav-dropdown-wrap" ref={caseMgmtRef}>
        <button
          className={`mims-nav-tab ${isCasesActive() ? 'active' : ''} ${!canAccessAny('mims_core', 'case_mgmt') ? 'disabled' : ''}`}
          onClick={() => canAccessAny('mims_core', 'case_mgmt') && setCaseMgmtOpen(o => !o)}
          title={!canAccessAny('mims_core', 'case_mgmt') ? 'Access restricted' : undefined}
        >
          Case Management
          <span className="mims-tab-arrow">▾</span>
        </button>
        {caseMgmtOpen && (
          <div className="mims-nav-dropdown">
            {CASE_MGMT_ITEMS.map(item => (
              <Link key={item} to={CASE_MGMT_ROUTES[item]} className="mims-nav-dropdown-item" onClick={() => setCaseMgmtOpen(false)}>
                {item}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Case Query */}
      {navItem('mims_core', '/case-query', 'Case Query')}

      {/* Utilities — dropdown (Exception Log, Session Mgmt, Process Explorer, Regression + coming soon) */}
      <div className="mims-nav-dropdown-wrap" ref={utilitiesRef}>
        <button
          className={`mims-nav-tab ${isUtilitiesActive() ? 'active' : ''}`}
          onClick={() => setUtilitiesOpen(o => !o)}
        >
          Utilities
          <span className="mims-tab-arrow">▾</span>
        </button>

        {utilitiesOpen && (
          <div className="mims-nav-dropdown" style={{ minWidth: 220 }}>

            {/* Active tools — all authenticated users */}
            {canAccess('mims_core') && (
              <Link to="/exceptions" className={`mims-nav-dropdown-item ${isActive('/exceptions') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Exception Log
              </Link>
            )}
            {canAccess('mims_core') && (
              <Link to="/session-management" className={`mims-nav-dropdown-item ${isActive('/session-management') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Session Management
              </Link>
            )}
            {canAccess('mims_core') && (
              <Link to="/response-log" className={`mims-nav-dropdown-item ${isActive('/response-log') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                📋 Response Log
              </Link>
            )}
            {isAdmin && (
              <Link to="/response-error-log" className={`mims-nav-dropdown-item ${isActive('/response-error-log') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Response Error Log
              </Link>
            )}

            {/* Admin-only tools */}
            {isAdmin && (
              processExplorerEnabled
                ? (
                  <Link to="/process-explorer" className={`mims-nav-dropdown-item ${isActive('/process-explorer') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                    Process Explorer
                  </Link>
                ) : (
                  <div className="mims-nav-dropdown-item coming-soon" title="Process Explorer disabled for your organisation">
                    Process Explorer <span className="mims-coming-tag">Off</span>
                  </div>
                )
            )}
            {isAdmin && (
              <Link to="/regression" className={`mims-nav-dropdown-item ${isActive('/regression') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                🧪 Regression Testing
              </Link>
            )}
            {isAdmin && (
              <Link to="/case-audit-trail" className={`mims-nav-dropdown-item ${isActive('/case-audit-trail') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Case Audit Trail
              </Link>
            )}
            {isAdmin && (
              <Link to="/cm-audit-trail" className={`mims-nav-dropdown-item ${isActive('/cm-audit-trail') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                CM Audit Trail
              </Link>
            )}
            {isAdmin && (
              <Link to="/transmission-error-log" className={`mims-nav-dropdown-item ${isActive('/transmission-error-log') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Transmission Error Log
              </Link>
            )}
            {isAdmin && (
              <Link to="/transmission-audit-trail" className={`mims-nav-dropdown-item ${isActive('/transmission-audit-trail') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Transmission Audit Trail
              </Link>
            )}
            {user?.role === 'superadmin' && (
              <Link to="/copy-division" className={`mims-nav-dropdown-item ${isActive('/copy-division') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                Copy Division
              </Link>
            )}
            {isAdmin && (
              <Link to="/dppr" className={`mims-nav-dropdown-item ${isActive('/dppr') ? 'active' : ''}`} onClick={() => setUtilitiesOpen(false)}>
                🔒 Data Privacy (DPPR)
              </Link>
            )}

            {/* Divider before coming-soon items */}
            <div className="mims-dropdown-divider" />

            {/* Coming soon items */}
            {COMING_SOON.map(item => (
              <div key={item} className="mims-nav-dropdown-item coming-soon">
                {item} <span className="mims-coming-tag">Soon</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transmissions */}
      {navItem('transmissions', '/transmissions', 'Transmissions')}

      {/* Browse Content */}
      {canAccessAny('browse_content', 'content_mgmt')
        ? (
          <Link to="/browse-content" className={`mims-nav-tab ${isActive('/browse-content') ? 'active' : ''}`}>
            Browse Content
          </Link>
        )
        : <button className="mims-nav-tab disabled" title="Access restricted">Browse Content</button>}

      {/* Reports */}
      {navItem('reports', '/reports', 'Reports')}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* + New Case */}
      <button className="mims-new-case-btn" onClick={() => navigate('/cases')}>
        + New Case
      </button>
    </nav>
  )
}
