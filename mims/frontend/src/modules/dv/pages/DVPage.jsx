import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'

export default function DVPage() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mims_sidebar_collapsed') === 'true')
  const [theme, setThemeState] = useState(() => localStorage.getItem('mims_theme') || 'light')
  function toggleSidebar() { const next = !collapsed; setCollapsed(next); localStorage.setItem('mims_sidebar_collapsed', next) }
  function setTheme(t) { setThemeState(t); localStorage.setItem('mims_theme', t); document.documentElement.setAttribute('data-theme', t) }

  return (
    <div className="app-wrapper">
      <Sidebar collapsed={collapsed} onCollapse={toggleSidebar} theme={theme} setTheme={setTheme} />
      <div className="main-content">
        <Topbar title="Data Visualization" onToggleSidebar={toggleSidebar} />
        <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Data Visualization</h2>
            <p style={{ fontSize: 14 }}>Reports, charts and analytics — coming in Sprint 8</p>
          </div>
        </div>
      </div>
    </div>
  )
}
