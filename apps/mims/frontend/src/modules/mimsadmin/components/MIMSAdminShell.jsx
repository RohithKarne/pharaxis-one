import { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import ServiceLog       from './tabs/ServiceLog'
import SystemActivity   from './tabs/SystemActivity'
import ServiceDashboard from './tabs/ServiceDashboard'
import Configuration    from './tabs/Configuration'
import Escalation       from './tabs/Escalation'
import Documents        from './tabs/Documents'
import Tables           from './tabs/Tables'
import System           from './tabs/System'
import Help             from './tabs/Help'
import { CONFIG_NAV, ESCALATION_NAV, DOCUMENTS_NAV } from './configItems'

const TABS = [
  { key: 'service-log',       label: 'Service Log',       component: ServiceLog       },
  { key: 'system-activity',   label: 'System Activity',   component: SystemActivity   },
  { key: 'service-dashboard', label: 'Service Dashboard', component: ServiceDashboard },
  { key: 'configuration',     label: 'Configuration',     component: Configuration    },
  { key: 'escalation',        label: 'Escalation',        component: Escalation       },
  { key: 'documents',         label: 'Documents',         component: Documents        },
  { key: 'tables',            label: 'Tables',            component: Tables           },
  { key: 'system',            label: 'System',            component: System           },
  { key: 'help',              label: 'Help',              component: Help             },
]

// ── Flyout submenu rendered via portal ───────────────────────────────────────
function FlyoutMenu({ items, anchorEl, onSelect, onClose }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    setPos({ top: r.top, left: r.right + 2 })
  }, [anchorEl])

  if (!pos) return null

  return ReactDOM.createPortal(
    <div
      onMouseEnter={() => {}}
      onMouseLeave={onClose}
      style={{
        position:      'fixed',
        top:           pos.top,
        left:          pos.left,
        zIndex:        9999,
        background:    'var(--surface)',
        border:        '1px solid var(--border)',
        borderRadius:  7,
        boxShadow:     '0 4px 18px rgba(0,0,0,0.14)',
        minWidth:      210,
        paddingTop:    4,
        paddingBottom: 4,
      }}
    >
      {items.map(child => (
        <div
          key={child.value}
          onClick={() => { onSelect(child.value); onClose() }}
          style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', userSelect: 'none' }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {child.label}
        </div>
      ))}
    </div>,
    document.body
  )
}

// ── Single row item inside the main dropdown ──────────────────────────────────
function DropdownRow({ item, onSelect, onCloseAll }) {
  const rowRef  = useRef(null)
  const [showFlyout, setShowFlyout] = useState(false)
  const closeTimer = useRef(null)

  const hasChildren = !!item.children

  function openFlyout()  { clearTimeout(closeTimer.current); setShowFlyout(true) }
  function closeFlyout() { closeTimer.current = setTimeout(() => setShowFlyout(false), 120) }

  return (
    <div
      ref={rowRef}
      onClick={() => { if (!hasChildren) { onSelect(item.value); onCloseAll() } }}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '8px 16px',
        cursor:         'pointer',
        fontSize:       13,
        color:          'var(--text-primary)',
        whiteSpace:     'nowrap',
        userSelect:     'none',
        gap:            24,
      }}
      onMouseEnter={e => { openFlyout(); e.currentTarget.style.background = '#f3f4f6' }}
      onMouseLeave={e => { closeFlyout(); e.currentTarget.style.background = 'transparent' }}
    >
      <span>{item.label}</span>
      {hasChildren && <span style={{ fontSize: 10, opacity: 0.45 }}>▶</span>}

      {hasChildren && showFlyout && (
        <FlyoutMenu
          items={item.children}
          anchorEl={rowRef.current}
          onSelect={onSelect}
          onClose={() => { setShowFlyout(false); onCloseAll() }}
        />
      )}
    </div>
  )
}

// ── Main config dropdown rendered via portal ──────────────────────────────────
function ConfigDropdown({ anchorEl, onSelect, onClose }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left })
  }, [anchorEl])

  if (!pos) return null

  return ReactDOM.createPortal(
    <div
      onMouseEnter={() => {}}
      onMouseLeave={onClose}
      style={{
        position:      'fixed',
        top:           pos.top,
        left:          pos.left,
        zIndex:        9998,
        background:    'var(--surface)',
        border:        '1px solid var(--border)',
        borderRadius:  7,
        boxShadow:     '0 4px 18px rgba(0,0,0,0.13)',
        minWidth:      210,
        paddingTop:    4,
        paddingBottom: 4,
      }}
    >
      {CONFIG_NAV.map(item => (
        <DropdownRow
          key={item.value}
          item={item}
          onSelect={onSelect}
          onCloseAll={onClose}
        />
      ))}
    </div>,
    document.body
  )
}

// ── Documents dropdown rendered via portal ────────────────────────────────────
function DocumentsDropdown({ anchorEl, onSelect, onClose }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left })
  }, [anchorEl])

  if (!pos) return null

  return ReactDOM.createPortal(
    <div
      onMouseEnter={() => {}}
      onMouseLeave={onClose}
      style={{
        position:      'fixed',
        top:           pos.top,
        left:          pos.left,
        zIndex:        9998,
        background:    'var(--surface)',
        border:        '1px solid var(--border)',
        borderRadius:  7,
        boxShadow:     '0 4px 18px rgba(0,0,0,0.13)',
        minWidth:      210,
        paddingTop:    4,
        paddingBottom: 4,
      }}
    >
      {DOCUMENTS_NAV.map(item => (
        <div
          key={item.value}
          onClick={() => { onSelect(item.value); onClose() }}
          style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', userSelect: 'none' }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {item.label}
        </div>
      ))}
    </div>,
    document.body
  )
}

// ── Documents tab button ──────────────────────────────────────────────────────
function DocumentsTab({ isActive, onTabClick, onSelect }) {
  const btnRef  = useRef(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function openMenu()  { clearTimeout(closeTimer.current); setOpen(true) }
  function closeMenu() { closeTimer.current = setTimeout(() => setOpen(false), 150) }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <button
        ref={btnRef}
        className={`mims-admin-tab${isActive ? ' active' : ''}`}
        onClick={onTabClick}
      >
        Documents
      </button>

      {open && (
        <DocumentsDropdown
          anchorEl={btnRef.current}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

// ── Escalation dropdown rendered via portal ───────────────────────────────────
function EscalationDropdown({ anchorEl, onSelect, onClose }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!anchorEl) return
    const r = anchorEl.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left })
  }, [anchorEl])

  if (!pos) return null

  return ReactDOM.createPortal(
    <div
      onMouseEnter={() => {}}
      onMouseLeave={onClose}
      style={{
        position:      'fixed',
        top:           pos.top,
        left:          pos.left,
        zIndex:        9998,
        background:    'var(--surface)',
        border:        '1px solid var(--border)',
        borderRadius:  7,
        boxShadow:     '0 4px 18px rgba(0,0,0,0.13)',
        minWidth:      210,
        paddingTop:    4,
        paddingBottom: 4,
      }}
    >
      {ESCALATION_NAV.map(item => (
        <div
          key={item.value}
          onClick={() => { onSelect(item.value); onClose() }}
          style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', userSelect: 'none' }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {item.label}
        </div>
      ))}
    </div>,
    document.body
  )
}

// ── Escalation tab button ─────────────────────────────────────────────────────
function EscalationTab({ isActive, onTabClick, onSelect }) {
  const btnRef  = useRef(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function openMenu()  { clearTimeout(closeTimer.current); setOpen(true) }
  function closeMenu() { closeTimer.current = setTimeout(() => setOpen(false), 150) }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <button
        ref={btnRef}
        className={`mims-admin-tab${isActive ? ' active' : ''}`}
        onClick={onTabClick}
      >
        Escalation
      </button>

      {open && (
        <EscalationDropdown
          anchorEl={btnRef.current}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

// ── Configuration tab button ──────────────────────────────────────────────────
function ConfigTab({ isActive, onTabClick, onSelect }) {
  const btnRef     = useRef(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function openMenu()  { clearTimeout(closeTimer.current); setOpen(true) }
  function closeMenu() { closeTimer.current = setTimeout(() => setOpen(false), 150) }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <button
        ref={btnRef}
        className={`mims-admin-tab${isActive ? ' active' : ''}`}
        onClick={onTabClick}
      >
        Configuration
      </button>

      {open && (
        <ConfigDropdown
          anchorEl={btnRef.current}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export default function MIMSAdminShell() {
  const [activeTab,      setActiveTab]      = useState('service-log')
  const [configItem,     setConfigItem]     = useState('')
  const [escalationItem, setEscalationItem] = useState('')
  const [documentsItem,  setDocumentsItem]  = useState('')

  function handleConfigSelect(value) {
    setConfigItem(value)
    setActiveTab('configuration')
  }

  function handleEscalationSelect(value) {
    setEscalationItem(value)
    setActiveTab('escalation')
  }

  function handleDocumentsSelect(value) {
    setDocumentsItem(value)
    setActiveTab('documents')
  }

  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || ServiceLog

  return (
    <div className="mims-admin-shell">
      <div className="mims-admin-topnav">
        {TABS.map(t =>
          t.key === 'configuration' ? (
            <ConfigTab
              key="configuration"
              isActive={activeTab === 'configuration'}
              onTabClick={() => setActiveTab('configuration')}
              onSelect={handleConfigSelect}
            />
          ) : t.key === 'escalation' ? (
            <EscalationTab
              key="escalation"
              isActive={activeTab === 'escalation'}
              onTabClick={() => setActiveTab('escalation')}
              onSelect={handleEscalationSelect}
            />
          ) : t.key === 'documents' ? (
            <DocumentsTab
              key="documents"
              isActive={activeTab === 'documents'}
              onTabClick={() => setActiveTab('documents')}
              onSelect={handleDocumentsSelect}
            />
          ) : (
            <button
              key={t.key}
              className={`mims-admin-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          )
        )}
      </div>

      <div className="mims-admin-tab-content">
        {activeTab === 'configuration'
          ? <Configuration selectedItem={configItem} />
          : activeTab === 'escalation'
          ? <Escalation selectedItem={escalationItem} />
          : activeTab === 'documents'
          ? <Documents selectedItem={documentsItem} />
          : <ActiveComponent />
        }
      </div>
    </div>
  )
}
