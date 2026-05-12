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
