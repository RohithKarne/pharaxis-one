'use strict';

const pool = require('../../database/db');
const cache = new Map();

async function searchMedDra(query, limit = 20) {
  const q = String(query || '').trim();
  if (!q) return [];
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const [rows] = await pool.execute(
    `SELECT id, code, term, level, parent_id, version
       FROM dictionary_meddra
      WHERE code = ? OR term LIKE ?
      ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, term ASC
      LIMIT ?`,
    [q, `%${q}%`, q, Number(limit)]
  );
  if (cache.size >= 500) cache.delete(cache.keys().next().value);
  cache.set(key, rows);
  return rows;
}

module.exports = { searchMedDra };
