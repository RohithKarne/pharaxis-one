import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const storageRoot = '/Users/rohithkarne/Pharaxis-One/apps/qms/backend/storage/binders';

export async function ensureStorageRoot() {
  await mkdir(storageRoot, { recursive: true });
  return storageRoot;
}

export async function registerFileObject(client, params) {
  const fileStats = await stat(params.absolutePath);
  const objectKey = path.basename(params.absolutePath);

  const id = randomUUID();
  await client.query(
    `
      INSERT INTO qms_file_objects (
        id,
        org_id,
        storage_provider,
        object_key,
        blob_uri,
        mime_type,
        byte_size,
        checksum_sha256,
        uploaded_by
      ) VALUES ($1, $2, 'local', $3, $4, $5, $6, $7, $8)
    `,
    [
      id,
      params.orgId,
      objectKey,
      params.absolutePath,
      params.mimeType || 'application/pdf',
      fileStats.size,
      params.checksumSha256 || null,
      params.uploadedBy || null
    ]
  );

  const { rows } = await client.query(
    'SELECT * FROM qms_file_objects WHERE id = $1 AND org_id = $2',
    [id, params.orgId]
  );

  return rows[0];
}

