'use strict';

/**
 * gridSectionService.js — Theme 7 helper (Wave 2).
 *
 * Powers multi-row grid sections (concomitant meds, MedDRA codes, products
 * taken, etc.). Parses pasted spreadsheet payloads, applies row templates,
 * and persists `case_grid_rows`.
 *
 * Surface:
 *   listRows({orgId, caseId, section, includeArchived})
 *   replaceRows({orgId, caseId, section, rows, userId})
 *   pastePreview({headers, text})                — parse tab/CSV string to row[]
 *   applyTemplate({orgId, section, templateId})  — returns rows from a stored template
 */

const pool = require('../database/db');

async function listRows({ orgId, caseId, section, includeArchived = false }) {
  const params = [orgId, caseId, section];
  let sql = `
    SELECT id, row_json, sort_order, archived,
           created_by, created_at, updated_by, updated_at
      FROM case_grid_rows
     WHERE org_id = ? AND case_id = ? AND section_name = ?
  `;
  if (!includeArchived) sql += ' AND archived = 0';
  sql += ' ORDER BY sort_order, id';
  const [rows] = await pool.execute(sql, params);
  return rows.map(r => ({ ...r, row_json: safeJson(r.row_json) }));
}

async function replaceRows({ orgId, caseId, section, rows, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Soft-archive any existing rows not in incoming set (by id)
    const incomingIds = (rows || []).filter(r => r.id).map(r => Number(r.id));
    if (incomingIds.length) {
      const placeholders = incomingIds.map(() => '?').join(',');
      await conn.execute(
        `UPDATE case_grid_rows SET archived = 1
          WHERE org_id = ? AND case_id = ? AND section_name = ?
            AND id NOT IN (${placeholders}) AND archived = 0`,
        [orgId, caseId, section, ...incomingIds]
      );
    } else {
      await conn.execute(
        `UPDATE case_grid_rows SET archived = 1
          WHERE org_id = ? AND case_id = ? AND section_name = ? AND archived = 0`,
        [orgId, caseId, section]
      );
    }
    // Insert / update
    let sortOrder = 0;
    const saved = [];
    for (const r of rows || []) {
      const json = JSON.stringify(r.row_json || r.data || {});
      if (r.id) {
        await conn.execute(
          `UPDATE case_grid_rows
              SET row_json = ?, sort_order = ?, archived = 0,
                  updated_by = ?, updated_at = NOW()
            WHERE id = ? AND org_id = ?`,
          [json, sortOrder++, userId || null, r.id, orgId]
        );
        saved.push(r.id);
      } else {
        const [ins] = await conn.execute(
          `INSERT INTO case_grid_rows
             (org_id, case_id, section_name, row_json, sort_order, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orgId, caseId, section, json, sortOrder++, userId || null, userId || null]
        );
        saved.push(ins.insertId);
      }
    }
    await conn.commit();
    return saved;
  } catch (err) {
    await conn.rollback(); throw err;
  } finally {
    conn.release();
  }
}

/**
 * Parse a clipboard paste from Excel/Sheets into row objects keyed by header.
 * Detects tab/comma delimiter. First line is assumed to be header if `headers`
 * is omitted; otherwise the provided header list is used and ALL lines treated
 * as data.
 */
function pastePreview({ headers, text }) {
  const t = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!t) return { headers: headers || [], rows: [] };
  const lines = t.split('\n');
  // delimiter detection — prefer tab
  const delim = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : '\t');
  const split = (l) => l.split(delim).map(c => c.trim());

  let cols = headers;
  let body = lines;
  if (!cols) { cols = split(lines[0]); body = lines.slice(1); }

  const rows = body.filter(Boolean).map(l => {
    const parts = split(l);
    const obj = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]] = parts[i] ?? '';
    return obj;
  });
  return { headers: cols, rows };
}

async function applyTemplate({ orgId, templateId }) {
  const [[t]] = await pool.execute(
    `SELECT rows_json FROM grid_section_templates
      WHERE id = ? AND (org_id = ? OR org_id IS NULL) LIMIT 1`,
    [templateId, orgId]
  );
  if (!t) return [];
  return safeJson(t.rows_json) || [];
}

function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

module.exports = { listRows, replaceRows, pastePreview, applyTemplate };
