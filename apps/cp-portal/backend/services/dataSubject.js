/**
 * dataSubject.js — CP-63 GDPR data-subject-rights engine (CP Portal scope only).
 *
 * Export: gather every table holding a portal user's personal data into a
 * machine-readable object (GDPR Art. 15).
 *
 * Erasure (GDPR Art. 17) honours the retention ruling (Vasu, CCO):
 *   - Adverse Event & Product Complaint submissions are RETAINED (pharmacovigilance
 *     legal obligation, Art. 17(3)(b)) but the reporter identity is severed.
 *   - Consent records are RETAINED as proof of consent.
 *   - The identity row is ANONYMIZED (not hard-deleted: it anchors the retained
 *     safety records) and its sessions are invalidated (token_version bump).
 *   - All other engagement data (MI/other inquiries, saved items, follows,
 *     notifications, feedback, MSL bookings, SSO identities) is DELETED.
 *
 * MIMS-synced case data is out of scope for this ticket (separate system) —
 * tracked as CP-76 under the Deferred epic.
 */
const { pool } = require('../database/db');
const fs = require('fs');
const path = require('path');

const RETAINED_SUBMISSION_TYPES = new Set(['adverse_event', 'product_complaint']);
const ERASED = '[erased]';

/** GDPR Art. 15 — everything we hold about this user, as structured JSON. */
async function buildExport(userId, clientId) {
  const q = (sql, params) => pool.execute(sql, params).then(([rows]) => rows);

  const [[profile]] = await pool.execute(
    `SELECT id, client_id, first_name, last_name, email, user_type, specialty, country, phone,
            is_active, email_verified, user_type_confirmed, last_login_at, created_at
       FROM cp_portal_users WHERE id = ? AND client_id = ?`,
    [userId, clientId]
  );

  const submissions = await q(
    `SELECT id, submission_type, submitter_name, submitter_email, submitter_type, form_data,
            status, external_ref, submitted_at, updated_at
       FROM cp_submissions WHERE user_id = ? AND client_id = ?`,
    [userId, clientId]
  );
  const subIds = submissions.map(s => s.id);
  let attachments = [];
  if (subIds.length) {
    attachments = await q(
      `SELECT id, submission_id, file_name, file_size, mime_type, created_at
         FROM cp_submission_attachments WHERE submission_id IN (${subIds.map(() => '?').join(',')})`,
      subIds
    );
  }

  const [consent, savedItems, follows, notifications, feedback, mslBookings, ssoIdentities] = await Promise.all([
    q(`SELECT id, version, choices_json, consented_at FROM cp_consent_records WHERE user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, item_type, item_id, created_at FROM cp_saved_items WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, item_type, item_id, created_at FROM cp_user_follows WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, type, title, item_id, is_read, created_at FROM cp_notifications WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, rating, message, page_url, submitted_at FROM cp_feedback WHERE user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, msl_id, requester_name, requester_email, preferred_date, topic, message, status, created_at FROM cp_msl_bookings WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, provider_key, email, created_at, last_login_at FROM cp_sso_identities WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
  ]);

  return {
    export_metadata: { generated_at: new Date().toISOString(), scope: 'CP Portal', user_id: userId, client_id: clientId, note: 'MIMS-synced case data is held in a separate system and is not included in this export.' },
    profile: profile || null,
    submissions,
    submission_attachments: attachments,
    consent_records: consent,
    saved_items: savedItems,
    follows,
    notifications,
    feedback,
    msl_bookings: mslBookings,
    sso_identities: ssoIdentities,
  };
}

/**
 * GDPR Art. 17 erasure with regulated-retention holds. Runs in a transaction and
 * returns a summary of what was deleted / retained / anonymized for the audit log.
 */
async function eraseUser(userId, clientId) {
  const conn = await pool.getConnection();
  const summary = { anonymized: [], retained: [], deleted: [] };
  try {
    await conn.beginTransaction();

    // Split submissions: retain AE/PC (sever identity), delete the rest.
    const [subs] = await conn.execute(
      `SELECT id, submission_type FROM cp_submissions WHERE user_id = ? AND client_id = ?`, [userId, clientId]);
    const retainIds = subs.filter(s => RETAINED_SUBMISSION_TYPES.has(s.submission_type)).map(s => s.id);
    const deleteIds = subs.filter(s => !RETAINED_SUBMISSION_TYPES.has(s.submission_type)).map(s => s.id);

    // Delete non-regulated submissions + their attachment rows (and files best-effort).
    if (deleteIds.length) {
      const ph = deleteIds.map(() => '?').join(',');
      const [atts] = await conn.execute(`SELECT file_path FROM cp_submission_attachments WHERE submission_id IN (${ph})`, deleteIds);
      await conn.execute(`DELETE FROM cp_submission_attachments WHERE submission_id IN (${ph})`, deleteIds);
      await conn.execute(`DELETE FROM cp_submissions WHERE id IN (${ph})`, deleteIds);
      for (const a of atts) {
        try { if (a.file_path) fs.unlinkSync(path.join(__dirname, '../', a.file_path.replace(/^\//, ''))); } catch (_) { /* best-effort */ }
      }
      summary.deleted.push(`submissions(${deleteIds.length}) + attachments`);
    }

    // Retain regulated submissions but sever the reporter identity.
    if (retainIds.length) {
      const ph = retainIds.map(() => '?').join(',');
      await conn.execute(
        `UPDATE cp_submissions SET user_id = NULL, submitter_name = ?, submitter_email = ?, ip_address = NULL WHERE id IN (${ph})`,
        [ERASED, ERASED, ...retainIds]
      );
      summary.retained.push(`submissions(${retainIds.length}) [AE/PC — identity severed, safety record retained]`);
    }

    // Delete engagement/identity-link data.
    for (const [table, col] of [
      ['cp_saved_items', 'portal_user_id'], ['cp_user_follows', 'portal_user_id'],
      ['cp_notifications', 'portal_user_id'], ['cp_feedback', 'user_id'],
      ['cp_msl_bookings', 'portal_user_id'], ['cp_sso_identities', 'portal_user_id'],
    ]) {
      const [r] = await conn.execute(`DELETE FROM \`${table}\` WHERE ${col} = ? AND client_id = ?`, [userId, clientId]);
      if (r.affectedRows) summary.deleted.push(`${table}(${r.affectedRows})`);
    }

    // Retain consent records as proof of consent (Art. 17(3)(b)); leave as-is.
    const [[cc]] = await conn.execute(`SELECT COUNT(*) n FROM cp_consent_records WHERE user_id = ? AND client_id = ?`, [userId, clientId]);
    if (cc.n) summary.retained.push(`consent_records(${cc.n}) [proof of consent]`);

    // Anonymize the identity row (kept — anchors retained records) + kill sessions.
    const anonEmail = `erased+${userId}.${Date.now()}@anonymized.invalid`;
    // password column is NOT NULL — set an unusable random value (account is also
    // deactivated and sessions are invalidated via token_version, so no login path).
    const deadHash = require('crypto').randomBytes(24).toString('hex');
    await conn.execute(
      `UPDATE cp_portal_users
          SET first_name = ?, last_name = ?, email = ?, phone = NULL, specialty = NULL, country = NULL,
              password = ?, is_active = 0, notif_prefs_json = '{}',
              verification_token = NULL, reset_token = NULL, reset_token_expires_at = NULL,
              token_version = COALESCE(token_version, 0) + 1
        WHERE id = ? AND client_id = ?`,
      [ERASED, ERASED, anonEmail, deadHash, userId, clientId]
    );
    summary.anonymized.push('cp_portal_users(identity)');

    await conn.commit();
    return summary;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { buildExport, eraseUser, RETAINED_SUBMISSION_TYPES };
