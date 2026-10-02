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

// ── CPPM-69: the person's name, email and phone inside text that is kept ──────
// A kept safety record has its name and email columns blanked, but the person also
// typed their name into form answers and replies, staff wrote it into answers and
// review notes, and we addressed emails to them. Those are rewritten here: every
// known full name, email address and phone number becomes [erased], and the rest of
// the text — the clinical content — is kept. A nickname, a first name on its own,
// or someone else's name cannot be recognised by a machine and stays.

// Form fields that identify the reporter rather than describe what happened.
const IDENTITY_FIELD = /^(first_?name|last_?name|full_?name|name|surname|e_?mail(_address)?|phone(_number)?|telephone|mobile|address|postcode|zip|(reporter|submitter|contact|requester)_.+)$/i;

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Collect what identifies the person: full names (two words or more), emails, phone numbers. */
function collectIdentifiers(user, subs) {
  const names = new Set(), emails = new Set(), phones = new Set();
  const addName = (...parts) => {
    const n = parts.filter(Boolean).map(x => String(x).trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
    if (n.split(' ').length >= 2 && n.length >= 4 && n !== `${ERASED} ${ERASED}`) names.add(n);
  };
  const addEmail = (e) => { if (e && /@/.test(e)) emails.add(String(e).trim().toLowerCase()); };
  const addPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); if (d.length >= 7) phones.add(d); };
  addName(user.first_name, user.last_name); addEmail(user.email); addPhone(user.phone);
  for (const s of subs) {
    addName(s.submitter_name); addEmail(s.submitter_email);
    let f = {};
    try { f = JSON.parse(s.form_data || '{}') || {}; } catch { f = {}; }
    addName(f.first_name || f.firstName, f.last_name || f.lastName); addName(f.name); addName(f.full_name);
    for (const [k, v] of Object.entries(f)) {
      if (/e_?mail/i.test(k)) addEmail(v);
      if (/phone|mobile|telephone/i.test(k)) addPhone(v);
    }
  }
  const patterns = [
    ...[...emails].map(e => new RegExp(escapeRe(e), 'gi')),
    // Longest names first, so "Mary Ann Smith" goes before "Mary Ann".
    ...[...names].sort((x, y) => y.length - x.length)
      .map(n => new RegExp(`(?<![\\p{L}\\p{N}])${n.split(' ').map(escapeRe).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu')),
    // The same number is written with or without its country code and leading 0
    // ("+44 7700 900555", "07700 900555"), so the match is on the last ten digits.
    ...[...phones].map(d => {
      const core = d.length > 10 ? d.slice(-10) : d.replace(/^0/, '');
      return new RegExp(`(?<!\\d)(?:(?:\\+|00)\\d{1,3}[\\s().-]*)?(?:\\(?0\\)?[\\s().-]*)?${core.split('').join('[\\s().-]*')}(?!\\d)`, 'g');
    }),
  ];
  return { names, emails, phones, patterns };
}

function redactText(text, ids) {
  if (text == null || !ids.patterns.length) return text;
  let out = String(text);
  for (const re of ids.patterns) out = out.replace(re, ERASED);
  return out;
}

// Rewrites every string inside a parsed JSON value; identity fields of a form are
// blanked outright when `form` is set.
function redactDeep(value, ids, form = false) {
  if (typeof value === 'string') return redactText(value, ids);
  if (Array.isArray(value)) return value.map(v => redactDeep(v, ids, form));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = form && IDENTITY_FIELD.test(k) && v != null && v !== '' ? ERASED : redactDeep(v, ids, form);
    }
    return out;
  }
  return value;
}

function redactJsonText(text, ids, form = false) {
  if (text == null) return text;
  try { return JSON.stringify(redactDeep(JSON.parse(text), ids, form)); } catch { return redactText(text, ids); }
}

/** Rewrites one text column on the given rows; returns how many rows changed. */
async function rewriteColumn(conn, table, column, rows, fn) {
  let changed = 0;
  for (const r of rows) {
    const next = fn(r[column]);
    if (next !== r[column]) {
      await conn.execute(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`, [next, r.id]);
      changed += 1;
    }
  }
  return changed;
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
  let answers = [];
  let messages = [];
  if (subIds.length) {
    const ph = subIds.map(() => '?').join(',');
    attachments = await q(
      `SELECT id, submission_id, file_name, file_size, mime_type, created_at
         FROM cp_submission_attachments WHERE submission_id IN (${ph})`,
      subIds
    );
    // CPPM-63: what was said to and by the person about their requests — the answers
    // sent to them, their replies, and the follow-ups sent. Staff drafts are not theirs.
    answers = await q(
      `SELECT submission_id, body, sent_at FROM cp_submission_answers
        WHERE submission_id IN (${ph}) AND status = 'sent'`, subIds);
    messages = await q(
      `SELECT submission_id, IF(direction = 'in', 'from_you', 'from_team') AS direction, body,
              ae_screen_answer, ae_screen_detail, IF(direction = 'in', created_at, sent_at) AS at
         FROM cp_submission_messages
        WHERE submission_id IN (${ph}) AND (direction = 'in' OR status = 'sent') ORDER BY id`, subIds);
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
    submission_answers: answers,
    submission_messages: messages,
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
      `SELECT id, submission_type, submitter_name, submitter_email, form_data FROM cp_submissions WHERE user_id = ? AND client_id = ?`, [userId, clientId]);
    // CPPM-69: what identifies them, read before any of it is changed.
    const [[person]] = await conn.execute(
      'SELECT first_name, last_name, email, phone FROM cp_portal_users WHERE id = ? AND client_id = ?', [userId, clientId]);
    const ids = collectIdentifiers(person || {}, subs);
    const allSubIds = subs.map(s => s.id);
    // CPPM-66: a request that raised a safety review — on the form, or in a reply to
    // our answer — is a safety record whatever its type, as a flagged chat is below.
    // Deleting it left the review pointing at nothing, and it could not be confirmed.
    let reviewed = new Set();
    if (subs.length) {
      const [flagged] = await conn.execute(
        `SELECT DISTINCT submission_id FROM cp_ae_review_tasks WHERE submission_id IN (${subs.map(() => '?').join(',')})`,
        subs.map(s => s.id));
      reviewed = new Set(flagged.map(f => f.submission_id));
    }
    const keep = s => RETAINED_SUBMISSION_TYPES.has(s.submission_type) || reviewed.has(s.id);
    const retainIds = subs.filter(keep).map(s => s.id);
    const deleteIds = subs.filter(s => !keep(s)).map(s => s.id);

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
      // CPPM-11: the ones already sent to MIMS hold the identity over there too.
      // Recorded inside this transaction, so the outstanding work either lands
      // with the erasure or not at all — it can never be lost between the two.
      const [synced] = await conn.execute(
        `SELECT id, external_ref FROM cp_submissions
          WHERE id IN (${ph}) AND external_ref IS NOT NULL AND external_ref <> ''`, retainIds);
      mimsTargets = synced;
      await mimsRedaction.queueRedactions(conn, clientId, userId, synced);

      await conn.execute(
        `UPDATE cp_submissions SET user_id = NULL, submitter_name = ?, submitter_email = ?, ip_address = NULL WHERE id IN (${ph})`,
        [ERASED, ERASED, ...retainIds]
      );
      summary.retained.push(`submissions(${retainIds.length}) [AE/PC or safety review raised — identity severed, safety record retained]`);
    }

    // CPPM-18: a chat that raised a safety review is a safety record — keep it,
    // sever the identity (as for AE/PC submissions above). The rest are deleted below.
    const [keptChats] = await conn.execute(
      `SELECT c.id FROM cp_chat_conversations c
        WHERE c.portal_user_id = ? AND c.client_id = ?
          AND EXISTS (SELECT 1 FROM cp_ae_review_tasks t WHERE t.chat_conversation_id = c.id)`, [userId, clientId]);
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

    // CPPM-69: the name, email and phone inside what is kept.
    const scrubbed = [];
    const inList = (n) => Array(n).fill('?').join(',');
    if (retainIds.length) {
      const ph = inList(retainIds.length);
      const [fd] = await conn.execute(`SELECT id, form_data FROM cp_submissions WHERE id IN (${ph})`, retainIds);
      const nForm = await rewriteColumn(conn, 'cp_submissions', 'form_data', fd, t => redactJsonText(t, ids, true));
      const [ans] = await conn.execute(`SELECT id, body FROM cp_submission_answers WHERE submission_id IN (${ph})`, retainIds);
      const nAns = await rewriteColumn(conn, 'cp_submission_answers', 'body', ans, t => redactText(t, ids));
      const [msgs] = await conn.execute(`SELECT id, body, ae_screen_detail FROM cp_submission_messages WHERE submission_id IN (${ph})`, retainIds);
      const nMsg = await rewriteColumn(conn, 'cp_submission_messages', 'body', msgs, t => redactText(t, ids))
        + await rewriteColumn(conn, 'cp_submission_messages', 'ae_screen_detail', msgs, t => redactText(t, ids));
      if (nForm || nAns || nMsg) scrubbed.push(`submissions(form answers ${nForm}, answers ${nAns}, replies ${nMsg})`);
    }
    const chatIds = keptChats.map(c => c.id);
    {
      const where = [];
      const params = [];
      if (retainIds.length) { where.push(`submission_id IN (${inList(retainIds.length)})`); params.push(...retainIds); }
      if (chatIds.length) { where.push(`chat_conversation_id IN (${inList(chatIds.length)})`); params.push(...chatIds); }
      if (where.length) {
        const [tasks] = await conn.execute(`SELECT id, reported_detail, outcome_reason FROM cp_ae_review_tasks WHERE ${where.join(' OR ')}`, params);
        const n = await rewriteColumn(conn, 'cp_ae_review_tasks', 'reported_detail', tasks, t => redactText(t, ids))
          + await rewriteColumn(conn, 'cp_ae_review_tasks', 'outcome_reason', tasks, t => redactText(t, ids));
        if (n) scrubbed.push(`safety_reviews(${n})`);
      }
    }
    if (chatIds.length) {
      const [cm] = await conn.execute(`SELECT id, content FROM cp_chat_messages WHERE conversation_id IN (${inList(chatIds.length)})`, chatIds);
      const n = await rewriteColumn(conn, 'cp_chat_messages', 'content', cm, t => redactText(t, ids));
      if (n) scrubbed.push(`chat_messages(${n})`);
    }
    // Emails we sent or still owe them: the address goes, and one not yet sent is never sent.
    if (ids.emails.size || allSubIds.length) {
      const where = [];
      const params = [clientId];
      if (ids.emails.size) { where.push(`LOWER(to_email) IN (${inList(ids.emails.size)})`); params.push(...ids.emails); }
      if (allSubIds.length) { where.push(`(related_type = 'submission' AND related_id IN (${inList(allSubIds.length)}))`); params.push(...allSubIds); }
      const [mail] = await conn.execute(
        `SELECT id, to_email, subject, html, text_body, status FROM cp_email_outbox WHERE client_id = ? AND (${where.join(' OR ')})`, params);
      let n = 0;
      for (const m of mail) {
        const to = ids.emails.has(String(m.to_email || '').toLowerCase()) ? ERASED : redactText(m.to_email, ids);
        const next = [to, redactText(m.subject, ids), redactText(m.html, ids), redactText(m.text_body, ids)];
        const owed = m.status === 'pending';
        if (owed || next[0] !== m.to_email || next[1] !== m.subject || next[2] !== m.html || next[3] !== m.text_body) {
          await conn.execute(
            `UPDATE cp_email_outbox SET to_email = ?, subject = ?, html = ?, text_body = ?,
                    status = IF(status = 'pending', 'failed', status),
                    last_error = IF(status = 'pending', 'Not sent: the recipient asked for their data to be erased.', last_error)
              WHERE id = ?`, [...next, m.id]);
          n += 1;
        }
      }
      if (n) scrubbed.push(`emails(${n})`);
    }
    // Audit lines keep the action and who did it; the person's address and name go.
    {
      const like = [...ids.emails, ...ids.names];
      if (like.length) {
        const [lines] = await conn.execute(
          `SELECT id, details FROM cp_audit_logs WHERE client_id = ? AND (${like.map(() => 'details LIKE ?').join(' OR ')})`,
          [clientId, ...like.map(x => `%${x}%`)]);
        const n = await rewriteColumn(conn, 'cp_audit_logs', 'details', lines, t => redactJsonText(t, ids));
        if (n) scrubbed.push(`audit_lines(${n})`);
      }
    }
    if (scrubbed.length) summary.anonymized.push(`name, email and phone removed from kept text: ${scrubbed.join(', ')}`);

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

module.exports = { buildExport, eraseUser, RETAINED_SUBMISSION_TYPES };
