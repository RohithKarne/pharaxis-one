'use strict';

const pool = require('../../database/db');
const { deterministicEmbedding } = require('./providerAbstraction');

async function upsertEmbedding({ source_type, source_id, org_id, content_text, model = 'text-embedding-3-small' }) {
  const embedding = JSON.stringify(deterministicEmbedding(content_text, 1536));
  const [result] = await pool.execute(
    `INSERT INTO ai_embeddings (source_type, source_id, org_id, content_text, embedding, model)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [source_type, source_id, org_id, content_text || '', embedding, model]
  );
  return result.insertId;
}

module.exports = { upsertEmbedding };
