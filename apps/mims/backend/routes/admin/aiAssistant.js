'use strict';

const crypto = require('crypto');
const express = require('express');
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { saveProviderConfig, getProvider } = require('../../services/ai/providerAbstraction');
const { classifyText } = require('../../services/ai/classifier');
const { extractFields } = require('../../services/ai/extractor');
const { draftResponse } = require('../../services/ai/responseDrafter');
const { summarizeCase } = require('../../services/ai/summarizer');
const { runQualityChecks } = require('../../services/ai/qualityChecker');
const { vectorSearch } = require('../../services/ai/retriever');
const { classifyInquiry, classifyRecentInquiries } = require('../../services/ai/inboxClassifierService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

const router = express.Router();

async function audit(req, action, entity, entityId, details) {
  await pool.execute(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user?.userId || null, req.user?.email || 'system', action, entity, entityId || null, JSON.stringify(details || {})]
  ).catch(() => {});
}

async function loadCase(req, id) {
  const params = [id];
  let sql = 'SELECT * FROM cases WHERE id = ?';
  if (!hasGlobalAdminScope(req.user)) { sql += ' AND org_id = ?'; params.push(req.user.orgId); }
  sql += ' LIMIT 1';
  const [[row]] = await pool.execute(sql, params);
  return row;
}

async function logSuggestion(req, caseId, type, payload, meta = {}) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
  const [result] = await pool.execute(
    `INSERT INTO ai_suggestions (case_id, suggestion_type, prompt_hash, suggestion_payload, model, tokens_in, tokens_out, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [caseId, type, hash, JSON.stringify(payload || {}), meta.model || 'deterministic-local', meta.tokens_in || 0, meta.tokens_out || 0, meta.latency_ms || 0]
  );
  await audit(req, 'AI_SUGGEST', 'ai_suggestion', result.insertId, { case_id: caseId, suggestion_type: type });
  return result.insertId;
}

router.post('/admin/ai-config', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.body.org_id || req.user.orgId;
    if (!orgId && !hasGlobalAdminScope(req.user)) return res.status(403).json({ error: 'No active organisation.' });
    const id = await saveProviderConfig(orgId || 0, req.body || {});
    await audit(req, 'UPSERT', 'ai_provider_config', id, { provider_key: req.body.provider_key, enabled: Boolean(req.body.enabled) });
    res.json({ id, message: 'AI provider configuration saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/ai/usage', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const params = [];
    let where = '1=1';
    if (req.query.from) { where += ' AND created_at >= ?'; params.push(req.query.from); }
    if (req.query.to) { where += ' AND created_at <= ?'; params.push(`${req.query.to} 23:59:59`); }
    const [rows] = await pool.execute(
      `SELECT model, suggestion_type, COUNT(*) calls, SUM(tokens_in) tokens_in, SUM(tokens_out) tokens_out, AVG(latency_ms) avg_latency_ms
         FROM ai_suggestions WHERE ${where} GROUP BY model, suggestion_type ORDER BY calls DESC`,
      params
    );
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/classify', authenticate, async (req, res) => {
  try {
    const row = await loadCase(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'Case not found.' });
    const suggestion = classifyText([row.subject, row.description, req.body?.text].filter(Boolean).join('\n'));
    const sid = await logSuggestion(req, row.id, 'classification', suggestion);
    res.json({ suggestion_id: sid, suggestion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/extract', authenticate, async (req, res) => {
  try {
    const row = await loadCase(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'Case not found.' });
    const suggestion = extractFields(req.body?.text || row.description || row.subject || '', req.body?.schema || {});
    const sid = await logSuggestion(req, row.id, 'extraction', suggestion);
    res.json({ suggestion_id: sid, suggestion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/suggest-response', authenticate, async (req, res) => {
  try {
    const row = await loadCase(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'Case not found.' });
    const context = await vectorSearch(row.subject || row.description || '', 'document', row.org_id, 5).catch(() => []);
    const suggestion = draftResponse(row, context);
    const sid = await logSuggestion(req, row.id, 'response', suggestion);
    res.json({ suggestion_id: sid, suggestion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/summarize', authenticate, async (req, res) => {
  try {
    const row = await loadCase(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'Case not found.' });
    const provider = await getProvider(row.org_id);
    const start = Date.now();
    const chat = await provider.chat([{ role: 'user', content: JSON.stringify(row) }], { purpose: 'summary' });
    const suggestion = { narrative: summarizeCase({ ...row, narrative: chat.content }) };
    const sid = await logSuggestion(req, row.id, 'summary', suggestion, { ...chat, latency_ms: Date.now() - start });
    res.json({ suggestion_id: sid, suggestion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/similar', authenticate, async (req, res) => {
  try {
    const row = await loadCase(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'Case not found.' });
    const similar = await vectorSearch(req.body?.query || row.subject || row.description || '', 'case', row.org_id, 10).catch(() => []);
    const sid = await logSuggestion(req, row.id, 'similar_cases', { similar });
    res.json({ suggestion_id: sid, similar });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/quality-check', authenticate, async (req, res) => {
  try {
    const row = await loadCase(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'Case not found.' });
    const checks = runQualityChecks({ ...row, ...(req.body?.case || {}) });
    for (const c of checks) {
      await pool.execute(
        `INSERT INTO ai_quality_checks (case_id, check_name, severity, message, resolved) VALUES (?, ?, ?, ?, 0)`,
        [row.id, c.check_name, c.severity, c.message]
      );
    }
    res.json({ checks, blocked: checks.some(c => c.severity === 'block') });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/suggestions/:sid/accept', authenticate, async (req, res) => {
  try {
    await pool.execute('UPDATE ai_suggestions SET accepted=1, accepted_by=?, accepted_at=CURRENT_TIMESTAMP WHERE id=? AND case_id=?', [req.user.userId, req.params.sid, req.params.id]);
    await audit(req, 'ACCEPT', 'ai_suggestion', req.params.sid, { case_id: Number(req.params.id) });
    res.json({ accepted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/ai/suggestions/:sid/reject', authenticate, async (req, res) => {
  try {
    await pool.execute('UPDATE ai_suggestions SET accepted=0, accepted_by=?, accepted_at=CURRENT_TIMESTAMP WHERE id=? AND case_id=?', [req.user.userId, req.params.sid, req.params.id]);
    await audit(req, 'REJECT', 'ai_suggestion', req.params.sid, { case_id: Number(req.params.id) });
    res.json({ accepted: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/inquiries/:id/ai/classify', authenticate, async (req, res) => {
  try {
    const suggestion = await classifyInquiry(req.params.id, req.user.userId);
    if (!suggestion) return res.status(404).json({ error: 'Inquiry not found.' });
    res.json({ suggestion });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/ai/classify-inbox', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const results = await classifyRecentInquiries(req.body.org_id || req.user.orgId, req.body.limit || 25);
    res.json({ results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
