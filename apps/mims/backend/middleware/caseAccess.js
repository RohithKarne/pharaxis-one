'use strict';

/**
 * caseAccess.js — one check in front of every case screen (access review,
 * Saad 2026-10-14).
 *
 * Only the case record itself checked "may this person see this case". Its
 * parts — AE and PC versions with patient details, lab results and medical
 * history, MI tabs, letters, comments, contacts, attachments, timeline — checked
 * only that the case was in the caller's organisation. A content author with no
 * case access, or an auditor (read only), could read them and change them by
 * calling the API.
 *
 * Every request about a case now needs the Cases module and View cases for that
 * case (own or all, as the case list). A change needs Update case for it, so an
 * auditor stays read only. Each route's own check (close, assign, escalate,
 * approve a letter, …) still applies after this one.
 */

const pool = require('../database/db');
const { authenticate } = require('./auth');
const { getUserModules } = require('../utils/userModules');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const { resolveActivityScope } = require('../services/accessConfigurationService');
const { verifyCaseOrg } = require('../services/caseHelpers');

// Paths this check covers.
const CASE_AREA = /^\/(cases|mi|mi-responses)(\/|$)|^\/inbox\/case\/\d+\//;
// Records kept against an entity: checked here when the entity is a case.
const ENTITY_AREA = /^\/(attachments|field-history|rich-fields)(\/|$)|^\/files\/\d+\//;

// How to find the case a path is about: the id in the path, or a lookup.
const AE_CHILD = (table) => `SELECT v.case_id FROM ${table} t JOIN case_ae_versions v ON v.id = t.version_id WHERE t.id = ?`;
const CASE_OF = [
  [/^\/cases\/(\d+)(\/|$)/, null],
  [/^\/cases\/drafts\/(\d+)$/, null],
  [/^\/cases\/copy-from\/(\d+)$/, null],
  [/^\/inbox\/case\/(\d+)\//, null],
  [/^\/cases\/ae\/versions\/(\d+)\//, 'SELECT case_id FROM case_ae_versions WHERE id = ?'],
  [/^\/cases\/pc\/versions\/(\d+)\//, 'SELECT case_id FROM case_pc_versions WHERE id = ?'],
  [/^\/cases\/ae\/events\/(\d+)$/, AE_CHILD('case_ae_events')],
  [/^\/cases\/ae\/lab-results\/(\d+)$/, AE_CHILD('case_ae_lab_results')],
  [/^\/cases\/ae\/medical-history\/(\d+)$/, AE_CHILD('case_ae_medical_history')],
  [/^\/cases\/ae\/product-info\/(\d+)$/, AE_CHILD('case_ae_product_info')],
  [/^\/cases\/mi\/(\d+)(\/|$)/, 'SELECT case_id FROM case_mi WHERE id = ?'],
  [/^\/mi\/tabs\/(\d+)\//, 'SELECT case_id FROM case_mi WHERE id = ?'],
  [/^\/cases\/contacts\/(\d+)$/, 'SELECT case_id FROM case_contacts WHERE id = ?'],
  [/^\/mi-responses\/(\d+)\//, 'SELECT case_id FROM case_mi_responses WHERE id = ?'],
];

// Changes that only concern the person looking at the case, not the case.
const VIEWER_ACTIONS = /^\/cases\/\d+\/(pin|touch|presence|watchers(\/\d+)?|validate|mi-response-builder\/preview)$/;

// The case an attachment, a field's history or a rich-text field belongs to,
// or null when the record is not a case's.
async function entityCaseId(req) {
  const q = req.query || {};
  let m;
  if ((m = req.path.match(/^\/(?:attachments\/source-for|rich-fields)\/([^/]+)\/(\d+)\//))) return m[1] === 'case' ? Number(m[2]) : null;
  if (['/attachments', '/field-history', '/rich-fields'].includes(req.path)) return q.entity_type === 'case' && q.entity_id ? Number(q.entity_id) : null;
  if ((m = req.path.match(/^\/attachments\/(\d+)(\/|$)/))) {
    const [[a]] = await pool.execute('SELECT entity_type, entity_id FROM attachments WHERE id = ?', [m[1]]);
    return a?.entity_type === 'case' ? Number(a.entity_id) : null;
  }
  if ((m = req.path.match(/^\/files\/\d+\/(.+)$/))) {
    const [[a]] = await pool.execute('SELECT entity_type, entity_id FROM attachments WHERE storage_key = ? OR thumb_key = ? LIMIT 1', [m[1], m[1]]);
    return a?.entity_type === 'case' ? Number(a.entity_id) : null;
  }
  return null;
}

async function checkEntity(req, res, next) {
  if (hasGlobalAdminScope(req.user)) return next();
  const caseId = await entityCaseId(req);
  if (!caseId) return next();
  const key = ['GET', 'HEAD'].includes(req.method) ? 'case.view' : 'case.update';
  const modules = await getUserModules(req.user.userId);
  if (modules.includes('mims_core') && await verifyCaseOrg(caseId, req, key)) return next();
  return deny(res, 403, key === 'case.view' ? 'You do not have permission to view this case.' : 'You do not have permission to change this case.');
}

async function caseIdFor(path) {
  for (const [re, sql] of CASE_OF) {
    const m = path.match(re);
    if (!m) continue;
    if (!sql) return { id: Number(m[1]) };
    const [[row]] = await pool.execute(sql, [m[1]]);
    return { id: row ? Number(row.case_id) : null };
  }
  return null;
}

function deny(res, status, error) {
  return res.status(status).json({ error, error_code: status === 403 ? 'CASE_ACCESS_FORBIDDEN' : 'CASE_NOT_FOUND', should_logout: false });
}

async function check(req, res, next) {
  if (hasGlobalAdminScope(req.user)) return next();
  if (!(await getUserModules(req.user.userId)).includes('mims_core')) {
    return deny(res, 403, 'You do not have access to Cases.');
  }
  const read = ['GET', 'HEAD'].includes(req.method);
  const target = await caseIdFor(req.path);
  if (!target) {
    // Lists, searches and new-case screens: the person must be able to see cases at all.
    const scope = await resolveActivityScope(req.user, 'case.view');
    return scope === 'none' ? deny(res, 403, 'You do not have permission to view cases.') : next();
  }
  if (!target.id) return deny(res, 404, 'Not found.');
  const key = read || VIEWER_ACTIONS.test(req.path) ? 'case.view' : 'case.update';
  if (await verifyCaseOrg(target.id, req, key)) return next();
  const [[exists]] = await pool.execute('SELECT id FROM cases WHERE id = ? LIMIT 1', [target.id]);
  if (!exists) return deny(res, 404, 'Case not found.');
  return deny(res, 403, key === 'case.view' ? 'You do not have permission to view this case.' : 'You do not have permission to change this case.');
}

function caseAccess(req, res, next) {
  const gate = CASE_AREA.test(req.path) ? check : ENTITY_AREA.test(req.path) ? checkEntity : null;
  if (!gate) return next();
  const run = () => gate(req, res, next).catch(next);
  return req.user ? run() : authenticate(req, res, run);
}

module.exports = { caseAccess };
