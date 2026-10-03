'use strict';

/**
 * Admin CME & REMS Training — /api/admin/training
 * CRUD management of educational modules per tenant client.
 *
 * CPPM-15: each module has a document to read and multiple-choice questions, and
 * every attempt a doctor makes is recorded. A module can be made Available only
 * once it has both (services/training.js); a module with attempts cannot be
 * deleted, because those attempts are the evidence of who is trained.
 */

const express = require('express');
const router  = express.Router();
const cache = require('../../utils/cache');
// CPPM-121: the portal keeps its settings for 20 seconds (CP-22). A successful write
// here changes what the portal offers — a page switched on or off, or a trial or
// training module that decides whether its page shows — so the copy is cleared at once.
router.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) cache.invalidate('config:'); });
  next();
});
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');
const { audit, changesBetween } = require('../../utils/audit');
const training = require('../../services/training');

// null when fine; otherwise why the chosen document cannot be the module's reading.
async function documentError(clientId, documentId) {
  if (documentId === null || documentId === undefined || documentId === '') return null;
  const [[doc]] = await pool.execute(
    'SELECT id FROM cp_documents WHERE id = ? AND client_id = ? AND is_active = 1', [documentId, clientId]);
  return doc ? null : 'Choose a document from this client’s library.';
}

async function findModule(req) {
  const [[m]] = await pool.execute(
    'SELECT * FROM cp_training_modules WHERE id = ? AND client_id = ?', [req.params.moduleId, req.params.clientId]);
  return m || null;
}

// GET /api/admin/training/:clientId — list modules for client
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT m.*, d.title AS document_title,
              (SELECT COUNT(*) FROM cp_training_questions q WHERE q.module_id = m.id) AS question_count,
              (SELECT COUNT(*) FROM cp_training_attempts a WHERE a.module_id = m.id AND a.client_id = m.client_id) AS attempt_count,
              (SELECT COUNT(*) FROM cp_training_attempts a WHERE a.module_id = m.id AND a.client_id = m.client_id AND a.passed = 1) AS pass_count
         FROM cp_training_modules m
         LEFT JOIN cp_documents d ON d.id = m.document_id AND d.client_id = m.client_id
        WHERE m.client_id = ?
        ORDER BY m.id DESC`,
      [req.params.clientId]
    );
    res.json({ modules: rows });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/training/:clientId/completions?module_id=&result=pass|fail&reference=
// CPPM-15: every attempt — who, which module and version, score, result, when.
function completionsQuery(req) {
  let sql = `SELECT id, module_id, module_title, module_version, person_name, person_email,
                    score, pass_score, passed, reference, ${training.TAKEN_AT_SQL}
               FROM cp_training_attempts WHERE client_id = ?`;
  const params = [req.params.clientId];
  if (req.query.module_id) { sql += ' AND module_id = ?'; params.push(req.query.module_id); }
  if (req.query.result === 'pass') sql += ' AND passed = 1';
  if (req.query.result === 'fail') sql += ' AND passed = 0';
  if (req.query.reference) { sql += ' AND reference = ?'; params.push(String(req.query.reference).trim().toUpperCase()); }
  return { sql: `${sql} ORDER BY id DESC`, params };
}

router.get('/:clientId/completions', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { sql, params } = completionsQuery(req);
    const [rows] = await pool.execute(sql, params);
    res.json({ completions: rows });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'GET /:clientId/completions', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/training/:clientId/completions/export — the same list as CSV.
// The export itself is recorded in the audit trail.
router.get('/:clientId/completions/export', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { sql, params } = completionsQuery(req);
    const [rows] = await pool.execute(sql, params);
    // Quoted, quotes doubled, and a leading = + - @ neutralised so a spreadsheet
    // never runs a value as a formula (as in analytics.js).
    const cell = v => {
      const s = String(v ?? '');
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const header = ['Taken at (UTC)', 'Person', 'Email', 'Module', 'Version', 'Score %', 'Pass mark %', 'Result', 'Reference'];
    const lines = rows.map(r => [
      r.taken_at, r.person_name, r.person_email, r.module_title, r.module_version,
      r.score, r.pass_score, r.passed ? 'Passed' : 'Failed', r.reference || '',
    ].map(cell).join(','));
    await audit(req.admin, req.params.clientId, 'EXPORT', 'training_completions', null, {
      rows: rows.length, module_id: req.query.module_id || null, result: req.query.result || null, reference: req.query.reference || null,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="training-completions-${req.params.clientId}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header.map(cell).join(','), ...lines].join('\r\n'));
  } catch (err) {
    log.error('admin.training.error', { err, route: 'GET /:clientId/completions/export', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/training/:clientId — add training module
router.post('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { title, type, duration, credits, pass_score, status, document_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    // CPPM-15: a new module has no questions yet, so it starts as Coming soon.
    if (status === training.AVAILABLE) return res.status(400).json({ error: training.NOT_READY_MESSAGE });
    const docErr = await documentError(req.params.clientId, document_id);
    if (docErr) return res.status(400).json({ error: docErr });
    const [result] = await pool.execute(
      `INSERT INTO cp_training_modules (client_id, title, type, duration, credits, pass_score, status, document_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, title, type || 'CME Accredited', duration || '30 mins', credits || '', Number(pass_score) || 80, status || 'Coming soon', document_id || null]
    );
    await audit(req.admin, req.params.clientId, 'CREATE', 'training_module', result.insertId, { title });
    res.json({ id: result.insertId, message: 'Training module created.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/training/:clientId/:moduleId — correct or close an entry (CPPM-33)
router.put('/:clientId/:moduleId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const ALLOWED = ['title', 'type', 'duration', 'credits', 'pass_score', 'status', 'document_id'];
    const sets = [], values = [];
    for (const f of ALLOWED) {
      if (req.body[f] === undefined) continue;
      sets.push(`${f} = ?`);
      if (f === 'pass_score') values.push(Number(req.body[f]) || 0);
      else if (f === 'document_id') values.push(req.body[f] === '' || req.body[f] === null ? null : Number(req.body[f]));
      else values.push(String(req.body[f]).trim());
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    if (req.body.title !== undefined && !String(req.body.title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });

    const before = await findModule(req);
    if (!before) return res.status(404).json({ error: 'Not found.' });
    const docErr = await documentError(req.params.clientId, req.body.document_id);
    if (docErr) return res.status(400).json({ error: docErr });
    // CPPM-15: Available means doctors can take it, so it needs questions and a document.
    const nextStatus = req.body.status !== undefined ? String(req.body.status).trim() : before.status;
    const nextDocument = req.body.document_id !== undefined ? (req.body.document_id || null) : before.document_id;
    if (nextStatus === training.AVAILABLE && (!nextDocument || await training.questionCount(pool, before.id) === 0)) {
      return res.status(400).json({ error: training.NOT_READY_MESSAGE });
    }

    sets.push('updated_at = NOW()');
    values.push(req.params.moduleId, req.params.clientId);
    await pool.execute(`UPDATE cp_training_modules SET ${sets.join(', ')} WHERE id = ? AND client_id = ?`, values);
    let after = await findModule(req);
    // A new document or pass mark changes what a completion means: new version.
    if (String(after.document_id ?? '') !== String(before.document_id ?? '') || after.pass_score !== before.pass_score) {
      await training.bumpVersion(pool, before.id, before.client_id);
      after = await findModule(req);
    }
    // CPPM-43: what changed, from → to — not just which fields the screen sent.
    await audit(req.admin, req.params.clientId, 'UPDATE', 'training_module', Number(req.params.moduleId), { changes: changesBetween(before, after, [...ALLOWED, 'version']) });
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'PUT /:clientId/:moduleId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/training/:clientId/:moduleId — delete training module
router.delete('/:clientId/:moduleId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    // CPPM-15: attempts are the record of who is trained; never delete them with the module.
    const [[used]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM cp_training_attempts WHERE module_id = ? AND client_id = ?', [req.params.moduleId, req.params.clientId]);
    if (used.n > 0) {
      return res.status(409).json({ error: 'This module has completion records, so it cannot be deleted. Set it to Retired instead.' });
    }
    const [result] = await pool.execute(
      'DELETE FROM cp_training_modules WHERE id = ? AND client_id = ?',
      [req.params.moduleId, req.params.clientId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found.' });
    await audit(req.admin, req.params.clientId, 'DELETE', 'training_module', Number(req.params.moduleId), {});
    res.json({ message: 'Training module deleted.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'DELETE /:clientId/:moduleId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Questions (CPPM-15) ─────────────────────────────────────────
// Every change to a module's questions starts a new version of the module.

const questionOut = q => ({ id: q.id, question: q.question, options: JSON.parse(q.options_json), correct_index: q.correct_index, sort_order: q.sort_order });

router.get('/:clientId/:moduleId/questions', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const module = await findModule(req);
    if (!module) return res.status(404).json({ error: 'Not found.' });
    const [rows] = await pool.execute(
      'SELECT * FROM cp_training_questions WHERE module_id = ? ORDER BY sort_order, id', [module.id]);
    res.json({ version: module.version, questions: rows.map(questionOut) });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'GET /:clientId/:moduleId/questions', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId/:moduleId/questions', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const module = await findModule(req);
    if (!module) return res.status(404).json({ error: 'Not found.' });
    const err = training.questionError(req.body);
    if (err) return res.status(400).json({ error: err });
    const [[{ next }]] = await pool.execute(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM cp_training_questions WHERE module_id = ?', [module.id]);
    const options = req.body.options.map(o => String(o).trim());
    const [r] = await pool.execute(
      `INSERT INTO cp_training_questions (client_id, module_id, question, options_json, correct_index, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [module.client_id, module.id, String(req.body.question).trim(), JSON.stringify(options), Number(req.body.correct_index), next]);
    await training.bumpVersion(pool, module.id, module.client_id);
    await audit(req.admin, module.client_id, 'CREATE', 'training_question', r.insertId,
      { module_id: module.id, question: String(req.body.question).trim(), options, correct_index: Number(req.body.correct_index) });
    res.json({ id: r.insertId, message: 'Question added.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'POST /:clientId/:moduleId/questions', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/:clientId/:moduleId/questions/:questionId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const module = await findModule(req);
    if (!module) return res.status(404).json({ error: 'Not found.' });
    const err = training.questionError(req.body);
    if (err) return res.status(400).json({ error: err });
    const ROW = 'SELECT * FROM cp_training_questions WHERE id = ? AND module_id = ?';
    const [[before]] = await pool.execute(ROW, [req.params.questionId, module.id]);
    if (!before) return res.status(404).json({ error: 'Not found.' });
    await pool.execute(
      'UPDATE cp_training_questions SET question = ?, options_json = ?, correct_index = ? WHERE id = ?',
      [String(req.body.question).trim(), JSON.stringify(req.body.options.map(o => String(o).trim())), Number(req.body.correct_index), before.id]);
    const [[after]] = await pool.execute(ROW, [before.id, module.id]);
    const changes = changesBetween(before, after, ['question', 'options_json', 'correct_index']);
    if (Object.keys(changes).length) await training.bumpVersion(pool, module.id, module.client_id);
    await audit(req.admin, module.client_id, 'UPDATE', 'training_question', before.id, { module_id: module.id, changes });
    res.json({ message: 'Question saved.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'PUT /:clientId/:moduleId/questions/:questionId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/:moduleId/questions/:questionId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const module = await findModule(req);
    if (!module) return res.status(404).json({ error: 'Not found.' });
    const [[q]] = await pool.execute('SELECT * FROM cp_training_questions WHERE id = ? AND module_id = ?', [req.params.questionId, module.id]);
    if (!q) return res.status(404).json({ error: 'Not found.' });
    if (module.status === training.AVAILABLE && await training.questionCount(pool, module.id) <= 1) {
      return res.status(400).json({ error: 'Doctors can take this module now, so it needs at least one question. Set it to Coming soon first.' });
    }
    await pool.execute('DELETE FROM cp_training_questions WHERE id = ?', [q.id]);
    await training.bumpVersion(pool, module.id, module.client_id);
    await audit(req.admin, module.client_id, 'DELETE', 'training_question', q.id, { module_id: module.id, question: q.question });
    res.json({ message: 'Question removed.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'DELETE /:clientId/:moduleId/questions/:questionId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
