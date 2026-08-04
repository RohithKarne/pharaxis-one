import { randomUUID } from 'crypto';

export async function appendTraceLink(client, params) {
  const {
    orgId,
    sourceModule,
    sourceTable,
    sourceId,
    targetModule,
    targetTable,
    targetId,
    linkType = 'Reference',
    createdBy = null
  } = params;

  await client.query(
    `
      INSERT INTO qms_trace_links (
        id,
        org_id,
        source_module,
        source_table,
        source_id,
        target_module,
        target_table,
        target_id,
        link_type,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (source_module, source_table, source_id, target_module, target_table, target_id, link_type)
      DO UPDATE SET created_at = CURRENT_TIMESTAMP(3)
    `,
    [
      randomUUID(),
      orgId,
      sourceModule,
      sourceTable,
      sourceId,
      targetModule,
      targetTable,
      targetId,
      linkType,
      createdBy
    ]
  );

  // Read back on the unique key, not on the id we generated: an upsert that hit
  // the conflict path keeps the pre-existing row's id, so a lookup by generated
  // id would find nothing.
  const { rows } = await client.query(
    `
      SELECT *
      FROM qms_trace_links
      WHERE org_id = $1
        AND source_module = $2
        AND source_table = $3
        AND source_id = $4
        AND target_module = $5
        AND target_table = $6
        AND target_id = $7
        AND link_type = $8
    `,
    [orgId, sourceModule, sourceTable, sourceId, targetModule, targetTable, targetId, linkType]
  );

  return rows[0];
}

export async function readTraceLinks(client, orgId, filters = {}) {
  const clauses = [];
  const values = [orgId];
  let idx = 2;

  if (filters.module) {
    clauses.push(`(source_module = $${idx} OR target_module = $${idx})`);
    values.push(filters.module);
    idx += 1;
  }

  if (filters.entityId) {
    clauses.push(`(source_id = $${idx} OR target_id = $${idx})`);
    values.push(filters.entityId);
    idx += 1;
  }

  const limit = Math.min(Number(filters.limit || 200), 500);
  values.push(limit);

  const where = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';

  const { rows } = await client.query(
    `
      SELECT *
      FROM qms_trace_links
      WHERE org_id = $1
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `,
    values
  );

  return rows;
}
