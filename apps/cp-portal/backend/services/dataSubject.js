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
 * CPPM-11 (was CP-76): the erasure now reaches MIMS too. A retained submission
 * that was synced keeps its safety case there, but the reporter identity on that
 * case is removed — the same ruling, applied on both sides of the integration.
 */
const { pool } = require('../database/db');
const fs = require('fs');
const path = require('path');
const mimsRedaction = require('./mimsRedaction');
const log = require('../utils/logger');

const RETAINED_SUBMISSION_TYPES = new Set(['adverse_event', 'product_complaint']);
const ERASED = '[erased]';

// Bridge row 10: the answers in a stored form that identify the person. The name and
// email columns were blanked on erasure but these copies inside the form were not, so
// the admin screen still showed who reported. Same list of details MIMS blanks.
const IDENTITY_KEYS = [
  'name', 'first_name', 'last_name', 'full_name', 'reporter_name',
  'email', 'reporter_email', 'contact_email', 'reporter_contact',
  'phone', 'reporter_phone', 'contact_phone',
  'organization', 'organisation', 'institution', 'address',
];

/**
 * Remove the reporter's identity from these requests and keep the requests: the name
 * and email columns, the link to their portal account, their IP address, and every
 * identifying answer in the stored form — the fixed list above plus any email or phone
 * field this client added to its forms. Runs on the caller's transaction. A request
 * already erased is left as it is.
 */
async function eraseSubmissionIdentity(conn, clientId, ids) {
  if (!ids.length) return 0;
  const [cfg] = await conn.execute(
    `SELECT DISTINCT field_key FROM cp_form_config WHERE client_id = ? AND field_type IN ('email', 'phone')`, [clientId]);
  const keys = new Set([...IDENTITY_KEYS, ...cfg.map(f => f.field_key)]);
  const [rows] = await conn.execute(
    `SELECT id, form_data FROM cp_submissions
      WHERE client_id = ? AND identity_erased_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`, [clientId, ...ids]);
  for (const r of rows) {
    let formData = r.form_data;
    try {
      const fd = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : r.form_data;
      for (const k of keys) if (fd && fd[k] != null && String(fd[k]).trim() !== '') fd[k] = ERASED;
      formData = JSON.stringify(fd);
    } catch (err) {
      // Unreadable form data cannot be picked apart, so none of it is kept.
      formData = JSON.stringify({ erased: true });
      log.warn('dataSubject.form_data_unreadable_on_erasure', { submission_id: r.id });
    }
    await conn.execute(
      `UPDATE cp_submissions
          SET user_id = NULL, submitter_name = ?, submitter_email = ?, ip_address = NULL,
              form_data = ?, identity_erased_at = NOW()
        WHERE id = ?`, [ERASED, ERASED, formData, r.id]);
  }
  return rows.length;
}

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
    // CPPM-13: the wording accepted, not just the version number behind it.
    // consent_text is null for records taken before the wording was stored —
    // we have the version they agreed to but not the text, and we do not guess.
    // consent_text_effective_from says when that wording was last saved: after
    // consented_at means the wording may have moved under the record.
    q(`SELECT cr.id, cr.version, cr.choices_json, cr.consented_at,
              v.title AS consent_title, v.body AS consent_text, v.effective_from AS consent_text_effective_from
         FROM cp_consent_records cr
         LEFT JOIN cp_consent_text_versions v ON v.id = cr.consent_text_version_id
        WHERE cr.user_id = ? AND cr.client_id = ?`, [userId, clientId]),
    q(`SELECT id, item_type, item_id, created_at FROM cp_saved_items WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, item_type, item_id, created_at FROM cp_user_follows WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, type, title, item_id, is_read, created_at FROM cp_notifications WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, rating, message, page_url, submitted_at FROM cp_feedback WHERE user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, msl_id, requester_name, requester_email, preferred_date, topic, message, status, created_at FROM cp_msl_bookings WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
    q(`SELECT id, provider_key, email, created_at, last_login_at FROM cp_sso_identities WHERE portal_user_id = ? AND client_id = ?`, [userId, clientId]),
  ]);

  // CPPM-17: chat conversations with their messages, oldest first.
  const chats = await q(
    `SELECT id, started_at, last_message_at, message_count FROM cp_chat_conversations
      WHERE portal_user_id = ? AND client_id = ? ORDER BY id`, [userId, clientId]);
  for (const c of chats) {
    c.messages = await q(
      `SELECT role, content, created_at FROM cp_chat_messages WHERE conversation_id = ? AND client_id = ? ORDER BY id`,
      [c.id, clientId]);
  }

  // CPPM-15: every training attempt, with the questions as asked and the answers given.
  const trainingAttempts = (await q(
    `SELECT id, module_title, module_version, score, pass_score, passed, reference, answers_json, taken_at
       FROM cp_training_attempts WHERE portal_user_id = ? AND client_id = ? ORDER BY id`, [userId, clientId]))
    .map(({ answers_json, ...a }) => ({ ...a, answers: JSON.parse(answers_json || '[]') }));

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
    chat_conversations: chats,
    training_attempts: trainingAttempts,
  };
}

/**
 * GDPR Art. 17 erasure with regulated-retention holds. Runs in a transaction and
 * returns a summary of what was deleted / retained / anonymized for the audit log.
 */
async function eraseUser(userId, clientId) {
  const conn = await pool.getConnection();
  const summary = { anonymized: [], retained: [], deleted: [] };
  let mimsTargets = [];   // CPPM-11: retained submissions that reached MIMS
  try {
    await conn.beginTransaction();

    // Split submissions: retain AE/PC (sever identity), delete the rest.
    const [subs] = await conn.execute(
      `SELECT id, submission_type FROM cp_submissions WHERE user_id = ? AND client_id = ?`, [userId, clientId]);
    const retainIds = subs.filter(s => RETAINED_SUBMISSION_TYPES.has(s.submission_type)).map(s => s.id);
    const deleteIds = subs.filter(s => !RETAINED_SUBMISSION_TYPES.has(s.submission_type)).map(s => s.id);

    // CPPM-11: every request already sent to MIMS holds the identity over there too —
    // the kept side-effect and complaint reports, and (bridge row 10) the medical
    // enquiries deleted below, whose MIMS cases kept the name and email until now.
    // Recorded inside this transaction, so the outstanding work either lands with the
    // erasure or not at all — it can never be lost between the two.
    if (subs.length) {
      const [synced] = await conn.execute(
        `SELECT id, external_ref FROM cp_submissions
          WHERE id IN (${subs.map(() => '?').join(',')}) AND external_ref IS NOT NULL AND external_ref <> ''`,
        subs.map(s => s.id));
      mimsTargets = synced;
      await mimsRedaction.queueRedactions(conn, clientId, userId, synced);
    }

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
      await eraseSubmissionIdentity(conn, clientId, retainIds);
      summary.retained.push(`submissions(${retainIds.length}) [AE/PC — identity severed, safety record retained]`);
    }

    // CPPM-18: a chat that raised a safety review is a safety record — keep it,
    // sever the identity (as for AE/PC submissions above). The rest are deleted below.
    const [flaggedChats] = await conn.execute(
      `UPDATE cp_chat_conversations c SET c.portal_user_id = NULL
        WHERE c.portal_user_id = ? AND c.client_id = ?
          AND EXISTS (SELECT 1 FROM cp_ae_review_tasks t WHERE t.chat_conversation_id = c.id)`, [userId, clientId]);
    if (flaggedChats.affectedRows) {
      summary.retained.push(`chat_conversations(${flaggedChats.affectedRows}) [safety review raised — identity severed, record retained]`);
    }

    // CPPM-15 (decision C, Rohith 29 Sep): a training attempt is the record that a
    // module was completed — keep it, remove who took it (as for AE/PC submissions).
    const [trainingKept] = await conn.execute(
      `UPDATE cp_training_attempts SET portal_user_id = NULL, person_name = ?, person_email = ?
        WHERE portal_user_id = ? AND client_id = ?`, [ERASED, ERASED, userId, clientId]);
    if (trainingKept.affectedRows) {
      summary.retained.push(`training_attempts(${trainingKept.affectedRows}) [completion record retained — name and email removed]`);
    }

    // Delete engagement/identity-link data.
    for (const [table, col] of [
      ['cp_saved_items', 'portal_user_id'], ['cp_user_follows', 'portal_user_id'],
      ['cp_notifications', 'portal_user_id'], ['cp_feedback', 'user_id'],
      ['cp_msl_bookings', 'portal_user_id'], ['cp_sso_identities', 'portal_user_id'],
      ['cp_chat_conversations', 'portal_user_id'], // CPPM-17; messages go with them
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

    // CPPM-11: MIMS is called only after the CP erasure has committed — never
    // with a transaction held open across a network call. Every case is already
    // recorded as owed, so a failure here delays the redaction, it never loses it.
    try {
      const flushed = await mimsRedaction.flushForSubmissions(clientId, mimsTargets.map(s => s.id));
      summary.mims = { ...flushed, detail: mimsRedaction.describe(flushed) };
    } catch (err) {
      log.error('dataSubject.mims_redaction_flush_failed', { err, user_id: userId, client_id: clientId });
      const pendingRefs = mimsTargets.map(s => String(s.external_ref));
      summary.mims = { done: [], pending: pendingRefs, detail: mimsRedaction.describe({ done: [], pending: pendingRefs }) };
    }

    return summary;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { buildExport, eraseUser, eraseSubmissionIdentity, RETAINED_SUBMISSION_TYPES };
