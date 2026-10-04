'use strict';

/**
 * Migration 158 — usage history for responses sent before MIPM-188 (MIPM-221).
 *
 * Sending a response only started recording which documents and modules went
 * out with MIPM-188, so a document's Usage view missed every earlier response.
 * Each sent response's enclosures are recorded once, dated when it was sent and
 * credited to the response's author. Rows that already exist are left alone.
 */

function ids(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (Array.isArray(v) ? v : []).map((x) => Number(x?.id ?? x)).filter(Boolean);
  } catch (_) {
    return [];
  }
}

async function up(conn) {
  const [sent] = await conn.execute(
    `SELECT id, case_id, selected_documents, selected_modules, COALESCE(author_id, approver_id) AS used_by,
            COALESCE(sent_at, created_at) AS used_at
       FROM case_mi_responses WHERE response_status = 'SENT'`
  );
  for (const r of sent) {
    if (!r.used_by) continue;
    for (const [type, list] of [['document', ids(r.selected_documents)], ['module', ids(r.selected_modules)]]) {
      for (const contentId of list) {
        const [[seen]] = await conn.execute(
          'SELECT id FROM cm_content_usage WHERE content_type = ? AND content_id = ? AND response_id = ? LIMIT 1',
          [type, contentId, r.id]
        );
        if (seen) continue;
        await conn.execute(
          'INSERT INTO cm_content_usage (content_type, content_id, case_id, response_id, used_by, used_at) VALUES (?, ?, ?, ?, ?, ?)',
          [type, contentId, r.case_id, r.id, r.used_by, r.used_at]
        );
      }
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
