/**
 * Portal Training — /api/portal/training (CPPM-15)
 *
 * A signed-in doctor opens a module, reads its document, answers its questions and
 * gets a result. Answers are marked here; the right answers never leave the server.
 * Every attempt is recorded, pass or fail. A pass gets a reference, and only the
 * person who passed can download its certificate.
 *
 * The public module list stays at GET /api/portal/content/:clientCode/training.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const training = require('../../services/training');
const log = require('../../utils/logger');

router.use(authenticatePortal, requirePortalAuth);

// The module, if it belongs to this signed-in person's portal and they may take it now.
// Returns { module, document } or { status, error }.
async function openModule(req) {
  const [[client]] = await pool.execute('SELECT id, name FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
  if (!client || client.id !== req.portalUser.clientId) return { status: 404, error: 'Module not found.' };
  const [[module]] = await pool.execute(
    'SELECT * FROM cp_training_modules WHERE id = ? AND client_id = ? AND is_active = 1', [req.params.moduleId, client.id]);
  if (!module) return { status: 404, error: 'Module not found.' };
  if (module.status !== training.AVAILABLE || await training.questionCount(pool, module.id) === 0) {
    return { status: 409, error: 'This module is not open yet.' };
  }
  const document = await training.readableDocument(pool, module, req.portalUser.user_type || 'other');
  if (!document) return { status: 409, error: 'This module is not available to your account.' };
  return { client, module, document };
}

const myAttemptsSql = `SELECT id, module_id, module_version, score, pass_score, passed, reference, ${training.TAKEN_AT_SQL}
                         FROM cp_training_attempts WHERE portal_user_id = ? AND client_id = ?`;

// GET /api/portal/training/:clientCode/mine — this person's attempts, newest first.
router.get('/:clientCode/mine', async (req, res) => {
  try {
    const [rows] = await pool.execute(`${myAttemptsSql} ORDER BY id DESC`, [req.portalUser.userId, req.portalUser.clientId]);
    res.json({ attempts: rows });
  } catch (err) {
    log.error('portal.training.error', { err, route: 'GET /:clientCode/mine', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/training/:clientCode/modules/:moduleId — the module to take, its
// document and its questions without the answers, and this person's earlier attempts.
router.get('/:clientCode/modules/:moduleId', async (req, res) => {
  try {
    const open = await openModule(req);
    if (open.error) return res.status(open.status).json({ error: open.error });
    const { module, document } = open;
    const [questions] = await pool.execute(
      'SELECT id, question, options_json FROM cp_training_questions WHERE module_id = ? ORDER BY sort_order, id', [module.id]);
    const [attempts] = await pool.execute(`${myAttemptsSql} AND module_id = ? ORDER BY id DESC`,
      [req.portalUser.userId, module.client_id, module.id]);
    res.json({
      module: { id: module.id, title: module.title, type: module.type, duration: module.duration, pass_score: module.pass_score, version: module.version },
      document,
      questions: questions.map(q => ({ id: q.id, question: q.question, options: JSON.parse(q.options_json) })),
      attempts,
    });
  } catch (err) {
    log.error('portal.training.error', { err, route: 'GET /:clientCode/modules/:moduleId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/training/:clientCode/modules/:moduleId/attempts { answers: { questionId: optionIndex } }
router.post('/:clientCode/modules/:moduleId/attempts', async (req, res) => {
  try {
    const open = await openModule(req);
    if (open.error) return res.status(open.status).json({ error: open.error });
    const { module } = open;
    const [questions] = await pool.execute(
      'SELECT id, question, options_json, correct_index FROM cp_training_questions WHERE module_id = ? ORDER BY sort_order, id', [module.id]);
    const marked = training.mark(questions, req.body?.answers);
    if (!marked) return res.status(400).json({ error: 'Answer every question before submitting.' });

    const [[person]] = await pool.execute(
      'SELECT first_name, last_name, email FROM cp_portal_users WHERE id = ? AND client_id = ?', [req.portalUser.userId, module.client_id]);
    const passed = marked.score >= module.pass_score;
    const reference = passed ? training.newReference() : null;
    await pool.execute(
      `INSERT INTO cp_training_attempts
         (client_id, module_id, module_version, module_title, portal_user_id, person_name, person_email,
          score, pass_score, passed, answers_json, reference, taken_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [module.client_id, module.id, module.version, module.title, req.portalUser.userId,
       `${person.first_name} ${person.last_name}`.trim(), person.email,
       marked.score, module.pass_score, passed ? 1 : 0, JSON.stringify(marked.record), reference]);
    res.json({ score: marked.score, pass_score: module.pass_score, passed, reference });
  } catch (err) {
    log.error('portal.training.error', { err, route: 'POST /:clientCode/modules/:moduleId/attempts', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/training/:clientCode/certificates/:reference — the PDF, for the
// person who passed only. Anyone else gets the same answer as a reference that does not exist.
router.get('/:clientCode/certificates/:reference', async (req, res) => {
  try {
    const [[attempt]] = await pool.execute(
      `SELECT a.person_name, a.module_title, a.module_version, a.score, a.pass_score, a.reference,
              ${training.TAKEN_AT_SQL}, c.name AS client_name
         FROM cp_training_attempts a JOIN cp_clients c ON c.id = a.client_id
        WHERE a.reference = ? AND a.passed = 1 AND a.portal_user_id = ? AND a.client_id = ? AND c.code = ?`,
      [String(req.params.reference).toUpperCase(), req.portalUser.userId, req.portalUser.clientId, req.params.clientCode]);
    if (!attempt) return res.status(404).json({ error: 'Certificate not found.' });
    training.writeCertificate(res, attempt, attempt.client_name);
  } catch (err) {
    log.error('portal.training.error', { err, route: 'GET /:clientCode/certificates/:reference', path: req.path, request_id: req.requestId || null });
    if (!res.headersSent) res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
