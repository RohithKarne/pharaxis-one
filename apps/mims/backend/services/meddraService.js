'use strict';

const pool = require('../database/db');

async function search({ q, level = 'PT', limit = 20 }) {
  const query = String(q || '').trim();
  if (query.length < 2) return [];
  const safeLevel = ['SOC','HLGT','HLT','PT','LLT'].includes(String(level).toUpperCase()) ? String(level).toUpperCase() : 'PT';
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT t.id, t.code, t.term, t.level, t.parent_id, v.version,
              MATCH(t.term) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
         FROM meddra_terms t LEFT JOIN meddra_versions v ON v.id = t.version_id
        WHERE t.level = ? AND MATCH(t.term) AGAINST (? IN NATURAL LANGUAGE MODE)
        ORDER BY score DESC, t.term ASC LIMIT ?`,
      [query, safeLevel, query, lim]
    );
  } catch (_) {
    [rows] = await pool.query(
      `SELECT t.id, t.code, t.term, t.level, t.parent_id, v.version, 0 AS score
         FROM meddra_terms t LEFT JOIN meddra_versions v ON v.id = t.version_id
        WHERE t.level = ? AND (t.code = ? OR t.term LIKE ?)
        ORDER BY CASE WHEN t.code = ? THEN 0 ELSE 1 END, t.term ASC LIMIT ?`,
      [safeLevel, query, `%${query}%`, query, lim]
    );
  }
  return rows;
}

async function getHierarchy(termId) {
  const hierarchy = {};
  let id = termId;
  for (let i = 0; i < 6 && id; i += 1) {
    const [[row]] = await pool.execute('SELECT id, code, term, level, parent_id FROM meddra_terms WHERE id = ? LIMIT 1', [id]);
    if (!row) break;
    hierarchy[String(row.level).toLowerCase()] = row;
    id = row.parent_id;
  }
  return hierarchy;
}

async function autoSuggest(verbatim) {
  return search({ q: verbatim, level: 'PT', limit: 10 });
}

async function codeReaction({ orgId, caseId, aeEventId, verbatim, termId, approvedBy }) {
  const [[existing]] = await pool.execute('SELECT id FROM case_meddra_codes WHERE case_id = ? AND ae_event_id <=> ? ORDER BY id DESC LIMIT 1', [caseId, aeEventId || null]);
  if (existing) {
    await pool.execute(
      `UPDATE case_meddra_codes SET verbatim_text=?, approved_term_id=?, approved_by=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [verbatim || null, termId || null, approvedBy || null, existing.id]
    );
    return existing.id;
  }
  const [result] = await pool.execute(
    `INSERT INTO case_meddra_codes (org_id, case_id, ae_event_id, verbatim_text, approved_term_id, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [orgId, caseId, aeEventId || null, verbatim || null, termId || null, approvedBy || null]
  );
  return result.insertId;
}

module.exports = { search, getHierarchy, autoSuggest, codeReaction };
