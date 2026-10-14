'use strict';

/**
 * mergeFields.js — the merge fields a letter template can use, and their values
 * for a case (content management review, Rohith 2026-10-14).
 *
 * Three places filled {{fields}} with three different lists: the MI letter
 * builder, the template preview and merge reports. A template written with
 * {{recipient_name}} worked in a letter but showed the raw field in the
 * preview, and the editors listed only some of them. One catalogue now, one
 * set of values, read by all of them.
 *
 * Values are taken from the case form: who asked, the product, the MI
 * question, the AE event, the PC lot. In a letter body every value is escaped,
 * except selected_content, which is the published content itself.
 */

const pool = require('../database/db');
const { getCaseProductName } = require('./caseProductName');

const MERGE_FIELDS = [
  { key: 'date',                  group: 'Letter',    label: "Today's date" },
  { key: 'agent_name',            group: 'Letter',    label: 'Your name' },
  { key: 'org_name',              group: 'Letter',    label: 'Organisation' },
  { key: 'case_number',           group: 'Case',      label: 'Case number' },
  { key: 'case_type',             group: 'Case',      label: 'Case type' },
  { key: 'date_received',         group: 'Case',      label: 'Date received' },
  { key: 'case_status',           group: 'Case',      label: 'Case status' },
  { key: 'case_priority',         group: 'Case',      label: 'Priority' },
  { key: 'case_assigned_to',      group: 'Case',      label: 'Case owner' },
  { key: 'recipient_name',        group: 'Requester', label: 'Name' },
  { key: 'recipient_title',       group: 'Requester', label: 'Title (Dr, Prof)' },
  { key: 'recipient_institution', group: 'Requester', label: 'Institution' },
  { key: 'recipient_address',     group: 'Requester', label: 'Address' },
  { key: 'recipient_email',       group: 'Requester', label: 'Email' },
  { key: 'patient_name',          group: 'Patient',   label: 'Patient initials' },
  { key: 'product_name',          group: 'Product',   label: 'Product' },
  { key: 'product_family',        group: 'Product',   label: 'Product family' },
  { key: 'mi_question',           group: 'Medical information', label: 'The question' },
  { key: 'mi_category',           group: 'Medical information', label: 'MI category' },
  { key: 'response_due_date',     group: 'Medical information', label: 'Answer due by' },
  { key: 'ae_event',              group: 'Adverse event',       label: 'First reported event' },
  { key: 'pc_complaint',          group: 'Product complaint',   label: 'Complaint description' },
  { key: 'pc_lot_number',         group: 'Product complaint',   label: 'Lot number' },
  { key: 'selected_content',      group: 'Letter builder',      label: 'The documents and modules chosen for the letter' },
];

// Older templates used contact_name / contact_email for the requester.
const ALIASES = { contact_name: 'recipient_name', contact_email: 'recipient_email' };

const longDate = (v) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });
};

/**
 * Values for a case. `recipient` (from the letter builder) and `miTab` override
 * what is looked up; without them the primary contact and the first MI are used.
 */
async function buildMergeData({ caseId, userId, recipient = null, miTab = null, productName = null }) {
  const [[agent]] = await pool.execute('SELECT name, email FROM users WHERE id = ? LIMIT 1', [userId || 0]);
  const data = Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, '']));
  data.date = longDate(new Date());
  data.agent_name = agent?.name || agent?.email || '';
  if (!caseId) return withAliases(data);

  const [[c]] = await pool.execute(
    `SELECT c.case_number, c.case_type, c.priority, c.date_received, o.name AS org_name,
            ws.name AS case_status, u.name AS owner_name
       FROM cases c
       LEFT JOIN organisations o ON o.id = c.org_id
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.id = ?`, [caseId]);
  if (c) {
    Object.assign(data, {
      case_number: c.case_number || '', case_type: c.case_type || '', case_priority: c.priority || '',
      case_status: c.case_status || '', case_assigned_to: (c.owner_name || '').trim(), org_name: c.org_name || '',
      date_received: longDate(c.date_received),
    });
  }

  const [[contact]] = await pool.execute(
    `SELECT cc.prefix, cc.address,
            COALESCE(cc.first_name, ct.first_name, '') AS first_name, COALESCE(cc.last_name, ct.last_name, '') AS last_name,
            COALESCE(cc.email, ct.email, '') AS email, COALESCE(cc.institution, ct.institution, '') AS institution
       FROM case_contacts cc LEFT JOIN contacts ct ON ct.id = cc.contact_id
      WHERE cc.case_id = ? ${recipient?.case_contact_id ? 'AND cc.id = ?' : ''}
      ORDER BY cc.is_primary DESC, cc.id ASC LIMIT 1`,
    recipient?.case_contact_id ? [caseId, recipient.case_contact_id] : [caseId]);
  data.recipient_name = (recipient?.name || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || recipient?.email || '');
  data.recipient_email = recipient?.email || contact?.email || '';
  data.recipient_institution = recipient?.institution || contact?.institution || '';
  data.recipient_title = contact?.prefix || '';
  data.recipient_address = contact?.address || '';

  const [[patient]] = await pool.execute('SELECT initials FROM case_patient WHERE case_id = ? LIMIT 1', [caseId]);
  data.patient_name = patient?.initials || '';

  let tab = miTab;
  if (!tab) {
    const [[first]] = await pool.execute(
      `SELECT mi.*, p.trade_name AS product_name, pf.name AS family_name
         FROM case_mi mi LEFT JOIN products p ON p.id = mi.product_id LEFT JOIN product_families pf ON pf.id = p.family_id
        WHERE mi.case_id = ? ORDER BY mi.tab_index, mi.id LIMIT 1`, [caseId]);
    tab = first || null;
  }
  if (tab) {
    data.mi_question = tab.question_summary || tab.detailed_question || '';
    data.mi_category = tab.mi_category || '';
    data.response_due_date = longDate(tab.response_required_by);
    data.product_family = tab.family_name || '';
  }
  data.product_name = productName || tab?.product_name || await getCaseProductName(caseId) || '';

  const [[ae]] = await pool.execute(
    `SELECT COALESCE(NULLIF(e.meddra_term, ''), e.event_description) AS term
       FROM case_ae_events e JOIN case_ae_versions v ON v.id = e.version_id
      WHERE v.case_id = ? ORDER BY v.version_number DESC, e.id ASC LIMIT 1`, [caseId]);
  data.ae_event = ae?.term || '';
  const [[pc]] = await pool.execute(
    `SELECT g.complaint_description, (SELECT pi.lot_number FROM case_pc_product_info pi WHERE pi.version_id = v.id ORDER BY pi.id LIMIT 1) AS lot
       FROM case_pc_versions v LEFT JOIN case_pc_general g ON g.version_id = v.id
      WHERE v.case_id = ? ORDER BY v.version_number DESC, v.id DESC LIMIT 1`, [caseId]);
  data.pc_complaint = pc?.complaint_description || '';
  data.pc_lot_number = pc?.lot || '';
  return withAliases(data);
}

function withAliases(data) {
  for (const [alias, key] of Object.entries(ALIASES)) data[alias] = data[key];
  return data;
}

const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Fill a letter body: values escaped so a typed name or question cannot add
// markup to a letter; selected_content is the published content, kept as is.
function applyHtml(html, data) {
  return String(html || '').replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (data[key] === undefined || data[key] === null) return m;
    return key === 'selected_content' ? String(data[key]) : escapeHtml(data[key]);
  });
}

// Fill plain text (a subject line).
function applyText(text, data) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (m, key) => (data[key] === undefined || data[key] === null ? m : String(data[key])));
}

module.exports = { MERGE_FIELDS, buildMergeData, applyHtml, applyText };
