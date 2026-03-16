import { useLocation } from 'react-router-dom'
import ThemeSwitcher from '../../../shared/components/ThemeSwitcher'

export default function Sidebar({ collapsed, onCollapse, theme, setTheme }) {
  const location = useLocation()
  function isActive(path) { return location.pathname === path }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-title">Content</div>
        <div className="logo-subtitle">MIMS Content Mgmt</div>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main</div>
        {!collapsed && (
          <div className="nav-item" style={{ fontSize: 12, opacity: 0.6 }} onClick={onCollapse}>
            <span className="nav-icon">‹</span>
            <span className="nav-label">Close</span>
          </div>
        )}
        <div className="nav-section-label">Content</div>
        <div className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <span className="nav-icon">📄</span><span className="nav-label">Templates</span>
        </div>
        <div className="nav-item"><span className="nav-icon">📁</span><span className="nav-label">Folders</span></div>
        <div className="nav-item"><span className="nav-icon">📝</span><span className="nav-label">Documents</span></div>
        <div className="nav-item"><span className="nav-icon">🖼️</span><span className="nav-label">Media Library</span></div>
      </nav>
      <ThemeSwitcher theme={theme} setTheme={setTheme} />
    </aside>
  )
}
