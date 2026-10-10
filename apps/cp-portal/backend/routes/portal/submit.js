/**
 * Portal Submit — /api/portal/submit
 * Handles all public form submissions. Auto-syncs to integrated system.
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const { assertSafeOutboundUrl, safeFetch } = require('../../utils/networkGuard');
const { getAuthHeaders, invalidateAuth } = require('../../services/mimsAuth');
const { validateUploads } = require('../../utils/fileValidation');
const { scanFile, downloadRefusal } = require('../../utils/virusScan');
const { queueEmail } = require('../../utils/emailOutbox');
const { validateAnswer, isFlagged, isScreenedType, AE_SCREEN_KEY, AE_SCREEN_DETAIL_KEY, AE_SCREEN_FIELDS } = require('../../services/aeScreening');
const { systemAudit, auditWithin } = require('../../utils/audit');
const { recordStatusEvent, publicTimeline, REOPENED_NOTE } = require('../../utils/submissionStatus');
const log = require('../../utils/logger');
const { loadFormFields, missingRequired, invalidAnswers } = require('../../services/formFields');
const { reportFingerprint } = require('../../services/reportFingerprint');
const { raiseAlert, clearAlerts, asSentence, recordConnectionResult } = require('../../services/adminAlerts');
const { MAX_ATTEMPTS: MAX_SYNC_ATTEMPTS } = require('../../services/mimsRetry');

// ── Attachment upload config (private storage, streamed via auth endpoints) ──
const ATT_MAX_SIZE  = 10 * 1024 * 1024; // 10 MB per file
const ATT_MAX_FILES = 5;
const ATT_ALLOWED   = [
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const attStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // SEC: sanitize clientCode before it touches the filesystem — multer runs
    // before route validation, so a raw `../` in the path param would otherwise
    // be a path-traversal write vector. Strip to the known clientCode charset.
    const safeCode = String(req.params.clientCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
    const dir = path.join(__dirname, '../../uploads/private/submissions', safeCode);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const submissionUpload = multer({
  storage: attStorage,
  limits: { fileSize: ATT_MAX_SIZE, files: ATT_MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (ATT_ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Use PDF, JPG, PNG or DOCX.'));
  },
}).array('attachments', ATT_MAX_FILES);

// Middleware wrapper that turns multer errors into clean JSON responses.
function handleUpload(req, res, next) {
  submissionUpload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'A file exceeds the 10MB limit.'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files (maximum 5).'
        : (err.message || 'File upload failed.');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

// Stream a stored attachment; verifies the caller already established access.
function streamAttachment(res, att, inline) {
  const abs = path.join(__dirname, '../../', att.file_path.replace(/^\//, ''));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found on server.' });
  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${att.file_name}"`);
  fs.createReadStream(abs).pipe(res);
}

// CPPM-39: scan each file against ClamAV's list of known viruses. A report is never
// lost because of a file: a virus is deleted and the report still goes through; a file
// that cannot be scanned right now is kept but held ('pending') until the background
// job has scanned it. Only 'clean' files can be downloaded or forwarded to MIMS.
// (Shared by a new report and a follow-up — bridge row 9.) Returns the blocked files.
async function scanUploads(req) {
  const blockedFiles = [];
  for (const f of req.files || []) {
    const result = await scanFile(f.path);
    if (result.status === 'infected') {
      try { fs.unlinkSync(f.path); } catch { /* already gone */ }
      blockedFiles.push({ file: f.originalname, virus: result.virus });
      f.blocked = true;
    }
    f.scanStatus = result.status === 'clean' ? 'clean' : 'pending';
    f.scanDetail = result.status === 'error' ? String(result.error).slice(0, 255) : null;
  }
  if (req.files) req.files = req.files.filter(f => !f.blocked);
  return blockedFiles;
}

// Store a request's uploaded files and audit the held and the blocked ones.
async function storeAttachments(submissionId, clientId, clientCode, files, blockedFiles) {
  const ids = [];
  for (const f of files || []) {
    const [r] = await pool.execute(
      `INSERT INTO cp_submission_attachments
         (submission_id, client_id, file_name, file_path, file_size, mime_type, scan_status, scan_detail, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${f.scanStatus === 'clean' ? 'NOW()' : 'NULL'})`,
      [submissionId, clientId, f.originalname.slice(0, 255),
       `/uploads/private/submissions/${clientCode}/${f.filename}`, f.size, f.mimetype,
       f.scanStatus, f.scanDetail]
    );
    ids.push(r.insertId);
    if (f.scanStatus === 'pending') {
      systemAudit('portal', clientId, 'ATTACHMENT_HELD', 'submission', submissionId,
        { file: f.originalname, reason: f.scanDetail });
    }
  }
  // CPPM-39: a file with a known virus was deleted before it was stored.
  for (const b of blockedFiles || []) {
    systemAudit('portal', clientId, 'ATTACHMENT_BLOCKED_VIRUS', 'submission', submissionId, b);
  }
  return ids;
}

// POST /api/portal/submit/:clientCode/:formType
router.post('/:clientCode/:formType', authenticatePortal, handleUpload, async (req, res) => {
  try {
    const { clientCode, formType } = req.params;
    const VALID_TYPES = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry'];
    if (!VALID_TYPES.includes(formType)) return res.status(400).json({ error: 'Invalid form type.' });

    // SEC: validate real attachment content (magic bytes), not the spoofable MIME
    // header. Rejects disguised HTML/SVG/executables and deletes them from disk.
    if (req.files && req.files.length) {
      const failure = validateUploads(req.files, ATT_ALLOWED);
      if (failure) return res.status(400).json({ error: failure });
    }

    const blockedFiles = await scanUploads(req);

    const [[client]] = await pool.execute('SELECT * FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    // Check feature is enabled for this client
    const [[feature]] = await pool.execute('SELECT * FROM cp_features WHERE client_id = ? AND feature_key = ? AND is_enabled = 1',
      [client.id, formType === 'other_inquiry' ? 'other_inquiry' : formType]);
    if (!feature) return res.status(403).json({ error: 'This submission type is not enabled.' });

    const { form_data } = req.body;
    if (!form_data) return res.status(400).json({ error: 'form_data is required.' });

    // API-07: Input length validation — prevent oversized payloads filling the database
    const formDataStr = typeof form_data === 'string' ? form_data : JSON.stringify(form_data);
    if (formDataStr.length > 50000) return res.status(400).json({ error: 'Input exceeds maximum length.' });

    // PD-2: every non-AE submission must answer the adverse-event screening
    // question. Enforced here as well as in the form config, because the form is
    // only a suggestion to anyone posting directly to this endpoint.
    let parsedForm = {};
    try { parsedForm = JSON.parse(formDataStr); } catch { parsedForm = {}; }
    const screenError = validateAnswer(formType, parsedForm);
    if (screenError) return res.status(400).json({ error: screenError, field: AE_SCREEN_KEY });

    // CPPM-7: required fields were only enforced by the page, so anything posted
    // another way was accepted with them empty. Checked here against the same
    // field list the page renders.
    const { fields: formFields } = await loadFormFields(client.id, formType);
    const missing = missingRequired(formFields, parsedForm);
    if (missing.length) {
      return res.status(400).json({
        error: `Please fill in: ${missing.map(f => f.label || f.field_key).join(', ')}.`,
        fields: missing.map(f => f.field_key),
      });
    }
    const invalid = invalidAnswers(formFields, parsedForm);
    if (invalid.length) {
      return res.status(400).json({
        error: invalid.map(x => x.msg).join(' '),
        fields: invalid.map(x => x.f.field_key),
        field_errors: Object.fromEntries(invalid.map(x => [x.f.field_key, x.msg])),
      });
    }

    const rawIp = req.ip || '';
    const ip_address = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;

    // The portal form sends the person's name and email inside form_data, not as
    // separate fields, so both were stored empty: the Safety Queue and Submissions
    // list showed "—", and a visitor who was not signed in never received the email
    // with their reference number. Read them from the form when not sent separately.
    const formName = [parsedForm.first_name, parsedForm.last_name].filter(v => v && String(v).trim()).join(' ')
      || parsedForm.reporter_name || parsedForm.full_name || parsedForm.name || '';
    const formEmail = parsedForm.email || parsedForm.reporter_email || parsedForm.contact_email || '';
    const submitter_name = (String(req.body.submitter_name || '').trim() || String(formName).trim()).slice(0, 255) || null;
    const submitter_email = (String(req.body.submitter_email || '').trim() || String(formEmail).trim()).slice(0, 255) || null;
    const submitter_type = (String(req.body.submitter_type || '').trim() || String(parsedForm.user_type || parsedForm.reporter_type || '').trim()).slice(0, 100) || null;

    const [info] = await pool.execute(`
      INSERT INTO cp_submissions (client_id, submission_type, user_id, submitter_name, submitter_email, submitter_type, form_data, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      client.id, formType,
      req.portalUser?.userId || null,
      submitter_name, submitter_email || null, submitter_type || null,
      formDataStr,
      ip_address,
    ]);

    const submissionId = info.insertId;

    // A1: audit the inquiry lifecycle. 'submitted' is the first entry.
    systemAudit('portal', client.id, 'SUBMITTED', 'submission', submissionId, { type: formType });

    // CPPM-4: the first entry in the history shown back to the person — "Received".
    await recordStatusEvent({ submissionId, clientId: client.id, status: 'submitted', source: 'portal' });

    // PD-2: the submitter said someone became unwell — raise a review task for
    // the client's safety team. Deliberately non-fatal: a failure here must never
    // cost the visitor their submission or their reference number. It is logged
    // and audited so a missing task is visible rather than silent.
    if (isFlagged(formType, parsedForm)) {
      try {
        const [task] = await pool.execute(
          `INSERT INTO cp_ae_review_tasks (client_id, submission_id, reported_detail) VALUES (?, ?, ?)`,
          [client.id, submissionId, String(parsedForm[AE_SCREEN_DETAIL_KEY] || '').slice(0, 5000) || null]
        );
        systemAudit('portal', client.id, 'AE_REVIEW_TASK_CREATED', 'submission', submissionId, { type: formType });
        raiseSafetyTaskAlert(client.id, task.insertId, 'a portal form');
      } catch (taskErr) {
        console.error(`[PD-2] AE review task NOT created for submission ${submissionId}:`, taskErr.message);
        systemAudit('portal', client.id, 'AE_REVIEW_TASK_FAILED', 'submission', submissionId,
          { type: formType, error: taskErr.message });
      }
    }

    // Save any uploaded attachments, linked to the new submission.
    await storeAttachments(submissionId, client.id, clientCode, req.files, blockedFiles);

    // Auto-sync to integrated system if configured
    // CPPM-8: syncToIntegration records its own failures; anything that still
    // escapes is logged, never swallowed. The retry job also sweeps stale
    // 'submitted' rows, so a crash here cannot strand the submission.
    syncToIntegration(client.id, submissionId, formType)
      .catch(err => log.error('portal.submit.sync_crashed', { err, submission_id: submissionId }));

    // Send submission confirmation email — fire-and-forget, non-fatal
    let recipientEmail = submitter_email || null;
    if (!recipientEmail && req.portalUser) {
      const [[u]] = await pool.execute('SELECT email FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
      recipientEmail = u?.email || null;
    }
    if (recipientEmail) {
      const ref = `CP-${String(submissionId).padStart(6, '0')}`;
      const typeLabel = { medical_inquiry: 'Medical Inquiry', adverse_event: 'Adverse Event', product_complaint: 'Product Complaint', other_inquiry: 'Other Inquiry' }[formType] || formType;
      // CPPM-36: recorded in the durable outbox — retried, and visible to an
      // administrator if it finally fails, rather than lost on restart.
      queueEmail(client.id, {
        to: recipientEmail,
        subject: `Submission Received — ${typeLabel} (${ref})`,
        html: `<p>Thank you for your submission.</p><p>Your reference number is <strong>${ref}</strong>.</p><p>We will review your ${typeLabel} and respond as soon as possible.</p>`,
        text: `Thank you for your submission. Your reference number is ${ref}. We will review your ${typeLabel} and respond as soon as possible.`,
      }, { kind: 'submission_ack', relatedType: 'submission', relatedId: submissionId });
    }

    res.status(201).json({
      id: submissionId,
      message: 'Submission received. Thank you.',
      reference: `CP-${String(submissionId).padStart(6, '0')}`,
      // CPPM-39: files removed because they contained a known virus, so the person knows.
      ...(blockedFiles.length ? { attachments_blocked: blockedFiles.map(b => b.file) } : {}),
    });
  } catch (err) {
    log.error('portal.submit.error', { err, route: 'POST /:clientCode/:formType', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// CPPM-86: the person's own words from a submission. The built-in forms name the
// free-text answer question, description, event_description or message; a client's
// own form may use another key, so failing those, the longest typed answer that is
// not a name, an email or the screening question.
const REQUEST_TEXT_KEYS = ['question', 'event_description', 'description', 'message', 'inquiry_details', 'complaint_details'];
const NOT_REQUEST_TEXT = /name|email|phone|contact|^ae_screen/;
// Bridge plan P2: answers with no field of their own in MIMS travel as "other answers"
// and become a case comment. Never the person's identity (an erasure request clears
// the reporter fields in MIMS, not comments) and never the screening question (MIMS-64).
const NOT_OTHER_ANSWER = /name|email|phone|contact|address|post_?code|zip|birth|^ae_screen/i;
function requestText(formData) {
  let d = formData;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
  if (!d || typeof d !== 'object') return null;
  for (const k of REQUEST_TEXT_KEYS) if (typeof d[k] === 'string' && d[k].trim()) return d[k].trim();
  const typed = Object.entries(d).filter(([k, v]) => typeof v === 'string' && !NOT_REQUEST_TEXT.test(k) && v.trim().length > 20);
  typed.sort((a, b) => b[1].length - a[1].length);
  return typed[0]?.[1].trim() || null;
}

// GET /api/portal/submit/:clientCode/submissions — user's own submissions (auth required)
router.get('/:clientCode/submissions', authenticatePortal, async (req, res) => {
  try {
    if (!req.portalUser) return res.status(401).json({ error: 'Login required to view submissions.' });
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // CPPM-14: a sent answer travels with the request. Only 'sent' — a draft or an
    // unapproved answer must never reach the person who asked.
    const [rows] = await pool.execute(`
      SELECT s.id, s.submission_type, s.status, s.external_ref, s.submitted_at, s.updated_at,
             s.form_data, a.body AS answer, a.sent_at AS answered_at
      FROM cp_submissions s
      LEFT JOIN cp_submission_answers a ON a.submission_id = s.id AND a.status = 'sent'
      WHERE s.client_id = ? AND s.user_id = ? ORDER BY s.submitted_at DESC
    `, [client.id, req.portalUser.userId]);
    // CPPM-4: the history behind each status. Read back with the same client_id
    // and user_id the list was built from, so a person can only ever see the
    // history of their own submissions.
    const byId = new Map(rows.map(r => [r.id, []]));
    if (rows.length) {
      const ph = rows.map(() => '?').join(',');
      const [events] = await pool.execute(
        `SELECT e.submission_id, e.status, e.note, e.created_at
           FROM cp_submission_status_events e
           JOIN cp_submissions s ON s.id = e.submission_id
          WHERE e.submission_id IN (${ph}) AND s.client_id = ? AND s.user_id = ?
          ORDER BY e.id ASC`,
        [...rows.map(r => r.id), client.id, req.portalUser.userId]
      );
      events.forEach(e => byId.get(e.submission_id)?.push(e));
      // Bridge row 9: what the person added after sending, oldest first.
      const [fus] = await pool.execute(
        `SELECT f.submission_id, f.body, f.created_at, f.question_id
           FROM cp_submission_followups f
           JOIN cp_submissions s ON s.id = f.submission_id
          WHERE f.submission_id IN (${ph}) AND s.client_id = ? AND s.user_id = ?
          ORDER BY f.id ASC`,
        [...rows.map(r => r.id), client.id, req.portalUser.userId]
      );
      fus.forEach(f => { const r = rows.find(x => x.id === f.submission_id); (r.followups = r.followups || []).push({ body: f.body, at: f.created_at, question_id: f.question_id || null }); });
      // Bridge feature F3: questions the medical team asked. A withdrawn one is not shown.
      const [qs] = await pool.execute(
        `SELECT q.id, q.submission_id, q.question, q.asked_at, q.status, q.answered_at
           FROM cp_submission_questions q
           JOIN cp_submissions s ON s.id = q.submission_id
          WHERE q.submission_id IN (${ph}) AND s.client_id = ? AND s.user_id = ? AND q.status IN ('open', 'answered')
          ORDER BY q.id ASC`,
        [...rows.map(r => r.id), client.id, req.portalUser.userId]
      );
      qs.forEach(q => { const r = rows.find(x => x.id === q.submission_id); (r.questions = r.questions || []).push({ id: q.id, question: q.question, asked_at: q.asked_at, status: q.status, answered_at: q.answered_at }); });
    }
    // Surface the user-facing case reference (matches the confirmation email/response).
    // CPPM-63: the conversation after the first answer — the person's own replies
    // and the follow-ups staff have sent. A draft never leaves the admin area.
    const convById = new Map(rows.map(r => [r.id, []]));
    if (rows.length) {
      const ph = rows.map(() => '?').join(',');
      const [msgs] = await pool.execute(
        `SELECT m.submission_id, m.direction, m.body, m.created_at, m.sent_at
           FROM cp_submission_messages m
           JOIN cp_submissions s ON s.id = m.submission_id
          WHERE m.submission_id IN (${ph}) AND s.client_id = ? AND s.user_id = ?
            AND (m.direction = 'in' OR m.status = 'sent')
          ORDER BY m.id ASC`,
        [...rows.map(r => r.id), client.id, req.portalUser.userId]
      );
      msgs.forEach(m => convById.get(m.submission_id)?.push({
        from: m.direction === 'in' ? 'you' : 'team', body: m.body, at: m.direction === 'in' ? m.created_at : m.sent_at,
      }));
    }
    const submissions = rows.map(({ form_data, ...r }) => ({
      ...r,
      // CPPM-86: what the person actually wrote, not a stock sentence. Only the
      // free-text request goes back — never the whole form.
      request_text: requestText(form_data),
      reference: `CP-${String(r.id).padStart(6, '0')}`,
      timeline: publicTimeline(byId.get(r.id) || []),
      followups: r.followups || [],
      questions: r.questions || [],
      can_follow_up: r.status !== 'closed',
      conversation: convById.get(r.id) || [],
      // Screened types ask "did anyone become unwell" on a reply too (PD-2).
      reply_needs_screening: isScreenedType(r.submission_type),
    }));
    // The screening question as worded in one place (services/aeScreening.js), for the reply form.
    res.json({ submissions, reply_screening: AE_SCREEN_FIELDS });
  } catch (err) {
    log.error('portal.submit.error', { err, route: 'GET /:clientCode/submissions', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/submit/:clientCode/submissions/:id/followups — bridge row 9: the
// person adds information to a request they already sent, instead of starting a new,
// unconnected one. Stored with the request, then sent to the MIMS case as a comment.
// Files go through the same checks as a new report and join the request's files.
const FOLLOWUP_MAX = 5000;
router.post('/:clientCode/submissions/:id/followups', authenticatePortal, requirePortalAuth, handleUpload, async (req, res) => {
  const clientCode = req.params.clientCode;
  // A refused follow-up must not leave its files behind on disk.
  const refuse = (status, error) => {
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
    return res.status(status).json({ error });
  };
  try {
    const text = String(req.body?.text || '').trim();
    if (text.length < 2) return refuse(400, 'Please write what you want to add.');
    if (text.length > FOLLOWUP_MAX) return refuse(400, `Please keep it under ${FOLLOWUP_MAX} characters.`);
    const [[s]] = await pool.execute(
      `SELECT s.id, s.client_id, s.status, s.submission_type, s.external_ref
         FROM cp_submissions s JOIN cp_clients c ON c.id = s.client_id
        WHERE s.id = ? AND c.code = ? AND c.is_active = 1 AND s.user_id = ?`,
      [req.params.id, clientCode, req.portalUser.userId]);
    if (!s) return refuse(404, 'Request not found.');
    // Bridge feature F3: an answer to a question the medical team asked. It can be
    // answered once, also after the request closed (the team asked, so they want it).
    let question = null;
    if (req.body?.question_id) {
      [[question]] = await pool.execute(
        "SELECT id, status FROM cp_submission_questions WHERE id = ? AND submission_id = ?", [Number(req.body.question_id) || 0, s.id]);
      if (!question) return refuse(404, 'Question not found.');
      if (question.status !== 'open') return refuse(409, 'This question has already been answered or was withdrawn.');
    }
    if (s.status === 'closed' && !question) return refuse(409, 'This request is closed. Please send a new one.');

    // PD-2: what the person adds is asked the same question as the form and a reply —
    // "did anyone become unwell" — and a Yes goes to the safety team (as CPPM-63 does
    // for a reply to an answer).
    const screen = { [AE_SCREEN_KEY]: req.body?.[AE_SCREEN_KEY], [AE_SCREEN_DETAIL_KEY]: req.body?.[AE_SCREEN_DETAIL_KEY] };
    const screenError = validateAnswer(s.submission_type, screen);
    if (screenError) return refuse(400, screenError);
    const flagged = isFlagged(s.submission_type, screen);
    const screenAnswer = isScreenedType(s.submission_type) ? String(screen[AE_SCREEN_KEY]).trim() : null;
    const detail = flagged ? (String(screen[AE_SCREEN_DETAIL_KEY] || '').trim().slice(0, 5000) || null) : null;

    const uploadError = req.files?.length ? validateUploads(req.files, ATT_ALLOWED) : null;
    if (uploadError) return res.status(400).json({ error: uploadError });
    const blockedFiles = await scanUploads(req);

    // A request MIMS never takes (other enquiries) keeps its follow-ups in the portal.
    const forwardStatus = FORM_TYPE_TO_CASE_TYPE[s.submission_type] ? 'pending' : 'local';
    // The follow-up and its safety task land together, or neither does.
    let followupId, task = null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute(
        'INSERT INTO cp_submission_followups (submission_id, client_id, body, forward_status, question_id) VALUES (?, ?, ?, ?, ?)',
        [s.id, s.client_id, text, forwardStatus, question?.id || null]);
      followupId = r.insertId;
      if (question) {
        const [q] = await conn.execute(
          "UPDATE cp_submission_questions SET status = 'answered', answered_at = NOW() WHERE id = ? AND status = 'open'", [question.id]);
        // Two answers sent at once: only the first one counts as the answer.
        if (!q.affectedRows) { const e = new Error('question already answered'); e.code = 'QUESTION_TAKEN'; throw e; }
      }
      if (flagged) {
        const reported = ((detail ? `${detail}\n\n` : '') + `What they added: ${text}`).slice(0, 5000);
        const [[open]] = await conn.execute(
          "SELECT id FROM cp_ae_review_tasks WHERE submission_id = ? AND client_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [s.id, s.client_id]);
        if (open) {
          await conn.execute("UPDATE cp_ae_review_tasks SET reported_detail = CONCAT_WS('\\n---\\n', reported_detail, ?) WHERE id = ?", [reported, open.id]);
          task = { id: open.id, created: false };
        } else {
          const [t] = await conn.execute(
            'INSERT INTO cp_ae_review_tasks (client_id, submission_id, reported_detail) VALUES (?, ?, ?)', [s.client_id, s.id, reported]);
          task = { id: t.insertId, created: true };
        }
        await auditWithin(conn, { adminId: null, name: 'portal' }, s.client_id,
          task.created ? 'AE_REVIEW_TASK_CREATED' : 'AE_REVIEW_TASK_UPDATED', 'submission', s.id, { task_id: task.id, followup_id: followupId });
      }
      await conn.commit();
    } catch (txErr) {
      await conn.rollback().catch(() => {});
      if (txErr.code === 'QUESTION_TAKEN') return refuse(409, 'This question has already been answered or was withdrawn.');
      throw txErr;
    } finally {
      conn.release();
    }
    if (task?.created) raiseSafetyTaskAlert(s.client_id, task.id, 'information added to a request');
    const attachmentIds = await storeAttachments(s.id, s.client_id, clientCode, req.files, blockedFiles);
    await recordStatusEvent({ submissionId: s.id, clientId: s.client_id, status: 'follow_up', source: 'portal' });
    systemAudit('portal', s.client_id, 'SUBMISSION_FOLLOW_UP', 'submission', s.id,
      { followup_id: followupId, files: attachmentIds.length, blocked: blockedFiles.length, ae_screen_answer: screenAnswer,
        ...(question ? { question_id: question.id } : {}) });

    res.status(201).json({
      message: question
        ? `Thank you. Your answer has been sent to the medical team.${flagged ? ' Our safety team will also review what you told us.' : ''}`
        : flagged
        ? 'Thank you. Your information has been added to your request, and our safety team will review what you told us.'
        : 'Thank you. Your information has been added to your request.',
      blocked_files: blockedFiles.map(b => b.file),
    });

    // After the reply: send it on to MIMS if the request is already there. If it is
    // not yet, the retry job sends it once the request has reached MIMS.
    if (forwardStatus === 'pending' && s.external_ref) {
      await forwardFollowUp(followupId).catch(err => log.error('portal.followup.forward_crashed', { err, followup_id: followupId }));
      for (const id of attachmentIds) {
        await forwardReleasedAttachment(id).catch(err => log.error('portal.followup.file_crashed', { err, attachment_id: id }));
      }
    }
  } catch (err) {
    log.error('portal.submit.error', { err, route: 'POST /:clientCode/submissions/:id/followups', path: req.path, request_id: req.requestId || null });
    if (!res.headersSent) res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/submit/:clientCode/submissions/:submissionId/reply — CPPM-63
// The person replies to the answer they received. Only on their own enquiry, only
// once an answer has been sent, and always with the PD-2 question "did anyone
// become unwell" on a screened type. A Yes raises a safety review task in the same
// transaction as the reply, so the reply is never accepted without it: an open task
// on the enquiry gains the new detail; otherwise a new task is raised for this reply
// (a closed task is never silently appended to). A reply to a closed enquiry reopens it.
const MAX_REPLIES_WAITING = 10;
router.post('/:clientCode/submissions/:submissionId/reply', authenticatePortal, requirePortalAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[client]] = await conn.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const body = String(req.body.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'Write your reply before sending it.', field: 'body' });
    if (body.length > 5000) return res.status(400).json({ error: 'Your reply is too long. Please keep it under 5,000 characters.', field: 'body' });

    // Someone else's enquiry looks exactly like one that does not exist.
    const [[sub]] = await conn.execute(
      'SELECT id, submission_type, status, external_ref FROM cp_submissions WHERE id = ? AND client_id = ? AND user_id = ?',
      [req.params.submissionId, client.id, req.portalUser.userId]);
    if (!sub) return res.status(404).json({ error: 'Request not found.' });
    // Bridge row 8: a request in MIMS is answered there; what the person says next goes
    // to the MIMS case as added information (row 9), not to a second answer path here.
    if (sub.external_ref) return res.status(409).json({ error: 'This request is with the medical team. Use "Add information" to tell them more.' });

    const [[answer]] = await conn.execute(
      "SELECT id FROM cp_submission_answers WHERE submission_id = ? AND status = 'sent'", [sub.id]);
    if (!answer) return res.status(409).json({ error: 'You can reply once our team has answered this request.' });

    const screen = { [AE_SCREEN_KEY]: req.body[AE_SCREEN_KEY], [AE_SCREEN_DETAIL_KEY]: req.body[AE_SCREEN_DETAIL_KEY] };
    const screenError = validateAnswer(sub.submission_type, screen);
    if (screenError) return res.status(400).json({ error: screenError, field: AE_SCREEN_KEY });
    const flagged = isFlagged(sub.submission_type, screen);
    const screenAnswer = isScreenedType(sub.submission_type) ? String(screen[AE_SCREEN_KEY]).trim() : null;
    const detail = flagged ? (String(screen[AE_SCREEN_DETAIL_KEY] || '').trim().slice(0, 5000) || null) : null;

    const [[waiting]] = await conn.execute(
      `SELECT COUNT(*) AS n FROM cp_submission_messages m
        WHERE m.submission_id = ? AND m.direction = 'in'
          AND m.created_at > IFNULL((SELECT MAX(x.sent_at) FROM cp_submission_messages x
                                      WHERE x.submission_id = m.submission_id AND x.direction = 'out' AND x.status = 'sent'), '1970-01-01')`,
      [sub.id]);
    if (waiting.n >= MAX_REPLIES_WAITING) {
      return res.status(429).json({ error: 'We have your earlier messages and our team will answer them. If someone has become unwell, please use the side effect report form.' });
    }

    await conn.beginTransaction();
    const [ins] = await conn.execute(
      `INSERT INTO cp_submission_messages (submission_id, client_id, direction, body, status, ae_screen_answer, ae_screen_detail)
       VALUES (?, ?, 'in', ?, 'received', ?, ?)`,
      [sub.id, client.id, body, screenAnswer, detail]);
    const replyId = ins.insertId;

    let task = null;
    if (flagged) {
      const reported = (detail ? `${detail}\n\n` : '') + `Their reply: ${body}`;
      const [[open]] = await conn.execute(
        "SELECT id FROM cp_ae_review_tasks WHERE submission_id = ? AND client_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [sub.id, client.id]);
      if (open) {
        await conn.execute(
          "UPDATE cp_ae_review_tasks SET reported_detail = CONCAT_WS('\\n---\\n', reported_detail, ?) WHERE id = ?",
          [reported.slice(0, 5000), open.id]);
        task = { id: open.id, created: false };
      } else {
        const [t] = await conn.execute(
          'INSERT INTO cp_ae_review_tasks (client_id, submission_id, reply_id, reported_detail) VALUES (?, ?, ?, ?)',
          [client.id, sub.id, replyId, reported.slice(0, 5000)]);
        task = { id: t.insertId, created: true };
      }
    }

    let reopenedTo = null;
    if (sub.status === 'closed') {
      // Back to where it was before it was closed — never to a state that would send it to MIMS again.
      const [[prev]] = await conn.execute(
        "SELECT status FROM cp_submission_status_events WHERE submission_id = ? AND status <> 'closed' ORDER BY id DESC LIMIT 1", [sub.id]);
      reopenedTo = prev?.status || 'submitted';
      await conn.execute("UPDATE cp_submissions SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'closed'", [reopenedTo, sub.id]);
    }
    // The audit lines go in the same transaction (CPPM-53): the reply, its safety
    // task and the reopening are recorded, or none of them happened. In the order
    // they happened, so the audit trail reads as the story.
    const portalActor = { adminId: null, name: 'portal' };
    await auditWithin(conn, portalActor, client.id, 'REPLY_RECEIVED', 'submission', sub.id, { reply_id: replyId, ae_screen_answer: screenAnswer });
    if (task) {
      await auditWithin(conn, portalActor, client.id, task.created ? 'AE_REVIEW_TASK_CREATED' : 'AE_REVIEW_TASK_UPDATED', 'submission', sub.id,
        { task_id: task.id, reply_id: replyId });
    }
    if (reopenedTo) {
      await auditWithin(conn, portalActor, client.id, 'STATUS_CHANGED', 'submission', sub.id, { status: reopenedTo, reason: 'reply' });
    }
    await conn.commit();
    // Bridge row 2: a new safety task is announced to the safety team.
    if (task?.created) raiseSafetyTaskAlert(client.id, task.id, 'a reply to an answer');

    if (reopenedTo) {
      await recordStatusEvent({ submissionId: sub.id, clientId: client.id, status: reopenedTo, note: REOPENED_NOTE, source: 'portal' });
    }

    res.status(201).json({
      message: flagged
        ? 'Thank you. Your reply has been sent, and our safety team will review what you told us.'
        : 'Thank you. Your reply has been sent to our team.',
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    log.error('portal.submit.reply_failed', { err, route: 'POST /:clientCode/submissions/:submissionId/reply', request_id: req.requestId || null });
    res.status(500).json({ error: 'Your reply could not be sent. Please try again.' });
  } finally {
    conn.release();
  }
});

// ── Integration sync helper ───────────────────────────────────

// CP form type → MIMS case_type. `other_inquiry` has NO MIMS equivalent
// (MIMS only models MI/AE/PC), so it is intentionally absent here and is never
// pushed — it stays CP-only on the admin screen. (Rohith decision, Gate 1 2026-07-10)
// Where this portal's screens are, for links that leave it (the same setting the alert emails use).
const FRONTEND_BASE = (process.env.CP_FRONTEND_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');

const FORM_TYPE_TO_CASE_TYPE = {
  medical_inquiry:   'MI',
  adverse_event:     'AE',
  product_complaint: 'PC',
};

// Build the MIMS /api/v1/cases payload from a CP submission's form_data.
// The portal captures the MINIMUM field set; MIMS triage completes the regulated
// fields (seriousness, causality, MedDRA, etc.). Reads the seeded CP field keys
// and tolerates the richer AE template's alternate keys as fallbacks.
// Local calendar date as 'YYYY-MM-DD'.
function toDateOnly(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// `used` collects every form key the payload reads, so the caller can send the rest
// as other answers.
function buildMimsPayload(formType, formData, submissionId, submittedAt, used = new Set()) {
  const caseType = FORM_TYPE_TO_CASE_TYPE[formType];
  const pick = (...keys) => {
    keys.forEach(k => used.add(k));
    for (const k of keys) {
      const v = formData[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
  };

  // FIX-3: clients configure their own form field keys (e.g. Novartis uses
  // `reporter_name`, `reporter_email`, `description`, `question`; the seed used
  // `first_name`, `email`, `event_description`, `inquiry_details`). Read a broad set
  // of aliases so real submissions carry their content into MIMS instead of syncing
  // an empty case. A single full-name field is split into first/last.
  const fullName = pick('reporter_name', 'name', 'full_name', 'contact_name');
  const nameParts = fullName ? String(fullName).trim().split(/\s+/) : [];
  const firstName = pick('first_name') || (nameParts.length ? nameParts[0] : null);
  const lastName  = pick('last_name')  || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : null);

  const payload = {
    case_type: caseType,
    intake_channel: 'Portal',
    reference: `CP-${String(submissionId).padStart(6, '0')}`,
    // CPPM-18: when the report first reached the company — it starts the
    // regulatory clock in MIMS. A side effect confirmed in the Safety Queue
    // carries the date it was originally reported; anything else, the day it was
    // submitted. Either way a sync that is retried days later keeps the true date.
    awareness_date: formData.awareness_date || (submittedAt ? toDateOnly(submittedAt) : null),
    // Bridge row 6: the earlier report this one was raised from (MIMS links the cases).
    ...(formData.related_reference ? { related_reference: formData.related_reference } : {}),
    reporter: {
      first_name:    firstName,
      last_name:     lastName,
      email:         pick('email', 'reporter_email', 'reporter_contact', 'contact_email'),
      phone:         pick('phone', 'reporter_phone', 'contact_phone'),
      organisation:  pick('organization', 'organisation', 'institution'),
      reporter_type: pick('reporter_type', 'user_type'),
    },
  };

  if (caseType === 'MI') {
    const question = pick('inquiry_details', 'question', 'question_details', 'question_summary', 'message', 'description', 'details');
    payload.description = question;
    // C2: populate the MIMS MI tab, not just the case description.
    payload.mi_intake = {
      mi_category:       pick('mi_category', 'category'),
      question_summary:  pick('question_summary', 'subject') || (question ? String(question).slice(0, 255) : null),
      detailed_question: question,
      // Bridge plan P2: MIMS matches the name to its product list.
      product_name:      pick('product', 'product_name', 'drug_name'),
    };
  } else if (caseType === 'AE') {
    payload.patient = {
      initials: pick('patient_initials'),
      age:      pick('patient_age', 'age'),
      gender:   pick('patient_sex', 'gender'),
    };
    const reaction = pick('event_description', 'description', 'reaction_description', 'event_details', 'details');
    payload.ae_intake = {
      suspect_drug_name:    pick('product_name', 'suspect_product', 'drug_name', 'product'),
      batch_lot_number:     pick('lot_number', 'batch_lot_number', 'batch_number', 'lot'),
      reaction_description: reaction,
      reaction_onset_date:  pick('event_date', 'onset_date', 'reaction_onset_date', 'date_of_event'),
      outcome:              pick('outcome'),
      // Bridge plan P2: the reporter's own answer; MIMS ticks the matching criteria as
      // reported, to be confirmed at triage.
      seriousness_reported: pick('seriousness', 'seriousness_criteria', 'serious'),
    };
    payload.description = reaction;
  } else if (caseType === 'PC') {
    const complaint = pick('complaint_details', 'complaint_description', 'description', 'details', 'complaint');
    payload.pc_intake = {
      product_name:          pick('product_name', 'product', 'drug_name'),
      batch_lot_number:      pick('lot_number', 'batch_lot_number', 'batch_number', 'lot'),
      complaint_category:    pick('complaint_category', 'complaint_type', 'category'),
      complaint_description: complaint,
      // Stored on the MIMS intake record. No MIMS complaint screen shows it, so it is
      // also left for the other answers (not added to `used`).
      purchase_date:         formData.purchase_date || null,
    };
    payload.description = complaint;
  }

  return payload;
}

// What MIMS said when it refused — its own error text, not just the status number,
// so an administrator reading Sync Health can tell a bad value from an outage.
async function refusalReason(r) {
  const body = await r.json().catch(() => null);
  const said = body && (body.error_description || body.error || body.message);
  return (said ? `MIMS refused it (HTTP ${r.status}): ${said}` : `MIMS refused it (HTTP ${r.status}).`).slice(0, 1000);
}

// C1: push a submission's stored attachments onto the linked MIMS case. Each file
// is independent — a failure on one is recorded on that file and never fatal to the sync.
// CPPM-39: only files ClamAV has cleared are forwarded; a held file goes later, on its
// own, when the background scan releases it (forwardReleasedAttachment below).
// Bridge row 3: each file keeps its own delivery state. A file that fails is retried by
// the MIMS retry job (mimsRetry) and raises an alert once the tries run out, instead of
// being written to the audit trail once and forgotten. MIMS stores a file it already
// has on that case only once, so a retry can never duplicate it.
async function forwardAttachments(integration, mimsCaseId, submissionId, headers, onlyAttachmentId = null) {
  const [atts] = await pool.execute(
    `SELECT id, file_name, file_path, mime_type, forward_attempts FROM cp_submission_attachments
      WHERE submission_id = ? AND scan_status = 'clean' AND forward_status IN ('pending', 'failed')${onlyAttachmentId ? ' AND id = ?' : ''}`,
    onlyAttachmentId ? [submissionId, onlyAttachmentId] : [submissionId]
  );
  if (!atts.length) return;
  // Multipart: carry only the auth header — fetch sets the multipart Content-Type + boundary.
  const authHeaders = {};
  if (headers['Authorization']) authHeaders['Authorization'] = headers['Authorization'];
  if (headers['X-API-Key']) authHeaders['X-API-Key'] = headers['X-API-Key'];

  for (const a of atts) {
    let reason = null, mimsAttachmentId = null, retryable = true;
    try {
      const abs = path.join(__dirname, '../../', a.file_path.replace(/^\//, ''));
      if (!fs.existsSync(abs)) {
        reason = 'The file is missing from the portal\'s own storage, so it cannot be sent.';
        retryable = false;
      } else {
        const fd = new FormData();
        fd.append('file', new Blob([fs.readFileSync(abs)], { type: a.mime_type || 'application/octet-stream' }), a.file_name || 'attachment');
        const url = new URL(`/api/v1/cases/${encodeURIComponent(mimsCaseId)}/attachments`, integration.api_base_url).toString();
        const r = await safeFetch(url, { method: 'POST', headers: authHeaders, body: fd });
        if (r.ok) mimsAttachmentId = (await r.json().catch(() => ({}))).id || null;
        else reason = await refusalReason(r);
      }
    } catch (err) {
      reason = err.message;
    }

    if (!reason) {
      await pool.execute(
        `UPDATE cp_submission_attachments
            SET forward_status = 'forwarded', forward_attempts = forward_attempts + 1, forward_error = NULL,
                forwarded_at = NOW(), last_forward_at = NOW(), mims_attachment_id = ?
          WHERE id = ?`, [mimsAttachmentId, a.id]);
      systemAudit('MIMS integration', integration.client_id, 'ATTACHMENT_FORWARDED', 'submission', submissionId,
        { attachment: a.file_name, mims_case_id: mimsCaseId, mims_attachment_id: mimsAttachmentId });
      clearAlerts(integration.client_id, `file:${a.id}`, 'system: the file reached MIMS');
      continue;
    }

    // A file that is gone cannot be fixed by trying again: use up the tries now so the
    // alert goes out straight away.
    const attempts = retryable ? a.forward_attempts + 1 : Math.max(a.forward_attempts + 1, MAX_SYNC_ATTEMPTS);
    await pool.execute(
      `UPDATE cp_submission_attachments
          SET forward_status = 'failed', forward_attempts = ?, forward_error = ?, last_forward_at = NOW()
        WHERE id = ?`, [attempts, String(reason).slice(0, 1000), a.id]);
    systemAudit('MIMS integration', integration.client_id, 'ATTACHMENT_FAILED', 'submission', submissionId,
      { attachment: a.file_name, mims_case_id: mimsCaseId, attempt: attempts, error: reason });
    if (attempts >= MAX_SYNC_ATTEMPTS) {
      const ref = `CP-${String(submissionId).padStart(6, '0')}`;
      await raiseAlert(integration.client_id, {
        kind: 'file_not_delivered', audience: 'integration',
        title: `A file sent with ${ref} has not reached MIMS`,
        body: `"${a.file_name}" is not on MIMS case ${mimsCaseId} after ${attempts} tries. Reason: ${asSentence(reason)} It is on the Sync Health page, where it can be sent again.`,
        linkPath: `/admin/clients/${integration.client_id}/sync-health`,
        relatedType: 'submission', relatedId: submissionId, dedupeKey: `file:${a.id}`,
      });
    }
  }
}

// Admin-configured field mappings override/extend the defaults, then every other
// answer goes along under its question. Used for real reports and for the connection
// test's trial report (bridge feature F4), so both are built the same way.
async function addMappedAndOtherAnswers({ clientId, integrationId, formType, formData, payload, used }) {
  const [mappings] = await pool.execute('SELECT * FROM cp_field_mapping WHERE client_id = ? AND integration_id = ? AND form_type = ?',
    [clientId, integrationId, formType]);
  // NEW-C: dot-path targets (e.g. `reporter.first_name`, `ae_intake.outcome`) write into
  // the nested payload the MIMS API actually reads — a flat assignment would silently no-op.
  for (const m of mappings) {
    let value = formData[m.cp_field] ?? m.default_value ?? null;
    if (value && m.transform === 'uppercase') value = String(value).toUpperCase();
    if (value && m.transform === 'date_iso') value = new Date(value).toISOString();
    const segs = String(m.target_field).split('.');
    let obj = payload;
    while (segs.length > 1) {
      const k = segs.shift();
      if (!obj[k] || typeof obj[k] !== 'object') obj[k] = {};
      obj = obj[k];
    }
    obj[segs[0]] = value;
    used.add(m.cp_field);
  }

  // Bridge plan P2: every other answer reaches the case, under its question as the
  // person saw it. Before, anything the payload did not name was dropped.
  const { fields } = await loadFormFields(clientId, formType);
  const labelOf = Object.fromEntries(fields.map(f => [f.field_key, f.label]));
  const other = Object.entries(formData)
    .filter(([k, v]) => !used.has(k) && !NOT_OTHER_ANSWER.test(k) && v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => ({
      question: String(labelOf[k] || k).slice(0, 200),
      answer: (Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v === false ? 'No' : String(v)).slice(0, 2000),
    }));
  if (other.length) payload.other_answers = other.slice(0, 50);
  return other;
}

async function syncToIntegration(clientId, submissionId, formType) {
  // other_inquiry has no MIMS case type — it is never pushed (CP-only). Gate 1 decision.
  if (!Object.prototype.hasOwnProperty.call(FORM_TYPE_TO_CASE_TYPE, formType)) return;

  // CPPM-8: preparing the case (lookups, parsing, the client's field mappings) can
  // fail before anything is sent — a DB blip, damaged form data, a mapping with a
  // bad date. It used to throw out of here with the row still 'submitted', which
  // the retry job never looks at, so the report was never sent and never seen.
  // Any failure while preparing is now recorded as failed_sync and counted as an
  // attempt, so it joins the retry queue and stays visible.
  let integration, payload;
  try {
    // AC3: no active integration configured for this client → stay CP-only, no MIMS call.
    [[integration]] = await pool.execute('SELECT * FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1', [clientId]);
    if (!integration) return;

    const [[submission]] = await pool.execute('SELECT * FROM cp_submissions WHERE id = ?', [submissionId]);
    if (!submission) return;

    const formData = typeof submission.form_data === 'string' ? JSON.parse(submission.form_data) : submission.form_data;

    // Default structured payload — works out-of-the-box for the seeded portal forms.
    const used = new Set(['awareness_date', 'related_reference']);
    payload = buildMimsPayload(formType, formData, submissionId, submission.submitted_at, used);

    // Post-merge review: this request's own key, so MIMS never hands it another report's
    // case that happens to have the same number (a portal set up again, or a second
    // database on the same connection, numbers from the start). Given once, kept.
    let syncKey = submission.sync_key;
    if (!syncKey) {
      await pool.execute('UPDATE cp_submissions SET sync_key = ? WHERE id = ? AND sync_key IS NULL', [require('crypto').randomUUID(), submissionId]);
      [[{ sync_key: syncKey }]] = await pool.execute('SELECT sync_key FROM cp_submissions WHERE id = ?', [submissionId]);
    }
    payload.source_key = syncKey;
    // The request a confirmed side effect was raised from, by its key as well.
    const relatedId = Number(String(formData.related_reference || '').replace(/^CP-0*/, ''));
    if (relatedId) {
      const [[rel]] = await pool.execute('SELECT sync_key FROM cp_submissions WHERE id = ? AND client_id = ?', [relatedId, clientId]);
      if (rel?.sync_key) payload.related_source_key = rel.sync_key;
    }

    // Bridge feature F1: the request's own page on this portal, opened from the MIMS case.
    payload.source_link = `${FRONTEND_BASE}/admin/clients/${clientId}/submissions?search=${payload.reference}`;
    // Bridge feature F3: only a person who was signed in can see and answer a question.
    payload.reporter_can_reply = !!submission.user_id;

    await addMappedAndOtherAnswers({ clientId, integrationId: integration.id, formType, formData, payload, used });
    // Bridge plan P5: MIMS checks the report arrived as sent, and answers with the same value.
    payload.payload_sha256 = reportFingerprint(payload);
  } catch (err) {
    const reason = `Could not prepare the MIMS case: ${err.message}`.slice(0, 1000);
    log.error('portal.sync.prepare_failed', { err, client_id: clientId, submission_id: submissionId });
    await pool.execute(`UPDATE cp_submissions SET status='failed_sync', sync_attempts=sync_attempts+1, sync_error=? WHERE id=?`, [reason, submissionId]);
    await recordStatusEvent({ submissionId, clientId, status: 'failed_sync', note: reason, source: 'mims-sync' });
    systemAudit('MIMS integration', clientId, 'SYNC_FAILED', 'submission', submissionId, { error: reason, stage: 'prepare' });
    // Retrying the same mapping gives the same answer, so the team is told now, not
    // after the six automatic tries (about half an hour of silence).
    await alertIfStuck(clientId, submissionId, reason, { unpreparable: true });
    return;
  }

  try {
    await pool.execute(`UPDATE cp_submissions SET status='pending_sync', sync_attempts=sync_attempts+1 WHERE id=?`, [submissionId]);
    await recordStatusEvent({ submissionId, clientId, status: 'pending_sync', source: 'mims-sync' });
    const safeBaseUrl = await assertSafeOutboundUrl(integration.api_base_url);

    const buildHeaders = async () => {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(integration)) };
      if (integration.extra_headers) Object.assign(headers, JSON.parse(integration.extra_headers));
      return headers;
    };
    let headers = await buildHeaders();

    // MIMS machine-to-machine intake endpoint (API-key auth). Was /api/cases (the
    // internal user-JWT route); retargeted to the purpose-built partner endpoint.
    const postCase = () => safeFetch(new URL('/api/v1/cases', safeBaseUrl).toString(), {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    let r = await postCase();

    // NEW-D: a cached OAuth token can be revoked/expired server-side — mint a
    // fresh one and retry exactly once before recording a failure.
    if (r.status === 401 && integration.auth_type === 'oauth') {
      await invalidateAuth(integration.id);
      headers = await buildHeaders();
      r = await postCase();
    }

    // Bridge row 7: MIMS answered (a 5xx means MIMS itself is failing, so it counts
    // against the connection; any other answer proves the line works).
    await recordConnectionResult(integration, r.status < 500, r.status < 500 ? null : `MIMS answered HTTP ${r.status}.`);

    const data = r.ok ? await r.json().catch(() => ({})) : null;
    const mimsCaseId = data ? (data.case_id || data.id || null) : null;
    // Bridge plan P5: a success that names no case is not a delivery. It was recorded
    // as delivered with no link, and the report was never followed again.
    if (r.ok && !mimsCaseId) {
      const reason = 'MIMS said it accepted the report but gave no case number, so delivery cannot be confirmed.';
      await pool.execute(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`, [reason, submissionId]);
      await recordStatusEvent({ submissionId, clientId, status: 'failed_sync', note: reason, source: 'mims-sync' });
      systemAudit('MIMS integration', clientId, 'SYNC_FAILED', 'submission', submissionId, { error: reason, status: r.status });
      await alertIfStuck(clientId, submissionId, reason);
      return;
    }
    if (r.ok) {
      // The receipt: MIMS's case number and the fingerprint of what it received. A
      // repeat of an earlier report returns that report's fingerprint; if it differs
      // from what was sent now, MIMS holds an older version and a person must look.
      // The earlier receipt is kept: it is still true of what MIMS holds.
      const theirs = typeof data.fingerprint === 'string' ? data.fingerprint : null;
      const matches = theirs === payload.payload_sha256;
      await pool.execute(
        `UPDATE cp_submissions SET status='synced', external_ref=?, mims_case_number=?, mims_fingerprint=COALESCE(?, mims_fingerprint), synced_at=NOW(), sync_error=null WHERE id=?`,
        [mimsCaseId, data.case_number ? String(data.case_number).slice(0, 100) : null, matches ? theirs : null, submissionId]);
      if (theirs && !matches) {
        systemAudit('MIMS integration', clientId, 'RECEIPT_MISMATCH', 'submission', submissionId,
          { mims_case_id: mimsCaseId, sent: payload.payload_sha256, mims_holds: theirs });
        await raiseAlert(clientId, {
          kind: 'receipt_mismatch', audience: 'integration',
          title: `MIMS holds a different version of ${`CP-${String(submissionId).padStart(6, '0')}`}`,
          body: `The report was sent again and MIMS matched it to case ${data.case_number || mimsCaseId}, which was created from a different version of it. Compare the request with the MIMS case and update the case by hand if needed.`,
          linkPath: `/admin/clients/${clientId}/sync-health`,
          relatedType: 'submission', relatedId: submissionId, dedupeKey: `receipt:${submissionId}:${theirs}`,
        });
      }
      await recordStatusEvent({ submissionId, clientId, status: 'synced', source: 'mims-sync' });
      systemAudit('MIMS integration', clientId, 'SYNCED', 'submission', submissionId, { mims_case_id: mimsCaseId });
      clearAlerts(clientId, `sync:${submissionId}`, 'system: the report reached MIMS');
      // C1: forward any attachments onto the MIMS case (non-fatal per file).
      if (mimsCaseId) await forwardAttachments(integration, mimsCaseId, submissionId, headers);
    } else {
      const reason = await refusalReason(r);
      await pool.execute(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`, [reason, submissionId]);
      await recordStatusEvent({ submissionId, clientId, status: 'failed_sync', note: reason, source: 'mims-sync' });
      systemAudit('MIMS integration', clientId, 'SYNC_FAILED', 'submission', submissionId, { error: reason, status: r.status });
      // 4xx other than sign-in, timeout and rate limit: MIMS looked at the report and
      // said no. Retrying the same data gets the same answer, so say so now.
      await alertIfStuck(clientId, submissionId, reason, { refused: r.status >= 400 && r.status < 500 && ![401, 408, 429].includes(r.status) });
    }
  } catch (err) {
    await recordConnectionResult(integration, false, err.message);
    await pool.execute(`UPDATE cp_submissions SET status='failed_sync', sync_error=? WHERE id=?`, [err.message, submissionId]);
    await recordStatusEvent({ submissionId, clientId, status: 'failed_sync', note: err.message, source: 'mims-sync' });
    systemAudit('MIMS integration', clientId, 'SYNC_FAILED', 'submission', submissionId, { error: err.message });
    await alertIfStuck(clientId, submissionId, err.message);
  }
}

const TYPE_LABEL = { medical_inquiry: 'medical enquiry', adverse_event: 'side-effect report', product_complaint: 'product complaint' };

// Bridge row 2: tell the client's team when a report is not getting through — at once
// if MIMS refused it outright, otherwise when the automatic retries are used up.
// One alert per report; it closes itself when the report reaches MIMS.
async function alertIfStuck(clientId, submissionId, reason, { refused = false, unpreparable = false } = {}) {
  try {
    const [[s]] = await pool.execute('SELECT sync_attempts, submission_type FROM cp_submissions WHERE id = ?', [submissionId]);
    if (!s || (!refused && !unpreparable && s.sync_attempts < MAX_SYNC_ATTEMPTS)) return;
    const ref = `CP-${String(submissionId).padStart(6, '0')}`;
    const what = TYPE_LABEL[s.submission_type] || 'report';
    const Title = `${what[0].toUpperCase()}${what.slice(1)} ${ref}`;
    await raiseAlert(clientId, {
      kind: refused ? 'sync_refused' : unpreparable ? 'sync_unpreparable' : 'sync_gave_up', audience: 'integration',
      title: refused ? `MIMS refused ${what} ${ref}` : unpreparable ? `${Title} could not be prepared for MIMS` : `${Title} has not reached MIMS after ${s.sync_attempts} tries`,
      body: `Reason: ${asSentence(reason)} ${unpreparable ? 'Sending again will fail the same way until the field mapping on the Integration page is fixed.' : ''}It is on the Sync Health page, where it can be sent again once the cause is fixed.`,
      linkPath: `/admin/clients/${clientId}/sync-health`,
      relatedType: 'submission', relatedId: submissionId, dedupeKey: `sync:${submissionId}`,
    });
  } catch (err) {
    log.error('portal.sync.alert_failed', { err, submission_id: submissionId });
  }
}

// Bridge row 2: a new safety task is announced to the safety team straight away.
// Reference and link only — what the person reported is read in the portal.
function raiseSafetyTaskAlert(clientId, taskId, source) {
  return raiseAlert(clientId, {
    kind: 'safety_task_new', audience: 'safety',
    title: `New safety task #${taskId} to review`,
    body: `Someone said they became unwell, through ${source}. Open the Safety Queue to review it.`,
    linkPath: `/admin/clients/${clientId}/safety-queue`,
    relatedType: 'ae_review_task', relatedId: taskId, dedupeKey: `safety_new:${taskId}`,
  });
}

// GET /api/portal/submit/:clientCode/attachments/:attachmentId — download own submission's attachment
router.get('/:clientCode/attachments/:attachmentId', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[att]] = await pool.execute(
      `SELECT a.file_name, a.file_path, a.mime_type, a.scan_status
       FROM cp_submission_attachments a
       JOIN cp_submissions s ON s.id = a.submission_id
       JOIN cp_clients c ON c.id = a.client_id
       WHERE a.id = ? AND c.code = ? AND s.user_id = ?`,
      [req.params.attachmentId, req.params.clientCode, req.portalUser.userId]);
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });
    const refusal = downloadRefusal(att.scan_status); // CPPM-39
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });
    streamAttachment(res, att, req.query.disposition === 'inline');
  } catch (err) {
    log.error('portal.submit.error', { err, route: 'GET /:clientCode/attachments/:attachmentId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// CPPM-39: a held file the background scan has just cleared. If its report already
// reached MIMS, send this one file to the case now; if not, the sync will take it,
// because it is 'clean' by the time the sync reads the attachments.
async function forwardReleasedAttachment(attachmentId) {
  const [[row]] = await pool.execute(
    `SELECT a.submission_id, s.client_id, s.external_ref
       FROM cp_submission_attachments a JOIN cp_submissions s ON s.id = a.submission_id
      WHERE a.id = ? AND a.scan_status = 'clean' AND s.status IN ('synced', 'closed') AND s.external_ref IS NOT NULL`,
    [attachmentId]);
  if (!row) return;
  const [[integration]] = await pool.execute(
    'SELECT * FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1', [row.client_id]);
  if (!integration) return;
  const headers = { ...(await getAuthHeaders(integration)) };
  if (integration.extra_headers) Object.assign(headers, JSON.parse(integration.extra_headers));
  await forwardAttachments(integration, row.external_ref, row.submission_id, headers, attachmentId);
}

// Bridge row 9: send one follow-up to its MIMS case as a case comment. MIMS keys it on
// our follow-up id, so a retry after a lost reply never adds the comment twice.
async function forwardFollowUp(followupId) {
  const [[f]] = await pool.execute(
    `SELECT f.id, f.body, f.forward_attempts, f.submission_id, s.client_id, s.external_ref, q.mims_question_id
       FROM cp_submission_followups f JOIN cp_submissions s ON s.id = f.submission_id
       LEFT JOIN cp_submission_questions q ON q.id = f.question_id AND q.submission_id = f.submission_id
      WHERE f.id = ? AND f.forward_status IN ('pending', 'failed') AND s.external_ref IS NOT NULL`, [followupId]);
  if (!f) return;
  const [[integration]] = await pool.execute(
    'SELECT * FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1', [f.client_id]);
  if (!integration) return;
  const ref = `CP-${String(f.submission_id).padStart(6, '0')}`;

  let reason = null, commentId = null, retryable = true;
  try {
    const safeBaseUrl = await assertSafeOutboundUrl(integration.api_base_url);
    const buildHeaders = async () => {
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(integration)) };
      if (integration.extra_headers) Object.assign(headers, JSON.parse(integration.extra_headers));
      return headers;
    };
    let headers = await buildHeaders();
    const post = () => safeFetch(new URL(`/api/v1/cases/${encodeURIComponent(f.external_ref)}/follow-ups`, safeBaseUrl).toString(), {
      method: 'POST', headers, body: JSON.stringify({ text: f.body, followup_id: `cp-followup-${f.id}`, reference: ref,
        // Bridge feature F3: this answers a question MIMS asked.
        ...(f.mims_question_id ? { question_id: f.mims_question_id } : {}) }),
    });
    let r = await post();
    if (r.status === 401 && integration.auth_type === 'oauth') {
      await invalidateAuth(integration.id);
      headers = await buildHeaders();
      r = await post();
    }
    await recordConnectionResult(integration, r.status < 500, r.status < 500 ? null : `MIMS answered HTTP ${r.status}.`);
    if (r.ok) commentId = (await r.json().catch(() => ({}))).id || null;
    else {
      reason = await refusalReason(r);
      // The case is gone or no longer this connection's: trying again cannot help.
      if (r.status === 404 || r.status === 403) retryable = false;
    }
  } catch (err) {
    reason = err.message;
    await recordConnectionResult(integration, false, err.message);
  }

  if (!reason) {
    await pool.execute(
      `UPDATE cp_submission_followups
          SET forward_status = 'forwarded', forward_attempts = forward_attempts + 1, forward_error = NULL,
              last_forward_at = NOW(), mims_comment_id = ?
        WHERE id = ?`, [commentId, f.id]);
    systemAudit('MIMS integration', f.client_id, 'FOLLOW_UP_FORWARDED', 'submission', f.submission_id,
      { followup_id: f.id, mims_case_id: f.external_ref, mims_comment_id: commentId });
    clearAlerts(f.client_id, `followup:${f.id}`, 'system: the follow-up reached MIMS');
    return;
  }
  const attempts = retryable ? f.forward_attempts + 1 : Math.max(f.forward_attempts + 1, MAX_SYNC_ATTEMPTS);
  await pool.execute(
    `UPDATE cp_submission_followups
        SET forward_status = 'failed', forward_attempts = ?, forward_error = ?, last_forward_at = NOW()
      WHERE id = ?`, [attempts, String(reason).slice(0, 1000), f.id]);
  systemAudit('MIMS integration', f.client_id, 'FOLLOW_UP_FAILED', 'submission', f.submission_id,
    { followup_id: f.id, mims_case_id: f.external_ref, attempt: attempts, error: reason });
  if (attempts >= MAX_SYNC_ATTEMPTS) {
    await raiseAlert(f.client_id, {
      kind: 'followup_not_delivered', audience: 'integration',
      title: `Information added to ${ref} has not reached MIMS`,
      body: `The reporter added information that is not on MIMS case ${f.external_ref} after ${attempts} tries. Reason: ${asSentence(reason)} It is on the Sync Health page, where it can be sent again.`,
      linkPath: `/admin/clients/${f.client_id}/sync-health`,
      relatedType: 'submission', relatedId: f.submission_id, dedupeKey: `followup:${f.id}`,
    });
  }
}

module.exports = router;
// R1: exposed so the retry poller can re-drive a failed sync without duplicating logic.
module.exports.syncToIntegration = syncToIntegration;
module.exports.forwardReleasedAttachment = forwardReleasedAttachment;
module.exports.toDateOnly = toDateOnly;
module.exports.raiseSafetyTaskAlert = raiseSafetyTaskAlert;
module.exports.forwardFollowUp = forwardFollowUp;
module.exports.buildMimsPayload = buildMimsPayload;
module.exports.addMappedAndOtherAnswers = addMappedAndOtherAnswers;
module.exports.FORM_TYPE_TO_CASE_TYPE = FORM_TYPE_TO_CASE_TYPE;
