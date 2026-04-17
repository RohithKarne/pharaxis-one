/**
 * MIMSNavbar.jsx — Horizontal navigation bar
 * Grid Home | 1 Inbox | 2 Case Management ▾ | 3 Case Query | 4 Utilities ▾ |
 * 5 Transmissions | 6 Browse Content | 7 Analytics          + New Case
 */

import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const CASE_MGMT_ROUTES  = { 'My Cases': '/cases?tab=my', 'Unassigned Cases': '/cases?tab=unassigned', 'Deleted Cases': '/cases?tab=deleted' }
const CASE_MGMT_ITEMS   = ['My Cases', 'Unassigned Cases', 'Deleted Cases']
const UTILITIES_ITEMS   = ['Response Log', 'CDR Log', 'Schedule CDR', 'Case Audit Trail', 'Transmission Audit Trail', 'Non Relevant Emails']

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
      if (user.role === 'superadmin') {
        if (alive) setProcessExplorerEnabled(true)
        return
      }
      try {
        const res = await fetch('/api/admin/process-logs/config', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!alive) return
        if (!res.ok) {
          setProcessExplorerEnabled(false)
          return
        }
        const data = await res.json()
        setProcessExplorerEnabled(!!data.allowed)
      } catch (_) {
        if (alive) setProcessExplorerEnabled(false)
      }
    }
    loadProcessExplorerConfig()
    return () => { alive = false }
  }, [token, user?.role, user?.id, user?.email])

  function isActive(path) { return location.pathname === path }
  function isCasesActive() { return location.pathname === '/cases' || location.pathname.startsWith('/cases/') }

  function canAccess(moduleKey) { return hasModuleAccess(moduleKey) }
  function canAccessAny(...moduleKeys) { return moduleKeys.some(k => hasModuleAccess(k)) }

  function navItem(moduleKey, path, label) {
    const allowed = canAccess(moduleKey)
    if (!allowed) {
      return (
        <button
          key={path}
          className="mims-nav-tab disabled"
          title="Access restricted"
        >
          {label}
        </button>
      )
    }
    return (
      <Link
        key={path}
        to={path}
        className={`mims-nav-tab ${isActive(path) ? 'active' : ''}`}
      >
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

      {/* Exception Log */}
      {navItem('mims_core', '/exceptions', 'Exception Log')}

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
              <Link
                key={item}
                to={CASE_MGMT_ROUTES[item]}
                className="mims-nav-dropdown-item"
                onClick={() => setCaseMgmtOpen(false)}
              >
                {item}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Case Query */}
      {navItem('mims_core', '/case-query', 'Case Query')}

      {/* Session Management */}
      {navItem('mims_core', '/session-management', 'Session Mgmt')}

      {/* Utilities — dropdown */}
      <div className="mims-nav-dropdown-wrap" ref={utilitiesRef}>
        <button
          className={`mims-nav-tab ${!canAccess('utilities') ? 'disabled' : ''}`}
          onClick={() => canAccess('utilities') && setUtilitiesOpen(o => !o)}
          title={!canAccess('utilities') ? 'Access restricted' : undefined}
        >
          Utilities
          <span className="mims-tab-arrow">▾</span>
        </button>
        {utilitiesOpen && (
          <div className="mims-nav-dropdown">
            {UTILITIES_ITEMS.map(item => (
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
      {navItem('browse_content', '/browse-content', 'Browse Content')}

      {/* Analytics */}
      {navItem('data_visualization', '/analytics', 'Analytics')}

      {/* Reports */}
      {navItem('reports', '/reports', 'Reports')}

      {/* Process Explorer */}
      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        processExplorerEnabled
          ? <Link to="/process-explorer" className={`mims-nav-tab ${isActive('/process-explorer') ? 'active' : ''}`}>Process Explorer</Link>
          : <button className="mims-nav-tab disabled" title="Process Explorer disabled for your organisation">Process Explorer</button>
      )}

      {/* Regression Testing */}
      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        <Link to="/regression" className={`mims-nav-tab ${isActive('/regression') ? 'active' : ''}`}>🧪 Regression</Link>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* + New Case */}
      <button className="mims-new-case-btn" onClick={() => navigate('/cases')}>
        + New Case
      </button>
    </nav>
  )
}
