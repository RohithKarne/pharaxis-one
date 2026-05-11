/**
 * MIMSLayout.jsx — Shared page shell
 * Header top full-width. Below: left sidebar nav + content area.
 */

import { useMemo, useState, useEffect } from 'react'
import MIMSHeader from './MIMSHeader'
import MIMSNavbar from './MIMSNavbar'
import MIMSStatStrip from './MIMSStatStrip'
import NotificationOverlay from './NotificationOverlay'
import HelpDrawer from './HelpDrawer'

const SIDEBAR_PREF_KEY = 'mims_sidebar_collapsed'

export default function MIMSLayout({ children, showStatStrip = true, bodyClassName = '' }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen]   = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_PREF_KEY) === 'true' } catch { return false }
  })

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_PREF_KEY, String(next)) } catch { /* silent */ }
      return next
    })
  }

  const pageBodyClassName = useMemo(
    () => ['mims-page-body', bodyClassName].filter(Boolean).join(' '),
    [bodyClassName]
  )

  return (
    <div className="mims-app-wrapper">
      <MIMSHeader
        onBellClick={() => setNotifOpen(true)}
        onHelpClick={() => setHelpOpen(true)}
      />
      <div className="mims-app-body">
        <MIMSNavbar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className="mims-content-area">
          {showStatStrip && <MIMSStatStrip />}
          <div className={pageBodyClassName}>
            {children}
          </div>
        </div>
      </div>
      <NotificationOverlay open={notifOpen} onClose={() => setNotifOpen(false)} />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
