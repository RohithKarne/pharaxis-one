import { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import Dashboard        from './tabs/Dashboard'
import Organizations    from './tabs/Organizations'
import ServiceLog       from './tabs/ServiceLog'
import SystemActivity   from './tabs/SystemActivity'
import ServiceDashboard from './tabs/ServiceDashboard'
import Configuration    from './tabs/Configuration'
import Escalation       from './tabs/Escalation'
import Documents        from './tabs/Documents'
import Tables           from './tabs/Tables'
import System           from './tabs/System'
import Help             from './tabs/Help'
import { CONFIG_NAV, ESCALATION_NAV, DOCUMENTS_NAV, TABLES_NAV, SYSTEM_NAV, HELP_NAV } from './configItems'
import { SYSTEM_NAV_PERMISSION_BY_VALUE } from './groupSecurityConfig'
import { AdminTenantProvider, useAdminTenant } from '../utils/AdminTenantContext'
import HelpHint from '../../../shared/components/HelpHint'
import { helpKeyFor, helpLabelFor } from '../utils/helpKeys'

function AdminTenantPicker() {
  const { tenants, tenantId, setTenantId, loading } = useAdminTenant()
  if (loading) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tenant</span>
      <select
        value={tenantId}
        onChange={e => setTenantId(e.target.value)}
        style={{
          minWidth: 200, padding: '6px 10px', border: '1px solid var(--border)',
          borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)',
        }}
      >
        {tenants.length === 0 && <option value="">— No tenants —</option>}
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  )
}

const TABS = [
  { key: 'dashboard',         label: 'Dashboard',         component: Dashboard        },
  { key: 'organizations',     label: 'Organizations',     component: Organizations    },
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

function hasSystemPermission(systemOptions, value) {
  const mapping = SYSTEM_NAV_PERMISSION_BY_VALUE[value]
  if (!mapping) return false
  return Boolean(systemOptions?.[mapping.section]?.[mapping.option])
}

function filterSystemNav(nav, systemOptions) {
  return nav.reduce((acc, item) => {
    if (item.children) {
      const children = filterSystemNav(item.children, systemOptions)
      if (children.length) acc.push({ ...item, children })
      return acc
    }
    if (hasSystemPermission(systemOptions, item.value)) acc.push(item)
    return acc
  }, [])
}

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
        <DropdownRow
          key={child.value}
          item={child}
          onSelect={onSelect}
          onCloseAll={onClose}
        />
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

// ── Tables dropdown rendered via portal (uses DropdownRow for Shift flyout) ───
function TablesDropdown({ anchorEl, onSelect, onClose }) {
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
      {TABLES_NAV.map(item => (
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

// ── Tables tab button ─────────────────────────────────────────────────────────
function TablesTab({ isActive, onTabClick, onSelect }) {
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
        Tables
      </button>

      {open && (
        <TablesDropdown
          anchorEl={btnRef.current}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
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

// ── Generic portal dropdown (leaf + nested via DropdownRow) ──────────────────
function NavDropdown({ nav, anchorEl, onSelect, onClose }) {
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
      {nav.map(item => (
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

// ── Generic hover tab ─────────────────────────────────────────────────────────
function HoverTab({ label, nav, isActive, onTabClick, onSelect }) {
  const btnRef     = useRef(null)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  function openMenu()  { clearTimeout(closeTimer.current); setOpen(true) }
  function closeMenu() { closeTimer.current = setTimeout(() => setOpen(false), 150) }

  return (
    <div style={{ position: 'relative' }} onMouseEnter={openMenu} onMouseLeave={closeMenu}>
      <button
        ref={btnRef}
        className={`mims-admin-tab${isActive ? ' active' : ''}`}
        onClick={onTabClick}
      >
        {label}
      </button>

      {open && (
        <NavDropdown
          nav={nav}
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
  const { token } = useAuth()
  return (
    <AdminTenantProvider token={token}>
      <MIMSAdminShellInner />
    </AdminTenantProvider>
  )
}

function MIMSAdminShellInner() {
  const { token, user } = useAuth()
  const location = useLocation()
  const initialSystemItem = new URLSearchParams(location.search).get('system') || ''
  const [activeTab,      setActiveTab]      = useState(initialSystemItem ? 'system' : 'dashboard')
  const [configItem,     setConfigItem]     = useState('')
  const [escalationItem, setEscalationItem] = useState('')
  const [documentsItem,  setDocumentsItem]  = useState('')
  const [tablesItem,     setTablesItem]     = useState('')
  const [systemItem,     setSystemItem]     = useState(initialSystemItem)
  const [helpItem,       setHelpItem]       = useState('')
  const [effectiveAccess, setEffectiveAccess] = useState({ unrestricted: true, system_options: null })

  const loadEffectiveAccess = useCallback(async () => {
    if (!token || !user) return
    try {
      const res = await httpFetch('/api/admin/security-groups/effective', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) setEffectiveAccess(data)
    } catch {
      setEffectiveAccess({ unrestricted: true, system_options: null })
    }
  }, [token, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEffectiveAccess()
  }, [loadEffectiveAccess])

  useEffect(() => {
    window.addEventListener('mims-security-groups-updated', loadEffectiveAccess)
    return () => window.removeEventListener('mims-security-groups-updated', loadEffectiveAccess)
  }, [loadEffectiveAccess])

  useEffect(() => {
    const nextSystemItem = new URLSearchParams(location.search).get('system') || ''
    if (!nextSystemItem) return
    setSystemItem(nextSystemItem)
    setActiveTab('system')
  }, [location.search])

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

  function handleTablesSelect(value) {
    setTablesItem(value)
    setActiveTab('tables')
  }

  function handleSystemSelect(value) {
    setSystemItem(value)
    setActiveTab('system')
  }

  function handleHelpSelect(value) {
    setHelpItem(value)
    setActiveTab('help')
  }

  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || Dashboard
  const systemNav = effectiveAccess?.unrestricted || !effectiveAccess?.system_options
    ? SYSTEM_NAV
    : filterSystemNav(SYSTEM_NAV, effectiveAccess.system_options)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === 'system' && systemNav.length === 0) setActiveTab('dashboard')
  }, [activeTab, systemNav.length])

  return (
    <div className="mims-admin-shell">
      <div className="mims-admin-topnav">
        {TABS.filter(t => t.key !== 'system' || systemNav.length > 0).map(t =>
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
          ) : t.key === 'tables' ? (
            <TablesTab
              key="tables"
              isActive={activeTab === 'tables'}
              onTabClick={() => setActiveTab('tables')}
              onSelect={handleTablesSelect}
            />
          ) : t.key === 'system' ? (
            <HoverTab
              key="system"
              label="System"
              nav={systemNav}
              isActive={activeTab === 'system'}
              onTabClick={() => setActiveTab('system')}
              onSelect={handleSystemSelect}
            />
          ) : t.key === 'help' ? (
            <HoverTab
              key="help"
              label="Help"
              nav={HELP_NAV}
              isActive={activeTab === 'help'}
              onTabClick={() => setActiveTab('help')}
              onSelect={handleHelpSelect}
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
        <AdminTenantPicker />
        <div style={{ marginRight: 12 }}>
          <HelpHint
            featureKey={helpKeyFor({ activeTab, systemItem, tablesItem })}
            label={helpLabelFor({ activeTab, systemItem })}
            placement="topbar"
          />
        </div>
      </div>

      <div className="mims-admin-tab-content">
        {activeTab === 'configuration'
          ? <Configuration selectedItem={configItem} />
          : activeTab === 'escalation'
          ? <Escalation selectedItem={escalationItem} />
          : activeTab === 'documents'
          ? <Documents selectedItem={documentsItem} />
          : activeTab === 'tables'
          ? <Tables selectedItem={tablesItem} />
          : activeTab === 'system'
          ? <System selectedItem={systemItem} />
          : activeTab === 'help'
          ? <Help selectedItem={helpItem} />
          : activeTab === 'dashboard'
          ? <Dashboard onNavigateTab={setActiveTab} />
          : <ActiveComponent />
        }
      </div>
    </div>
  )
}
