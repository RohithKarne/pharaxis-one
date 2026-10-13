'use strict';

/**
 * miSendCheck.js — what an MI needs before its response can be sent (MI field
 * review, Rohith 2026-10-13). One check, read by the MI tab's card and by the
 * server when a response is marked SENT, so the two never disagree.
 *
 * - who asked: a contact on the case with a name;
 * - the product the question is about — a warning, not a block: the choices
 *   come from the organisation's product master, which may be empty, and a
 *   question can be about a disease rather than a product;
 * - the question;
 * - the screening answer: does the enquiry mention an adverse event or a
 *   product complaint? Every enquiry must be screened; this is the record that
 *   it was;
 * - when the answer is Yes, the AE or PC case it went to: the MI's own
 *   conversion, or a case linked to this one.
 *
 * Saving stays free; only sending is held.
 */

const pool = require('../database/db');

async function linkedSafetyCase(caseId, db) {
  const [[row]] = await db.execute(
    `SELECT c.id, c.case_type FROM case_links l
       JOIN cases c ON c.id = IF(l.case_id = ?, l.linked_case_id, l.case_id)
      WHERE (l.case_id = ? OR l.linked_case_id = ?) AND c.case_type IN ('AE', 'PC') AND c.is_deleted = 0
      LIMIT 1`, [caseId, caseId, caseId]);
  return row || null;
}

async function miSendCheck(caseId, miTabId = null, db = pool) {
  const [tabs] = await db.execute(
    `SELECT id, tab_index, product_id, question_summary, ae_pc_screening, converted_to_case_id
       FROM case_mi WHERE case_id = ? ${miTabId ? 'AND id = ?' : ''} ORDER BY tab_index, id`,
    miTabId ? [caseId, miTabId] : [caseId]);
  const [[contact]] = await db.execute(
    `SELECT COUNT(*) AS n FROM case_contacts
      WHERE case_id = ? AND (TRIM(COALESCE(first_name, '')) <> '' OR TRIM(COALESCE(last_name, '')) <> '')`, [caseId]);
  const linked = await linkedSafetyCase(caseId, db);

  const items = [{ key: 'requester', label: 'Who asked', level: 'block', ok: Number(contact.n) > 0, detail: 'a contact with a name' }];
  const prefix = (t) => (tabs.length > 1 ? `MI ${t.tab_index}: ` : '');
  for (const t of tabs) {
    const screening = String(t.ae_pc_screening || '').toLowerCase();
    items.push({ key: 'product', label: `${prefix(t)}Product`, level: 'warn', ok: !!t.product_id, detail: t.product_id ? '' : 'not chosen' });
    items.push({ key: 'question', label: `${prefix(t)}Question`, level: 'block', ok: !!String(t.question_summary || '').trim() });
    items.push({ key: 'screening', label: `${prefix(t)}Adverse event / complaint screening`, level: 'block', ok: ['yes', 'no'].includes(screening), detail: screening ? screening : 'not answered' });
    if (screening === 'yes') {
      items.push({ key: 'linked', label: `${prefix(t)}AE or PC case for what was found`, level: 'block', ok: !!(t.converted_to_case_id || linked),
        detail: t.converted_to_case_id ? `case ${t.converted_to_case_id}` : (linked ? `case ${linked.id}` : 'convert the MI or link the case') });
    }
  }
  const blocking = items.filter(i => i.level === 'block' && !i.ok);
  return { items, ready: blocking.length === 0, missing: blocking.map(i => i.label) };
}

module.exports = { miSendCheck };
