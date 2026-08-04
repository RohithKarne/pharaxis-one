export async function searchDocuments(client, orgId, filters = {}) {
  const clauses = [];
  const values = [orgId];
  let index = 2;

  if (filters.title) {
    clauses.push(`LOWER(d.title) LIKE LOWER($${index})`);
    values.push(`%${filters.title}%`);
    index += 1;
  }

  if (filters.documentType) {
    clauses.push(`d.document_type = $${index}`);
    values.push(filters.documentType);
    index += 1;
  }

  if (filters.department) {
    clauses.push(`d.department = $${index}`);
    values.push(filters.department);
    index += 1;
  }

  if (filters.ownerUserId) {
    clauses.push(`d.owner_user_id = $${index}`);
    values.push(filters.ownerUserId);
    index += 1;
  }

  if (filters.status) {
    clauses.push(`v.status = $${index}`);
    values.push(filters.status);
    index += 1;
  }

  if (filters.versionNo) {
    clauses.push(`v.version_no = $${index}`);
    values.push(Number(filters.versionNo));
    index += 1;
  }

  const limit = Math.min(Number(filters.limit || 50), 200);
  values.push(limit);

  const where = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';

  const sql = `
    SELECT
      d.id,
      d.document_code,
      d.title,
      d.document_type,
      d.department,
      d.owner_user_id,
      d.next_review_due_date,
      d.binder_includable,
      d.updated_at,
      v.id AS version_id,
      v.version_no,
      v.status,
      v.effective_date
    FROM dc_documents d
    LEFT JOIN dc_document_versions v ON v.id = d.active_version_id
    WHERE d.org_id = $1
    ${where}
    ORDER BY d.updated_at DESC
    LIMIT $${index}
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}

