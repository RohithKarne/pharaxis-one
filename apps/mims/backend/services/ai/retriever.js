'use strict';

const pool = require('../../database/db');
const { deterministicEmbedding } = require('./providerAbstraction');

function cosine(a = [], b = []) {
  let dot = 0, ma = 0, mb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

async function vectorSearch(query, sourceType, orgId, k = 10) {
  const qv = deterministicEmbedding(query, 1536);
  const params = [orgId];
  let sql = 'SELECT * FROM ai_embeddings WHERE org_id = ?';
  if (sourceType) { sql += ' AND source_type = ?'; params.push(sourceType); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const [rows] = await pool.execute(sql, params);
  return rows.map(row => {
    let ev = [];
    try { ev = JSON.parse(row.embedding || '[]'); } catch (_) {}
    return { ...row, score: Number(cosine(qv, ev).toFixed(4)) };
  }).sort((a, b) => b.score - a.score).slice(0, Number(k));
}

module.exports = { vectorSearch, cosine };
