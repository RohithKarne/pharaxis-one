'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { safeFetch } = require('../../utils/ssrf');

const MIMS_BASE_URL = process.env.MIMS_API_URL || 'http://localhost:3001/api';

router.get('/:token', async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 16) return res.status(400).json({ error: 'Invalid or missing token.' });

  try {
    const mimsUrl = `${MIMS_BASE_URL}/bridge/clarifications/${encodeURIComponent(token)}`;
    const r = await safeFetch(mimsUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (_) {
    try {
      const [[q]] = await pool.execute(
        `SELECT q.id, q.case_id, q.question, q.asked_at, q.answered_at, q.withdrawn_at,
                q.token_expires_at, q.token_used_at, c.case_number, c.product_name, c.case_type,
                ac.comment AS answer_text
           FROM case_reporter_questions q
           JOIN cases c ON c.id = q.case_id
           LEFT JOIN case_comments ac ON ac.id = q.answer_comment_id
          WHERE q.token = ? LIMIT 1`,
        [token]
      );
      if (!q) return res.status(404).json({ error: 'Clarification request not found.' });
      const isExpired = q.token_expires_at ? new Date(q.token_expires_at) < new Date() : false;
      return res.json({
        question_id: q.id,
        case_number: q.case_number,
        product_name: q.product_name,
        case_type: q.case_type,
        question: q.question,
        asked_at: q.asked_at,
        expires_at: q.token_expires_at,
        is_expired: isExpired,
        is_answered: !!q.answered_at,
        is_withdrawn: !!q.withdrawn_at,
        answer_text: q.answer_text,
      });
    } catch (e) {
      return res.status(503).json({ error: 'Medical Affairs bridge is currently unreachable. Please try again later.' });
    }
  }
});

router.post('/:token/reply', async (req, res) => {
  const { token } = req.params;
  const { answer, reporter_name } = req.body || {};
  if (!answer || answer.trim().length < 5) {
    return res.status(400).json({ error: 'Please enter your clinical response (minimum 5 characters).' });
  }

  try {
    const mimsUrl = `${MIMS_BASE_URL}/bridge/clarifications/${encodeURIComponent(token)}/reply`;
    const r = await safeFetch(mimsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answer.trim(), reporter_name }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (_) {
    try {
      const [[q]] = await pool.execute(
        `SELECT q.id, q.case_id, q.org_id, q.token_expires_at, q.answered_at, q.withdrawn_at
           FROM case_reporter_questions q
          WHERE q.token = ? LIMIT 1`,
        [token]
      );
      if (!q) return res.status(404).json({ error: 'Clarification request not found.' });
      if (q.withdrawn_at) return res.status(410).json({ error: 'This clarification request was withdrawn.' });
      if (q.answered_at) return res.status(409).json({ error: 'This clarification has already been answered.' });
      if (q.token_expires_at && new Date(q.token_expires_at) < new Date()) {
        return res.status(410).json({ error: 'This clarification request has expired (72-hour limit).' });
      }

      const commentText = `[Physician Response from ${reporter_name || 'Reporting Physician'}]: ${answer.trim()}`;
      const [commentRes] = await pool.execute(
        'INSERT INTO case_comments (case_id, org_id, user_id, comment, created_at) VALUES (?, ?, NULL, ?, NOW())',
        [q.case_id, q.org_id, commentText]
      );
      await pool.execute(
        'UPDATE case_reporter_questions SET answered_at = NOW(), token_used_at = NOW(), answer_comment_id = ? WHERE id = ?',
        [commentRes.insertId, q.id]
      );
      await pool.execute('UPDATE cases SET updated_at = NOW() WHERE id = ?', [q.case_id]);
      return res.json({ success: true, message: 'Thank you. Your clinical clarification has been received.' });
    } catch (e) {
      return res.status(503).json({ error: 'Could not record your clarification. Please try again.' });
    }
  }
});

module.exports = router;
