import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  authHeaders,
  clearOrgSession,
  getOrgToken,
  getOrgUser
} from '../utils/session'

const PRIMARY_SECTIONS = [
  {
    key: 'overview',
    label: 'Overview',
    moduleKey: 'workspace',
    match: pathname => pathname === '/vault' || pathname.startsWith('/vault/content')
  },
  {
    key: 'qualityOps',
    label: 'Quality Ops',
    moduleKey: 'qualityOps',
    match: pathname => pathname.startsWith('/vault/upload') || pathname.startsWith('/vault/search')
  },
  {
    key: 'compliance',
    label: 'Compliance',
    moduleKey: 'compliance',
    match: pathname => pathname.startsWith('/vault/dossiers') || pathname.startsWith('/vault/slots')
  },
  {
    key: 'riskPartners',
    label: 'Risk & Partners',
    moduleKey: 'riskPartners',
    match: pathname => pathname.startsWith('/vault/expiry')
  },
  {
    key: 'workforce',
    label: 'Workforce',
    moduleKey: 'workforce',
    match: pathname => pathname.startsWith('/vault/tasks') || pathname.startsWith('/vault/notifications')
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    moduleKey: 'intelligence',
    match: pathname => pathname.startsWith('/admin/workflows') || pathname.startsWith('/admin/audit')
  },
  {
    key: 'platform',
    label: 'Platform',
    moduleKey: 'platform',
    match: pathname => pathname.startsWith('/admin')
  }
]

const MODULE_GROUPS = {
  workspace: [
    { label: 'Workspace Home', path: '/vault' },
    { label: 'Content Search', path: '/vault/search' }
  ],
  qualityOps: [
    { label: 'Upload', path: '/vault/upload' },
    { label: 'Search', path: '/vault/search' }
  ],
  compliance: [
    { label: 'Content Slots', path: '/vault/slots' },
    { label: 'Dossiers', path: '/vault/dossiers' }
  ],
  riskPartners: [
    { label: 'Expiry Dashboard', path: '/vault/expiry' },
    { label: 'Integrations', path: '/admin/integrations', adminOnly: true }
  ],
  workforce: [
    { label: 'My Tasks', path: '/vault/tasks' },
    { label: 'Notifications', path: '/vault/notifications' },
    { label: 'Workflow Queue', path: '/admin/workflows', adminOnly: true }
  ],
  intelligence: [
    { label: 'Workflow Analytics', path: '/admin/workflows', adminOnly: true },
    { label: 'Audit Trail', path: '/admin/audit', adminOnly: true }
  ],
  platform: [
    { label: 'Admin Console', path: '/admin', adminOnly: true },
    { label: 'Setup Wizard', path: '/admin/wizard', adminOnly: true },
    { label: 'Users', path: '/admin/users', adminOnly: true },
    { label: 'Taxonomy', path: '/admin/taxonomy', adminOnly: true },
    { label: 'Lifecycle', path: '/admin/lifecycle', adminOnly: true },
    { label: 'Security', path: '/admin/security', adminOnly: true },
    { label: 'Channels', path: '/admin/channels', adminOnly: true },
    { label: 'Integrations', path: '/admin/integrations', adminOnly: true }
  ]
}

function activeSectionForPath(pathname) {
  const firstMatch = PRIMARY_SECTIONS.find(section => section.match(pathname))
  return firstMatch || PRIMARY_SECTIONS[0]
}

export default function WorkspaceShell({ children }) {
  const user = getOrgUser()
  const isAdmin = user?.role === 'admin'
  const appIconUrl = `${import.meta.env.BASE_URL}vault-icon.svg`
  const location = useLocation()
  const navigate = useNavigate()
  const [moduleSearch, setModuleSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')

  const activePrimary = useMemo(
    () => activeSectionForPath(location.pathname),
    [location.pathname]
  )

  useEffect(() => {
    if (location.pathname === '/vault/search') {
      const params = new URLSearchParams(location.search)
      setGlobalSearch(params.get('q') || '')
      return
    }
    setGlobalSearch('')
  }, [location.pathname, location.search])

  const visibleModules = useMemo(() => {
    const entries = MODULE_GROUPS[activePrimary.moduleKey] || []
    const allowed = entries.filter(entry => isAdmin || !entry.adminOnly)
    const query = moduleSearch.trim().toLowerCase()
    if (!query) return allowed
    return allowed.filter(entry => entry.label.toLowerCase().includes(query))
  }, [activePrimary.moduleKey, isAdmin, moduleSearch])

  async function logout() {
    const token = getOrgToken()
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(token)
      })
    } finally {
      clearOrgSession()
      navigate('/')
    }
  }

  function submitGlobalSearch(event) {
    event.preventDefault()
    const query = globalSearch.trim()
    if (!query) {
      navigate('/vault/search')
      return
    }
    navigate(`/vault/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <div className="workspace-shell">
      <div className="workspace-utility-strip">
        <div className="workspace-utility-brand">
          <span className="workspace-utility-logo">
            <img className="workspace-utility-logo-mark" src={appIconUrl} alt="Vault" />
          </span>
          <span>Pharaxis Vault</span>
        </div>
        <form className="workspace-utility-search-wrap" onSubmit={submitGlobalSearch}>
          <input
            className="workspace-utility-search"
            type="search"
            placeholder="Search records, documents, and workflows"
            value={globalSearch}
            onChange={event => setGlobalSearch(event.target.value)}
          />
        </form>
        <div className="workspace-utility-actions">
          <button
            className="workspace-utility-action"
            type="button"
            onClick={() => navigate('/vault/notifications')}
          >
            Notifications
          </button>
          <button
            className="workspace-utility-action"
            type="button"
            onClick={() => navigate('/vault/tasks')}
          >
            Tasks
          </button>
          <span className="workspace-utility-avatar">{String(user?.name || 'U').charAt(0).toUpperCase()}</span>
        </div>
      </div>

      <header className="workspace-header-bar">
        <div className="workspace-brand-block">
          <p className="workspace-brand-kicker">Workspace</p>
          <h1 className="workspace-brand-title">Vault User Workspace</h1>
        </div>

        <nav className="workspace-primary-nav">
          {PRIMARY_SECTIONS.map(section => (
            <button
              key={section.key}
              type="button"
              className={section.key === activePrimary.key ? 'workspace-primary-tab workspace-primary-tab-active' : 'workspace-primary-tab'}
              onClick={() => {
                const modules = MODULE_GROUPS[section.moduleKey] || []
                const allowed = modules.find(entry => isAdmin || !entry.adminOnly)
                if (allowed) {
                  navigate(allowed.path)
                  setModuleSearch('')
                }
              }}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="workspace-header-actions">
          <div className="workspace-user-meta">
            <p className="workspace-user-name">{isAdmin ? 'Vault Admin' : 'Vault User'}</p>
            <p className="workspace-user-roles">{user?.name || 'user'}, {user?.role || 'role'}</p>
          </div>
          <button className="workspace-logout" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="workspace-subnav-row">
        <div className="workspace-secondary-nav">
          {visibleModules.map(item => (
            <NavLink
              key={item.path}
              className={({ isActive }) => (isActive ? 'workspace-secondary-link workspace-secondary-link-active' : 'workspace-secondary-link')}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="workspace-subnav-tools">
          <input
            className="workspace-module-search"
            type="search"
            placeholder="Filter modules in this tab"
            value={moduleSearch}
            onChange={event => setModuleSearch(event.target.value)}
          />
        </div>
      </div>

      <main className="workspace-content">{children}</main>
    </div>
  )
}
