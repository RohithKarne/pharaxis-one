/**
 * Sidebar.jsx — Navigation Sidebar Component
 *
 * Bug fixes applied:
 * 1. Sub-nav auto-closes when sidebar collapses (useEffect watches collapsed prop)
 * 2. Active state syncs correctly with current URL on refresh (useLocation)
 * 3. Case Management toggle disabled when sidebar is collapsed
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'

export default function Sidebar({ collapsed, onCollapse, theme, setTheme }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [caseMgmtOpen, setCaseMgmtOpen] = useState(false)

  // Bug Fix 1: Auto-close sub-nav when sidebar collapses
  useEffect(() => {
    if (collapsed) {
      setCaseMgmtOpen(false)
    }
  }, [collapsed])

  // Active check — works on refresh because useLocation() reads current URL
  function isActive(path) {
    return location.pathname === path
  }

  // Bug Fix 3: Don't open sub-nav when sidebar is collapsed
  function handleCaseMgmtClick() {
    if (collapsed) return
    setCaseMgmtOpen(o => !o)
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-title">MIMS</div>
        <div className="logo-subtitle">Medical Info Management</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>

        {!collapsed && (
          <div className="nav-item" style={{ fontSize: 12, opacity: 0.6, letterSpacing: 0.5 }} onClick={onCollapse}>
            <span className="nav-icon">‹</span>
            <span className="nav-label">Close</span>
          </div>
        )}

        <Link to="/dashboard" className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}>
          <span className="nav-icon">📊</span>
          <span className="nav-label">Dashboard</span>
        </Link>

        <Link to="/inbox" className={`nav-item ${isActive('/inbox') ? 'active' : ''}`}>
          <span className="nav-icon">📥</span>
          <span className="nav-label">Inbox</span>
        </Link>

        <div className={`nav-item ${caseMgmtOpen ? 'expanded' : ''}`}
          onClick={handleCaseMgmtClick}>
          <span className="nav-icon">📁</span>
          <span className="nav-label">Case Management</span>
          <span className="expand-arrow">▾</span>
        </div>

        {caseMgmtOpen && !collapsed && (
          <div className="sub-nav open">
            <div className="sub-nav-item">📂 Unassigned Cases</div>
            <div className="sub-nav-item">📂 My Cases</div>
            <div className="sub-nav-item">🔍 Case Query</div>
          </div>
        )}

        <div className="nav-item"><span className="nav-icon">🔎</span><span className="nav-label">Search</span></div>

        <div className="nav-item"><span className="nav-icon">👤</span><span className="nav-label">User Settings</span></div>

        <div className="nav-section-label">System</div>

        <a href="/mims-admin" target="_blank" rel="noopener noreferrer" className="nav-item" style={{ textDecoration: 'none' }}>
          <span className="nav-icon">🛡️</span><span className="nav-label">Admin ↗</span>
        </a>

        <div className="nav-item"><span className="nav-icon">📄</span><span className="nav-label">Content Management</span></div>

        <div className="nav-item"><span className="nav-icon">📈</span><span className="nav-label">Data Visualization</span></div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-label" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--sidebar-text)', opacity: 0.5 }}>
          Theme
        </div>
        <div className="theme-switcher">
          <button className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
            ☀️ <span className="theme-label">Light</span>
          </button>
          <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
            🌙 <span className="theme-label">Dark</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
