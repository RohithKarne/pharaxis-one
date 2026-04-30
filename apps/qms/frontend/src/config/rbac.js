const ALL_USER_ROLES = ['viewer', 'author', 'qa_reviewer', 'approver', 'admin', 'superadmin'];

export const MODULE_ACCESS = {
  dashboard: {
    label: 'Dashboard',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  eventHub: {
    label: 'Event Hub',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  workflowInbox: {
    label: 'Workflow Inbox',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  notificationsCenter: {
    label: 'Notifications Center',
    readRoles: ALL_USER_ROLES,
    writeRoles: ALL_USER_ROLES
  },
  documentControl: {
    label: 'Document Control',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  capa: {
    label: 'CAPA',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  deviations: {
    label: 'Deviation',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  complaints: {
    label: 'Complaints',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'admin', 'superadmin']
  },
  nonconformance: {
    label: 'Nonconformance',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'admin', 'superadmin']
  },
  audits: {
    label: 'Audit',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['author', 'qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  validation: {
    label: 'Validation',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  changeControl: {
    label: 'Change Control',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'approver', 'admin', 'superadmin']
  },
  supplierQuality: {
    label: 'Supplier Quality',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'admin', 'superadmin']
  },
  riskManagement: {
    label: 'Risk Management',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'admin', 'superadmin']
  },
  trainingManagement: {
    label: 'Training Matrix',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'admin', 'superadmin']
  },
  managementReview: {
    label: 'Mgmt Review',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'admin', 'superadmin']
  },
  qualityInsights: {
    label: 'AI Insights',
    readRoles: ['qa_reviewer', 'admin', 'superadmin'],
    writeRoles: ['qa_reviewer', 'admin', 'superadmin']
  },
  integrations: {
    label: 'Integrations',
    readRoles: ALL_USER_ROLES,
    writeRoles: ['qa_reviewer', 'admin', 'superadmin']
  }
};

export function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  const normalized = roles
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function hasAnyRole(userRoles, requiredRoles = []) {
  const required = normalizeRoles(requiredRoles);
  if (required.length === 0) return true;

  const granted = normalizeRoles(userRoles);
  if (granted.includes('superadmin')) return true;

  return required.some((role) => granted.includes(role));
}

export function canReadModule(moduleKey, userRoles) {
  const module = MODULE_ACCESS[moduleKey];
  if (!module) return true;
  return hasAnyRole(userRoles, module.readRoles || []);
}

export function canWriteModule(moduleKey, userRoles) {
  const module = MODULE_ACCESS[moduleKey];
  if (!module) return true;
  return hasAnyRole(userRoles, module.writeRoles || []);
}

export function describeRequiredRoles(requiredRoles = []) {
  const unique = Array.from(new Set(normalizeRoles(requiredRoles)));
  if (unique.length === 0) return 'authorized role';
  return unique.join(', ');
}
