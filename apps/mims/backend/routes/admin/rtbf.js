'use strict';

const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

function orgScope(req) {
  return hasGlobalAdminScope(req.user) ? (Number(req.query.org_id || req.body?.org_id || 0) || null) : req.user.orgId;
}

async function audit(userId, action, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'rtbf_request', ?, ?, ?)`,
      [userId || null, entityId || null, action, JSON.stringify(details || {})]
    );
  } catch (_) {}
}

async function previewAffected(orgId, identifier) {
  const like = `%${identifier}%`;
  const [[cases]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM cases
     WHERE org_id = ? AND (description LIKE ? OR internal_notes LIKE ?)`,
    [orgId, like, like]
  );
  const [[contacts]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM case_contacts cc
     JOIN cases c ON c.id = cc.case_id
     WHERE c.org_id = ? AND (cc.email = ? OR cc.first_name = ? OR cc.last_name = ?)`,
    [orgId, identifier, identifier, identifier]
  ).catch(() => [[{ cnt: 0 }]]);
  return { cases: Number(cases?.cnt || 0), contacts: Number(contacts?.cnt || 0) };
}

function pdfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdf(lines) {
  const text = lines.map((line, idx) => `BT /F1 10 Tf 50 ${760 - (idx * 18)} Td (${pdfEscape(line)}) Tj ET`).join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(text)} >> stream\n${text}\nendstream endobj`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body));
    body += `${obj}\n`;
  }
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body);
}

function signatureManifest(payload) {
  const keyPath = process.env.DPPR_SIGNING_KEY_PATH;
  if (!keyPath) {
    const err = new Error('DPPR_SIGNING_KEY_PATH is required for signed DPPR certificates.');
    err.statusCode = 500;
    throw err;
  }
  const key = fs.readFileSync(keyPath);
  return {
    algorithm: 'sha256-hmac',
    payload_hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    signature: crypto.createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex'),
  };
}

router.post('/rtbf/intake', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = orgScope(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const { subject_type, subject_identifier, requester_name, requester_email, legal_basis } = req.body || {};
    if (!subject_type || !subject_identifier) return res.status(400).json({ error: 'subject_type and subject_identifier are required.' });
    const [result] = await pool.execute(
      `INSERT INTO rtbf_requests
        (org_id, subject_type, subject_identifier, requester_name, requester_email, legal_basis)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, subject_type, subject_identifier, requester_name || null, requester_email || null, legal_basis || null]
    );
    await audit(req.user.userId, 'RTBF_INTAKE', result.insertId, req.body);
    res.status(201).json({ id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rtbf', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = orgScope(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const params = [orgId];
    let where = 'org_id = ?';
    if (req.query.status) { where += ' AND status = ?'; params.push(req.query.status); }
    const [rows] = await pool.execute(`SELECT * FROM rtbf_requests WHERE ${where} ORDER BY created_at DESC`, params);
    res.json({ requests: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rtbf/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const [[row]] = await pool.execute('SELECT * FROM rtbf_requests WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'RTBF request not found.' });
  res.json({ request: row });
});

router.get('/rtbf/:id/preview', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const [[row]] = await pool.execute('SELECT * FROM rtbf_requests WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'RTBF request not found.' });
  res.json({ affected: await previewAffected(row.org_id, row.subject_identifier) });
});

router.post('/rtbf/:id/review', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const decision = req.body?.decision;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected.' });
  await pool.execute(
    `UPDATE rtbf_requests SET status = ?, reviewer_id = ?, review_notes = ?, review_at = NOW() WHERE id = ?`,
    [decision, req.user.userId, req.body?.notes || null, req.params.id]
  );
  await audit(req.user.userId, 'RTBF_REVIEW', req.params.id, req.body);
  res.json({ ok: true });
});

router.post('/rtbf/:id/execute', authenticate, requireRole('platform_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute('SELECT * FROM rtbf_requests WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!row) {
      const err = new Error('RTBF request not found.');
      err.statusCode = 404;
      throw err;
    }
    if (row.status !== 'approved') {
      const err = new Error('RTBF must be approved before execution.');
      err.statusCode = 400;
      throw err;
    }
    const affected = await previewAffected(row.org_id, row.subject_identifier);
    const manifest = signatureManifest({ id: row.id, affected, at: new Date().toISOString() });
    await conn.execute(
      `UPDATE cases SET description = REPLACE(description, ?, '[RTBF-ANONYMIZED]'),
                        internal_notes = REPLACE(internal_notes, ?, '[RTBF-ANONYMIZED]')
       WHERE org_id = ?`,
      [row.subject_identifier, row.subject_identifier, row.org_id]
    );
    await conn.execute(
      `UPDATE rtbf_requests SET status = 'completed', executed_at = NOW(), affected_record_summary = ?, certificate_path = ? WHERE id = ?`,
      [JSON.stringify(affected), `rtbf-certificate-${row.id}.pdf`, row.id]
    );
    await conn.commit();
    await audit(req.user.userId, 'RTBF_EXECUTE', row.id, { affected, signature_manifest: manifest });
    res.json({ ok: true, affected, signature_manifest: manifest });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally { conn.release(); }
});

router.get('/rtbf/:id/certificate', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const [[row]] = await pool.execute('SELECT * FROM rtbf_requests WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'RTBF request not found.' });
  try {
    const payload = { certificate: row, generated_at: new Date().toISOString() };
    const manifest = signatureManifest(payload);
    const pdf = buildSimplePdf([
      'RTBF Completion Certificate',
      `Request ID: ${row.id}`,
      `Organisation ID: ${row.org_id}`,
      `Subject Type: ${row.subject_type}`,
      `Subject Identifier: ${row.subject_identifier}`,
      `Status: ${row.status}`,
      `Executed At: ${row.executed_at || ''}`,
      `Affected Summary: ${JSON.stringify(row.affected_record_summary || {})}`,
      `Signature Manifest: ${JSON.stringify(manifest)}`,
    ]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rtbf-certificate-${row.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/data-portability/:subjectId', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = orgScope(req);
  if (!orgId) return res.status(400).json({ error: 'org_id required.' });
  const subjectId = req.params.subjectId;
  const like = `%${subjectId}%`;
  const [cases] = await pool.execute(
    `SELECT * FROM cases WHERE org_id = ? AND (description LIKE ? OR internal_notes LIKE ?) LIMIT 500`,
    [orgId, like, like]
  );
  const manifest = { subject_id: subjectId, org_id: orgId, generated_at: new Date().toISOString(), files: ['cases.json'] };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ manifest, cases })).digest('hex');
  res.json({ manifest: { ...manifest, sha256: hash }, cases });
});

module.exports = router;
