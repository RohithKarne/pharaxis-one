export default function TopBar({ user, onLogout }) {
  return (
    <header className="topbar reveal-up">
      <div>
        <div className="topbar-kicker">Pharaxis One</div>
        <h1>IEG Command Center</h1>
      </div>
      <div className="topbar-user">
        <div>
          <div className="topbar-name">{user?.fullName || user?.display_name || 'User'}</div>
          <div className="muted small">{user?.email}</div>
        </div>
        <button className="ghost" onClick={onLogout}>Logout</button>
      </div>
    </header>
  )
}
