'use strict';

const express = require('express');
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { sha256 } = require('../../services/eSignManifestService');

const router = express.Router();

router.post('/audit/inspector-export', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const caseId = Number(req.body.case_id);
    if (!caseId) return res.status(400).json({ error: 'case_id is required.' });
    const [audit] = await pool.execute('SELECT * FROM case_audit_trail WHERE case_id=? ORDER BY changed_at ASC', [caseId]).catch(async () => [ [] ]);
    const [generic] = await pool.execute('SELECT * FROM audit_logs WHERE entity_id=? ORDER BY created_at ASC', [caseId]).catch(async () => [ [] ]);
    const payload = { case_id: caseId, generated_at: new Date().toISOString(), audit, generic, signature_manifest: { hash: sha256(JSON.stringify({ audit, generic })) } };
    res.json({ format: 'json-pdf-ready', payload, note: 'PDF rendering can consume this signed payload in the deployment environment.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
