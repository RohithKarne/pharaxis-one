import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { hasGlobalAdminScope } from '../../../shared/utils/adminScope.js'
import { CONFIG_NAV, ESCALATION_NAV, DOCUMENTS_NAV, TABLES_NAV, SYSTEM_NAV, HELP_NAV } from './configItems'
import { AdminTenantProvider, useAdminTenant } from '../utils/AdminTenantContext'
import HelpHint from '../../../shared/components/HelpHint'
import { helpKeyFor, helpLabelFor } from '../utils/helpKeys'

const DashboardTab = lazy(() => import('./tabs/Dashboard'))
const OrganizationsTab = lazy(() => import('./tabs/Organizations'))
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
  return { resolved: false, unrestricted: false, system_options: {}, privileges: [] }
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
  // With one organisation there is nothing to choose (M-112).
  if (loading || tenants.length <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
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
  { key: 'dashboard',         label: 'Admin home',        component: DashboardTab        },
  { key: 'organizations',     label: 'Organisations',     component: OrganizationsTab    },
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

// ── Capability-based admin gating ──
// Coarse map: admin nav value → capability key.
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
function effHasCap(effectiveAccess, cap) {
  if (!cap) return true
  if (!effectiveAccess) return false
  if (effectiveAccess.unrestricted) return true
  if (!Array.isArray(effectiveAccess.privileges)) return false
  return effectiveAccess.privileges.includes(cap)
}

function isSystemItemAllowed(effectiveAccess, value) {
  if (!value) return true
  return effHasCap(effectiveAccess, capForSystemValue(value))
}

function AdminAccessDenied({ label = 'this admin screen', platformOnly = false }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ maxWidth: 480, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Access not available</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          {platformOnly
            ? `${label} is kept to platform administrators, because it reaches every organisation.`
            : `Your security group does not allow access to ${label}. Ask an administrator to update Group Security.`}
        </p>
      </div>
    </div>
  )
}

// Platform-admin tools, never shown to an organisation's admin (M-113: Copy
// Division reaches every organisation). The server refuses them too.
// The server keeps these to platform admins: each holds every organisation's data
// (MIPM-149). A tenant admin saw the menu items and a screen whose data was refused.
const PLATFORM_ONLY_LABELS = { 'sys-maint-copy-division': 'Copy Division', 'sys-reports-access': 'Reports Access', 'sys-exception-log': 'The Exception Log' }
const PLATFORM_ONLY_SYSTEM_ITEMS = new Set(Object.keys(PLATFORM_ONLY_LABELS))

function withoutPlatformOnly(nav) {
  return nav.reduce((acc, item) => {
    if (item.children) {
      const children = withoutPlatformOnly(item.children)
      if (children.length) acc.push({ ...item, children })
      return acc
    }
    if (!PLATFORM_ONLY_SYSTEM_ITEMS.has(item.value)) acc.push(item)
    return acc
  }, [])
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

// ── Admin left list ───────────────────────────────────────────────────────────
// The admin screens sat behind hover menus up to four levels deep, with no search
// and nothing saying where you were (MIMS screen review, row 6). They are now one
// list that stays on screen, a "Find a setting" box over every screen in it, and a
// trail above the page. Each entry opens the same address it always did.
// The admin home's short list of the settings most admin visits are for.
const COMMON_SETTINGS = ['sys-sec-users', 'sys-sec-group', 'sys-setup-case-fields', 'sys-setup-workflow', 'sys-setup-email-accounts']

function buildAdminTree(tabs, systemNav) {
  const navs = {
    'service-log':     [SERVICE_LOG_NAV, 'service'],
    'system-activity': [SYSTEM_ACTIVITY_NAV, 'activity'],
    configuration:     [CONFIG_NAV, 'config'],
    escalation:        [ESCALATION_NAV, 'escalation'],
    documents:         [DOCUMENTS_NAV, 'documents'],
    tables:            [TABLES_NAV, 'tables'],
    system:            [systemNav, 'system'],
    help:              [HELP_NAV, 'help'],
  }
  const toNodes = (nav, tab, key, parentId) => nav.map(item => {
    const id = `${parentId}/${item.value}`
    return item.children
      ? { id, label: item.label, children: toNodes(item.children, tab, key, id) }
      : { id, label: item.label, tab, key, value: item.value }
  })
  return tabs.map(t => navs[t.key]
    ? { id: t.key, label: t.label, children: toNodes(navs[t.key][0], t.key, navs[t.key][1], t.key) }
    : { id: t.key, label: t.label, tab: t.key, key: null, value: '' })
}

function flattenLeaves(nodes, trail = []) {
  return nodes.flatMap(n => n.children
    ? flattenLeaves(n.children, [...trail, n])
    : [{ ...n, trail: [...trail, n] }])
}

function AdminNavNode({ node, depth, currentId, isOpen, onToggle, onPick }) {
  if (!node.children) {
    const current = node.id === currentId
    return (
      <button
        type="button"
        className={`mims-admin-nav-leaf${current ? ' current' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        aria-current={current ? 'page' : undefined}
        onClick={() => onPick(node)}
      >
        {node.label}
      </button>
    )
  }
  const open = isOpen(node.id)
  return (
    <>
      <button
        type="button"
        className={`mims-admin-nav-group${depth === 0 ? ' top' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        aria-expanded={open}
        onClick={() => onToggle(node.id, !open)}
      >
        <span className="mims-admin-nav-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {node.label}
      </button>
      {open && node.children.map(child => (
        <AdminNavNode key={child.id} node={child} depth={depth + 1} currentId={currentId} isOpen={isOpen} onToggle={onToggle} onPick={onPick} />
      ))}
    </>
  )
}

function AdminSideNav({ tree, leaves, current, open, onSelect }) {
  const [query, setQuery] = useState('')
  // Groups on the way to the current screen start open; a click on a group wins.
  const [toggled, setToggled] = useState({})
  const trailIds = new Set((current?.trail || []).map(n => n.id))
  const isOpen = id => (id in toggled ? toggled[id] : trailIds.has(id))
  const onToggle = (id, value) => setToggled(prev => ({ ...prev, [id]: value }))

  const q = query.trim().toLowerCase()
  const results = q
    ? leaves
        .filter(l => l.trail.some(n => n.label.toLowerCase().includes(q)))
        .sort((a, b) => Number(!a.label.toLowerCase().includes(q)) - Number(!b.label.toLowerCase().includes(q)))
    : []

  function pick(leaf) {
    setQuery('')
    setToggled({})
    onSelect(leaf)
  }

  return (
    <nav className={`mims-admin-sidenav${open ? ' open' : ''}`} aria-label="Admin settings">
      <input
        type="search"
        className="mims-admin-nav-search"
        placeholder="Find a setting…"
        aria-label="Find a setting"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && results[0]) pick(results[0])
          if (e.key === 'Escape') setQuery('')
        }}
      />
      <div className="mims-admin-nav-list">
        {q ? (
          results.length ? results.map(leaf => (
            <button key={leaf.id} type="button" className="mims-admin-nav-result" onClick={() => pick(leaf)}>
              <span>{leaf.label}</span>
              {leaf.trail.length > 1 && (
                <span className="mims-admin-nav-result-trail">{leaf.trail.slice(0, -1).map(n => n.label).join(' › ')}</span>
              )}
            </button>
          )) : (
            <div className="mims-admin-nav-empty">No setting matches “{query.trim()}”.</div>
          )
        ) : tree.map(node => (
          <AdminNavNode key={node.id} node={node} depth={0} currentId={current?.id} isOpen={isOpen} onToggle={onToggle} onPick={pick} />
        ))}
      </div>
    </nav>
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
  const [narrowNavOpen,  setNarrowNavOpen]  = useState(false)

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

  // Capability-based filtering
  const capabilityNav = (effectiveAccess?.unrestricted)
    ? SYSTEM_NAV
    : filterSystemNav(SYSTEM_NAV, effectiveAccess)
  const systemNav = hasGlobalAdminScope(user) ? capabilityNav : withoutPlatformOnly(capabilityNav)
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

  function handleAuditSelect(value) {
    setAuditItem(value)
    setSystemItem('sys-view-data')
    setActiveTab('system')
    syncAdminState({ tab: 'system', system: 'sys-view-data', audit: value })
  }

  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || DashboardTab
  const visibleTabs = TABS.filter(t => {
    if (t.key === 'system') return systemNav.length > 0
    // Creating and running organisations is the platform admin's job alone (MIPM-132).
    if (t.key === 'organizations') return hasGlobalAdminScope(user)
    return true
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

  const adminTree = buildAdminTree(visibleTabs, systemNav)
  const adminLeaves = flattenLeaves(adminTree)
  const currentItems = { service: serviceItem, activity: activityItem, config: configItem, escalation: escalationItem, documents: documentsItem, tables: tablesItem, system: systemItem, help: helpItem }
  const currentLeaf = adminLeaves.find(l => l.tab === activeTab && (!l.key || l.value === currentItems[l.key]))
    || adminLeaves.find(l => l.tab === activeTab)

  return (
    <div className="mims-admin-shell">
      <AdminSideNav
        tree={adminTree}
        leaves={adminLeaves}
        current={currentLeaf}
        open={narrowNavOpen}
        onSelect={leaf => { setNarrowNavOpen(false); activateTab(leaf.tab, leaf.key, leaf.value) }}
      />
      <div className="mims-admin-main">
        <div className="mims-admin-trailbar">
          <button type="button" className="mims-admin-nav-toggle" aria-expanded={narrowNavOpen} onClick={() => setNarrowNavOpen(o => !o)}>
            {narrowNavOpen ? 'Close settings list' : 'All settings'}
          </button>
          <div className="mims-admin-trail" aria-label="You are here">
            {(currentLeaf?.trail || []).map((n, i, all) => (
              <span key={n.id} className={i === all.length - 1 ? 'here' : undefined}>
                {n.label}{i < all.length - 1 && <span className="mims-admin-trail-sep" aria-hidden="true"> › </span>}
              </span>
            ))}
          </div>
          {/* One unit, so when the bar wraps the picker and its help button move together. */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
            <AdminTenantPicker />
            <HelpHint
              featureKey={helpKeyFor({ activeTab, systemItem, tablesItem })}
              label={helpLabelFor({ activeTab, systemItem })}
              placement="topbar"
            />
          </div>
        </div>

        <div className="mims-admin-tab-content">
          <Suspense fallback={<AdminTabLoader />}>
            {activeTab === 'system' && systemItem && (!isSystemItemAllowed(effectiveAccess, systemItem)
                // Reached by link or address: the menu hides these, the screen should too.
                || (PLATFORM_ONLY_SYSTEM_ITEMS.has(systemItem) && !hasGlobalAdminScope(user)))
              ? <AdminAccessDenied label={PLATFORM_ONLY_LABELS[systemItem] || helpLabelFor({ activeTab, systemItem }) || 'this system option'} platformOnly={PLATFORM_ONLY_SYSTEM_ITEMS.has(systemItem)} />
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
              ? <DashboardTab onNavigateTab={activateTab} commonSettings={COMMON_SETTINGS.map(v => adminLeaves.find(l => l.value === v)).filter(Boolean)} />
              : <ActiveComponent />
            }
          </Suspense>
        </div>
      </div>
    </div>
  )
}
