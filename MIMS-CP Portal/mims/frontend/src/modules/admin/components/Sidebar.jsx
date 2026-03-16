import { useLocation } from 'react-router-dom'
import ThemeSwitcher from '../../../shared/components/ThemeSwitcher'

export default function Sidebar({ collapsed, onCollapse, theme, setTheme }) {
  const location = useLocation()
  function isActive(path) { return location.pathname === path }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-title">Admin</div>
        <div className="logo-subtitle">MIMS System Console</div>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>
        {!collapsed && (
          <div className="nav-item" style={{ fontSize: 12, opacity: 0.6 }} onClick={onCollapse}>
            <span className="nav-icon">‹</span>
            <span className="nav-label">Close</span>
          </div>
        )}
        <div className="nav-section-label">Configuration</div>
        <div className={`nav-item ${isActive('/admin') || isActive('/') ? 'active' : ''}`}>
          <span className="nav-icon">⚙️</span><span className="nav-label">General Settings</span>
        </div>
        <div className="nav-item"><span className="nav-icon">👥</span><span className="nav-label">Users &amp; Roles</span></div>
        <div className="nav-item"><span className="nav-icon">🏢</span><span className="nav-label">Organisations</span></div>
        <div className="nav-item"><span className="nav-icon">📧</span><span className="nav-label">Email Accounts</span></div>
        <div className="nav-section-label">System</div>
        <div className="nav-item"><span className="nav-icon">📋</span><span className="nav-label">Audit Log</span></div>
        <div className="nav-item"><span className="nav-icon">🔐</span><span className="nav-label">Security</span></div>
      </nav>
      <ThemeSwitcher theme={theme} setTheme={setTheme} />
    </aside>
  )
}
