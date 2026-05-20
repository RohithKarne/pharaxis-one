/**
 * MIMS Process Explorer flow templates.
 * CP-specific template content has been removed.
 */

export const LANE_COLORS = {
  User: '#6B3FA0',
  Admin: '#6B3FA0',
  Frontend: '#2563EB',
  Backend: '#D97706',
  Auth: '#DC2626',
  Database: '#16A34A',
  Notifications: '#0D9488',
  Scheduler: '#7C3AED',
  External: '#6B7280',
}

const BASE_SWIMLANES_ADMIN = ['Admin', 'Frontend', 'Backend', 'Auth', 'Database']

export function matchTemplate(method, path = '') {
  return 'generic_admin'
}

export const FLOW_TEMPLATES = {
  generic_admin: {
    title: 'MIMS Generic Admin Flow',
    description: 'Admin action from UI to backend with auth and data operation.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Admin triggers action', type: 'solid', concept: '🖥 UI Action', detail: 'Admin performs a saved business action in MIMS.' },
      { from: 1, to: 2, label: 'Send API request', type: 'solid', concept: '🔄 Middleware', apiRoute: 'Derived /api/admin/...', detail: 'Frontend sends request to backend API.' },
      { from: 2, to: 3, label: 'Validate session and permissions', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js', detail: 'Backend validates auth and org/client scope.' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication', detail: 'Request is allowed to continue.' },
      { from: 2, to: 4, label: 'Read/Write MIMS data', type: 'solid', concept: '💾 DB Write', dbQuery: 'INSERT/UPDATE/DELETE or SELECT ...', detail: 'Backend executes business operation on pharaxis_mims_dev (Pharaxis DB layer).' },
      { from: 4, to: 2, label: 'DB result', type: 'dashed', concept: '💾 DB Read', detail: 'Database returns success/data to backend.' },
      { from: 2, to: 1, label: 'Response to UI', type: 'dashed', concept: '🖥 UI Action', statusMeaning: '200 OK — operation completed', detail: 'Frontend updates the UI from API response.' },
    ],
  },

  mims_platform_admin_org_update: {
    title: 'Platform Admin Org Update',
    description: 'Platform admin updates organisation-level controls and feature toggles.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Open org settings and edit values', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/mimsadmin/pages/MIMSAdminPage.jsx' },
      { from: 1, to: 2, label: 'PUT /api/admin/platform/orgs/:id', type: 'solid', concept: '🔄 Middleware', apiRoute: 'PUT /api/admin/platform/orgs/:id' },
      { from: 2, to: 3, label: 'Validate platform admin privileges', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Update organisations row', type: 'solid', concept: '💾 DB Write', file: 'mims/backend/routes/platformAdmin.js', dbQuery: 'UPDATE organisations SET ... WHERE id=?' },
      { from: 4, to: 2, label: 'DB confirms update', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '200 OK + updated config', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  mims_admin_picklist_create: {
    title: 'Admin Picklist Create',
    description: 'Admin creates picklist values used by case forms and workflows.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Enter picklist name and value', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx' },
      { from: 1, to: 2, label: 'POST /api/admin/picklists', type: 'solid', concept: '🔄 Middleware', apiRoute: 'POST /api/admin/picklists' },
      { from: 2, to: 3, label: 'Validate admin session', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Insert picklist item', type: 'solid', concept: '💾 DB Write', file: 'mims/backend/routes/admin/picklists.js', dbQuery: 'INSERT INTO picklists ...' },
      { from: 4, to: 2, label: 'DB confirms insert', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '201 Created', type: 'dashed', concept: '🖥 UI Action', statusMeaning: '201 Created — picklist saved' },
    ],
  },

  mims_inbox_correspondence: {
    title: 'Inbox Correspondence Flow',
    description: 'Inbox communication is linked to case correspondence timeline.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Open inquiry and choose correspondence action', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/max/pages/InboxPage.jsx' },
      { from: 1, to: 2, label: 'POST /api/inbox/:id/reply or forward', type: 'solid', concept: '🔄 Middleware', apiRoute: 'POST /api/inbox/:id/reply' },
      { from: 2, to: 3, label: 'Validate session and org scope', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Persist correspondence log', type: 'solid', concept: '💾 DB Write', file: 'mims/backend/routes/inbox.js', dbQuery: 'INSERT INTO inquiries/case correspondence ...' },
      { from: 4, to: 2, label: 'DB confirms write', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '200 OK + updated thread', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  mims_case_create: {
    title: 'Case Creation Flow',
    description: 'User creates a new case from inbox or case management.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Fill case creation form', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/cases/pages/CaseFormPage.jsx' },
      { from: 1, to: 2, label: 'POST /api/cases', type: 'solid', concept: '🔄 Middleware', apiRoute: 'POST /api/cases' },
      { from: 2, to: 3, label: 'Validate auth and org access', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Insert case + generate case number', type: 'solid', concept: '💾 DB Write', file: 'mims/backend/routes/cases.js', dbQuery: 'INSERT INTO cases ...' },
      { from: 4, to: 2, label: 'DB confirms case id/number', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '201 Created + case payload', type: 'dashed', concept: '🖥 UI Action', statusMeaning: '201 Created — case saved' },
    ],
  },

  mims_case_update: {
    title: 'Case Update Flow',
    description: 'Case data is updated and tracked in audit trail.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Edit case details', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/cases/pages/CaseFormPage.jsx' },
      { from: 1, to: 2, label: 'PUT /api/cases/:id', type: 'solid', concept: '🔄 Middleware', apiRoute: 'PUT /api/cases/:id' },
      { from: 2, to: 3, label: 'Validate session and permissions', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Update case + audit trail', type: 'solid', concept: '💾 DB Write', file: 'mims/backend/routes/cases.js', dbQuery: 'UPDATE cases ...; INSERT case_audit_trail ...' },
      { from: 4, to: 2, label: 'DB confirms update', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '200 OK + refreshed case', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  mims_case_query_search: {
    title: 'Case Query Search',
    description: 'Case Query loads filtered case and correspondence metadata.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Apply filters in Case Query', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/cases/pages/CaseQueryPage.jsx' },
      { from: 1, to: 2, label: 'GET /api/cases/query', type: 'solid', concept: '🔄 Middleware', apiRoute: 'GET /api/cases/query' },
      { from: 2, to: 3, label: 'Validate read access', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Run filtered SELECT query', type: 'solid', concept: '💾 DB Read', file: 'mims/backend/routes/cases.js', dbQuery: 'SELECT ... FROM cases WHERE ...' },
      { from: 4, to: 2, label: 'Return result set', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '200 OK + query results', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  mims_cm_template_management: {
    title: 'CM Template Management',
    description: 'Content Management templates are created/updated for responses.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Manage CM template form', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/content/pages/ContentPage.jsx' },
      { from: 1, to: 2, label: 'POST/PUT /api/cm/templates', type: 'solid', concept: '🔄 Middleware', apiRoute: 'POST /api/cm/templates' },
      { from: 2, to: 3, label: 'Validate auth + role', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Persist CM template record', type: 'solid', concept: '💾 DB Write', file: 'mims/backend/routes/cm/templates.js', dbQuery: 'INSERT/UPDATE cm_templates ...' },
      { from: 4, to: 2, label: 'DB confirms template save', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '200/201 success response', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  mims_process_explorer_refresh: {
    title: 'Process Explorer Refresh',
    description: 'Process Explorer fetches route catalog and logged event coverage.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Open explorer and click Get Data', type: 'solid', concept: '🖥 UI Action', file: 'mims/frontend/src/modules/dv/pages/ProcessExplorerPage.jsx' },
      { from: 1, to: 2, label: 'GET /api/admin/process-logs/library', type: 'solid', concept: '🔄 Middleware', apiRoute: 'GET /api/admin/process-logs/library' },
      { from: 2, to: 3, label: 'Validate explorer access', type: 'solid', concept: '🔐 Authentication', file: 'mims/backend/middleware/auth.js' },
      { from: 3, to: 2, label: 'Authorization passed', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 4, label: 'Load log aggregates + catalog', type: 'solid', concept: '💾 DB Read', file: 'mims/backend/routes/admin/processExplorer.js', dbQuery: 'SELECT ... FROM mims_process_logs ...' },
      { from: 4, to: 2, label: 'Coverage payload prepared', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: '200 OK + flow library data', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  error_401_unauthorized: {
    title: 'MIMS Error — 401 Unauthorized',
    description: 'Request blocked because session/token is missing or invalid.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Trigger protected action', type: 'solid', concept: '🖥 UI Action' },
      { from: 1, to: 2, label: 'Request protected API', type: 'solid', concept: '🔄 Middleware' },
      { from: 2, to: 3, label: 'Session validation failed', type: 'solid', concept: '🔐 Authentication', statusMeaning: '401 Unauthorized — invalid or missing auth' },
      { from: 3, to: 2, label: 'Return 401', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 1, label: 'Show auth/session error', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  error_403_forbidden: {
    title: 'MIMS Error — 403 Forbidden',
    description: 'Request blocked due to insufficient role/scope permissions.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Trigger restricted action', type: 'solid', concept: '🖥 UI Action' },
      { from: 1, to: 2, label: 'Call restricted API', type: 'solid', concept: '🔄 Middleware' },
      { from: 2, to: 3, label: 'Role/scope check failed', type: 'solid', concept: '🔐 Authentication', statusMeaning: '403 Forbidden — insufficient permission' },
      { from: 3, to: 2, label: 'Return 403', type: 'dashed', concept: '🔐 Authentication' },
      { from: 2, to: 1, label: 'Display permission error', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  error_404_not_found: {
    title: 'MIMS Error — 404 Not Found',
    description: 'Requested resource does not exist or route is invalid.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Open item/action', type: 'solid', concept: '🖥 UI Action' },
      { from: 1, to: 2, label: 'Send API request', type: 'solid', concept: '🔄 Middleware' },
      { from: 2, to: 4, label: 'Lookup resource', type: 'solid', concept: '💾 DB Read', dbQuery: 'SELECT ... WHERE id=?' },
      { from: 4, to: 2, label: 'No matching row', type: 'dashed', concept: '💾 DB Read' },
      { from: 2, to: 1, label: 'Return 404 to UI', type: 'dashed', concept: '🖥 UI Action', statusMeaning: '404 Not Found — resource missing' },
    ],
  },

  error_422_validation: {
    title: 'MIMS Error — 422 Validation Failed',
    description: 'Request body is incomplete or invalid.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Submit form with invalid/missing fields', type: 'solid', concept: '🖥 UI Action' },
      { from: 1, to: 2, label: 'POST/PUT payload', type: 'solid', concept: '🔄 Middleware' },
      { from: 2, to: 2, label: 'Validate required fields', type: 'solid', concept: '⚡ Processing', statusMeaning: '422 Validation Failed — invalid payload' },
      { from: 2, to: 1, label: 'Return field error message', type: 'dashed', concept: '🖥 UI Action' },
      { from: 1, to: 0, label: 'Show validation errors', type: 'dashed', concept: '🖥 UI Action' },
    ],
  },

  error_500_server: {
    title: 'MIMS Error — 500 Internal Server Error',
    description: 'Unhandled backend exception or downstream failure.',
    source: 'mims',
    swimlanes: BASE_SWIMLANES_ADMIN,
    steps: [
      { from: 0, to: 1, label: 'Trigger business action', type: 'solid', concept: '🖥 UI Action' },
      { from: 1, to: 2, label: 'Send API request', type: 'solid', concept: '🔄 Middleware' },
      { from: 2, to: 4, label: 'DB/service operation throws', type: 'solid', concept: '⚡ Processing' },
      { from: 4, to: 2, label: 'Exception captured', type: 'dashed', concept: '⚡ Processing' },
      { from: 2, to: 1, label: 'Return 500 error response', type: 'dashed', concept: '🖥 UI Action', statusMeaning: '500 Internal Server Error — operation failed' },
    ],
  },
}

function titleCase(text) {
  return String(text || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function extractResource(path = '') {
  const cleaned = String(path)
    .split('?')[0]
    .replace(/\/+/g, '/')
    .replace(/\/\d+(?=\/|$)/g, '')
    .replace(/\/:([A-Za-z0-9_]+)/g, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (!parts.length) return { section: 'general', resource: 'resource' }
  const tail = parts[parts.length - 1]
  const section = parts.includes('admin')
    ? (parts[parts.length - 2] || tail)
    : (parts[0] || tail)
  return {
    section: section || 'general',
    resource: tail || section || 'resource',
  }
}

function inferMimsRouteFile(path = '') {
  const p = String(path).toLowerCase()
  if (p.includes('/api/admin/platform/')) return 'mims/backend/routes/platformAdmin.js'
  if (p.includes('/api/admin/platform/')) return 'mims/backend/routes/platformAdmin.js'
  if (p.includes('/api/inbox')) return 'mims/backend/routes/inbox.js'
  if (p.includes('/api/cases') || p.includes('/api/case')) return 'mims/backend/routes/cases.js'
  if (p.includes('/api/cm/folders')) return 'mims/backend/routes/cm/folders.js'
  if (p.includes('/api/cm/documents')) return 'mims/backend/routes/cm/documents.js'
  if (p.includes('/api/cm/faqs')) return 'mims/backend/routes/cm/faqs.js'
  if (p.includes('/api/cm/merge-reports')) return 'mims/backend/routes/cm/mergeReports.js'
  if (p.includes('/api/cm/templates')) return 'mims/backend/routes/cm/templates.js'
  if (p.includes('/api/cm/reviews')) return 'mims/backend/routes/cm/reviews.js'
  if (p.includes('/api/admin/process-logs')) return 'mims/backend/routes/admin/processExplorer.js'
  if (p.includes('/api/admin/picklists')) return 'mims/backend/routes/admin/picklists.js'
  if (p.includes('/api/admin/field-setup')) return 'mims/backend/routes/admin/fieldSetup.js'
  if (p.includes('/api/admin/security-groups')) return 'mims/backend/routes/admin/securityGroups.js'
  if (p.includes('/api/admin/contacts')) return 'mims/backend/routes/admin/contacts.js'
  if (p.includes('/api/admin/site')) return 'mims/backend/routes/admin/siteConfig.js'
  if (p.includes('/api/admin/org')) return 'mims/backend/routes/admin/orgs.js'
  if (p.includes('/api/admin/service-logs')) return 'mims/backend/routes/admin/serviceLogs.js'
  if (p.includes('/api/admin/system-activity')) return 'mims/backend/routes/admin/systemActivity.js'
  if (p.includes('/api/admin/case-number')) return 'mims/backend/routes/admin/caseNumbering.js'
  if (p.includes('/api/admin/case-form')) return 'mims/backend/routes/admin/caseFormDefinition.js'
  if (p.includes('/api/admin/workflow')) return 'mims/backend/routes/admin/workflowActivities.js'
  if (p.includes('/api/admin/case-audit')) return 'mims/backend/routes/admin/caseAuditTrail.js'
  if (p.includes('/api/admin/transmission-audit')) return 'mims/backend/routes/admin/transmissionAuditTrail.js'
  if (p.includes('/api/admin/product')) return 'mims/backend/routes/admin/productDictionary.js'
  if (p.includes('/api/admin/')) return 'mims/backend/routes/admin/config.js'
  if (p.includes('/api/auth')) return 'mims/backend/routes/auth.js'
  return 'mims/backend/server.js'
}

function inferMimsPageFile(path = '') {
  const p = String(path).toLowerCase()
  if (p.includes('/inbox')) return 'mims/frontend/src/modules/max/pages/InboxPage.jsx'
  if (p.includes('/cases') || p.includes('/case')) return 'mims/frontend/src/modules/cases/pages/CaseFormPage.jsx'
  if (p.includes('/picklist')) return 'mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx'
  if (p.includes('/process-logs') || p.includes('/process-explorer')) return 'mims/frontend/src/modules/dv/pages/ProcessExplorerPage.jsx'
  if (p.includes('/admin/platform') || p.includes('/mims-admin')) return 'mims/frontend/src/modules/mimsadmin/pages/MIMSAdminPage.jsx'
  if (p.includes('/cm/')) return 'mims/frontend/src/modules/content/pages/ContentPage.jsx'
  return 'mims/frontend/src/modules/max/pages/DashboardPage.jsx'
}

function inferEventConcept(method = 'GET') {
  const m = String(method).toUpperCase()
  if (m === 'GET') return '💾 DB Read'
  if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') return '💾 DB Write'
  return '⚡ Processing'
}

export function generateFlow(method = 'GET', path = '/api/admin/resource', options = {}) {
  const m = String(method || 'GET').toUpperCase()
  const p = String(path || '/api/admin/resource')
  const actor = 'Admin'
  const swimlanes = BASE_SWIMLANES_ADMIN
  const { resource } = extractResource(p)
  const actionWord = {
    GET: 'Fetch',
    POST: 'Create',
    PUT: 'Update',
    PATCH: 'Update',
    DELETE: 'Delete',
    JOB: 'Execute',
    SCHEMA: 'Track',
  }[m] || 'Process'

  const routeFile = options.routeFile || inferMimsRouteFile(p)
  const pageFile = inferMimsPageFile(p)
  const statusLabel = m === 'POST' ? '201 Created' : '200 OK'

  return {
    title: `${actionWord} ${titleCase(resource)}`,
    description: `Auto-generated MIMS flow for ${m} ${p}`,
    source: 'mims',
    isAutoGenerated: true,
    swimlanes,
    files: [
      { path: pageFile, role: 'UI source' },
      { path: 'mims/backend/middleware/auth.js', role: 'Auth middleware' },
      { path: routeFile, role: 'Route handler' },
    ],
    steps: [
      {
        from: 0,
        to: 1,
        label: `${actor} triggers ${titleCase(resource)} action`,
        type: 'solid',
        concept: '🖥 UI Action',
        file: pageFile,
        detail: 'User action from MIMS screen triggers API call.',
      },
      {
        from: 1,
        to: 2,
        label: `${m} ${p}`,
        type: 'solid',
        concept: '🔄 Middleware',
        apiRoute: `${m} ${p}`,
        detail: 'Frontend sends request to MIMS backend.',
      },
      {
        from: 2,
        to: 3,
        label: 'Validate auth and access',
        type: 'solid',
        concept: '🔐 Authentication',
        file: 'mims/backend/middleware/auth.js',
        detail: 'Backend validates session and org/client permissions.',
      },
      {
        from: 3,
        to: 2,
        label: 'Authorization passed',
        type: 'dashed',
        concept: '🔐 Authentication',
      },
      {
        from: 2,
        to: 4,
        label: m === 'GET' ? `SELECT ${resource}` : `${m} ${resource}`,
        type: 'solid',
        concept: inferEventConcept(m),
        file: routeFile,
        dbQuery: m === 'GET' ? 'SELECT ...' : m === 'DELETE' ? 'DELETE FROM ...' : 'INSERT/UPDATE ...',
        detail: 'MIMS backend executes business query/command.',
      },
      {
        from: 4,
        to: 2,
        label: 'DB result',
        type: 'dashed',
        concept: '💾 DB Read',
      },
      {
        from: 2,
        to: 1,
        label: `${statusLabel} response`,
        type: 'dashed',
        concept: '🖥 UI Action',
        statusMeaning: `${statusLabel} — operation completed`,
        detail: 'Frontend receives response and updates UI state.',
      },
    ],
  }
}

function sanitizeFilePath(filePath) {
  if (!filePath) return undefined
  const v = String(filePath)
  if (!v.startsWith('mims/')) return undefined
  return v
}

function inferStatusMeaning(step, flow) {
  if (step.statusMeaning) return step.statusMeaning
  const text = [step.label, step.detail, flow?.title].filter(Boolean).join(' ').toLowerCase()
  if (/401|unauthorized|token|session/.test(text)) return '401 Unauthorized — session/token invalid'
  if (/403|forbidden|permission|access/.test(text)) return '403 Forbidden — access denied'
  if (/404|not found|missing/.test(text)) return '404 Not Found — resource missing'
  if (/422|validation|required|invalid/.test(text)) return '422 Validation Failed — invalid payload'
  if (/500|exception|failed|error/.test(text)) return '500 Internal Server Error — operation failed'
  if (/create|insert|post/.test(text)) return '201 Created — new record saved'
  return '200 OK — step completed'
}

function inferRequestBody(step) {
  if (step.requestBody) return step.requestBody
  const text = [step.label, step.detail].filter(Boolean).join(' ').toLowerCase()
  if (/login/.test(text)) return '{ username/email, password }'
  if (/create|post|save|insert/.test(text)) return '{ ...payload }'
  if (/update|put|patch/.test(text)) return '{ ...updatedFields }'
  if (/delete/.test(text)) return '{ id }'
  return 'N/A'
}

function inferResponseBody(step) {
  if (step.responseBody) return step.responseBody
  const text = [step.label, step.detail].filter(Boolean).join(' ').toLowerCase()
  if (/list|fetch|select|get/.test(text)) return '{ items: [...] }'
  if (/error|failed|unauthorized|forbidden|not found|validation/.test(text)) return '{ error: "..." }'
  return '{ ok: true }'
}

function inferDbQuery(step) {
  if (step.dbQuery) return step.dbQuery
  const text = [step.label, step.detail].filter(Boolean).join(' ').toLowerCase()
  if (/select|fetch|get|list/.test(text)) return 'SELECT ...'
  if (/delete|remove/.test(text)) return 'DELETE FROM ...'
  if (/update|patch|put/.test(text)) return 'UPDATE ...'
  if (/create|insert|post|save/.test(text)) return 'INSERT INTO ...'
  return 'N/A'
}

function inferConcept(step) {
  if (step.concept) return step.concept
  const text = [step.label, step.detail, step.apiRoute].filter(Boolean).join(' ').toLowerCase()
  if (/auth|token|session|permission|role|forbidden|unauthorized/.test(text)) return '🔐 Authentication'
  if (/select|fetch|get|list|query|read/.test(text)) return '💾 DB Read'
  if (/insert|update|delete|create|save|write|post|put|patch/.test(text)) return '💾 DB Write'
  if (/click|open|ui|screen|render|form/.test(text)) return '🖥 UI Action'
  if (/middleware|validate|guard/.test(text)) return '🔄 Middleware'
  return '⚡ Processing'
}

function inferApiRoute(step) {
  if (step.apiRoute) return step.apiRoute
  const text = [step.label, step.detail].filter(Boolean).join(' ')
  const m = text.match(/\b(GET|POST|PUT|PATCH|DELETE|JOB|SCHEMA)\s+(\/api\/[\w\-\/:?&.=]+)/i)
  if (m) return `${m[1].toUpperCase()} ${m[2]}`
  return 'Derived request'
}

export function normalizeFlowTemplate(flow) {
  if (!flow || !Array.isArray(flow.steps)) return flow

  const normalizedSteps = flow.steps.map((step, idx) => {
    const apiRoute = inferApiRoute(step)
    const safeFile = sanitizeFilePath(step.file)

    return {
      ...step,
      concept: inferConcept(step),
      apiRoute,
      file: safeFile,
      line: safeFile ? step.line : undefined,
      requestBody: inferRequestBody(step),
      responseBody: inferResponseBody(step),
      statusMeaning: inferStatusMeaning(step, flow),
      dbQuery: inferDbQuery(step),
      whyItExists: step.whyItExists || 'This step exists to move the workflow safely to the next stage.',
      whatCouldGoWrong: step.whatCouldGoWrong || 'Unexpected validation/auth/network/backend issue can fail this step.',
      securityNote: step.securityNote || 'Server-side authz/authn and validation should pass before data operations.',
      beforeAfter: step.beforeAfter || { before: 'Step not executed yet', after: 'Workflow advanced to next stage' },
      beginnerTip: step.beginnerTip || 'Frontend sends request, backend validates, DB executes, UI updates.',
      commonMistake: step.commonMistake || 'Updating UI state before backend confirms success.',
      stepIndex: idx + 1,
    }
  })

  const normalizedFiles = Array.isArray(flow.files)
    ? flow.files
      .map((f) => ({ ...f, path: sanitizeFilePath(f?.path) }))
      .filter((f) => Boolean(f.path))
    : []

  const derivedFiles = normalizedFiles.length
    ? normalizedFiles
    : Array.from(
      new Map(
        normalizedSteps
          .filter((s) => s.file)
          .map((s) => [`${s.file}:${s.line || ''}`, {
            path: s.file,
            role: 'Step source',
            lines: s.line ? String(s.line) : undefined,
          }])
      ).values()
    )

  return {
    ...flow,
    source: flow.source || 'mims',
    files: derivedFiles,
    steps: normalizedSteps,
  }
}

const TABLE_ALIAS_MAP = {
  auth: 'users',
  users: 'users',
  orgs: 'organisations',
  organisations: 'organisations',
  picklists: 'picklists',
  'field-setup': 'field_setup',
  'security-groups': 'security_groups',
  contacts: 'contacts',
  inbox: 'inquiries',
  inquiries: 'inquiries',
  cases: 'cases',
  case: 'cases',
  'case-query': 'cases',
  templates: 'cm_templates',
  folders: 'cm_folders',
  documents: 'cm_documents',
  faqs: 'cm_faqs',
  reviews: 'cm_reviews',
  'merge-reports': 'cm_merge_reports',
  'email-accounts': 'email_accounts',
  'process-logs': 'mims_process_logs',
  'process-explorer': 'mims_process_logs',
  analytics: 'audit_logs',
  audit: 'audit_logs',
  'audit-logs': 'audit_logs',
  'service-logs': 'service_logs',
  'system-activity': 'audit_logs',
}

function toSnake(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function normalizeTableName(name) {
  const key = String(name || '').trim().toLowerCase()
  if (!key) return 'resource_items'
  if (TABLE_ALIAS_MAP[key]) return TABLE_ALIAS_MAP[key]
  return toSnake(key)
}

function extractApiRoute(flow, logEntry) {
  const byStep = Array.isArray(flow?.steps)
    ? flow.steps.find((s) => s?.apiRoute && !String(s.apiRoute).toLowerCase().startsWith('derived'))
    : null
  if (byStep?.apiRoute) return byStep.apiRoute
  if (logEntry?.method && logEntry?.path) return `${String(logEntry.method).toUpperCase()} ${logEntry.path}`
  if (Array.isArray(flow?.steps)) {
    const maybe = flow.steps.find((s) => s?.apiRoute)
    if (maybe?.apiRoute) return maybe.apiRoute
  }
  return null
}

function inferRouteMeta(flow, logEntry) {
  const apiRoute = extractApiRoute(flow, logEntry) || 'GET /api/admin/resource'
  const m = String(apiRoute).match(/\b(GET|POST|PUT|PATCH|DELETE|JOB|SCHEMA)\b/i)
  const method = m ? m[1].toUpperCase() : (logEntry?.method ? String(logEntry.method).toUpperCase() : 'GET')
  const pathMatch = String(apiRoute).match(/(\/api\/[A-Za-z0-9_\/:\-]+)/)
  const path = pathMatch ? pathMatch[1] : (logEntry?.path || '/api/admin/resource')
  const parts = path.split('/').filter(Boolean).filter((p) => p !== 'api' && !p.startsWith(':'))
  const resource = parts[parts.length - 1] || 'resource'
  const module = parts[0] || 'admin'
  return { method, path, resource, module }
}

function inferPrimaryTable(flow, logEntry) {
  const queryHints = []
  for (const step of (flow?.steps || [])) {
    const q = String(step?.dbQuery || '')
    if (q) queryHints.push(q)
  }
  const qBlob = queryHints.join(' ')
  const tableMatch =
    qBlob.match(/\bfrom\s+([a-zA-Z0-9_]+)/i) ||
    qBlob.match(/\binto\s+([a-zA-Z0-9_]+)/i) ||
    qBlob.match(/\bupdate\s+([a-zA-Z0-9_]+)/i) ||
    qBlob.match(/\bdelete\s+from\s+([a-zA-Z0-9_]+)/i)
  if (tableMatch?.[1] && tableMatch[1] !== '...') return normalizeTableName(tableMatch[1])
  const { resource } = inferRouteMeta(flow, logEntry)
  return normalizeTableName(resource)
}

function inferJoinTables(primaryTable) {
  if (primaryTable === 'cases') return ['organisations', 'users']
  if (primaryTable === 'inquiries') return ['cases', 'users']
  if (primaryTable === 'cm_templates') return ['users', 'organisations']
  if (primaryTable === 'picklists') return ['organisations', 'users']
  if (primaryTable === 'organisations') return ['user_org_access', 'users']
  return ['organisations', 'users']
}

function sqlText(lines) {
  return lines.join('\n').trim()
}

function sqlEntry({ title, sql, explanation, whatHappens, whenToUse, caution }) {
  return { title, sql, explanation, whatHappens, whenToUse, caution }
}

export function buildSqlPlaybook(flow, logEntry = null) {
  const route = inferRouteMeta(flow, logEntry)
  const primaryTable = inferPrimaryTable(flow, logEntry)
  const [joinTableA, joinTableB] = inferJoinTables(primaryTable)
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)

  const selectSql = sqlText([
    `-- Flow: ${flow?.title || 'MIMS Flow'}`,
    `-- Route: ${route.method} ${route.path}`,
    'SELECT *',
    `FROM ${primaryTable}`,
    'ORDER BY id DESC',
    'LIMIT 100;',
  ])

  const insertSql = sqlText([
    `-- Insert template for ${primaryTable}`,
    `INSERT INTO ${primaryTable} (org_id, created_at, updated_at)`,
    `VALUES (1, '${now}', '${now}');`,
    '',
    '-- Use explicit column list for production safety.',
  ])

  const updateSql = sqlText([
    `-- Update template for ${primaryTable}`,
    `UPDATE ${primaryTable}`,
    `SET updated_at = '${now}'`,
    'WHERE id = :id',
    '  AND org_id = :org_id;',
  ])

  const deleteSql = sqlText([
    '-- Prefer soft delete where supported',
    `UPDATE ${primaryTable}`,
    `SET is_deleted = 1, updated_at = '${now}'`,
    'WHERE id = :id',
    '  AND org_id = :org_id;',
    '',
    '-- Hard delete (use only with approved change request)',
    `DELETE FROM ${primaryTable}`,
    'WHERE id = :id',
    '  AND org_id = :org_id;',
  ])

  const joinSql = sqlText([
    '-- Join view for flow analytics',
    'SELECT p.*, a.name AS join_a_name, b.name AS join_b_name',
    `FROM ${primaryTable} p`,
    `LEFT JOIN ${joinTableA} a ON a.id = p.org_id`,
    `LEFT JOIN ${joinTableB} b ON b.id = p.created_by`,
    'WHERE p.org_id = :org_id',
    'ORDER BY p.id DESC',
    'LIMIT 100;',
  ])

  const ddlSql = sqlText([
    '-- Schema inspection',
    `SHOW CREATE TABLE ${primaryTable};`,
    `DESCRIBE ${primaryTable};`,
    '',
    '-- Example safe DDL migration',
    `ALTER TABLE ${primaryTable}`,
    'ADD COLUMN IF NOT EXISTS updated_by INT NULL;',
  ])

  const indexSql = sqlText([
    '-- Check indexes',
    `SHOW INDEX FROM ${primaryTable};`,
    '',
    '-- Add index for org + created_at filtering',
    `CREATE INDEX idx_${primaryTable}_org_created`,
    `ON ${primaryTable} (org_id, created_at);`,
  ])

  const auditSql = sqlText([
    '-- Validate audit trail for this entity',
    'SELECT *',
    'FROM audit_logs',
    `WHERE entity IN ('${primaryTable}', '${route.resource}')`,
    'ORDER BY id DESC',
    'LIMIT 200;',
  ])

  const prodSql = sqlText([
    '-- Production runbook (execute in order)',
    'START TRANSACTION;',
    `SELECT COUNT(*) AS before_count FROM ${primaryTable} WHERE org_id = :org_id;`,
    '-- INSERT/UPDATE/DELETE statements here',
    `SELECT COUNT(*) AS after_count FROM ${primaryTable} WHERE org_id = :org_id;`,
    '-- If validation passes:',
    'COMMIT;',
    '-- If any mismatch/error:',
    '-- ROLLBACK;',
  ])

  const selectDetailsSql = sqlText([
    '-- Scoped read (recommended for operations)',
    `SELECT id, org_id, created_at, updated_at`,
    `FROM ${primaryTable}`,
    'WHERE org_id = :org_id',
    'ORDER BY id DESC',
    'LIMIT 200;',
  ])

  const selectAnalyticsSql = sqlText([
    '-- Aggregate read for quick analytics',
    `SELECT org_id, COUNT(*) AS total_rows, MAX(updated_at) AS last_updated`,
    `FROM ${primaryTable}`,
    'GROUP BY org_id',
    'ORDER BY total_rows DESC;',
  ])

  const insertBulkSql = sqlText([
    '-- Bulk insert pattern',
    `INSERT INTO ${primaryTable} (org_id, created_at, updated_at) VALUES`,
    `(1, '${now}', '${now}'),`,
    `(1, '${now}', '${now}');`,
  ])

  const insertFromSelectSql = sqlText([
    '-- Insert from existing rows (template cloning)',
    `INSERT INTO ${primaryTable} (org_id, created_at, updated_at)`,
    `SELECT org_id, '${now}', '${now}'`,
    `FROM ${primaryTable}`,
    'WHERE id = :source_id;',
  ])

  const updateScopedSql = sqlText([
    '-- Update only target rows with audit-friendly filter',
    `UPDATE ${primaryTable}`,
    `SET updated_at = '${now}'`,
    'WHERE org_id = :org_id',
    '  AND id IN (:id1, :id2);',
  ])

  const updateJoinSql = sqlText([
    '-- Update with join validation (MySQL)',
    `UPDATE ${primaryTable} p`,
    `JOIN organisations o ON o.id = p.org_id`,
    `SET p.updated_at = '${now}'`,
    'WHERE p.id = :id',
    '  AND o.id = :org_id;',
  ])

  const deleteHardSql = sqlText([
    '-- Hard delete (only with approved CR)',
    `DELETE FROM ${primaryTable}`,
    'WHERE id = :id',
    '  AND org_id = :org_id;',
  ])

  const deleteArchiveSql = sqlText([
    '-- Archive-before-delete pattern',
    `INSERT INTO ${primaryTable}_archive`,
    `SELECT * FROM ${primaryTable}`,
    'WHERE id = :id',
    '  AND org_id = :org_id;',
    '',
    `DELETE FROM ${primaryTable}`,
    'WHERE id = :id',
    '  AND org_id = :org_id;',
  ])

  const joinAuditSql = sqlText([
    '-- Join with audit to trace who changed what',
    'SELECT p.id, p.org_id, a.user_name, a.action, a.created_at',
    `FROM ${primaryTable} p`,
    `LEFT JOIN audit_logs a ON a.entity_id = p.id`,
    "WHERE a.entity IN (:entity_name, :table_name)",
    'ORDER BY a.id DESC',
    'LIMIT 100;',
  ])

  const ddlAddColumnSql = sqlText([
    '-- Add new operational column',
    `ALTER TABLE ${primaryTable}`,
    'ADD COLUMN IF NOT EXISTS remarks VARCHAR(500) NULL;',
  ])

  const ddlCreateTableSql = sqlText([
    '-- Create extension table for future module',
    `CREATE TABLE IF NOT EXISTS ${primaryTable}_ext (`,
    '  id INT AUTO_INCREMENT PRIMARY KEY,',
    '  org_id INT NOT NULL,',
    '  ref_id INT NOT NULL,',
    '  metadata_json JSON NULL,',
    '  created_at DATETIME NOT NULL,',
    '  updated_at DATETIME NOT NULL',
    ');',
  ])

  const indexCompositeSql = sqlText([
    '-- Composite index for common filters',
    `CREATE INDEX idx_${primaryTable}_org_status_created`,
    `ON ${primaryTable} (org_id, updated_at, created_at);`,
  ])

  const indexExplainSql = sqlText([
    '-- Execution plan check',
    'EXPLAIN',
    `SELECT * FROM ${primaryTable}`,
    'WHERE org_id = :org_id',
    'ORDER BY created_at DESC',
    'LIMIT 100;',
  ])

  const auditTraceSql = sqlText([
    '-- Row-level traceability',
    'SELECT id, user_name, action, entity, entity_id, created_at, details',
    'FROM audit_logs',
    'WHERE entity_id = :id',
    'ORDER BY id DESC',
    'LIMIT 100;',
  ])

  const prodPrecheckSql = sqlText([
    '-- PROD pre-check',
    'SELECT @@version AS mysql_version;',
    `SELECT COUNT(*) AS target_rows FROM ${primaryTable} WHERE org_id = :org_id;`,
    'SHOW PROCESSLIST;',
  ])

  const prodTxnSql = sqlText([
    '-- PROD transactional change set',
    'START TRANSACTION;',
    `SELECT COUNT(*) AS before_count FROM ${primaryTable} WHERE org_id = :org_id;`,
    '-- INSERT/UPDATE/DELETE statements here',
    `SELECT COUNT(*) AS after_count FROM ${primaryTable} WHERE org_id = :org_id;`,
    'COMMIT;',
    '-- If mismatch/error: ROLLBACK;',
  ])

  const prodPostcheckSql = sqlText([
    '-- PROD post-check + rollback verification',
    `SELECT * FROM ${primaryTable}`,
    'WHERE org_id = :org_id',
    'ORDER BY updated_at DESC',
    'LIMIT 50;',
    '',
    '-- Optional rollback dry script',
    '-- START TRANSACTION; ... ROLLBACK;',
  ])

  return {
    title: flow?.title || 'MIMS Flow',
    primaryTable,
    route: `${route.method} ${route.path}`,
    tabs: [
      {
        key: 'select',
        label: 'SELECT',
        entries: [
          sqlEntry({
            title: 'Baseline Read',
            sql: selectSql,
            explanation: 'Reads the latest rows for this flow table.',
            whatHappens: 'No data change; safe read.',
            whenToUse: 'Initial troubleshooting and quick review.',
            caution: 'Avoid SELECT * in very large tables for performance.',
          }),
          sqlEntry({
            title: 'Scoped Operational Read',
            sql: selectDetailsSql,
            explanation: 'Reads org-specific data with controlled projection.',
            whatHappens: 'Fetches only key columns for operations.',
            whenToUse: 'During support or admin verification.',
            caution: 'Always pass correct :org_id.',
          }),
          sqlEntry({
            title: 'Aggregate Overview',
            sql: selectAnalyticsSql,
            explanation: 'Summarizes counts and freshness by org.',
            whatHappens: 'Returns grouped aggregate metrics.',
            whenToUse: 'Capacity planning, usage review, monitoring.',
            caution: 'May need additional index on grouping columns.',
          }),
        ],
      },
      {
        key: 'insert',
        label: 'INSERT',
        entries: [
          sqlEntry({
            title: 'Single Row Insert',
            sql: insertSql,
            explanation: 'Creates a single record template.',
            whatHappens: 'One new row is inserted.',
            whenToUse: 'Manual data repair or controlled setup.',
            caution: 'Use explicit columns; avoid default assumptions.',
          }),
          sqlEntry({
            title: 'Bulk Insert',
            sql: insertBulkSql,
            explanation: 'Creates multiple rows in one statement.',
            whatHappens: 'Inserts more than one record quickly.',
            whenToUse: 'Backfill or migration batches.',
            caution: 'Validate batch size to avoid lock contention.',
          }),
          sqlEntry({
            title: 'Insert from Existing Data',
            sql: insertFromSelectSql,
            explanation: 'Clones data from a known source row.',
            whatHappens: 'Copies selected values into new row(s).',
            whenToUse: 'Template duplication and controlled seeding.',
            caution: 'Ensure source row does not include stale values.',
          }),
        ],
      },
      {
        key: 'update',
        label: 'UPDATE',
        entries: [
          sqlEntry({
            title: 'Targeted Update',
            sql: updateSql,
            explanation: 'Updates one row by id and org scope.',
            whatHappens: 'Modifies a single controlled record.',
            whenToUse: 'Hotfix or operational correction.',
            caution: 'Never run without restrictive WHERE clause.',
          }),
          sqlEntry({
            title: 'Scoped Multi-row Update',
            sql: updateScopedSql,
            explanation: 'Updates multiple selected rows in an org.',
            whatHappens: 'Modifies only listed ids for the org.',
            whenToUse: 'Bulk correction under change approval.',
            caution: 'Verify impacted row count before COMMIT.',
          }),
          sqlEntry({
            title: 'Join-validated Update',
            sql: updateJoinSql,
            explanation: 'Updates with join guard to avoid cross-org drift.',
            whatHappens: 'Changes row only if join condition matches.',
            whenToUse: 'Sensitive updates tied to org ownership.',
            caution: 'Join conditions must be indexed for performance.',
          }),
        ],
      },
      {
        key: 'delete',
        label: 'DELETE',
        entries: [
          sqlEntry({
            title: 'Soft Delete',
            sql: deleteSql,
            explanation: 'Marks records as deleted while retaining data.',
            whatHappens: 'Row remains but is hidden from active flows.',
            whenToUse: 'Default deletion behavior in regulated systems.',
            caution: 'Ensure application filters `is_deleted` consistently.',
          }),
          sqlEntry({
            title: 'Hard Delete',
            sql: deleteHardSql,
            explanation: 'Permanently removes data from table.',
            whatHappens: 'Row is physically removed.',
            whenToUse: 'Approved cleanup only.',
            caution: 'Irreversible unless backup/restore is available.',
          }),
          sqlEntry({
            title: 'Archive then Delete',
            sql: deleteArchiveSql,
            explanation: 'Preserves a copy before permanent deletion.',
            whatHappens: 'Moves row to archive then deletes source.',
            whenToUse: 'Data retention + cleanup requirements.',
            caution: 'Archive schema must stay in sync with source.',
          }),
        ],
      },
      {
        key: 'join',
        label: 'JOIN',
        entries: [
          sqlEntry({
            title: 'Operational Join',
            sql: joinSql,
            explanation: 'Links flow table with org/user context.',
            whatHappens: 'Returns enriched, relational view.',
            whenToUse: 'Investigations and operational dashboards.',
            caution: 'LEFT JOIN may return nulls; handle in UI/report.',
          }),
          sqlEntry({
            title: 'Audit Join',
            sql: joinAuditSql,
            explanation: 'Combines entity rows with audit history.',
            whatHappens: 'Shows who changed each item and when.',
            whenToUse: 'Compliance reviews and RCA.',
            caution: 'Entity mapping (`entity`, `entity_id`) must be consistent.',
          }),
        ],
      },
      {
        key: 'ddl',
        label: 'DDL',
        entries: [
          sqlEntry({
            title: 'Inspect + Safe Alter',
            sql: ddlSql,
            explanation: 'Inspects table and applies small controlled schema change.',
            whatHappens: 'Reads schema and optionally adds a column.',
            whenToUse: 'Minor schema evolution.',
            caution: 'Run during maintenance window for large tables.',
          }),
          sqlEntry({
            title: 'Create Extension Table',
            sql: ddlCreateTableSql,
            explanation: 'Creates a new support table for future features.',
            whatHappens: 'New table is created if absent.',
            whenToUse: 'Feature rollout/migration.',
            caution: 'Review storage, indexes, and FK strategy before production.',
          }),
          sqlEntry({
            title: 'Add Column Migration',
            sql: ddlAddColumnSql,
            explanation: 'Adds a new column with minimal impact pattern.',
            whatHappens: 'Table definition expands with nullable field.',
            whenToUse: 'Backward-compatible schema update.',
            caution: 'Avoid non-null + default on very large tables at peak time.',
          }),
        ],
      },
      {
        key: 'index',
        label: 'INDEX',
        entries: [
          sqlEntry({
            title: 'Index Baseline',
            sql: indexSql,
            explanation: 'Checks current indexes and adds common filter index.',
            whatHappens: 'Potentially creates new index for query acceleration.',
            whenToUse: 'Slow query remediation.',
            caution: 'Extra indexes increase write cost and storage.',
          }),
          sqlEntry({
            title: 'Composite Index',
            sql: indexCompositeSql,
            explanation: 'Creates multi-column index for practical operational filters.',
            whatHappens: 'Optimizes org/time based lookups.',
            whenToUse: 'Frequent combined where/order filters.',
            caution: 'Column order matters; validate with EXPLAIN.',
          }),
          sqlEntry({
            title: 'Execution Plan Check',
            sql: indexExplainSql,
            explanation: 'Verifies whether index is used.',
            whatHappens: 'Shows scan type and key usage.',
            whenToUse: 'Before/after index tuning.',
            caution: 'Run against representative queries and data size.',
          }),
        ],
      },
      {
        key: 'audit',
        label: 'AUDIT',
        entries: [
          sqlEntry({
            title: 'Audit Overview',
            sql: auditSql,
            explanation: 'Checks audit trail entries for this flow entity.',
            whatHappens: 'Returns recent action history.',
            whenToUse: 'Regulatory/operational traceability.',
            caution: 'Mask sensitive fields before external sharing.',
          }),
          sqlEntry({
            title: 'Entity Trace',
            sql: auditTraceSql,
            explanation: 'Gets detailed timeline for one row/entity.',
            whatHappens: 'Shows granular who/what/when changes.',
            whenToUse: 'Incident deep-dive.',
            caution: 'Ensure entity_id mapping matches application records.',
          }),
        ],
      },
      {
        key: 'prod',
        label: 'PROD',
        entries: [
          sqlEntry({
            title: 'Production Pre-check',
            sql: prodPrecheckSql,
            explanation: 'Validates runtime readiness before making changes.',
            whatHappens: 'Confirms engine/version and target row count.',
            whenToUse: 'Before every production operation.',
            caution: 'Stop if row count differs from approved change scope.',
          }),
          sqlEntry({
            title: 'Transactional Change Runbook',
            sql: prodTxnSql,
            explanation: 'Executes write changes with explicit transaction boundary.',
            whatHappens: 'Allows safe COMMIT/ROLLBACK control.',
            whenToUse: 'Production hotfixes and controlled migrations.',
            caution: 'Never leave transaction open; monitor locks.',
          }),
          sqlEntry({
            title: 'Post-check + Rollback Readiness',
            sql: prodPostcheckSql,
            explanation: 'Verifies final state and keeps rollback path ready.',
            whatHappens: 'Confirms updated rows and health after change.',
            whenToUse: 'Immediately after COMMIT.',
            caution: 'Capture evidence/screenshots for change closure.',
          }),
        ],
      },
    ],
  }
}
