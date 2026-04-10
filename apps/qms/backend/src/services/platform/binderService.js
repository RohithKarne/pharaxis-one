import path from 'path';
import { createHash } from 'crypto';
import { ensureStorageRoot, registerFileObject } from './blobService.js';
import { createSimplePdf } from './pdfService.js';
import { appendAuditEvent } from '../auditTrailService.js';

function hashFileName(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function countRow(client, sql, orgId) {
  const { rows } = await client.query(sql, [orgId]);
  return Number(rows[0]?.count || 0);
}

export async function generateInspectionBinder(client, params) {
  const startedAt = Date.now();

  const { rows: jobRows } = await client.query(
    `
      INSERT INTO au_binder_jobs (org_id, job_status, requested_by)
      VALUES ($1, 'Processing', $2)
      RETURNING *
    `,
    [params.orgId, params.requestedBy]
  );
  const job = jobRows[0];

  const counts = {
    documents: await countRow(
      client,
      `
      SELECT count(*)::int AS count
      FROM dc_document_versions
      WHERE org_id = $1 AND status = 'Effective'
    `,
      params.orgId
    ),
    capas: await countRow(
      client,
      `
      SELECT count(*)::int AS count
      FROM ca_capa_records
      WHERE org_id = $1
    `,
      params.orgId
    ),
    deviations: await countRow(
      client,
      `
      SELECT count(*)::int AS count
      FROM dv_deviation_records
      WHERE org_id = $1
    `,
      params.orgId
    ),
    audits: await countRow(
      client,
      `
      SELECT count(*)::int AS count
      FROM au_audits
      WHERE org_id = $1
    `,
      params.orgId
    ),
    validation: await countRow(
      client,
      `
      SELECT count(*)::int AS count
      FROM vs_system_inventory
      WHERE org_id = $1
    `,
      params.orgId
    )
  };

  const totalRecords =
    counts.documents + counts.capas + counts.deviations + counts.audits + counts.validation;

  await client.query(
    `
      INSERT INTO au_binder_items (org_id, binder_job_id, source_module, source_table, source_id)
      SELECT $1, $2, 'document_control', 'dc_document_versions', id
      FROM dc_document_versions
      WHERE org_id = $1 AND status = 'Effective'
      LIMIT 50
    `,
    [params.orgId, job.id]
  );

  const storageRoot = await ensureStorageRoot();
  const pdfFile = path.join(
    storageRoot,
    `binder-${job.id}-${hashFileName(`${params.orgId}-${Date.now()}`)}.pdf`
  );

  await createSimplePdf(pdfFile, [
    {
      title: 'Table of Contents',
      lines: [
        '1. Controlled Documents',
        '2. CAPA Records',
        '3. Deviation Log',
        '4. Audit History',
        '5. Validation Services'
      ]
    },
    {
      title: 'Record Counts',
      lines: [
        `Effective Documents: ${counts.documents}`,
        `CAPA Records: ${counts.capas}`,
        `Deviation Records: ${counts.deviations}`,
        `Audits: ${counts.audits}`,
        `Validation Systems: ${counts.validation}`
      ]
    }
  ]);

  const fileObject = await registerFileObject(client, {
    orgId: params.orgId,
    absolutePath: pdfFile,
    uploadedBy: params.requestedBy,
    mimeType: 'application/pdf'
  });

  const durationMs = Date.now() - startedAt;

  const { rows: completedRows } = await client.query(
    `
      UPDATE au_binder_jobs
      SET
        job_status = 'Completed',
        total_records = $2,
        duration_ms = $3,
        file_object_id = $4,
        completed_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [job.id, totalRecords, durationMs, fileObject.id]
  );

  await appendAuditEvent(client, {
    orgId: params.orgId,
    moduleKey: 'audit_management',
    entityTable: 'au_binder_jobs',
    entityId: job.id,
    actionKey: 'binder_generated',
    actorUserId: params.requestedBy,
    payloadJson: { totalRecords, durationMs, fileObjectId: fileObject.id }
  });

  return {
    job: completedRows[0],
    fileObject
  };
}

