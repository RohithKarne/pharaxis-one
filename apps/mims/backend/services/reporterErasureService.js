'use strict';

/**
 * reporterErasureService — remove the reporter's identity from one case, keep the case.
 *
 * The safety record is retained (pharmacovigilance legal obligation); only the fields
 * that identify the reporter are blanked. reporter_type, country and specialty stay —
 * they are case content, not identity. Used when the source portal asks (CPPM-11) and
 * when a MIMS user erases it on the case screen (bridge row 10). Runs on the caller's
 * connection, inside its transaction.
 *
 * Saad's rulings of 2 October, Rohith approved:
 *  - 2b: a reporter picked from the shared contact list is blanked there too when no
 *    other case uses that entry; when another case does, it is kept and the caller is
 *    told, so the person doing the erasure can deal with it.
 *  - 2c: notes the reporter sent through a portal become case comments; the reporter's
 *    known name, email and phone are replaced with [erased] in those comments, and the
 *    rest of the text is kept. Comments written by MIMS staff and the case history are
 *    not edited (the history is never rewritten).
 */

const { writeCaseAudit } = require('./caseHelpers');

const ERASED = '[erased]';
// The comment the API writes for a portal follow-up (routes/apiPlatform.js).
const PORTAL_NOTE_PREFIX = 'Follow-up from the reporter (';

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Known full names (two words or more), emails and phone numbers → patterns to replace. */
function identifierPatterns(people) {
  const names = new Set(), emails = new Set(), phones = new Set();
  for (const p of people) {
    const n = [p.first_name, p.last_name].filter(Boolean).map(x => String(x).trim()).join(' ').replace(/\s+/g, ' ');
    if (n.split(' ').length >= 2 && n.length >= 4 && !n.includes(ERASED)) names.add(n);
    if (p.email && /@/.test(p.email)) emails.add(String(p.email).trim().toLowerCase());
    const d = String(p.phone || '').replace(/\D/g, '');
    if (d.length >= 7) phones.add(d);
  }
  return [
    ...[...emails].map(e => new RegExp(escapeRe(e), 'gi')),
    ...[...names].sort((x, y) => y.length - x.length)
      .map(n => new RegExp(`(?<![\\p{L}\\p{N}])${n.split(' ').map(escapeRe).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu')),
    // Written with or without the country code and leading 0, so matched on the last ten digits.
    ...[...phones].map(d => {
      const core = d.length > 10 ? d.slice(-10) : d.replace(/^0/, '');
      return new RegExp(`(?<!\\d)(?:(?:\\+|00)\\d{1,3}[\\s().-]*)?(?:\\(?0\\)?[\\s().-]*)?${core.split('').join('[\\s().-]*')}(?!\\d)`, 'g');
    }),
  ];
}

/** Which shared contact list entries the reporter came from, and how many other cases use each. */
async function sharedContacts(exec, caseId) {
  const [rows] = await exec.execute(
    `SELECT ct.id, ct.first_name, ct.last_name, ct.email, ct.phone,
            (SELECT COUNT(DISTINCT o.case_id) FROM case_contacts o JOIN cases oc ON oc.id = o.case_id AND oc.is_deleted = 0
              WHERE o.contact_id = ct.id AND o.case_id <> ?) AS other_cases
       FROM contacts ct
      WHERE ct.id IN (SELECT cc.contact_id FROM case_contacts cc
                       WHERE cc.case_id = ? AND cc.contact_role = 'reporter' AND cc.contact_id IS NOT NULL)`,
    [caseId, caseId]);
  return rows.map(r => ({ ...r, other_cases: Number(r.other_cases) }));
}

/** What an erasure on this case would also do — shown in the dialog before it is signed. */
async function erasurePreview(exec, caseId) {
  const shared = await sharedContacts(exec, caseId);
  const [[notes]] = await exec.execute(
    'SELECT COUNT(*) AS n FROM case_comments WHERE case_id = ? AND user_id IS NULL AND comment LIKE ?',
    [caseId, `${PORTAL_NOTE_PREFIX}%`]);
  return {
    shared_contacts_blanked: shared.filter(s => s.other_cases === 0).length,
    shared_contacts_kept: shared.filter(s => s.other_cases > 0).map(s => ({ id: s.id, other_cases: s.other_cases })),
    portal_notes: Number(notes.n),
  };
}

/**
 * Returns { present, reporter_rows, contact_rows, shared_contacts_blanked,
 * shared_contacts_kept, notes_scrubbed }. present = how many rows still held any
 * identity before this call; 0 on a repeat, which then records nothing new — unless
 * `always` (a person asked for it on the case screen: their request is recorded, and
 * the portal is told, even if someone had already removed the details by hand).
 */
async function eraseReporterIdentity(conn, caseId, { userId, userName, note, always = false }) {
  // Read who the reporter is before any of it is blanked: the notes are scrubbed with it.
  const [reporters] = await conn.execute(
    'SELECT first_name, last_name, email, phone, organisation FROM case_reporter WHERE case_id = ?', [caseId]);
  const [cards] = await conn.execute(
    `SELECT first_name, last_name, email, phone, address, institution FROM case_contacts
      WHERE case_id = ? AND contact_role = 'reporter'`, [caseId]);
  const shared = await sharedContacts(conn, caseId);
  const has = (r, cols) => cols.some(c => r[c] != null && String(r[c]).trim() !== '' && r[c] !== ERASED);
  const present = reporters.filter(r => has(r, ['first_name', 'last_name', 'email', 'phone', 'organisation'])).length
    + cards.filter(r => has(r, ['first_name', 'last_name', 'email', 'phone', 'address', 'institution'])).length;

  // Intake records the reporter twice: case_reporter (the intake record) and
  // case_contacts (what the case screen shows). Both carry the identity, so
  // both are blanked or the identity survives on screen.
  const [rep] = await conn.execute(
    `UPDATE case_reporter
        SET first_name = NULL, last_name = NULL, email = NULL, phone = NULL, organisation = NULL
      WHERE case_id = ?`, [caseId]);
  const [con] = await conn.execute(
    `UPDATE case_contacts
        SET first_name = NULL, last_name = NULL, email = NULL, phone = NULL, address = NULL, institution = NULL
      WHERE case_id = ? AND contact_role = 'reporter'`, [caseId]);

  // 2b: the shared contact list entry goes too when this was its only case.
  const blanked = [];
  for (const s of shared.filter(x => x.other_cases === 0)) {
    await conn.execute(
      `UPDATE contacts SET first_name = ?, last_name = NULL, email = NULL, phone = NULL, address = NULL,
              institution = NULL, is_active = 0 WHERE id = ?`, [ERASED, s.id]);
    blanked.push(s.id);
  }
  const kept = shared.filter(x => x.other_cases > 0).map(s => ({ id: s.id, other_cases: s.other_cases }));

  // 2c: the reporter's own notes sent through a portal.
  let scrubbed = 0;
  const patterns = identifierPatterns([...reporters, ...cards, ...shared]);
  if (patterns.length) {
    const [notes] = await conn.execute(
      'SELECT id, comment FROM case_comments WHERE case_id = ? AND user_id IS NULL AND comment LIKE ?',
      [caseId, `${PORTAL_NOTE_PREFIX}%`]);
    for (const n of notes) {
      let next = n.comment;
      for (const re of patterns) next = next.replace(re, ERASED);
      if (next !== n.comment) {
        await conn.execute('UPDATE case_comments SET comment = ? WHERE id = ?', [next, n.id]);
        scrubbed++;
      }
    }
  }

  if (present > 0 || always || blanked.length || scrubbed) {
    // Part 11: the removal goes into the case's own history, in this transaction —
    // writeCaseAudit re-throws inside one, so no audit row means no erasure. The
    // erased values are deliberately not kept as old_value: that would undo the erasure.
    const extra = [
      scrubbed ? `name/email/phone removed from ${scrubbed} portal note(s)` : null,
      blanked.length ? `shared contact list entry #${blanked.join(', #')} blanked` : null,
      kept.length ? `shared contact list entry ${kept.map(k => `#${k.id} (used by ${k.other_cases} other case(s))`).join(', ')} kept` : null,
    ].filter(Boolean).join('; ');
    await writeCaseAudit(caseId, userId, userName, 'REPORTER_IDENTITY_REDACTED', 'reporter_identity', null,
      extra ? `${note}; ${extra}` : note, conn);
    // Bridge row 10: stamped, and the case marked changed, so the change feed tells the
    // source portal to blank its copy as well.
    await conn.execute(
      'UPDATE cases SET reporter_erased_at = COALESCE(reporter_erased_at, NOW()), updated_at = NOW() WHERE id = ?', [caseId]);
  }
  return {
    present, reporter_rows: rep.affectedRows, contact_rows: con.affectedRows,
    shared_contacts_blanked: blanked.length, shared_contacts_kept: kept, notes_scrubbed: scrubbed,
  };
}

module.exports = { eraseReporterIdentity, erasurePreview };
