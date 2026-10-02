'use strict';

const pool = require('../../database/db');
const { classifyText } = require('./classifier');
const { logAudit } = require('../../utils/auditLog');

async function classifyInquiry(inquiryId, userId = null) {
  const [[row]] = await pool.execute('SELECT id, org_id, sender, subject, body FROM inquiries WHERE id = ? LIMIT 1', [inquiryId]);
  if (!row) return null;
  const suggestion = classifyText([row.sender, row.subject, row.body].filter(Boolean).join('\n'));
  await pool.execute(
    `UPDATE inquiries
        SET ai_suggested_type = ?, ai_suggested_payload = ?, ai_classified_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [suggestion.caseType, JSON.stringify(suggestion), inquiryId]
  );
  await pool.execute(
    `INSERT INTO ai_suggestions (case_id, suggestion_type, prompt_hash, suggestion_payload, model, tokens_in, tokens_out, latency_ms)
     VALUES (0, 'classification', SHA2(?, 256), ?, 'rules-based', ?, ?, 0)`, /* MIPM-27: keyword rules, not a model */
    [JSON.stringify(suggestion), JSON.stringify({ inquiry_id: inquiryId, ...suggestion }), Math.ceil(JSON.stringify(row).length / 4), Math.ceil(JSON.stringify(suggestion).length / 4)]
  ).catch(() => {});
  await logAudit(userId, 'Keyword classifier', 'CLASSIFY', 'inquiry', inquiryId, suggestion);
  return suggestion;
}

async function classifyRecentInquiries(orgId, limit = 25) {
  const [rows] = await pool.execute(
    `SELECT id FROM inquiries
      WHERE org_id = ? AND ai_classified_at IS NULL
      ORDER BY received_at DESC, id DESC
      LIMIT ${Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200)}`,
    [orgId]
  );
  const results = [];
  for (const row of rows) results.push({ inquiry_id: row.id, suggestion: await classifyInquiry(row.id) });
  return results;
}

module.exports = { classifyInquiry, classifyRecentInquiries };
