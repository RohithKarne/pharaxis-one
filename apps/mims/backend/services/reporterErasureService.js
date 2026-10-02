'use strict';

/**
 * reporterErasureService — remove the reporter's identity from one case, keep the case.
 *
 * The safety record is retained (pharmacovigilance legal obligation); only the fields
 * that identify the reporter are blanked. reporter_type, country and specialty stay —
 * they are case content, not identity — and nothing else on the case is touched.
 * Used when the source portal asks (CPPM-11) and when a MIMS user erases it on the
 * case screen (bridge row 10). Runs on the caller's connection, inside its transaction.
 */

const { writeCaseAudit } = require('./caseHelpers');

/**
 * Returns { present, reporter_rows, contact_rows }. present = how many rows still held
 * any identity before this call; 0 on a repeat, which then records nothing new —
 * unless `always` (a person asked for it on the case screen: their request is recorded,
 * and the portal is told, even if someone had already removed the details by hand).
 */
async function eraseReporterIdentity(conn, caseId, { userId, userName, note, always = false }) {
  const [[{ present }]] = await conn.execute(
    `SELECT (SELECT COUNT(*) FROM case_reporter WHERE case_id = ?
               AND COALESCE(first_name, last_name, email, phone, organisation) IS NOT NULL)
          + (SELECT COUNT(*) FROM case_contacts WHERE case_id = ? AND contact_role = 'reporter'
               AND COALESCE(first_name, last_name, email, phone, address, institution) IS NOT NULL) AS present`,
    [caseId, caseId]
  );
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
  if (present > 0 || always) {
    // Part 11: the removal goes into the case's own history, in this transaction —
    // writeCaseAudit re-throws inside one, so no audit row means no erasure. The
    // erased values are deliberately not kept as old_value: that would undo the erasure.
    await writeCaseAudit(caseId, userId, userName, 'REPORTER_IDENTITY_REDACTED', 'reporter_identity', null, note, conn);
    // Bridge row 10: stamped, and the case marked changed, so the change feed tells the
    // source portal to blank its copy as well.
    await conn.execute(
      'UPDATE cases SET reporter_erased_at = COALESCE(reporter_erased_at, NOW()), updated_at = NOW() WHERE id = ?', [caseId]);
  }
  return { present: Number(present), reporter_rows: rep.affectedRows, contact_rows: con.affectedRows };
}

module.exports = { eraseReporterIdentity };
