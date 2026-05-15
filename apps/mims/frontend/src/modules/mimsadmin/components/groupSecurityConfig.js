export const SYSTEM_OPTION_SECTIONS = [
  {
    key: 'general',
    label: 'General',
    options: [
      { key: 'division_parameters', label: 'Division Parameters', navValues: ['sys-division-params'] },
      { key: 'view_data', label: 'View Data', navValues: ['sys-view-data'] },
      { key: 'system_parameters', label: 'System Parameters', navValues: ['sys-system-params'] },
      { key: 'service_configurations', label: 'Service Configurations', navValues: [] },
      { key: 'mobile_configurations', label: 'Mobile Configurations', navValues: [] },
      {
        key: 'ai_configuration',
        label: 'AI Configuration',
        navValues: [
          'sys-uat-bugs',
          'sys-uat-features',
          'sys-ai-qa-reports',
          'sys-ai-qa-rules',
          'sys-ai-qa-overrides',
        ],
      },
    ],
  },
  {
    key: 'setup',
    label: 'Setup',
    options: [
      { key: 'business_rules', label: 'Business Rules', navValues: ['sys-setup-business-rules'] },
      { key: 'two_factor_configuration', label: '2FA Configuration', navValues: ['sys-setup-2fa-config'] },
      { key: 'alerts', label: 'Alerts', navValues: ['sys-setup-alerts'] },
      {
        key: 'integrations',
        label: 'Integrations',
        navValues: [
          'sys-setup-int-contacts',
          'sys-setup-int-mir',
          'sys-setup-int-crm',
          'sys-setup-int-content',
          'sys-setup-int-emir',
          'sys-setup-int-case-import',
          'sys-setup-int-transmission',
        ],
      },
      { key: 'data_protection_rules', label: 'Data Protection Rules', navValues: ['sys-setup-data-protect'] },
      { key: 'individual_protection_rules', label: 'Individual Protection Rules', navValues: ['sys-setup-indiv-protect'] },
      { key: 'customized_forms', label: 'Customized Forms', navValues: ['sys-setup-customize-forms'] },
      { key: 'table_names_definitions', label: 'Table Names Definitions', navValues: ['sys-setup-table-names'] },
      { key: 'managed_translations', label: 'Managed Translations', navValues: ['sys-setup-lang-mapping'] },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    options: [
      { key: 'user_maintenance', label: 'User Maintenance', navValues: ['sys-sec-users'] },
      { key: 'group_security', label: 'Group Security', navValues: ['sys-sec-group'] },
      { key: 'logged_in_user_security_log', label: 'Logged-in User Security Log', navValues: ['sys-sec-logged-in', 'sys-sec-log'] },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    options: [
      { key: 'copy_division', label: 'Copy Division', navValues: ['sys-maint-copy-division'] },
      { key: 'sequence', label: 'Sequence', navValues: ['sys-maint-sequence'] },
      { key: 'configuration_management', label: 'Configuration Management', navValues: ['sys-maint-config-mgmt'] },
    ],
  },
  {
    key: 'bus',
    label: 'Bus',
    options: [
      { key: 'bus_configuration', label: 'Bus Configuration', navValues: [] },
      { key: 'bus_endpoint_status', label: 'Bus Endpoint Status', navValues: [] },
      { key: 'bus_tasks', label: 'Bus Tasks', navValues: [] },
    ],
  },
]

export const SYSTEM_NAV_PERMISSION_BY_VALUE = SYSTEM_OPTION_SECTIONS.reduce((acc, section) => {
  section.options.forEach(option => {
    option.navValues.forEach(value => {
      acc[value] = { section: section.key, option: option.key }
    })
  })
  return acc
}, {})

export function createEmptySystemOptions() {
  return SYSTEM_OPTION_SECTIONS.reduce((acc, section) => {
    acc[section.key] = section.options.reduce((sectionAcc, option) => {
      sectionAcc[option.key] = false
      return sectionAcc
    }, {})
    return acc
  }, {})
}

export const CASE_OPTION_SECTIONS = [
  {
    key: 'case_entry_options',
    label: 'Case Entry Options',
    options: [
      { key: 'add_new_case', label: 'Add New Case' },
      { key: 'update_case', label: 'Update Case' },
      { key: 'modify_other_users_cases', label: "Modify Other Users' Cases" },
      { key: 'modify_other_users_nodes', label: "Modify Other Users' Nodes" },
      { key: 'update_is_completed', label: 'Update Is Completed' },
      { key: 'reopen_is_completed', label: 'Reopen Is Completed' },
      { key: 'update_first_response_date', label: 'Update First Response Date' },
      { key: 'update_completed_case', label: 'Update Completed Case' },
      { key: 'case_or_question_date', label: 'Case or Question Date' },
    ],
  },
  {
    key: 'adverse_event_options',
    label: 'Adverse Event Options',
    options: [
      { key: 'enter_ae_screen', label: 'Enter an AE Screen' },
      { key: 'modify_other_users_aes', label: "Modify Other Users' AEs" },
      { key: 'export_to_b', label: 'Export to B' },
      { key: 'reopen', label: 'Reopen' },
      { key: 'delete_ae', label: 'Delete AE' },
    ],
  },
  {
    key: 'product_complaint_options',
    label: 'Product Complaint Options',
    options: [
      { key: 'enter_pc_screen', label: 'Enter PC Screen' },
      { key: 'modify_other_users_pc', label: "Modify Other Users' PC" },
      { key: 'reopen', label: 'Reopen' },
    ],
  },
  {
    key: 'insight_options',
    label: 'Insight Options',
    options: [
      { key: 'enter_insight_screen', label: 'Enter Insight Screen' },
    ],
  },
  {
    key: 'letter_options',
    label: 'Letter Options',
    options: [
      { key: 'create', label: 'Create' },
      { key: 'customize', label: 'Customize' },
      { key: 'bypass_custom_letter', label: 'Bypass Custom Letter' },
      { key: 'review', label: 'Review' },
      { key: 'reprint', label: 'Reprint' },
      { key: 'recent', label: 'Recent' },
      { key: 'modify_other_user_letters', label: 'Modify Other User Letters' },
    ],
  },
  {
    key: 'other_options',
    label: 'Other Options',
    options: [
      { key: 'include_in_ref_to_list', label: 'Include in Ref To List' },
      { key: 'decrypt_cases', label: 'Decrypt Cases' },
      { key: 'case_query_or_maintain_query_list', label: 'Case Query or Maintain Query List' },
      { key: 'delete_case_question', label: 'Delete Case Question' },
      { key: 'escalation', label: 'Escalation' },
      { key: 'question_escalation_search', label: 'Question Escalation Search' },
      { key: 'question_escalation_administrator', label: 'Question Escalation Administrator' },
      { key: 'individual_production', label: 'Individual Production' },
      { key: 'individual_protection_search', label: 'Individual Protection Search' },
      { key: 'batch_print', label: 'Batch Print' },
      { key: 'unknown_email_response', label: 'Unknown Email Response' },
    ],
  },
]

export function createEmptyCaseOptions() {
  return CASE_OPTION_SECTIONS.reduce((acc, section) => {
    acc[section.key] = section.options.reduce((sectionAcc, option) => {
      sectionAcc[option.key] = false
      return sectionAcc
    }, {})
    return acc
  }, {})
}
