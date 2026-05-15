/**
 * helpKeys.js — Maps admin tab/selectedItem keys to help_key values
 * stored in the existing Help Content system (MIMS Admin > Help > Guide).
 *
 * If an item isn't in this map, the HelpHint falls back to the tab-level key.
 * If no article exists for the key, the drawer shows a graceful empty state.
 */

const HELP_KEYS_BY_TAB = {
  dashboard:         'admin.dashboard',
  organizations:     'admin.organisations',
  'service-log':     'admin.service_log',
  'system-activity': 'admin.system_activity',
  'service-dashboard': 'admin.service_dashboard',
  configuration:     'admin.configuration',
  escalation:        'admin.escalation',
  documents:         'admin.documents',
  tables:            'admin.tables',
  system:            'admin.system',
  help:              'general',
}

const HELP_KEYS_BY_SYSTEM_ITEM = {
  'sys-sec-users':              'admin.users',
  'sys-sec-group':              'admin.security_groups',
  'sys-sec-auth-policy':        'admin.auth_policy',
  'sys-sec-logged-in':          'admin.logged_in_users',
  'sys-sec-log':                'admin.security_log',
  'sys-setup-customize-forms':  'admin.customize_forms',
  'sys-setup-workflow':         'admin.workflow',
  'sys-setup-email-accounts':   'admin.email_accounts',
  'sys-setup-picklists-admin':  'admin.picklists_admin',
  'sys-setup-field-config':     'admin.field_setup',
  'sys-setup-case-form-def':    'admin.case_form_definition',
  'sys-setup-change-approvals': 'admin.change_approvals',
  'sys-setup-2fa-config':       'admin.two_factor_config',
  'sys-setup-alerts':           'admin.alerts',
  'sys-system-params':          'admin.system_parameters',
  'sys-reports-access':         'admin.reports_access',
  'sys-maint-copy-division':    'admin.copy_division',
  'sys-exception-log':          'admin.exception_log',
  'sys-view-data':              'admin.view_data',
}

const HELP_KEYS_BY_TABLES_ITEM = {
  'tbl-general':            'admin.picklists',
  'tbl-account-masters':    'admin.account_masters',
  'tbl-contact-masters':    'admin.contact_masters',
  'tbl-postal-code':        'admin.postal_codes',
  'tbl-global-product':     'admin.global_product',
  'tbl-product':            'admin.product',
  'tbl-product-manufacturer':'admin.product_manufacturer',
  'tbl-rep-type':           'admin.rep_type',
  'tbl-rep-alignment':      'admin.rep_alignment',
  'tbl-msl':                'admin.msl',
  'tbl-msl-territory':      'admin.msl_territory',
  'tbl-signature':          'admin.signature',
}

export function helpKeyFor({ activeTab, systemItem, tablesItem }) {
  if (activeTab === 'system' && systemItem && HELP_KEYS_BY_SYSTEM_ITEM[systemItem]) {
    return HELP_KEYS_BY_SYSTEM_ITEM[systemItem]
  }
  if (activeTab === 'tables' && tablesItem && HELP_KEYS_BY_TABLES_ITEM[tablesItem]) {
    return HELP_KEYS_BY_TABLES_ITEM[tablesItem]
  }
  return HELP_KEYS_BY_TAB[activeTab] || 'general'
}

export function helpLabelFor({ activeTab, systemItem }) {
  if (activeTab === 'system' && systemItem) return `Help for ${systemItem.replace(/^sys-/, '').replace(/-/g, ' ')}`
  return `Help for ${(activeTab || '').replace(/-/g, ' ')}`
}
