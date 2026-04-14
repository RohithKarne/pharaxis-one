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

  const { rows } = await client.query(
    `
      INSERT INTO qms_trace_links (
        org_id,
        source_module,
        source_table,
        source_id,
        target_module,
        target_table,
        target_id,
        link_type,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (source_module, source_table, source_id, target_module, target_table, target_id, link_type)
      DO UPDATE SET created_at = now()
      RETURNING *
    `,
    [
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

  return rows[0];
}

export async function readTraceLinks(client, orgId, filters = {}) {
  const where = ['org_id = $1'];
  const values = [orgId];
  let idx = 2;

  if (filters.module) {
    where.push(`(source_module = $${idx} OR target_module = $${idx})`);
    values.push(filters.module);
    idx += 1;
  }

  if (filters.entityId) {
    where.push(`(source_id = $${idx} OR target_id = $${idx})`);
    values.push(filters.entityId);
    idx += 1;
  }

  const limit = Math.min(Number(filters.limit || 200), 500);
  values.push(limit);

  const { rows } = await client.query(
    `
      SELECT *
      FROM qms_trace_links
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `,
    values
  );

  return rows;
}
