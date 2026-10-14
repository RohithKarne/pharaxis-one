'use strict';

/**
 * cmLineage.js — every version of one piece of content (content review,
 * 2026-10-14).
 *
 * Since Revise, each version of a document, module, FAQ or template is its own
 * row, linked by revision_of to the version it revised. The version history
 * read one row's entries only, so a revision showed nothing of the versions
 * before it. These helpers follow the links both ways.
 */

const pool = require('../database/db');

const TABLES = { document: 'cm_documents', module: 'cm_modules', faq: 'cm_faqs', template: 'cm_templates' };

// Ids of every row in the same line of versions as `id`, oldest first.
async function lineageIds(entityType, id) {
  const table = TABLES[entityType];
  const seen = new Set([Number(id)]);
  let cur = Number(id);
  for (let i = 0; i < 100; i++) {
    const [[row]] = await pool.execute(`SELECT revision_of FROM ${table} WHERE id = ?`, [cur]);
    if (!row?.revision_of || seen.has(Number(row.revision_of))) break;
    cur = Number(row.revision_of);
    seen.add(cur);
  }
  let frontier = [...seen];
  for (let i = 0; i < 100 && frontier.length; i++) {
    const [rows] = await pool.execute(
      `SELECT id FROM ${table} WHERE revision_of IN (${frontier.map(() => '?').join(',')})`, frontier);
    frontier = rows.map((r) => Number(r.id)).filter((x) => !seen.has(x));
    frontier.forEach((x) => seen.add(x));
  }
  return [...seen].sort((a, b) => a - b);
}

// The version history of the whole line, newest first.
async function lineageHistory(entityType, id) {
  const ids = await lineageIds(entityType, id);
  const [rows] = await pool.execute(
    `SELECT vh.*, u.name AS author_name FROM cm_version_history vh
       LEFT JOIN users u ON u.id = vh.author_id
      WHERE vh.entity_type = ? AND vh.entity_id IN (${ids.map(() => '?').join(',')})
      ORDER BY vh.created_at DESC, vh.id DESC`,
    [entityType, ...ids]);
  return rows;
}

module.exports = { lineageIds, lineageHistory };
