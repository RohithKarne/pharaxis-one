export const CONFIG_NAV = [
  { label: 'Email Notifications', value: 'email-notifications' },
  { label: 'Email Types',         value: 'email-types'         },
  { label: 'FTP File Transfers',  value: 'ftp-file-transfers'  },
  { label: 'Tasks',               value: 'tasks'               },
  {
    label: 'Services', value: 'services', children: [
      { label: 'Rep Memo',                    value: 'svc-rep-memo'             },
      { label: 'Correspondence Notification', value: 'svc-correspondence-notif' },
      { label: 'Translation',                 value: 'svc-translation'          },
    ],
  },
  {
    label: 'Import', value: 'import', children: [
      { label: 'Email Case Import',    value: 'imp-email-case'    },
      { label: 'Response Import',      value: 'imp-response'      },
      { label: 'File Case Import',     value: 'imp-file-case'     },
      { label: 'XML Case Import',      value: 'imp-xml-case'      },
      { label: 'Account Import',       value: 'imp-account'       },
      { label: 'Contact Import',       value: 'imp-contact'       },
      { label: 'Product Import',       value: 'imp-product'       },
      { label: 'Postal Codes Import',  value: 'imp-postal-codes'  },
      { label: 'Sales Rep Import',     value: 'imp-sales-rep'     },
      { label: 'MSL Import',           value: 'imp-msl'           },
      { label: 'Language Map Import',  value: 'imp-language-map'  },
      { label: 'Live Import',          value: 'imp-live'          },
    ],
  },
  {
    label: 'Export', value: 'export', children: [
      { label: 'Document Export',     value: 'exp-document'     },
      { label: 'Case Export',         value: 'exp-case'         },
      { label: 'Sunshine Act Export', value: 'exp-sunshine-act' },
    ],
  },
  {
    label: 'Custom', value: 'custom', children: [
      { label: 'AE Reporting (E2B & ACK)', value: 'cust-ae-e2b'      },
      { label: 'AE Reporting (Email)',     value: 'cust-ae-email'     },
      { label: 'PC Synch',                value: 'cust-pc-synch'     },
      { label: 'Data Protection Process', value: 'cust-data-protect' },
      { label: 'QA Rule Process',         value: 'cust-qa-rule'      },
      { label: 'Batch Case Email/Fax',    value: 'cust-batch-case'   },
    ],
  },
]

export const ESCALATION_NAV = [
  { label: 'Group List',         value: 'group-list'         },
  { label: 'Product Group List', value: 'product-group-list' },
]

export const HELP_NAV = [
  { label: 'About', value: 'help-about' },
  { label: 'Guide', value: 'help-guide' },
]

export function findHelpLabel(value) {
  const item = HELP_NAV.find(i => i.value === value)
  return item ? item.label : value
}

export const SYSTEM_NAV = [
  {
    label: 'Maintenance', value: 'sys-maintenance', children: [
      { label: 'Copy Division',            value: 'sys-maint-copy-division' },
      { label: 'Sequence',                 value: 'sys-maint-sequence'      },
      { label: 'Configuration Management', value: 'sys-maint-config-mgmt'  },
    ],
  },
  {
    label: 'Security', value: 'sys-security', children: [
      { label: 'Add / Edit Users', value: 'sys-sec-users'    },
      { label: 'Group Security',   value: 'sys-sec-group'    },
      { label: 'Auth Policy',      value: 'sys-sec-auth-policy' },
      { label: '2FA Configuration', value: 'sys-setup-2fa-config' },
      { label: 'Logged In Users',  value: 'sys-sec-logged-in'},
      { label: 'Security Log',     value: 'sys-sec-log'      },
    ],
  },
  {
    label: 'Setup', value: 'sys-setup', children: [
      // Reorganized into 6 logical groups (was a flat 29-item list).
      // Leaf `value`s are unchanged — only grouping changed. 2FA moved to Security.
      {
        label: 'Forms & Fields', value: 'sys-setup-grp-forms', children: [
          { label: 'Customize Forms',                  value: 'sys-setup-customize-forms' },
          { label: 'Smart Field Rules',                value: 'sys-setup-smart-fields'    },
          { label: 'Validation Rules',                 value: 'sys-setup-validation'      },
          { label: 'Grid Section Templates',           value: 'sys-setup-grid-templates'  },
          { label: 'Case Actions (Templates/Macros)',  value: 'sys-setup-case-actions'    },
          { label: 'Case Hyperlinks',                  value: 'sys-setup-case-hyperlinks' },
        ],
      },
      {
        label: 'Workflow & Rules', value: 'sys-setup-grp-workflow', children: [
          { label: 'Business Rules',    value: 'sys-setup-business-rules'  },
          { label: 'Workflow Setup',    value: 'sys-setup-workflow'        },
          { label: 'Workflow Engine',   value: 'sys-setup-workflow-engine' },
          { label: 'CAPA Workflow',     value: 'sys-setup-capa'            },
          { label: 'Change Approvals',  value: 'sys-setup-change-approvals'},
          { label: 'Alerts',            value: 'sys-setup-alerts'          },
        ],
      },
      {
        label: 'Safety Reference Data', value: 'sys-setup-grp-safety', children: [
          { label: 'Document Types',          value: 'sys-setup-document-types' },
          { label: 'Complaint Codes',         value: 'sys-setup-complaint-codes'},
          { label: 'Lot Master',              value: 'sys-setup-lot-master'     },
          { label: 'Field Actions / Recalls', value: 'sys-setup-field-actions'  },
        ],
      },
      {
        label: 'Data Protection & Compliance', value: 'sys-setup-grp-compliance', children: [
          { label: 'PII Redaction Rules',         value: 'sys-setup-pii-redaction' },
          { label: 'Data Protection Rules',       value: 'sys-setup-data-protect'  },
          { label: 'Individual Protection Rules', value: 'sys-setup-indiv-protect' },
          { label: 'Compliance Hardening',        value: 'sys-setup-compliance'    },
          { label: 'PDF Security',                value: 'sys-setup-pdf-security'  },
        ],
      },
      {
        label: 'Integrations & Platform', value: 'sys-setup-grp-platform', children: [
          { label: 'Contacts Integration',          value: 'sys-setup-int-contacts'     },
          { label: 'MIR Integration',               value: 'sys-setup-int-mir'          },
          { label: 'CRM Integration Notification',  value: 'sys-setup-int-crm'          },
          { label: 'Content Integration',           value: 'sys-setup-int-content'      },
          { label: 'EMIR Integration',              value: 'sys-setup-int-emir'         },
          { label: 'Case Import',                   value: 'sys-setup-int-case-import'  },
          { label: 'Inbox Routing Rules',           value: 'sys-setup-int-routing'      },
          { label: 'Transmission Setup',            value: 'sys-setup-int-transmission' },
          { label: 'Developer API Clients',         value: 'sys-setup-developer-api'    },
          { label: 'Email Accounts',                value: 'sys-setup-email-accounts'   },
          { label: 'AI Configuration',              value: 'sys-setup-ai-config'        },
        ],
      },
      {
        label: 'System Reference', value: 'sys-setup-grp-system', children: [
          { label: 'Feature Flags',           value: 'sys-setup-feature-flags' },
          { label: 'Table Names Definitions', value: 'sys-setup-table-names'   },
          { label: 'Language Mapping',        value: 'sys-setup-lang-mapping'  },
        ],
      },
      // Picklist Definitions / Field Configuration / Case Form Definition retired —
      // folded into Tables > General (Picklists Table → Manage Schema) and
      // System > Setup > Customize Forms (⚙ More + Add Field per section).
    ],
  },
  {
    label: 'Plugins', value: 'sys-plugins', children: [
      {
        label: 'Contact', value: 'sys-plugin-contact', children: [
          { label: 'Plugin Maintenance',   value: 'sys-plugin-contact-maint'  },
          { label: 'Plugin Configuration', value: 'sys-plugin-contact-config' },
        ],
      },
      {
        label: 'MSL', value: 'sys-plugin-msl', children: [
          { label: 'Plugin Maintenance',   value: 'sys-plugin-msl-maint'  },
          { label: 'Plugin Configuration', value: 'sys-plugin-msl-config' },
        ],
      },
      {
        label: 'Representative', value: 'sys-plugin-rep', children: [
          { label: 'Plugin Maintenance',   value: 'sys-plugin-rep-maint'  },
          { label: 'Plugin Configuration', value: 'sys-plugin-rep-config' },
        ],
      },
    ],
  },
  { label: 'Division Parameters',    value: 'sys-division-params' },
  { label: 'System Parameters',      value: 'sys-system-params'   },
  { label: 'Reports Access',         value: 'sys-reports-access'  },
  { label: 'License Administration', value: 'sys-license-admin'   },
  { label: 'View Data',              value: 'sys-view-data'       },
  { label: 'Exception Log',          value: 'sys-exception-log'   },
  {
    label: 'UAT & QA', value: 'sys-uat-qa', children: [
      { label: 'Bug Reports',      value: 'sys-uat-bugs'     },
      { label: 'Feature Requests', value: 'sys-uat-features' },
      { label: 'Regression Testing', value: 'sys-uat-regression' },
    ],
  },
  {
    label: 'AI QA Engine', value: 'sys-ai-qa-engine', children: [
      { label: 'Retrospective QA Reports', value: 'sys-ai-qa-reports'   },
      { label: 'QA Rules Configuration',   value: 'sys-ai-qa-rules'     },
      { label: 'Override Dashboard',       value: 'sys-ai-qa-overrides' },
    ],
  },
]

function findInNav(nav, value) {
  for (const item of nav) {
    if (item.value === value) return item.label
    if (item.children) {
      const found = findInNav(item.children, value)
      if (found) return found
    }
  }
  return null
}

export function findSystemLabel(value) {
  return findInNav(SYSTEM_NAV, value) ?? value
}

export const TABLES_NAV = [
  { label: 'General',                  value: 'tbl-general'              },
  { label: 'Abstract Control',         value: 'tbl-abstract-control'     },
  { label: 'Account Masters',          value: 'tbl-account-masters'      },
  { label: 'Code Converter',           value: 'tbl-code-converter'       },
  { label: 'Contact Masters',          value: 'tbl-contact-masters'      },
  { label: 'Contact Class',            value: 'tbl-contact-class'        },
  { label: 'Postal Code',              value: 'tbl-postal-code'          },
  { label: 'Global Product',           value: 'tbl-global-product'       },
  { label: 'Product',                  value: 'tbl-product'              },
  { label: 'Product Manufacturer',     value: 'tbl-product-manufacturer' },
  { label: 'Representative Type',      value: 'tbl-rep-type'             },
  { label: 'Representative Alignment', value: 'tbl-rep-alignment'        },
  { label: 'MSL',                      value: 'tbl-msl'                  },
  { label: 'MSL Territory',            value: 'tbl-msl-territory'        },
  {
    label: 'Shift', value: 'tbl-shift', children: [
      { label: 'Referral', value: 'tbl-shift-referral' },
      { label: 'QA',       value: 'tbl-shift-qa'       },
    ],
  },
  { label: 'Signature', value: 'tbl-signature' },
]

export function findTableLabel(value) {
  for (const item of TABLES_NAV) {
    if (item.value === value) return item.label
    if (item.children) {
      const child = item.children.find(c => c.value === value)
      if (child) return child.label
    }
  }
  return value
}

export const DOCUMENTS_NAV = [
  { label: 'Template Control',     value: 'template-control'     },
  { label: 'Letter Formats',       value: 'letter-formats'       },
  { label: 'Custom Letter Review', value: 'custom-letter-review' },
]

export function findDocumentLabel(value) {
  const item = DOCUMENTS_NAV.find(i => i.value === value)
  return item ? item.label : value
}

export function findEscalationLabel(value) {
  const item = ESCALATION_NAV.find(i => i.value === value)
  return item ? item.label : value
}

export function findConfigLabel(value) {
  for (const item of CONFIG_NAV) {
    if (item.value === value) return item.label
    if (item.children) {
      const child = item.children.find(c => c.value === value)
      if (child) return child.label
    }
  }
  return value
}
