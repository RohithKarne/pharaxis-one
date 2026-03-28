/**
 * MIMSNavbar.jsx — Horizontal navigation bar
 * Grid Home | 1 Inbox | 2 Case Management ▾ | 3 Case Query | 4 Utilities ▾ |
 * 5 Transmissions | 6 Browse Content | 7 Analytics          + New Case
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const CASE_MGMT_ROUTES  = { 'My Cases': '/cases?tab=my', 'Unassigned Cases': '/cases?tab=unassigned', 'Deleted Cases': '/cases?tab=deleted' }
const CASE_MGMT_ITEMS   = ['My Cases', 'Unassigned Cases', 'Deleted Cases']
const UTILITIES_ITEMS   = ['Response Log', 'CDR Log', 'Schedule CDR', 'Case Audit Trail', 'Transmission Audit Trail', 'Non Relevant Emails']

export default function MIMSNavbar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { hasModuleAccess } = useAuth()

  const [caseMgmtOpen,  setCaseMgmtOpen]  = useState(false)
  const [utilitiesOpen, setUtilitiesOpen] = useState(false)

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

  function isActive(path) { return location.pathname === path }

  function canAccess(moduleKey) { return hasModuleAccess(moduleKey) }

  function navItem(moduleKey, path, label) {
    const allowed = canAccess(moduleKey)
    return (
      <button
        key={path}
        className={`mims-nav-tab ${isActive(path) ? 'active' : ''} ${!allowed ? 'disabled' : ''}`}
        onClick={() => allowed && navigate(path)}
        title={!allowed ? 'Access restricted' : undefined}
      >
        {label}
      </button>
    )
  }

  return (
    <nav className="mims-navbar">
      {/* Home grid icon */}
      <button className={`mims-nav-tab mims-nav-home ${isActive('/dashboard') ? 'active' : ''}`}
        onClick={() => navigate('/dashboard')} title="Home">
        ⊞
      </button>

      {/* Inbox */}
      {navItem('mims_core', '/inbox', 'Inbox')}

      {/* Case Management — dropdown */}
      <div className="mims-nav-dropdown-wrap" ref={caseMgmtRef}>
        <button
          className={`mims-nav-tab ${!canAccess('case_mgmt') ? 'disabled' : ''}`}
          onClick={() => canAccess('case_mgmt') && setCaseMgmtOpen(o => !o)}
          title={!canAccess('case_mgmt') ? 'Access restricted' : undefined}
        >
          Case Management
          <span className="mims-tab-arrow">▾</span>
        </button>
        {caseMgmtOpen && (
          <div className="mims-nav-dropdown">
            {CASE_MGMT_ITEMS.map(item => (
              <div
                key={item}
                className="mims-nav-dropdown-item"
                onClick={() => { setCaseMgmtOpen(false); navigate(CASE_MGMT_ROUTES[item]) }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Case Query */}
      {navItem('case_query', '/case-query', 'Case Query')}

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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* + New Case */}
      <button className="mims-new-case-btn" onClick={() => navigate('/cases')}>
        + New Case
      </button>
    </nav>
  )
}
