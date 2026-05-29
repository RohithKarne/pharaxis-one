import { lazy, Suspense, useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { hasGlobalAdminScope } from '../../../shared/utils/adminScope.js'
// import Organizations from './tabs/Organizations' // retired — see TABS note (Division Parameters replaces it)
import { CONFIG_NAV, ESCALATION_NAV, DOCUMENTS_NAV, TABLES_NAV, SYSTEM_NAV, HELP_NAV } from './configItems'
// Legacy nav-key permission map retired — admin gating is now capability-based.
// groupSecurityConfig kept on disk for rollback. (import removed)
import { AdminTenantProvider, useAdminTenant } from '../utils/AdminTenantContext'
import HelpHint from '../../../shared/components/HelpHint'
import { helpKeyFor, helpLabelFor } from '../utils/helpKeys'

const DashboardTab = lazy(() => import('./tabs/Dashboard'))
const ServiceLogTab = lazy(() => import('./tabs/ServiceLog'))
const SystemActivityTab = lazy(() => import('./tabs/SystemActivity'))
const ServiceDashboardTab = lazy(() => import('./tabs/ServiceDashboard'))
const ConfigurationTab = lazy(() => import('./tabs/Configuration'))
const EscalationTabContent = lazy(() => import('./tabs/Escalation'))
const DocumentsTabContent = lazy(() => import('./tabs/Documents'))
const TablesTabContent = lazy(() => import('./tabs/Tables'))
const SystemTab = lazy(() => import('./tabs/System'))
const HelpTab = lazy(() => import('./tabs/Help'))

function AdminTabLoader() {
  return (
    <div style={{ minHeight: 240, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Loading admin workspace...
    </div>
  )
}

function createResolvedAdminAccess(data = {}) {
  return { resolved: true, unrestricted: false, system_options: null, ...data }
}

function createUnresolvedAdminAccess() {
  return { resolved: false, unrestricted: false, system_options: {} }
}

function findFirstLeafValue(nav, predicate = () => true) {
  for (const item of nav) {
    if (item.children?.length) {
      const child = findFirstLeafValue(item.children, predicate)
      if (child) return child
      continue
    }
    if (item.value && predicate(item.value)) return item.value
  }
  return ''
}

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
  { key: 'dashboard',         label: 'Dashboard',         component: DashboardTab        },
  // Organizations retired — replaced by System > Division Parameters (division-only model).
  // Component file kept for rollback; remove import + file once parity is fully confirmed.
  { key: 'service-log',       label: 'Service Log',       component: ServiceLogTab       },
  { key: 'system-activity',   label: 'System Activity',   component: SystemActivityTab   },
  { key: 'service-dashboard', label: 'Service Dashboard', component: ServiceDashboardTab },
  { key: 'configuration',     label: 'Configuration',     component: ConfigurationTab    },
  { key: 'escalation',        label: 'Escalation',        component: EscalationTabContent       },
  { key: 'documents',         label: 'Documents',         component: DocumentsTabContent        },
  { key: 'tables',            label: 'Tables',            component: TablesTabContent           },
  { key: 'system',            label: 'System',            component: SystemTab           },
  { key: 'help',              label: 'Help',              component: HelpTab             },
]

const SERVICE_LOG_NAV = [
  { label: 'Service Log Overview', value: 'service-log-overview' },
  { label: 'Response Error Log', value: 'response-error-log' },
  { label: 'Transmission Error Log', value: 'transmission-error-log' },
]

const SYSTEM_ACTIVITY_NAV = [
  { label: 'System Activity Overview', value: 'system-activity-overview' },
]

// ── Capability-based admin gating (replaces legacy nav-key system_options) ──
// Coarse map: admin nav value → capability key. Anything UNMAPPED fails OPEN
// (stays visible) — combined with the unrestricted/unresolved fail-open in
// effHasCap, this guarantees an admin can never be locked out of the console.
const SYSTEM_VALUE_CAP = {
  'sys-division-params': 'admin.division_parameters',
  'sys-view-data':       'admin.view_data',
  'sys-system-params':   'admin.system_parameters',
  'sys-reports-access':  'admin.system_parameters',
  'sys-license-admin':   'admin.system_parameters',
  'sys-sec-users':       'admin.users',
  'sys-sec-group':       'admin.security_groups',
  'sys-sec-auth-policy': 'admin.auth_policy',
  'sys-exception-log':   'admin.exception_log',
}
function capForSystemValue(value) {
  if (!value) return null
  if (value.startsWith('sys-setup-')) return 'admin.setup'
  return SYSTEM_VALUE_CAP[value] || null
}
// Fail-open: no mapping, unrestricted (superadmin), or privileges not yet
// resolved → allowed. Only an explicitly-resolved list lacking the cap hides it.
function effHasCap(effectiveAccess, cap) {
  if (!cap) return true
  if (!effectiveAccess || effectiveAccess.unrestricted) return true
  if (effectiveAccess.privileges == null) return true
  return Array.isArray(effectiveAccess.privileges) && effectiveAccess.privileges.includes(cap)
}

function isSystemItemAllowed(effectiveAccess, value) {
  if (!value) return true
  return effHasCap(effectiveAccess, capForSystemValue(value))
}

// Admin tabs stay visible; granular control lives at the System sub-item level.
function isAdminTabAllowed(tabKey, effectiveAccess) {
  if (tabKey === 'dashboard' || tabKey === 'help') return true
  if (!effectiveAccess || effectiveAccess.unrestricted || effectiveAccess.privileges == null) return true
  return true
}

function AdminAccessDenied({ label = 'this admin screen' }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ maxWidth: 480, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🚫</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Access not available</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          Your security group does not allow access to {label}. Ask an administrator to update Group Security.
        </p>
      </div>
    </div>
  )
}

function filterSystemNav(nav, effectiveAccess) {
  return nav.reduce((acc, item) => {
    if (item.children) {
      const children = filterSystemNav(item.children, effectiveAccess)
      if (children.length) acc.push({ ...item, children })
      return acc
    }
    if (isSystemItemAllowed(effectiveAccess, item.value)) acc.push(item)
    return acc
  }, [])
}

function getAnchorPosition(anchorEl, direction = 'bottom') {
  if (!anchorEl) return null
  const rect = anchorEl.getBoundingClientRect()
  if (direction === 'right') {
    return { top: rect.top, left: rect.right + 2 }
  }
  return { top: rect.bottom + 2, left: rect.left }
}

// ── Flyout submenu rendered via portal ───────────────────────────────────────
function FlyoutMenu({ items, anchorEl, onSelect, onClose }) {
  const pos = getAnchorPosition(anchorEl, 'right')
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
  const [flyoutAnchor, setFlyoutAnchor] = useState(null)
  const closeTimer = useRef(null)

  const hasChildren = !!item.children

  function openFlyout()  {
    clearTimeout(closeTimer.current)
    setFlyoutAnchor(rowRef.current)
    setShowFlyout(true)
  }
  function closeFlyout() {
    closeTimer.current = setTimeout(() => {
      setShowFlyout(false)
      setFlyoutAnchor(null)
    }, 120)
  }

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
          anchorEl={flyoutAnchor}
          onSelect={onSelect}
          onClose={() => { setShowFlyout(false); setFlyoutAnchor(null); onCloseAll() }}
        />
      )}
    </div>
  )
}

// ── Main config dropdown rendered via portal ──────────────────────────────────
function ConfigDropdown({ anchorEl, onSelect, onClose }) {
  const pos = getAnchorPosition(anchorEl)
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
  const pos = getAnchorPosition(anchorEl)
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
  const [menuAnchor, setMenuAnchor] = useState(null)
  const closeTimer = useRef(null)

  function openMenu()  {
    clearTimeout(closeTimer.current)
    setMenuAnchor(btnRef.current)
    setOpen(true)
  }
  function closeMenu() {
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setMenuAnchor(null)
    }, 150)
  }

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
          anchorEl={menuAnchor}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

// ── Documents dropdown rendered via portal ────────────────────────────────────
function DocumentsDropdown({ anchorEl, onSelect, onClose }) {
  const pos = getAnchorPosition(anchorEl)
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
  const [menuAnchor, setMenuAnchor] = useState(null)
  const closeTimer = useRef(null)

  function openMenu()  {
    clearTimeout(closeTimer.current)
    setMenuAnchor(btnRef.current)
    setOpen(true)
  }
  function closeMenu() {
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setMenuAnchor(null)
    }, 150)
  }

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
          anchorEl={menuAnchor}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

// ── Escalation dropdown rendered via portal ───────────────────────────────────
function EscalationDropdown({ anchorEl, onSelect, onClose }) {
  const pos = getAnchorPosition(anchorEl)
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
  const [menuAnchor, setMenuAnchor] = useState(null)
  const closeTimer = useRef(null)

  function openMenu()  {
    clearTimeout(closeTimer.current)
    setMenuAnchor(btnRef.current)
    setOpen(true)
  }
  function closeMenu() {
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setMenuAnchor(null)
    }, 150)
  }

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
          anchorEl={menuAnchor}
          onSelect={(value) => { onSelect(value); setOpen(false) }}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

// ── Generic portal dropdown (leaf + nested via DropdownRow) ──────────────────
function NavDropdown({ nav, anchorEl, onSelect, onClose }) {
  const pos = getAnchorPosition(anchorEl)
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
  const [menuAnchor, setMenuAnchor] = useState(null)
  const closeTimer = useRef(null)

  function openMenu()  {
    clearTimeout(closeTimer.current)
    setMenuAnchor(btnRef.current)
    setOpen(true)
  }
  function closeMenu() {
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setMenuAnchor(null)
    }, 150)
  }

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
          anchorEl={menuAnchor}
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
  const [menuAnchor, setMenuAnchor] = useState(null)
  const closeTimer = useRef(null)

  function openMenu()  {
    clearTimeout(closeTimer.current)
    setMenuAnchor(btnRef.current)
    setOpen(true)
  }
  function closeMenu() {
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setMenuAnchor(null)
    }, 150)
  }

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
          anchorEl={menuAnchor}
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
  const navigate = useNavigate()
  const initialParams = new URLSearchParams(location.search)
  const initialServiceItem = initialParams.get('service') || ''
  const initialActivityItem = initialParams.get('activity') || ''
  const initialTablesItem = initialParams.get('tables') || ''
  const initialSystemItem = initialParams.get('system') || ''
  const initialAuditItem = initialParams.get('audit') || 'admin'
  const [activeTab,      setActiveTab]      = useState(
    initialParams.get('tab')
      || (initialSystemItem ? 'system' : initialTablesItem ? 'tables' : initialServiceItem ? 'service-log' : initialActivityItem ? 'system-activity' : 'dashboard')
  )
  const [configItem,     setConfigItem]     = useState(initialParams.get('config') || '')
  const [escalationItem, setEscalationItem] = useState(initialParams.get('escalation') || '')
  const [documentsItem,  setDocumentsItem]  = useState(initialParams.get('documents') || '')
  const [serviceItem,    setServiceItem]    = useState(initialServiceItem)
  const [activityItem,   setActivityItem]   = useState(initialActivityItem)
  const [tablesItem,     setTablesItem]     = useState(initialTablesItem)
  const [systemItem,     setSystemItem]     = useState(initialSystemItem)
  const [auditItem,      setAuditItem]      = useState(initialAuditItem)
  const [helpItem,       setHelpItem]       = useState(initialParams.get('help') || '')
  const [effectiveAccess, setEffectiveAccess] = useState(() => createUnresolvedAdminAccess())

  const loadEffectiveAccess = useCallback(async () => {
    if (!token || !user) return
    if (hasGlobalAdminScope(user)) {
      setEffectiveAccess(createResolvedAdminAccess({ unrestricted: true, system_options: null }))
      return
    }
    try {
      const res = await httpFetch('/api/admin/security-groups/effective', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('security access unavailable')
      const data = await res.json()
      setEffectiveAccess(createResolvedAdminAccess(data))
    } catch {
      setEffectiveAccess(createUnresolvedAdminAccess())
    }
  }, [token, user])

  useEffect(() => {
    loadEffectiveAccess()
  }, [loadEffectiveAccess])

  useEffect(() => {
    window.addEventListener('mims-security-groups-updated', loadEffectiveAccess)
    return () => window.removeEventListener('mims-security-groups-updated', loadEffectiveAccess)
  }, [loadEffectiveAccess])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const nextServiceItem = params.get('service') || ''
    const nextActivityItem = params.get('activity') || ''
    const nextTab = params.get('tab')
      || (params.get('system') ? 'system' : params.get('tables') ? 'tables' : nextServiceItem ? 'service-log' : nextActivityItem ? 'system-activity' : 'dashboard')
    const nextConfigItem = params.get('config') || ''
    const nextEscalationItem = params.get('escalation') || ''
    const nextDocumentsItem = params.get('documents') || ''
    const nextHelpItem = params.get('help') || ''
    const nextSystemItem = params.get('system') || ''
    const nextTablesItem = params.get('tables') || ''
    const nextAuditItem = params.get('audit') || 'admin'
    setActiveTab(nextTab)
    setConfigItem(nextConfigItem)
    setEscalationItem(nextEscalationItem)
    setDocumentsItem(nextDocumentsItem)
    setServiceItem(nextServiceItem)
    setActivityItem(nextActivityItem)
    setHelpItem(nextHelpItem)
    setSystemItem(nextSystemItem)
    setTablesItem(nextTablesItem)
    setAuditItem(nextAuditItem)
  }, [location.search])

  // Capability-based filtering with fail-open: unresolved / unrestricted / no
  // resolved privilege list → show full nav (never lock an admin out).
  const systemNav = (!effectiveAccess || effectiveAccess.resolved === false || effectiveAccess.unrestricted || effectiveAccess.privileges == null)
    ? SYSTEM_NAV
    : filterSystemNav(SYSTEM_NAV, effectiveAccess)
  const defaultConfigItem = findFirstLeafValue(CONFIG_NAV)
  const defaultEscalationItem = findFirstLeafValue(ESCALATION_NAV)
  const defaultDocumentsItem = findFirstLeafValue(DOCUMENTS_NAV)
  const defaultServiceItem = 'service-log-overview'
  const defaultActivityItem = 'system-activity-overview'
  const defaultTablesItem = findFirstLeafValue(TABLES_NAV)
  const defaultSystemItem = findFirstLeafValue(systemNav, value => isSystemItemAllowed(effectiveAccess, value))
  const defaultHelpItem = findFirstLeafValue(HELP_NAV)

  const syncAdminState = useCallback((nextState) => {
    const params = new URLSearchParams(location.search)
    const {
      tab = activeTab,
      config = configItem,
      escalation = escalationItem,
      documents = documentsItem,
      service = serviceItem,
      activity = activityItem,
      tables = tablesItem,
      system = systemItem,
      audit = auditItem,
      help = helpItem,
    } = nextState

    const values = { tab, config, escalation, documents, service, activity, tables, system, audit, help }
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'audit' && system !== 'sys-view-data') {
        params.delete(key)
      } else if (value) params.set(key, value)
      else params.delete(key)
    })
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true })
  }, [
    activeTab,
    configItem,
    documentsItem,
    escalationItem,
    helpItem,
    location.pathname,
    location.search,
    navigate,
    serviceItem,
    activityItem,
    systemItem,
    auditItem,
    tablesItem,
  ])

  const activateTab = useCallback((nextTab, nextItemKey = null, nextItemValue = '') => {
    if (nextTab === 'service-log') {
      const value = nextItemKey === 'service' ? nextItemValue : (serviceItem || defaultServiceItem)
      setServiceItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, service: value })
      return
    }
    if (nextTab === 'system-activity') {
      const value = nextItemKey === 'activity' ? nextItemValue : (activityItem || defaultActivityItem)
      setActivityItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, activity: value })
      return
    }
    if (nextTab === 'configuration') {
      const value = nextItemKey === 'config' ? nextItemValue : (configItem || defaultConfigItem)
      setConfigItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, config: value })
      return
    }
    if (nextTab === 'escalation') {
      const value = nextItemKey === 'escalation' ? nextItemValue : (escalationItem || defaultEscalationItem)
      setEscalationItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, escalation: value })
      return
    }
    if (nextTab === 'documents') {
      const value = nextItemKey === 'documents' ? nextItemValue : (documentsItem || defaultDocumentsItem)
      setDocumentsItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, documents: value })
      return
    }
    if (nextTab === 'tables') {
      const value = nextItemKey === 'tables' ? nextItemValue : (tablesItem || defaultTablesItem)
      setTablesItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, tables: value })
      return
    }
    if (nextTab === 'system') {
      const value = nextItemKey === 'system' ? nextItemValue : (systemItem && isSystemItemAllowed(effectiveAccess, systemItem) ? systemItem : defaultSystemItem)
      setSystemItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, system: value })
      return
    }
    if (nextTab === 'help') {
      const value = nextItemKey === 'help' ? nextItemValue : (helpItem || defaultHelpItem)
      setHelpItem(value)
      setActiveTab(nextTab)
      syncAdminState({ tab: nextTab, help: value })
      return
    }
    setActiveTab(nextTab)
    syncAdminState({ tab: nextTab })
  }, [
    activityItem,
    configItem,
    defaultActivityItem,
    defaultConfigItem,
    defaultDocumentsItem,
    defaultEscalationItem,
    defaultHelpItem,
    defaultServiceItem,
    defaultSystemItem,
    defaultTablesItem,
    documentsItem,
    escalationItem,
    helpItem,
    serviceItem,
    syncAdminState,
    systemItem,
    tablesItem,
    effectiveAccess,
  ])

  function handleConfigSelect(value) {
    activateTab('configuration', 'config', value)
  }

  function handleServiceSelect(value) {
    activateTab('service-log', 'service', value)
  }

  function handleSystemActivitySelect(value) {
    activateTab('system-activity', 'activity', value)
  }

  function handleEscalationSelect(value) {
    activateTab('escalation', 'escalation', value)
  }

  function handleDocumentsSelect(value) {
    activateTab('documents', 'documents', value)
  }

  function handleTablesSelect(value) {
    activateTab('tables', 'tables', value)
  }

  function handleSystemSelect(value) {
    activateTab('system', 'system', value)
  }

  function handleAuditSelect(value) {
    setAuditItem(value)
    setSystemItem('sys-view-data')
    setActiveTab('system')
    syncAdminState({ tab: 'system', system: 'sys-view-data', audit: value })
  }

  function handleHelpSelect(value) {
    activateTab('help', 'help', value)
  }

  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || DashboardTab
  const visibleTabs = TABS.filter(t => {
    if (t.key === 'system') return systemNav.length > 0
    return isAdminTabAllowed(t.key, effectiveAccess)
  })
  useEffect(() => {
    if (activeTab === 'system' && systemNav.length === 0) activateTab('dashboard')
  }, [activeTab, activateTab, systemNav.length])

  useEffect(() => {
    if (!visibleTabs.some(t => t.key === activeTab)) activateTab('dashboard')
  }, [activeTab, activateTab, visibleTabs])

  useEffect(() => {
    if (activeTab === 'service-log' && !serviceItem) activateTab('service-log', 'service', defaultServiceItem)
    if (activeTab === 'system-activity' && !activityItem) activateTab('system-activity', 'activity', defaultActivityItem)
    if (activeTab === 'configuration' && !configItem && defaultConfigItem) activateTab('configuration', 'config', defaultConfigItem)
    if (activeTab === 'escalation' && !escalationItem && defaultEscalationItem) activateTab('escalation', 'escalation', defaultEscalationItem)
    if (activeTab === 'documents' && !documentsItem && defaultDocumentsItem) activateTab('documents', 'documents', defaultDocumentsItem)
    if (activeTab === 'tables' && !tablesItem && defaultTablesItem) activateTab('tables', 'tables', defaultTablesItem)
    if (activeTab === 'system' && !systemItem && defaultSystemItem) activateTab('system', 'system', defaultSystemItem)
    if (activeTab === 'help' && !helpItem && defaultHelpItem) activateTab('help', 'help', defaultHelpItem)
  }, [
    activeTab,
    activityItem,
    activateTab,
    configItem,
    defaultConfigItem,
    defaultDocumentsItem,
    defaultEscalationItem,
    defaultHelpItem,
    defaultActivityItem,
    defaultServiceItem,
    defaultSystemItem,
    defaultTablesItem,
    documentsItem,
    escalationItem,
    helpItem,
    serviceItem,
    systemItem,
    tablesItem,
  ])

  return (
    <div className="mims-admin-shell">
      <div className="mims-admin-topnav">
        {visibleTabs.map(t =>
          t.key === 'service-log' ? (
            <HoverTab
              key="service-log"
              label="Service Log"
              nav={SERVICE_LOG_NAV}
              isActive={activeTab === 'service-log'}
              onTabClick={() => activateTab('service-log')}
              onSelect={handleServiceSelect}
            />
          ) : t.key === 'system-activity' ? (
            <HoverTab
              key="system-activity"
              label="System Activity"
              nav={SYSTEM_ACTIVITY_NAV}
              isActive={activeTab === 'system-activity'}
              onTabClick={() => activateTab('system-activity')}
              onSelect={handleSystemActivitySelect}
            />
          ) : t.key === 'configuration' ? (
            <ConfigTab
              key="configuration"
              isActive={activeTab === 'configuration'}
              onTabClick={() => activateTab('configuration')}
              onSelect={handleConfigSelect}
            />
          ) : t.key === 'escalation' ? (
            <EscalationTab
              key="escalation"
              isActive={activeTab === 'escalation'}
              onTabClick={() => activateTab('escalation')}
              onSelect={handleEscalationSelect}
            />
          ) : t.key === 'documents' ? (
            <DocumentsTab
              key="documents"
              isActive={activeTab === 'documents'}
              onTabClick={() => activateTab('documents')}
              onSelect={handleDocumentsSelect}
            />
          ) : t.key === 'tables' ? (
            <TablesTab
              key="tables"
              isActive={activeTab === 'tables'}
              onTabClick={() => activateTab('tables')}
              onSelect={handleTablesSelect}
            />
          ) : t.key === 'system' ? (
            <HoverTab
              key="system"
              label="System"
              nav={systemNav}
              isActive={activeTab === 'system'}
              onTabClick={() => activateTab('system')}
              onSelect={handleSystemSelect}
            />
          ) : t.key === 'help' ? (
            <HoverTab
              key="help"
              label="Help"
              nav={HELP_NAV}
              isActive={activeTab === 'help'}
              onTabClick={() => activateTab('help')}
              onSelect={handleHelpSelect}
            />
          ) : (
            <button
              key={t.key}
              className={`mims-admin-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => activateTab(t.key)}
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
        <Suspense fallback={<AdminTabLoader />}>
          {activeTab === 'system' && systemItem && !isSystemItemAllowed(effectiveAccess, systemItem)
            ? <AdminAccessDenied label={helpLabelFor({ activeTab, systemItem }) || 'this system option'} />
            : activeTab !== 'system' && !isAdminTabAllowed(activeTab, effectiveAccess)
            ? <AdminAccessDenied label={TABS.find(t => t.key === activeTab)?.label || 'this admin tab'} />
            : activeTab === 'service-log'
            ? <ServiceLogTab selectedItem={serviceItem} />
            : activeTab === 'system-activity'
            ? <SystemActivityTab selectedItem={activityItem} />
            : activeTab === 'configuration'
            ? <ConfigurationTab selectedItem={configItem} onSelect={(value) => activateTab('configuration', 'config', value)} />
            : activeTab === 'escalation'
            ? <EscalationTabContent selectedItem={escalationItem} onSelect={(value) => activateTab('escalation', 'escalation', value)} />
            : activeTab === 'documents'
            ? <DocumentsTabContent selectedItem={documentsItem} onSelect={(value) => activateTab('documents', 'documents', value)} />
            : activeTab === 'tables'
            ? <TablesTabContent selectedItem={tablesItem} onSelect={(value) => activateTab('tables', 'tables', value)} />
            : activeTab === 'system'
            ? <SystemTab selectedItem={systemItem} auditItem={auditItem} onAuditSelect={handleAuditSelect} />
            : activeTab === 'help'
            ? <HelpTab selectedItem={helpItem} onSelect={(value) => activateTab('help', 'help', value)} />
            : activeTab === 'dashboard'
            ? <DashboardTab onNavigateTab={activateTab} />
            : <ActiveComponent />
          }
        </Suspense>
      </div>
    </div>
  )
}
