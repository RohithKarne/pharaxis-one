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
    label: 'Home',
    moduleKey: 'workspace',
    match: pathname => pathname === '/vault' || pathname.startsWith('/vault/content')
  },
  {
    key: 'qualityOps',
    label: 'Library',
    moduleKey: 'qualityOps',
    match: pathname => pathname.startsWith('/vault/upload') || pathname.startsWith('/vault/search') || pathname.startsWith('/vault/bulk')
  },
  {
    key: 'compliance',
    label: 'Document Actions',
    moduleKey: 'compliance',
    match: pathname => pathname.startsWith('/vault/dossiers') || pathname.startsWith('/vault/slots')
  },
  {
    key: 'riskPartners',
    label: 'Lifecycle',
    moduleKey: 'riskPartners',
    match: pathname => pathname.startsWith('/vault/expiry')
  },
  {
    key: 'workforce',
    label: 'Training',
    moduleKey: 'workforce',
    match: pathname => pathname.startsWith('/vault/tasks') || pathname.startsWith('/vault/notifications') || pathname.startsWith('/vault/training')
  },
  {
    key: 'intelligence',
    label: 'Reports',
    moduleKey: 'intelligence',
    match: pathname => pathname.startsWith('/admin/workflows') || pathname.startsWith('/admin/audit') || pathname.startsWith('/vault/reach') || pathname.startsWith('/vault/intelligence') || pathname.startsWith('/vault/reports')
  },
  {
    key: 'platform',
    label: 'Administration',
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
    { label: 'Search', path: '/vault/search' },
    { label: 'Bulk Operations', path: '/vault/bulk', adminOnly: true }
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
    { label: 'Read & Understood', path: '/vault/training' },
    { label: 'Notifications', path: '/vault/notifications' },
    { label: 'Workflow Queue', path: '/admin/workflows', adminOnly: true }
  ],
  intelligence: [
    { label: 'Reach Score', path: '/vault/reach' },
    { label: 'Content Intelligence', path: '/vault/intelligence' },
    { label: 'Reports', path: '/vault/reports', adminOnly: true },
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

const CREATE_ACTIONS = [
  { label: 'Upload Document', path: '/vault/upload', roles: ['admin', 'author'] },
  { label: 'Create Content Slot', path: '/vault/slots', roles: ['admin', 'author'] },
  { label: 'Build Dossier', path: '/vault/dossiers', roles: ['admin', 'author'] },
  { label: 'Open Workflow Queue', path: '/admin/workflows', roles: ['admin'] },
  { label: 'Configure Vault', path: '/admin', roles: ['admin'] }
]

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
  const [searchScope, setSearchScope] = useState('All Documents')
  const [createOpen, setCreateOpen] = useState(false)

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

  const visibleCreateActions = useMemo(() => {
    const role = String(user?.role || '')
    return CREATE_ACTIONS.filter(action => action.roles.includes(role))
  }, [user?.role])

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
          <button
            className="workspace-app-launcher"
            type="button"
            aria-label="Open app launcher"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </button>
          <span className="workspace-utility-logo">
            <img className="workspace-utility-logo-mark" src={appIconUrl} alt="Vault" />
          </span>
          <span className="workspace-brand-wordmark">Pharaxis <strong>Vault</strong></span>
        </div>
        <form className="workspace-utility-search-wrap" onSubmit={submitGlobalSearch}>
          <select
            className="workspace-search-scope"
            value={searchScope}
            onChange={event => setSearchScope(event.target.value)}
            aria-label="Search scope"
          >
            <option>All Documents</option>
            <option>Recent Library</option>
            <option>Workflows</option>
            <option>Training Evidence</option>
            <option>Audit Trail</option>
          </select>
          <input
            className="workspace-utility-search"
            type="search"
            placeholder={`Search ${searchScope.toLowerCase()}`}
            value={globalSearch}
            onChange={event => setGlobalSearch(event.target.value)}
          />
          <button className="workspace-search-submit" type="submit" aria-label="Run search">
            Search
          </button>
        </form>
        <div className="workspace-utility-actions">
          <span className="workspace-module-pill">Vault</span>
          {visibleCreateActions.length ? (
            <div className="workspace-create-menu">
              <button
                className="workspace-create-button"
                type="button"
                onClick={() => setCreateOpen(open => !open)}
              >
                + Create
              </button>
              {createOpen ? (
                <div className="workspace-create-popover">
                  {visibleCreateActions.map(action => (
                    <button
                      key={action.path}
                      type="button"
                      onClick={() => {
                        setCreateOpen(false)
                        navigate(action.path)
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            className="workspace-icon-action"
            type="button"
            onClick={() => navigate('/vault/notifications')}
            aria-label="Notifications"
          >
            <span className="workspace-icon-bell" aria-hidden="true" />
          </button>
          <button
            className="workspace-icon-action"
            type="button"
            onClick={() => navigate('/vault/tasks')}
            aria-label="Tasks"
          >
            <span className="workspace-icon-task" aria-hidden="true" />
          </button>
          <span className="workspace-utility-avatar">{String(user?.name || 'U').charAt(0).toUpperCase()}</span>
        </div>
      </div>

      <header className="workspace-header-bar">
        <div className="workspace-brand-block">
          <p className="workspace-brand-kicker">Validated Content Workspace</p>
          <h1 className="workspace-brand-title">Pharaxis Vault</h1>
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
