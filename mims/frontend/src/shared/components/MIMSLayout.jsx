/**
 * MIMSLayout.jsx — Shared page shell
 * Every protected page wraps its content in this.
 * Renders: MIMSHeader + MIMSNavbar + MIMSStatStrip + children (page content)
 */

import { useState } from 'react'
import MIMSHeader from './MIMSHeader'
import MIMSNavbar from './MIMSNavbar'
import MIMSStatStrip from './MIMSStatStrip'
import NotificationOverlay from './NotificationOverlay'

export default function MIMSLayout({ children, showStatStrip = true }) {
  const [notifOpen, setNotifOpen] = useState(false)

  return (
    <div className="mims-app-wrapper">
      <MIMSHeader onBellClick={() => setNotifOpen(true)} />
      <MIMSNavbar />
      {showStatStrip && <MIMSStatStrip />}
      <div className="mims-page-body">
        {children}
      </div>
      <NotificationOverlay open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  )
}
