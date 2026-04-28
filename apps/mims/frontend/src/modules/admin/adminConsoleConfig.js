export const ADMIN_SECTION_ALIASES = {
  'sites-setup': 'sites',
  'workflow-setup': 'workflow',
  'product-dictionary': 'products',
  'user-security-groups': 'user-security',
  'user-configuration': 'user-config',
  'admin-audit-trail': 'audit-admin',
  'login-audit-trail': 'audit-login',
  'contact-master': 'case-contacts',
  'company-representatives': 'company-reps',
}

export const ADMIN_NAV_GROUPS = [
  {
    key: 'general',
    title: 'Admin Console',
    overviewLayout: 'stack',
    items: [
      { key: 'picklists', label: 'Picklists', active: true },
      { key: 'email-accounts', label: 'Email Accounts', active: true },
      { key: 'sites', label: 'Sites Setup', active: true },
      { key: 'workflow', label: 'Workflow Setup', active: true },
      { key: 'source-types', label: 'Source Types', active: true },
      { key: 'case-numbering', label: 'Case Numbering', active: true },
      { key: 'data-protection', label: 'Data Protection & Privacy Rules', active: false },
      { key: 'transmission-rules', label: 'Transmission Rules', active: false },
      { key: 'other-configs', label: 'Other Configurations', active: false },
      { key: 'case-reporting', label: 'Case Reporting', active: false },
      { key: 'help-system', label: 'Help System', active: false },
      { key: 'ssp-setup', label: 'SSP Setup', active: false },
    ],
  },
  {
    key: 'product-setup',
    title: 'Product Setup',
    items: [
      { key: 'product-groups', label: 'Product Groups', active: false },
      { key: 'products', label: 'Product Dictionary', active: true },
    ],
  },
  {
    key: 'access-configurations',
    title: 'Access Configurations',
    items: [
      { key: 'security-groups', label: 'Security Groups', active: true },
      { key: 'user-security', label: 'User Security Groups', active: true },
      { key: 'user-config', label: 'User Configuration', active: true },
      { key: 'report-access-requests', label: 'Report Access Requests', active: true },
      { key: 'change-approvals', label: 'Change Approvals', active: true },
    ],
  },
  {
    key: 'analytics',
    title: 'Analytics',
    items: [
      { key: 'analytics-url', label: 'Analytics URL', active: false },
      { key: 'analytics-reports', label: 'Analytics Master Reports', active: false },
    ],
  },
  {
    key: 'audit-trail',
    title: 'Audit Trail',
    items: [
      { key: 'audit-admin', label: 'Admin Audit Trail', active: true },
      { key: 'audit-login', label: 'Login Audit Trail', active: true },
    ],
  },
  {
    key: 'form-configurations',
    title: 'Form Configurations',
    items: [
      { key: 'field-setup', label: 'Field Setup', active: true },
      { key: 'case-form-def', label: 'Case Form Definition', active: true },
      { key: 'custom-forms', label: 'Custom Forms', active: false },
    ],
  },
  {
    key: 'contact-master',
    title: 'Contact Master',
    items: [
      { key: 'case-contacts', label: 'Case Contacts Repository', active: true },
      { key: 'company-reps', label: 'Company Representatives', active: true },
      { key: 'org-address-book', label: 'Organization Address Book', active: false },
    ],
  },
  {
    key: 'integration-setup',
    title: 'Integration Setup',
    items: [
      { key: 'contacts-int', label: 'Contacts Integration', active: false },
      { key: 'mir-int', label: 'MIR Integration', active: true },
      { key: 'crm-int', label: 'CRM Integration Notification', active: true },
      { key: 'content-int', label: 'Content Integration', active: true },
      { key: 'emir-int', label: 'EMIR Integration', active: true },
      { key: 'case-import', label: 'Case Import', active: true },
      { key: 'transmission-setup', label: 'Transmission Setup', active: false },
    ],
  },
  {
    key: 'system-tools',
    title: 'System Tools',
    items: [
      { key: 'service-log', label: 'Service Log', active: true },
      { key: 'system-activity', label: 'System Activity', active: true },
      { key: 'exception-log', label: 'Exception Log', active: true },
    ],
  },
  {
    key: 'qa-engine',
    title: 'AI QA Engine',
    items: [
      { key: 'qa-reports',   label: 'Retrospective QA Reports', active: true },
      { key: 'qa-rules',     label: 'QA Rules Configuration',   active: true },
      { key: 'qa-overrides', label: 'Override Dashboard',        active: true },
    ],
  },
  {
    key: 'content-management',
    title: 'Content Management',
    items: [
      { key: 'mi-categories', label: 'MI Categories', active: true },
      { key: 'policy-graph', label: 'Policy Graph Engine', active: true },
      { key: 'evidence-chain-compiler', label: 'Evidence Chain Compiler', active: true },
      { key: 'contradiction-radar', label: 'Contradiction Radar', active: true },
      { key: 'digital-twin-release-simulator', label: 'Digital Twin Release Simulator', active: true },
      { key: 'adaptive-risk-workflow', label: 'Adaptive Risk Workflow', active: true },
    ],
  },
]

const LABEL_OVERRIDES = {
  'sites-setup': 'Sites Setup',
  'workflow-setup': 'Workflow Setup',
  'product-dictionary': 'Product Dictionary',
  'user-security-groups': 'User Security Groups',
  'user-configuration': 'User Configuration',
  'admin-audit-trail': 'Admin Audit Trail',
  'login-audit-trail': 'Login Audit Trail',
  'contact-master': 'Case Contacts Repository',
  'company-representatives': 'Company Representatives',
}

const SECTION_LABELS = ADMIN_NAV_GROUPS.flatMap((group) => group.items).reduce((acc, item) => {
  acc[item.key] = item.label
  return acc
}, { ...LABEL_OVERRIDES })

export function normalizeAdminSection(section) {
  const key = String(section || '').trim()
  return ADMIN_SECTION_ALIASES[key] || key
}

export function getAdminSectionLabel(section) {
  const raw = String(section || '').trim()
  const normalized = normalizeAdminSection(raw)
  return SECTION_LABELS[raw] || SECTION_LABELS[normalized] || normalized || 'Admin Console'
}

export function getAdminNavItem(sectionKey) {
  const normalized = normalizeAdminSection(sectionKey)
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.key === normalized) || null
}

export function getAdminRoute(sectionKey) {
  const item = getAdminNavItem(sectionKey)
  return item ? `/admin-console/${item.key}` : '/admin-console'
}
