export default function ThemeSwitcher({ theme, setTheme }) {
  return (
    <div className="sidebar-footer">
      <div className="sidebar-footer-label">Theme</div>
      <div className="theme-switcher">
        <button className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>☀️ <span className="theme-label">Light</span></button>
        <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙 <span className="theme-label">Dark</span></button>
      </div>
    </div>
  )
}
