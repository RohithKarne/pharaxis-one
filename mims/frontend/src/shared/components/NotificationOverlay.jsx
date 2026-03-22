/**
 * NotificationOverlay.jsx — Right-side full notification panel
 * Opens as overlay from the bell icon in MIMSHeader.
 */

export default function NotificationOverlay({ open, onClose }) {
  if (!open) return null

  // Placeholder notifications
  const notifications = []

  return (
    <>
      {/* Backdrop */}
      <div className="mims-overlay-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="mims-notif-panel">
        <div className="mims-notif-header">
          <span className="mims-notif-title">Notifications</span>
          <button className="mims-notif-close" onClick={onClose}>✕</button>
        </div>

        <div className="mims-notif-body">
          {notifications.length === 0 ? (
            <div className="mims-notif-empty">
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔔</div>
              <div>No notifications yet.</div>
            </div>
          ) : (
            notifications.map((n, i) => (
              <div key={i} className="mims-notif-item">
                <div className="mims-notif-case-id">{n.caseId}</div>
                <div className="mims-notif-meta">
                  Org: {n.org} &nbsp; Site: {n.site} &nbsp; {n.time}
                </div>
                <div className="mims-notif-text">{n.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
