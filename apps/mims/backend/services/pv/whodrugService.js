'use strict';

const pool = require('../../database/db');

async function searchWhoDrug(query, limit = 20) {
  const q = String(query || '').trim();
  if (!q) return [];
  const [rows] = await pool.execute(
    `SELECT id, code, term, level, parent_id, version
       FROM dictionary_whodrug
      WHERE code = ? OR term LIKE ?
      ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, term ASC
      LIMIT ?`,
    [q, `%${q}%`, q, Number(limit)]
  );
  return rows;
}

module.exports = { searchWhoDrug };
