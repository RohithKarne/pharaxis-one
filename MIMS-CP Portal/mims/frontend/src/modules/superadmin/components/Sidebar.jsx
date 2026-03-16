import ThemeSwitcher from '../../../shared/components/ThemeSwitcher'

export default function Sidebar({ collapsed, onCollapse, theme, setTheme, activePage, onNavigate }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-title">Superadmin</div>
        <div className="logo-subtitle">Module Access Control</div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Admin</div>

        {!collapsed && (
          <div className="nav-item" style={{ fontSize: 12, opacity: 0.6, letterSpacing: 0.5 }} onClick={onCollapse}>
            <span className="nav-icon">‹</span>
            <span className="nav-label">Close</span>
          </div>
        )}

        <div className={`nav-item ${activePage === 'module-access' ? 'active' : ''}`} onClick={() => onNavigate('module-access')}>
          <span className="nav-icon">🧩</span>
          <span className="nav-label">Module Access</span>
        </div>

        <div className={`nav-item ${activePage === 'audit' ? 'active' : ''}`} onClick={() => onNavigate('audit')}>
          <span className="nav-icon">📋</span>
          <span className="nav-label">Audit Trail</span>
        </div>

        <div className={`nav-item ${activePage === 'login-audit' ? 'active' : ''}`} onClick={() => onNavigate('login-audit')}>
          <span className="nav-icon">🔐</span>
          <span className="nav-label">Login Audit</span>
        </div>
      </nav>

      <ThemeSwitcher theme={theme} setTheme={setTheme} />
    </aside>
  )
}
