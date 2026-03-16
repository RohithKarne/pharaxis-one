/**
 * Sidebar.jsx — MIMS Navigation Sidebar
 *
 * System section items (Admin Console, Content Management, Data Visualization)
 * open their respective modules in a new tab via window.open().
 * Visibility of system items is gated by the user's module permissions.
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import ThemeSwitcher from '../../../shared/components/ThemeSwitcher'

export default function Sidebar({ collapsed, onCollapse, theme, setTheme }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { hasModuleAccess } = useAuth()
  const [caseMgmtOpen, setCaseMgmtOpen] = useState(false)

  // Auto-close sub-nav when sidebar collapses
  useEffect(() => {
    if (collapsed) {
      setCaseMgmtOpen(false)
    }
  }, [collapsed])

  function isActive(path) {
    return location.pathname === path
  }

  function handleCaseMgmtClick() {
    if (collapsed) return
    setCaseMgmtOpen(o => !o)
  }

  const canAccessAdmin = hasModuleAccess('admin_console')
  const canAccessContent = hasModuleAccess('content_mgmt')
  const canAccessDV = hasModuleAccess('data_visualization')
  const hasAnySystemAccess = canAccessAdmin || canAccessContent || canAccessDV

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

        <div className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}
          onClick={() => navigate('/dashboard')}>
          <span className="nav-icon">📊</span>
          <span className="nav-label">Dashboard</span>
        </div>

        <div className={`nav-item ${isActive('/inbox') ? 'active' : ''}`}
          onClick={() => navigate('/inbox')}>
          <span className="nav-icon">📥</span>
          <span className="nav-label">Inbox</span>
        </div>

        <div className="nav-item" onClick={() => navigate('/new-case')}>
          <span className="nav-icon">➕</span>
          <span className="nav-label">New Case</span>
        </div>

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

        {hasAnySystemAccess && <div className="nav-section-label">System</div>}

        {canAccessAdmin && (
          <div className="nav-item" onClick={() => window.open('/admin.html', '_blank')}>
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Admin Console ↗</span>
          </div>
        )}

        {canAccessContent && (
          <div className="nav-item" onClick={() => window.open('/content.html', '_blank')}>
            <span className="nav-icon">📄</span>
            <span className="nav-label">Content Management ↗</span>
          </div>
        )}

        {canAccessDV && (
          <div className="nav-item" onClick={() => window.open('/dv.html', '_blank')}>
            <span className="nav-icon">📈</span>
            <span className="nav-label">Data Visualization ↗</span>
          </div>
        )}
      </nav>

      <ThemeSwitcher theme={theme} setTheme={setTheme} />
    </aside>
  )
}
