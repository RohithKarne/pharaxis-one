/**
 * MIMSLayout.jsx — Shared page shell
 * Header top full-width. Below: left sidebar nav + content area.
 */

import { useEffect, useMemo, useState } from 'react'
import MIMSHeader from './MIMSHeader'
import MIMSNavbar from './MIMSNavbar'
import MIMSStatStrip from './MIMSStatStrip'
import NotificationOverlay from './NotificationOverlay'
import HelpDrawer from './HelpDrawer'
import CommandPalette from './CommandPalette'
import ToastNotificationListener from './ToastNotificationListener'

const SIDEBAR_PREF_KEY = 'mims_sidebar_collapsed'

export default function MIMSLayout({ children, showStatStrip = true, bodyClassName = '', surfaceVariant = 'default', compact = false }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen]   = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_PREF_KEY) === 'true' } catch { return false }
  })

  // Global Cmd/Ctrl-K opens the command palette. Outside a text field, "/" moves to the
  // page's search box and "n" starts a new case (when the user may create one).
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      const t = e.target
      const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
      if (typing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        const visible = sel => [...document.querySelectorAll(sel)].find(el => !el.disabled && el.offsetParent !== null)
        const search = visible('.mims-page-body [data-shortcut="search"]')
          || visible('.mims-page-body input[type="search"], .mims-page-body input[placeholder^="Search" i]')
        if (search) { e.preventDefault(); search.focus(); search.select() }
      } else if (e.key === 'n') {
        // The New Case form opens from Case Management; from any other screen, go there first.
        const openForm = () => {
          const btn = document.querySelector('.cf-new-case-btn')
          if (!btn || btn.disabled) return false
          btn.click()
          return true
        }
        const goToCases = document.querySelector('.mims-new-case-btn')
        if (openForm()) e.preventDefault()
        else if (goToCases && !goToCases.disabled) {
          e.preventDefault()
          goToCases.click()
          let tries = 0
          const timer = setInterval(() => { if (openForm() || ++tries > 30) clearInterval(timer) }, 100)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_PREF_KEY, String(next)) } catch { /* silent */ }
      return next
    })
  }

  const pageBodyClassName = useMemo(
    () => [
      'mims-page-body',
      surfaceVariant ? `mims-page-body--${surfaceVariant}` : '',
      compact ? 'mims-page-body--compact' : '',
      bodyClassName,
    ].filter(Boolean).join(' '),
    [bodyClassName, compact, surfaceVariant]
  )

  return (
    <div className="mims-app-wrapper">
      {/* First Tab stop: jump past the header and menu to the screen's own content. */}
      <a href="#mims-main" className="mims-skip-link"
        onClick={e => { e.preventDefault(); document.getElementById('mims-main')?.focus() }}>
        Skip to content
      </a>
      <MIMSHeader
        onBellClick={() => setNotifOpen(true)}
        onHelpClick={() => setHelpOpen(true)}
      />
      <div className="mims-app-body">
        <MIMSNavbar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className="mims-content-area">
          {showStatStrip && <MIMSStatStrip />}
          <div id="mims-main" tabIndex={-1} className={pageBodyClassName}>
            {children}
          </div>
        </div>
      </div>
      <NotificationOverlay open={notifOpen} onClose={() => setNotifOpen(false)} />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastNotificationListener />
    </div>
  )
}
