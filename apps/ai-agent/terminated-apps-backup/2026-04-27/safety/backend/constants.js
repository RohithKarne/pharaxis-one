const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CRO_ADMIN: 'CRO_ADMIN',
  SAFETY_SCIENTIST: 'SAFETY_SCIENTIST',
  MEDICAL_REVIEWER: 'MEDICAL_REVIEWER',
  READ_ONLY: 'READ_ONLY'
}

const MODULES = {
  ORG_MANAGEMENT: 'Org Management',
  CLIENT_HIERARCHY: 'Client Hierarchy',
  USER_MANAGEMENT: 'User Management',
  PRODUCT_CONFIG: 'Product Config',
  CASE_MANAGEMENT: 'Case Management',
  CASE_ID_CONFIG: 'Case ID Config',
  SYSTEM_CONFIG: 'System Config',
  AUDIT_TRAIL_VIEW: 'Audit Trail View'
}

const MODULE_PERMISSIONS = {
  [MODULES.ORG_MANAGEMENT]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN],
  [MODULES.CLIENT_HIERARCHY]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN],
  [MODULES.USER_MANAGEMENT]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN],
  [MODULES.PRODUCT_CONFIG]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN],
  [MODULES.CASE_MANAGEMENT]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN, ROLES.SAFETY_SCIENTIST, ROLES.MEDICAL_REVIEWER, ROLES.READ_ONLY],
  [MODULES.CASE_ID_CONFIG]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN],
  [MODULES.SYSTEM_CONFIG]: [ROLES.SUPER_ADMIN],
  [MODULES.AUDIT_TRAIL_VIEW]: [ROLES.SUPER_ADMIN, ROLES.CRO_ADMIN]
}

const DEFAULT_SYSTEM_CONFIG = {
  session_timeout_minutes: '480',
  max_concurrent_sessions: '2',
  audit_retention_days: '3650',
  notification_preferences: JSON.stringify({
    login_alerts: true,
    invite_alerts: true,
    password_reset_alerts: true
  }),
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_password: '',
  smtp_from_email: 'no-reply@pharaxis.one',
  duplicate_precheck_onset_window_days: '30'
}

module.exports = {
  ROLES,
  MODULES,
  MODULE_PERMISSIONS,
  DEFAULT_SYSTEM_CONFIG
}
