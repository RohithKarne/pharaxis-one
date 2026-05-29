const prefetchedKeys = new Set()

function normalizePath(pathname = '') {
  return String(pathname || '').split('?')[0]
}

const routeLoaders = [
  { key: 'dashboard', match: (path) => path === '/dashboard', load: () => import('../../modules/max/pages/DashboardPage') },
  { key: 'inbox', match: (path) => path === '/inbox', load: () => import('../../modules/max/pages/InboxPage') },
  { key: 'chat', match: (path) => path === '/chat', load: () => import('../../modules/max/pages/ChatPage') },
  { key: 'session-management', match: (path) => path === '/session-management', load: () => import('../../modules/max/pages/SessionManagementPage') },
  { key: 'cases', match: (path) => path === '/cases', load: () => import('../../modules/cases/pages/CasesPage') },
  { key: 'case-form', match: (path) => path.startsWith('/cases/'), load: () => import('../../modules/cases/pages/CaseFormPage') },
  { key: 'case-query', match: (path) => path === '/case-query', load: () => import('../../modules/cases/pages/CaseQueryPage') },
  { key: 'transmissions', match: (path) => path === '/transmissions', load: () => import('../../modules/transmissions/pages/TransmissionsPage') },
  { key: 'response-log', match: (path) => path === '/response-log', load: () => import('../../modules/responselog/pages/ResponseLogPage') },
  { key: 'exceptions', match: (path) => path === '/exceptions', load: () => import('../../modules/max/pages/ExceptionLogsPage') },
  { key: 'browse-content', match: (path) => path === '/browse-content', load: () => import('../../modules/browse/pages/BrowseContentPage') },
  { key: 'content', match: (path) => path === '/content', load: () => import('../../modules/content/pages/ContentPage') },
  { key: 'reports', match: (path) => path === '/reports', load: () => import('../../modules/reports/pages/ReportsPage') },
  { key: 'mims-admin', match: (path) => path === '/mims-admin', load: () => import('../../modules/mimsadmin/pages/MIMSAdminPage') },
  { key: 'developer', match: (path) => path === '/developer', load: () => import('../../modules/devportal/DeveloperPortalPage') },
]

export function prefetchRoutePath(pathname = '') {
  const normalized = normalizePath(pathname)
  const entry = routeLoaders.find((item) => item.match(normalized))
  if (!entry || prefetchedKeys.has(entry.key)) return
  prefetchedKeys.add(entry.key)
  entry.load().catch(() => {
    prefetchedKeys.delete(entry.key)
  })
}
