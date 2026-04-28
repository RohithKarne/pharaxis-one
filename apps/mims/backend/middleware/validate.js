'use strict';

/**
 * validate.js — Joi-based request validation middleware.
 *
 * Usage in routes:
 *   const { validate, schemas } = require('../middleware/validate');
 *   router.post('/endpoint', validate(schemas.endpointBody), handler);
 *
 * Validates req.body by default. Pass { source: 'params' | 'query' } for other targets.
 */

const Joi = require('joi');

// ── Middleware factory ────────────────────────────────────────────────────────
function validate(schema, options = {}) {
  const source = options.source || 'body';
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
      });
    }
    req[source] = value;
    next();
  };
}

// ── Shared field definitions ──────────────────────────────────────────────────
const id     = () => Joi.number().integer().positive();
const str    = (max = 255) => Joi.string().trim().max(max);
const email  = () => Joi.string().email().trim().max(255);
const bool   = () => Joi.boolean();
const isoDate = () => Joi.string().isoDate();

// ── Schemas ───────────────────────────────────────────────────────────────────
const schemas = {

  // ── Auth ──────────────────────────────────────────────────────────────────
  login: Joi.object({
    email:    str().required(),
    password: str(1000).required(),
    org_id:   id().optional(),
  }),

  changePassword: Joi.object({
    current_password: str(1000).required(),
    new_password:     str(1000).min(8).required(),
  }),

  resetPassword: Joi.object({
    token:        str(512).required(),
    new_password: str(1000).min(8).required(),
  }),

  // ── Cases ─────────────────────────────────────────────────────────────────
  createCase: Joi.object({
    case_type:         str(20).valid('MI', 'AE', 'PC').required(),
    org_id:            id().optional(),
    site_id:           id().optional(),
    inquiry_id:        id().optional(),
    subject:           str(500).optional(),
    description:       str(5000).optional(),
    intake_channel:    str(50).optional(),
    date_received:     isoDate().optional().allow('', null),
    priority:          str(20).optional(),
    source_type_id:    id().optional(),
    product_id:        id().optional(),
    workflow_state_id: id().optional(),
    assigned_to:       id().optional(),
  }),

  updateCase: Joi.object({
    subject:           str(500).optional(),
    description:       str(5000).optional(),
    priority:          str(20).optional(),
    status:            str(50).optional(),
    workflow_state_id: id().optional(),
    assigned_to:       id().optional(),
    product_id:        id().optional(),
    source_type_id:    id().optional(),
    site_id:           id().optional(),
  }).min(1),

  savedView: Joi.object({
    name:    str(255).required(),
    filters: Joi.object().optional(),
  }),

  // ── Admin — Picklists ─────────────────────────────────────────────────────
  createPicklist: Joi.object({
    name:            str().optional(),
    value:           str().required(),
    description:     str(1000).optional().allow('', null),
    category:        str().optional().allow('', null),
    field_type:      str().optional().allow('', null),
    field_name:      str().optional().allow('', null),
    field_id:        id().optional(),
    org_id:          id().optional(),
    status:          str(20).optional(),
    is_active:       bool().optional(),
    sort_order:      Joi.number().integer().min(0).optional(),
    effective_from:  isoDate().optional().allow('', null),
    effective_to:    isoDate().optional().allow('', null),
    governance_note: str(1000).optional().allow('', null),
  }),

  updatePicklist: Joi.object({
    name:            str().optional(),
    value:           str().optional(),
    description:     str(1000).optional().allow('', null),
    category:        str().optional().allow('', null),
    field_type:      str().optional().allow('', null),
    field_name:      str().optional().allow('', null),
    field_id:        id().optional(),
    org_id:          id().optional(),
    status:          str(20).optional(),
    is_active:       bool().optional(),
    sort_order:      Joi.number().integer().min(0).optional(),
    effective_from:  isoDate().optional().allow('', null),
    effective_to:    isoDate().optional().allow('', null),
    governance_note: str(1000).optional().allow('', null),
  }).min(1),

  // ── Admin — Sites ─────────────────────────────────────────────────────────
  createSite: Joi.object({
    org_id:       id().required(),
    name:         str().required(),
    country:      str(100).optional(),
    abbreviation: str(20).optional(),
    is_primary:   bool().optional(),
    is_active:    bool().optional(),
  }),

  updateSite: Joi.object({
    name:                   str().optional(),
    country:                str(100).optional(),
    abbreviation:           str(20).optional(),
    is_primary:             bool().optional(),
    is_active:              bool().optional(),
    is_finalized:           bool().optional(),
    enable_dppr:            bool().optional(),
    country_specific:       bool().optional(),
    default_country:        str(100).optional(),
    enable_state_validation: bool().optional(),
  }).min(1),

  // ── Admin — Workflow ──────────────────────────────────────────────────────
  createWorkflowState: Joi.object({
    name:      str().required(),
    org_id:    id().optional(),
    is_active: bool().optional(),
  }),

  createWorkflowRule: Joi.object({
    org_id:       id().required(),
    from_state_id: id().required(),
    to_state_id:   id().required(),
    role:          str(50).optional(),
    is_active:     bool().optional(),
  }),

  // ── Admin — Email Accounts ────────────────────────────────────────────────
  createEmailAccount: Joi.object({
    org_id:       id().required(),
    account_name: str().required(),
    provider:     str(100).optional(),
    direction:    str(50).valid('Inbound', 'Outbound', 'Both').optional(),
    mailbox_email: email().optional(),
    from_email:    email().optional(),
    is_active:     bool().optional(),
    imap_host:     str().optional(),
    imap_port:     Joi.number().integer().min(1).max(65535).optional(),
    imap_encryption: str(50).optional(),
    imap_username:  str().optional(),
    imap_password:  str(1000).optional(),
    smtp_host:     str().optional(),
    smtp_port:     Joi.number().integer().min(1).max(65535).optional(),
    smtp_encryption: str(50).optional(),
    smtp_username:  str().optional(),
    smtp_password:  str(1000).optional(),
    polling_interval_min: Joi.number().integer().min(1).optional(),
    initial_fetch_days:   Joi.number().integer().min(1).optional(),
  }),

  // ── Admin — Case Numbering ────────────────────────────────────────────────
  caseNumberConfig: Joi.object({
    org_id:       id().required(),
    case_type:    str(20).valid('MI', 'AE', 'PC').required(),
    prefix:       str(20).optional().allow('', null),
    suffix:       str(20).optional().allow('', null),
    padding:      Joi.number().integer().min(1).max(10).optional(),
    include_year: bool().optional(),
    include_site: bool().optional(),
    next_sequence: Joi.number().integer().min(1).optional(),
  }),

  // ── Admin — Security Groups ───────────────────────────────────────────────
  createSecurityGroup: Joi.object({
    org_id:      id().optional(),
    name:        str().required(),
    description: str(500).optional(),
    privileges:  Joi.object().optional(),
    is_active:   bool().optional(),
  }),

  // ── Admin — Contacts ─────────────────────────────────────────────────────
  createContact: Joi.object({
    org_id:       id().optional(),
    first_name:   str(100).required(),
    last_name:    str(100).optional().allow('', null),
    email:        email().optional().allow('', null),
    phone:        str(50).optional().allow('', null),
    institution:  str(255).optional().allow('', null),
    contact_type: str(50).optional(),
    is_active:    bool().optional(),
  }),

  // ── Admin — Products ─────────────────────────────────────────────────────
  createProduct: Joi.object({
    trade_name: str().required(),
    org_id:     id().optional(),
    is_active:  bool().optional(),
  }),

  // ── Admin — DPPR ──────────────────────────────────────────────────────────
  createDpprRule: Joi.object({
    org_id:          id().optional(),
    rule_name:       str().required(),
    domain:          str(100).required(),
    contact_type:    str(50).optional(),
    consent_type:    str(50).optional(),
    action:          str(20).valid('None', 'Anonymize', 'Delete').required(),
    retention_days:  Joi.number().integer().min(1).required(),
    is_active:       bool().optional(),
  }),

  // ── Content Management ────────────────────────────────────────────────────
  createDocument: Joi.object({
    org_id:       id().required(),
    title:        str(500).required(),
    doc_type:     str(50).optional(),
    status:       str(50).optional(),
    folder_id:    id().optional().allow(null),
    content_html: Joi.string().max(500000).optional().allow('', null),
    summary:      str(1000).optional().allow('', null),
  }),

  updateDocument: Joi.object({
    title:        str(500).optional(),
    status:       str(50).optional(),
    folder_id:    id().optional().allow(null),
    content_html: Joi.string().max(500000).optional().allow('', null),
    summary:      str(1000).optional().allow('', null),
    is_active:    bool().optional(),
  }).min(1),

  createFolder: Joi.object({
    org_id:    id().required(),
    name:      str().required(),
    parent_id: id().optional().allow(null),
  }),

  // ── QA Engine ────────────────────────────────────────────────────────────
  createQaReport: Joi.object({
    report_name:       str().required(),
    date_range_start:  isoDate().optional().allow('', null),
    date_range_end:    isoDate().optional().allow('', null),
    case_type_filter:  str(20).valid('MI', 'AE', 'PC', 'ALL').optional().allow('', null),
  }),

  updateQaRule: Joi.object({
    is_active:      bool().optional(),
    severity:       str(20).valid('critical', 'warning', 'info').optional(),
    condition_json: Joi.object().optional(),
  }).min(1),

  qaOverride: Joi.object({
    response_id:       id().required(),
    override_reason:   str(1000).optional().allow('', null),
    has_critical_flags: bool().optional(),
  }),

  // ── Superadmin ────────────────────────────────────────────────────────────
  createOrg: Joi.object({
    name:      str().required(),
    is_active: bool().optional(),
  }),

  updateOrg: Joi.object({
    name:      str().optional(),
    is_active: bool().optional(),
    session_timeout_minutes: Joi.number().integer().min(5).max(480).optional(),
    two_factor_enabled:      bool().optional(),
  }).min(1),

  createUser: Joi.object({
    name:     str().required(),
    email:    email().required(),
    password: str(1000).min(8).optional(),
    role:     str(50).valid('admin', 'agent', 'reviewer', 'content_manager').required(),
    org_id:   id().optional(),
    site_id:  id().optional(),
    is_active: bool().optional(),
  }),

  updateUser: Joi.object({
    name:      str().optional(),
    email:     email().optional(),
    role:      str(50).optional(),
    is_active: bool().optional(),
    org_id:    id().optional().allow(null),
    site_id:   id().optional().allow(null),
  }).min(1),

  // ── Notifications ─────────────────────────────────────────────────────────
  markNotificationRead: Joi.object({
    ids: Joi.array().items(id()).min(1).required(),
  }),

  // ── Help System ───────────────────────────────────────────────────────────
  createHelpArticle: Joi.object({
    feature_key:   str(120).required(),
    feature_group: str(80).optional().allow('', null),
    title:         str(500).required(),
    content_html:  Joi.string().max(500000).required(),
    summary:       str(500).optional().allow('', null),
    audience:      Joi.array().items(Joi.string()).optional(),
    tags:          Joi.array().items(Joi.string()).optional(),
    org_id:        id().optional().allow(null),
    is_active:     bool().optional(),
    sort_order:    Joi.number().integer().min(0).optional(),
  }),

};

module.exports = { validate, schemas };
