'use strict';

/**
 * pcHandoffCheck.js — what a product complaint needs before it is handed to
 * Quality (PC field review, Rohith 2026-10-13). One check, read by the PC
 * tab's card and by the server when a hand-off is started.
 *
 * Blocking (21 CFR 211.198(b)(1) — the complaint record names the complainant,
 * the product and the nature of the complaint):
 * - the complainant: a contact with a name, an email or a phone (14 Oct 2026,
 *   so Route to Quality and the Transmission screen ask the same);
 * - the product;
 * - the description of the complaint;
 * - when the patient was injured, a linked AE case: a complaint with an
 *   adverse event goes to safety too.
 * Warning only: the lot (often unknown to the complainant).
 * Shown, not blocking: a suspected counterfeit or tampering, and the Field
 * Alert Report deadline, 3 working days from Date Received (21 CFR
 * 314.81(b)(1)), when reportability says so.
 */

const pool = require('../database/db');

const { addWorkingDays } = require('../utils/workingDays');

async function pcHandoffCheck(caseId, db = pool) {
  const [[c]] = await db.execute('SELECT id, date_received FROM cases WHERE id = ?', [caseId]);
  const [[v]] = await db.execute(
    'SELECT id, version_number FROM case_pc_versions WHERE case_id = ? ORDER BY version_number DESC LIMIT 1', [caseId]);
  const [[g]] = v ? await db.execute('SELECT * FROM case_pc_general WHERE version_id = ?', [v.id]) : [[null]];
  const [[p]] = v ? await db.execute('SELECT * FROM case_pc_product_info WHERE version_id = ?', [v.id]) : [[null]];
  const [[pt]] = v ? await db.execute('SELECT injury_experienced FROM case_pc_patient_info WHERE version_id = ?', [v.id]) : [[null]];
  const [[ae]] = await db.execute(
    `SELECT c.id FROM case_links l
       JOIN cases c ON c.id = IF(l.case_id = ?, l.linked_case_id, l.case_id)
      WHERE (l.case_id = ? OR l.linked_case_id = ?) AND c.case_type = 'AE' AND c.is_deleted = 0
      LIMIT 1`, [caseId, caseId, caseId]);
  const [[rep]] = await db.execute(
    `SELECT v.field_value FROM case_dynamic_field_values v JOIN field_setup f ON f.id = v.field_id
      WHERE v.case_id = ? AND f.field_name = 'Reportability Determination' LIMIT 1`, [caseId]);

  const [[complainant]] = await db.execute(
    `SELECT COUNT(*) AS n FROM case_contacts
      WHERE case_id = ? AND (TRIM(COALESCE(first_name, '')) <> '' OR TRIM(COALESCE(last_name, '')) <> ''
        OR TRIM(COALESCE(email, '')) <> '' OR TRIM(COALESCE(phone, '')) <> '')`, [caseId]);
  const product = String(p?.product_name || '').trim() || (p?.product_id ? `product ${p.product_id}` : '');
  const injured = /^y/i.test(String(pt?.injury_experienced || ''));
  const items = [
    { key: 'complainant', label: 'Complainant', level: 'block', ok: Number(complainant.n) > 0, detail: Number(complainant.n) > 0 ? '' : 'add who complained (a name, email or phone)' },
    { key: 'product', label: 'Product', level: 'block', ok: !!product, detail: product || 'not entered' },
    { key: 'description', label: 'Description of the complaint', level: 'block', ok: !!String(g?.complaint_description || '').trim() },
    { key: 'lot', label: 'Lot', level: 'warn', ok: !!String(p?.lot_number || '').trim(), detail: p?.lot_number || 'not known — say so in the description if the complainant does not have it' },
  ];
  if (injured) {
    items.push({ key: 'safety', label: 'AE case for the injury', level: 'block', ok: !!ae, detail: ae ? `case ${ae.id}` : 'link the AE case (the patient was injured)' });
  }
  if (Number(g?.suspected_counterfeit)) {
    items.push({ key: 'counterfeit', label: 'Suspected counterfeit or tampering', level: 'info', ok: false, detail: 'urgent — an illegitimate product is notified to FDA within 24 hours of the determination' });
  }
  if (/field alert/i.test(String(rep?.field_value || '')) && c?.date_received) {
    const received = c.date_received instanceof Date ? c.date_received : new Date(`${String(c.date_received).slice(0, 10)}T00:00:00Z`);
    items.push({ key: 'far', label: 'Field Alert Report due', level: 'info', ok: false, detail: addWorkingDays(received, 3) });
  }
  const blocking = items.filter(i => i.level === 'block' && !i.ok);
  return { version: v?.version_number || null, items, ready: !!v && blocking.length === 0, missing: blocking.map(i => i.label) };
}

module.exports = { pcHandoffCheck, addWorkingDays };
