/**
 * MIMSLayout.jsx — Shared page shell
 * Every protected page wraps its content in this.
 * Renders: MIMSHeader + MIMSNavbar + MIMSStatStrip + children (page content)
 */

import { useMemo, useState } from 'react'
import MIMSHeader from './MIMSHeader'
import MIMSNavbar from './MIMSNavbar'
import MIMSStatStrip from './MIMSStatStrip'
import NotificationOverlay from './NotificationOverlay'
import HelpDrawer from './HelpDrawer'

export default function MIMSLayout({ children, showStatStrip = true, bodyClassName = '' }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen]   = useState(false)
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
      <MIMSNavbar />
      {showStatStrip && <MIMSStatStrip />}
      <div className={pageBodyClassName}>
        {children}
      </div>
      <NotificationOverlay open={notifOpen} onClose={() => setNotifOpen(false)} />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
