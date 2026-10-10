// One word list for the codes the admin console shows (CP ease-of-use plan, phase 3
// row 16). Screens showed homepage_quicklinks, dhcp_letter, failed_sync, SYNC_RETRY.
// label(kind, code) gives the plain words; a code missing from the list is still
// shown as words ("ANSWER_DRAFTED" → "Answer drafted"), never as the raw code.
// Exports (CSV) keep the codes, so records stay matchable.

const WORDS = {
  submissionType: {
    medical_inquiry:   'Medical Inquiry',
    adverse_event:     'Adverse Event',
    product_complaint: 'Product Complaint',
    other_inquiry:     'Other Inquiry',
  },
  submissionStatus: {
    submitted:    'New submission',
    pending_sync: 'Sync pending',
    synced:       'Synced',
    failed_sync:  'Sync failed',
    closed:       'Closed',
  },
  feature: {
    homepage_quicklinks:   'Home page quick links',
    therapeutic_areas:     'Therapeutic areas',
    medical_inquiry:       'Medical information requests',
    adverse_event:         'Side-effect reports',
    product_complaint:     'Product complaints',
    other_inquiry:         'Other questions',
    events:                'Events',
    find_msl:              'Find an MSL',
    resources:             'Resources',
    drug_info:             'Drug information',
    user_auth:             'Sign-in and registration',
    hcp_gate:              'Healthcare professional check',
    news_announcements:    'News and announcements',
    document_library:      'Document library',
    safety_communications: 'Safety alerts',
    chatbox:               'Chat assistant',
    clinical_trials:       'Clinical trials',
    cme_training:          'CME and training',
  },
  alertType: {
    dhcp_letter:               'DHCP Letter',
    product_recall:            'Product Recall',
    urgent_safety_restriction: 'Urgent Safety Restriction',
    field_safety_notice:       'Field Safety Notice',
    safety_update:             'Safety Update',
    other:                     'Other',
  },
  fieldType: {
    text:        'Short text',
    textarea:    'Long text',
    email:       'Email',
    phone:       'Phone',
    number:      'Number',
    date:        'Date',
    select:      'Drop-down list',
    multiselect: 'Pick several',
    radio:       'Pick one',
    checkbox:    'Tick box',
    file:        'File',
    hidden:      'Hidden',
  },
  // Phase 3 row 21: one set of status words for every content screen.
  contentStatus: {
    draft:     'Draft',
    review:    'Needs review',
    approved:  'Approved to publish',
    scheduled: 'Scheduled',
    published: 'Live in portal',
    archived:  'Archived',
    active:    'Live in portal', // a safety alert being shown
    resolved:  'Resolved',
    in_review: 'Needs review',  // Library items
    in_progress: 'In progress',
    expired:   'Expired',
  },
  formField: {
    ae_screen_answer: 'Did anyone become unwell?',
    ae_screen_detail: 'What happened',
  },
  auditEntity: {
    msl: 'MSL',
    faq: 'FAQ',
  },
  auditAction: {
    CREATE:                 'Created',
    UPDATE:                 'Changed',
    DELETE:                 'Deleted',
    ENABLE:                 'Turned on',
    DISABLE:                'Turned off',
    UPLOAD:                 'Uploaded',
    EXPORT:                 'Exported',
    VIEW:                   'Viewed',
    LOGIN:                  'Signed in',
    LOGIN_FAILED:           'Sign-in failed',
    LOGIN_LOCKED:           'Account locked',
    SUBMITTED:              'Submitted',
    SYNC_RETRY:             'Retried sending to MIMS',
    MANUAL_RETRY:           'Sent to MIMS again',
    ACCESS_REQUESTED:       'Asked for access',
    APPROVE_ACCESS:         'Approved access',
    DECLINE_ACCESS:         'Declined access',
    ALERT_RAISED:           'Raised an alert',
    TEST_EMAIL:             'Sent a test email',
    TEST_CONNECTION:        'Tested the connection',
    RESEND_EMAIL:           'Sent an email again',
    CHAT_VIEWED:            'Viewed a chat',
    TRIGGER_RECONSENT:      'Asked for consent again',
    AE_REVIEW_TASK_CREATED: 'Side-effect review task created',
    AE_REVIEW_TASK_UPDATED: 'Side-effect review task changed',
    AE_REVIEW_CLOSED:       'Side-effect review closed',
    AE_TASK_TAKEN:          'Took a side-effect task',
    AE_TASK_HANDED:         'Handed on a side-effect task',
    AE_TASK_RELEASED:       'Released a side-effect task',
  },
}

export function label(kind, code) {
  if (code === null || code === undefined || code === '') return ''
  const known = WORDS[kind]?.[code]
  if (known) return known
  const words = String(code).replace(/_/g, ' ').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// For filters and pickers that list every known code of one kind.
export function labelsOf(kind) {
  return WORDS[kind] || {}
}
