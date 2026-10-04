// Only topics with a real screen are listed (T10 / M-35, 2026-09-29). The other
// 27 (email notifications, services, imports, exports, custom processes) only
// highlighted a tile with a developer note; they return here when each is built.
export const CONFIG_NAV = [
  {
    label: 'Import', value: 'import', children: [
      { label: 'Email Case Import',    value: 'imp-email-case'    },
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

// Only items with a real screen are listed (T10 / M-35, 2026-09-29): Sequence,
// Configuration Management, Security Log, Case Hyperlinks, Business Rules,
// Individual Protection Rules, PDF Security, Table Names, Language Mapping, the
// Contact / MSL / Representative plugins and License Administration all opened
// "Under Development". Add an item back with its screen in tabs/System.jsx.
export const SYSTEM_NAV = [
  {
    label: 'Maintenance', value: 'sys-maintenance', children: [
      { label: 'Copy Division',            value: 'sys-maint-copy-division' },
    ],
  },
  {
    label: 'Security', value: 'sys-security', children: [
      { label: 'Add / Edit Users', value: 'sys-sec-users'    },
      { label: 'Group Security',   value: 'sys-sec-group'    },
      { label: 'Auth Policy',      value: 'sys-sec-auth-policy' },
      { label: '2FA Configuration', value: 'sys-setup-2fa-config' },
      { label: 'Logged In Users',  value: 'sys-sec-logged-in'},
      { label: 'Support Access',   value: 'sys-sec-support-access' },
    ],
  },
  {
    label: 'Setup', value: 'sys-setup', children: [
      // Reorganized into 6 logical groups (was a flat 29-item list).
      // Leaf `value`s are unchanged — only grouping changed. 2FA moved to Security.
      {
        label: 'Forms & Fields', value: 'sys-setup-grp-forms', children: [
          // Phase 3 — the real per-field configuration surface. Drives the case
          // form's labels, required flags, visibility and order from field_setup.
          { label: 'Case Form Fields',                 value: 'sys-setup-case-fields'     },
          { label: 'Case Numbering',                   value: 'sys-setup-case-numbering'  },
          { label: 'Customize Forms',                  value: 'sys-setup-customize-forms' },
          { label: 'Smart Field Rules',                value: 'sys-setup-smart-fields'    },
          { label: 'Validation Rules',                 value: 'sys-setup-validation'      },
          { label: 'Grid Section Templates',           value: 'sys-setup-grid-templates'  },
          { label: 'Case Actions (Templates/Macros)',  value: 'sys-setup-case-actions'    },
        ],
      },
      {
        label: 'Workflow & Rules', value: 'sys-setup-grp-workflow', children: [
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
          { label: 'Compliance Hardening',        value: 'sys-setup-compliance'    },
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
          { label: 'Integration Health Monitor',    value: 'sys-setup-int-health'       },
          { label: 'Transmission Setup',            value: 'sys-setup-int-transmission' },
          { label: 'Developer API Clients',         value: 'sys-setup-developer-api'    },
          { label: 'Email Accounts',                value: 'sys-setup-email-accounts'   },
          { label: 'AI Configuration',              value: 'sys-setup-ai-config'        },
        ],
      },
      {
        label: 'System Reference', value: 'sys-setup-grp-system', children: [
          { label: 'Feature Flags',           value: 'sys-setup-feature-flags' },
        ],
      },
      // Picklist Definitions / Field Configuration / Case Form Definition retired —
      // folded into Tables > General (Picklists Table → Manage Schema) and
      // System > Setup > Customize Forms (⚙ More + Add Field per section).
    ],
  },
  { label: 'Division Parameters',    value: 'sys-division-params' },
  { label: 'System Parameters',      value: 'sys-system-params'   },
  { label: 'Reports Access',         value: 'sys-reports-access'  },
  { label: 'View Data',              value: 'sys-view-data'       },
  { label: 'Exception Log',          value: 'sys-exception-log'   },
  {
    label: 'UAT & QA', value: 'sys-uat-qa', children: [
      { label: 'Bug Reports',      value: 'sys-uat-bugs'     },
      { label: 'Feature Requests', value: 'sys-uat-features' },
      { label: 'Automated Compliance Checks', value: 'sys-ai-qa-compliance' },
      { label: 'E-Signature Verification', value: 'sys-ai-qa-esign' },
      // CUT: in-app Regression Testing runner removed (dev tooling → CI).
    ],
  },
  // PARK: AI QA Engine removed from the admin surface — the AI suite ships as a
  // deterministic-local mock; re-surface once a real provider is standard.
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

// Only tables with a real screen are listed (MIPM-154, as T10 / M-35 did for System).
// Abstract Control, Account Masters, Code Converter, Contact Class, Postal Code,
// Global Product, Product Manufacturer, Representative Type / Alignment, MSL,
// MSL Territory, Shift (Referral, QA) and Signature only highlighted a row.
export const TABLES_NAV = [
  { label: 'General',         value: 'tbl-general'         },
  { label: 'Product',         value: 'tbl-product'         },
  { label: 'Contact Masters', value: 'tbl-contact-masters' },
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

// Walks the tree to any depth. The previous version only checked two levels, so
// any topic nested deeper — System > Setup > Forms & Fields > Case Form Fields,
// for instance — fell through and the UI displayed the raw slug instead of the
// label.
export function findConfigLabel(value, items = CONFIG_NAV) {
  for (const item of items) {
    if (item.value === value) return item.label
    if (item.children) {
      const found = findConfigLabel(value, item.children)
      if (found !== value) return found
    }
  }
  return value
}
