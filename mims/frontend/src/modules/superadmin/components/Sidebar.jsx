import ThemeSwitcher from '../../../shared/components/ThemeSwitcher'

const NAV_ITEMS = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'organizations', label: 'Organizations' },
  { key: '2fa-config',    label: '2FA Configuration' },
  { key: 'users',         label: 'Users' },
  { key: 'alerts',        label: 'Alerts' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'audit',         label: 'Audit Trail' },
  { key: 'login-audit',   label: 'Login Audit' },
]

const S = {
  sidebar: {
    width: 220, flexShrink: 0,
    background: '#1e2d40',
    display: 'flex', flexDirection: 'column',
    height: '100vh', overflow: 'hidden',
    transition: 'width 0.2s',
  },
  sidebarCollapsed: {
    width: 48,
  },
  logoArea: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 14px 14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0, minHeight: 56,
  },
  logoText: {
    display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
  },
  logoTitle: {
    fontSize: 14, fontWeight: 700, color: '#fff',
    letterSpacing: 0.5, whiteSpace: 'nowrap',
  },
  logoSubtitle: {
    fontSize: 10, color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap',
  },
  collapseBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1,
    padding: '2px 4px', borderRadius: 4, flexShrink: 0,
    transition: 'color 0.15s',
  },
  sectionLabel: {
    padding: '14px 16px 4px',
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.35)',
  },
  navItem: (active) => ({
    display: 'flex', alignItems: 'center',
    padding: '8px 16px', fontSize: 13,
    color: active ? '#e8890c' : 'rgba(255,255,255,0.72)',
    background: active ? 'rgba(232,137,12,0.12)' : 'none',
    borderLeft: `2px solid ${active ? '#e8890c' : 'transparent'}`,
    cursor: 'pointer', fontWeight: active ? 600 : 400,
    transition: 'background 0.1s, color 0.1s',
    whiteSpace: 'nowrap', overflow: 'hidden',
  }),
  nav: {
    flex: 1, overflowY: 'auto', padding: '8px 0',
  },
}

export default function Sidebar({ collapsed, onCollapse, theme, setTheme, activePage, onNavigate }) {
  return (
    <aside style={{ ...S.sidebar, ...(collapsed ? S.sidebarCollapsed : {}) }}>
      {/* Logo area */}
      <div style={S.logoArea}>
        {!collapsed && (
          <div style={S.logoText}>
            <div style={S.logoTitle}>Superadmin</div>
            <div style={S.logoSubtitle}>Platform Control</div>
          </div>
        )}
        <button style={S.collapseBtn} onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Navigation */}
      <div style={S.nav}>
        {!collapsed && <div style={S.sectionLabel}>Platform</div>}
        {NAV_ITEMS.map(item => (
          <div
            key={item.key}
            style={S.navItem(activePage === item.key)}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
          >
            {!collapsed && item.label}
          </div>
        ))}
      </div>

      <ThemeSwitcher theme={theme} setTheme={setTheme} />
    </aside>
  )
}
