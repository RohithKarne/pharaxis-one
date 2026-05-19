'use strict';

const pool = require('../database/db');
const CATEGORIES = new Set(['certain','probable','possible','unlikely','conditional','unassessable']);
const ASSESSORS = new Set(['company','reporter']);

async function getLatestAeVersionId(caseId) {
  const [[v]] = await pool.execute('SELECT id FROM case_ae_versions WHERE case_id = ? ORDER BY version_number DESC, id DESC LIMIT 1', [caseId]);
  return v?.id || null;
}

async function getMatrix({ orgId, caseId, aeVersionId = null }) {
  const versionId = aeVersionId || await getLatestAeVersionId(caseId);
  const [drugs] = await pool.execute(`SELECT * FROM case_drugs WHERE org_id=? AND case_id=? AND role IN ('suspect','co_suspect') ORDER BY id ASC`, [orgId, caseId]);
  const [reactions] = versionId ? await pool.execute('SELECT * FROM case_ae_events WHERE version_id=? ORDER BY id ASC', [versionId]) : [[]];
  const [rows] = await pool.execute('SELECT * FROM case_causality WHERE org_id=? AND case_id=? ORDER BY id ASC', [orgId, caseId]);
  const cells = {};
  rows.forEach(row => {
    const key = `${row.suspect_drug_id}_${row.ae_event_id}`;
    cells[key] = cells[key] || {};
    cells[key][row.assessor] = row;
  });
  return { ae_version_id: versionId, drugs, reactions, cells };
}

async function upsertCell({ orgId, caseId, aeVersionId, drugId, aeEventId, assessor, method = 'WHO_UMC', category, narrative, userId }) {
  if (!ASSESSORS.has(assessor)) throw new Error('Invalid assessor.');
  if (!CATEGORIES.has(category)) throw new Error('Invalid causality category.');
  const versionId = aeVersionId || await getLatestAeVersionId(caseId);
  await pool.execute(
    `INSERT INTO case_causality (org_id, case_id, ae_version_id, suspect_drug_id, ae_event_id, assessor, method, category, narrative, assessed_by, assessed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE method=VALUES(method), category=VALUES(category), narrative=VALUES(narrative), assessed_by=VALUES(assessed_by), assessed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP`,
    [orgId, caseId, versionId, drugId, aeEventId, assessor, method, category, narrative || null, userId || null]
  );
}

function applyNaranjoScore({ score }) {
  const n = Number(score || 0);
  if (n >= 9) return 'certain';
  if (n >= 5) return 'probable';
  if (n >= 1) return 'possible';
  return 'unlikely';
}

module.exports = { getMatrix, upsertCell, applyNaranjoScore };
