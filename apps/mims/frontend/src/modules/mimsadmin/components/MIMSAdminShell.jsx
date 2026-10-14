import { lazy, Suspense, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { hasGlobalAdminScope } from '../../../shared/utils/adminScope.js'
import { CONFIG_NAV, ESCALATION_NAV, DOCUMENTS_NAV, TABLES_NAV, SYSTEM_NAV, HELP_NAV, RETIRED_SYSTEM_ITEMS, withoutAdvanced } from './configItems'
import { ADVANCED_FORMS_KEY } from './CaseFieldsConfig'
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

// MIMS Admin is for administrators, who may use every screen in it; only the
// platform tools below are kept from an organisation's administrator. A
// per-screen tick on Group Security used to hide items here, but the server
// let administrators use them all the same (access review, 2026-10-14).
function AdminAccessDenied({ label = 'this admin screen' }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ maxWidth: 480, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--text-primary)' }}>Access not available</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          {`${label} is kept to platform administrators, because it reaches every organisation.`}
        </p>
      </div>
    </div>
  )
}

// Platform-admin tools, never shown to an organisation's admin (M-113: Copy
// Division reaches every organisation). The server refuses them too.
// The server keeps these to platform admins: each holds every organisation's data
// (MIPM-149). A tenant admin saw the menu items and a screen whose data was refused.
const PLATFORM_ONLY_LABELS = { 'sys-maint-copy-division': 'Copy Division', 'sys-exception-log': 'The Exception Log' }
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

// The address key that holds each tab's chosen item.
const ITEM_KEY_BY_TAB = {
  'service-log':     'service',
  'system-activity': 'activity',
  configuration:     'config',
  escalation:        'escalation',
  documents:         'documents',
  tables:            'tables',
  system:            'system',
  help:              'help',
}

function MIMSAdminShellInner() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [narrowNavOpen,  setNarrowNavOpen]  = useState(false)

  // "Advanced form tools" switch on Case Form Fields (case form clean-up PR 5).
  const readAdvancedForms = () => { try { return localStorage.getItem(ADVANCED_FORMS_KEY) === '1' } catch { return false } }
  const [advancedForms, setAdvancedForms] = useState(readAdvancedForms)
  useEffect(() => {
    const onChange = () => setAdvancedForms(readAdvancedForms())
    window.addEventListener('mims-advanced-forms', onChange)
    return () => window.removeEventListener('mims-advanced-forms', onChange)
  }, [])

  // The address is the only record of which screen is open: a click writes it,
  // and the screen is read back from it here, with a default for a blank item.
  const params = new URLSearchParams(location.search)
  // A retired screen's address is replaced by the screen that took its place.
  const retiredTo = RETIRED_SYSTEM_ITEMS[params.get('system')]
  useEffect(() => {
    if (!retiredTo) return
    const next = new URLSearchParams(location.search)
    next.set('system', retiredTo)
    navigate(`${location.pathname}?${next.toString()}`, { replace: true })
  }, [retiredTo, location.search, location.pathname, navigate])

  const scopedNav = hasGlobalAdminScope(user) ? SYSTEM_NAV : withoutPlatformOnly(SYSTEM_NAV)
  const systemNav = advancedForms ? scopedNav : withoutAdvanced(scopedNav)
  const defaultItems = {
    service:    'service-log-overview',
    activity:   'system-activity-overview',
    config:     findFirstLeafValue(CONFIG_NAV),
    escalation: findFirstLeafValue(ESCALATION_NAV),
    documents:  findFirstLeafValue(DOCUMENTS_NAV),
    tables:     findFirstLeafValue(TABLES_NAV),
    system:     findFirstLeafValue(systemNav),
    help:       findFirstLeafValue(HELP_NAV),
  }
  const items = Object.fromEntries(Object.entries(defaultItems).map(([key, fallback]) => [key, params.get(key) || fallback]))
  if (retiredTo) items.system = retiredTo
  const { service: serviceItem, activity: activityItem, config: configItem, escalation: escalationItem,
    documents: documentsItem, tables: tablesItem, system: systemItem, help: helpItem } = items
  const auditItem = params.get('audit') || 'admin'

  const visibleTabs = TABS.filter(t => {
    if (t.key === 'system') return systemNav.length > 0
    // Creating and running organisations is the platform admin's job alone (MIPM-132).
    if (t.key === 'organizations') return hasGlobalAdminScope(user)
    return true
  })
  const requestedTab = params.get('tab')
    || (params.get('system') ? 'system' : params.get('tables') ? 'tables' : params.get('service') ? 'service-log' : params.get('activity') ? 'system-activity' : 'dashboard')
  // A tab this administrator cannot see opens the admin home instead.
  const activeTab = visibleTabs.some(t => t.key === requestedTab) ? requestedTab : 'dashboard'
  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || DashboardTab

  function writeAddress(next, audit = auditItem) {
    if (next.get('system') === 'sys-view-data') next.set('audit', audit)
    else next.delete('audit')
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : '' }, { replace: true })
  }

  // Opens a tab, and the item given or the one it last showed.
  function activateTab(nextTab, nextItemKey = null, nextItemValue = '') {
    const next = new URLSearchParams(location.search)
    next.set('tab', nextTab)
    const key = ITEM_KEY_BY_TAB[nextTab]
    if (key) {
      const value = nextItemKey === key ? nextItemValue : items[key]
      if (value) next.set(key, value)
      else next.delete(key)
    }
    writeAddress(next)
  }

  function handleAuditSelect(value) {
    const next = new URLSearchParams(location.search)
    next.set('tab', 'system')
    next.set('system', 'sys-view-data')
    writeAddress(next, value)
  }

  const adminTree = buildAdminTree(visibleTabs, systemNav)
  const adminLeaves = flattenLeaves(adminTree)
  const currentLeaf = adminLeaves.find(l => l.tab === activeTab && (!l.key || l.value === items[l.key]))
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
            {activeTab === 'system' && systemItem && PLATFORM_ONLY_SYSTEM_ITEMS.has(systemItem) && !hasGlobalAdminScope(user)
                // Reached by link or address: the menu hides these, the screen should too.
              ? <AdminAccessDenied label={PLATFORM_ONLY_LABELS[systemItem]} />
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
