'use strict';

/**
 * A case that came in from a connected portal — the case screen's side of the bridge
 * (bridge features F1, F3 and F5; Rohith, 2026-10-10).
 *
 * - Where the case came from, with a link back to the request on that portal (F1).
 * - An earlier case flagged at intake as possibly the same report (F5).
 * - Questions for the person who reported. MIMS never calls the portal: a question is
 *   stored here and the case's change time moves, so the portal picks it up on its next
 *   check, asks the person, and sends the answer back as a follow-up (F3).
 */

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { verifyCaseOrg, writeCaseAudit } = require('../services/caseHelpers');
const { logger } = require('../services/logger');

async function bridgeInfo(caseId) {
  const [[c]] = await pool.execute(
    `SELECT c.source_api_client_id, c.source_reference, c.source_link, c.source_can_reply, c.possible_duplicate_of, c.reporter_erased_at,
            a.name AS source_name, d.case_number AS duplicate_number, d.is_deleted AS duplicate_deleted
       FROM cases c
       LEFT JOIN api_clients a ON a.id = c.source_api_client_id
       LEFT JOIN cases d ON d.id = c.possible_duplicate_of AND d.org_id = c.org_id
      WHERE c.id = ? LIMIT 1`, [caseId]);
  if (!c) return null;
  const [questions] = await pool.execute(
    `SELECT q.id, q.question, q.asked_at, q.answered_at, q.answer_comment_id, q.withdrawn_at, COALESCE(u.name, u.email) AS asked_by_name
       FROM case_reporter_questions q LEFT JOIN users u ON u.id = q.asked_by
      WHERE q.case_id = ? ORDER BY q.id ASC`, [caseId]);
  return {
    source: c.source_api_client_id
      ? { name: c.source_name || `Connection #${c.source_api_client_id}`, reference: c.source_reference, link: c.source_link || null }
      : null,
    possible_duplicate: c.possible_duplicate_of && c.duplicate_number && !Number(c.duplicate_deleted)
      ? { id: c.possible_duplicate_of, case_number: c.duplicate_number } : null,
    // A question can be asked only on a case a portal sent, while the reporter is known
    // and the portal said they can answer there. A visitor has no page to answer on, and
    // a portal that never said so (an older one, or a case sent before) would not show
    // the question at all — it would wait for an answer that cannot come.
    can_ask: !!c.source_api_client_id && !c.reporter_erased_at && c.source_can_reply === 1,
    cannot_ask_reason: !c.source_api_client_id ? 'not_from_portal' : c.reporter_erased_at ? 'reporter_erased'
      : c.source_can_reply === 0 ? 'reporter_not_signed_in' : c.source_can_reply === 1 ? null : 'portal_not_ready',
    questions,
  };
}

router.get('/cases/:id/bridge', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(404).json({ error: 'Case not found.' });
    res.json(await bridgeInfo(owned.id));
  } catch (err) {
    logger.error({ err, case_id: req.params.id }, 'case bridge info failed');
    res.status(500).json({ error: 'Could not load where this case came from.' });
  }
});

router.post('/cases/:id/reporter-questions', authenticate, async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (question.length < 5 || question.length > 2000) return res.status(400).json({ error: 'Write a question of 5 to 2000 characters.' });
  try {
    const owned = await verifyCaseOrg(req.params.id, req, 'case.update');
    if (!owned) return res.status(404).json({ error: 'Case not found.' });
    const info = await bridgeInfo(owned.id);
    if (!info.can_ask) {
      return res.status(409).json({ error: {
        not_from_portal: 'This case did not come from a portal, so there is nobody to send a question to.',
        reporter_erased: "The reporter's details were erased on this case, so they cannot be asked anything.",
        reporter_not_signed_in: 'The reporter was not signed in to the portal, so they have no page to answer on. Contact them another way.',
        portal_not_ready: 'This case was sent before the portal could take questions. Contact the reporter another way.',
      }[info.cannot_ask_reason] });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute(
        'INSERT INTO case_reporter_questions (org_id, case_id, question, asked_by) VALUES (?, ?, ?, ?)',
        [owned.org_id, owned.id, question, req.user.userId]);
      // The portal reads what changed by this time; without it the question never leaves.
      await conn.execute('UPDATE cases SET updated_at = NOW() WHERE id = ?', [owned.id]);
      await writeCaseAudit(owned.id, req.user.userId, req.user.email, 'REPORTER_QUESTION_ASKED', 'reporter_question', null,
        `#${r.insertId} via ${info.source.name}: ${question}`, conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    res.status(201).json(await bridgeInfo(owned.id));
  } catch (err) {
    logger.error({ err, case_id: req.params.id }, 'reporter question failed');
    res.status(500).json({ error: 'The question could not be saved.' });
  }
});

router.post('/cases/:id/reporter-questions/:qid/withdraw', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req, 'case.update');
    if (!owned) return res.status(404).json({ error: 'Case not found.' });
    const [upd] = await pool.execute(
      `UPDATE case_reporter_questions SET withdrawn_at = NOW()
        WHERE id = ? AND case_id = ? AND answered_at IS NULL AND withdrawn_at IS NULL`, [req.params.qid, owned.id]);
    if (!upd.affectedRows) return res.status(409).json({ error: 'That question has already been answered or withdrawn.' });
    await pool.execute('UPDATE cases SET updated_at = NOW() WHERE id = ?', [owned.id]);
    await writeCaseAudit(owned.id, req.user.userId, req.user.email, 'REPORTER_QUESTION_WITHDRAWN', 'reporter_question',
      `#${req.params.qid}`, null);
    res.json(await bridgeInfo(owned.id));
  } catch (err) {
    logger.error({ err, case_id: req.params.id }, 'reporter question withdraw failed');
    res.status(500).json({ error: 'The question could not be withdrawn.' });
  }
});

module.exports = router;
