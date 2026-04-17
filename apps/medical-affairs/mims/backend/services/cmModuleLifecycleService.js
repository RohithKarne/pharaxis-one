'use strict';

const pool = require('../database/db');

function parseSelectedModules(value) {
  if (value === undefined || value === null || value === '') return [];
  let parsed = value;
  for (let i = 0; i < 2; i += 1) {
    if (typeof parsed !== 'string') break;
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const normalized = parsed
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(normalized)];
}

async function addVersionHistory(entityType, entityId, version, status, notes, authorId) {
  try {
    await pool.execute(
      `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entityType, entityId, version, status, notes || null, authorId || null]
    );
  } catch (_) { /* best-effort */ }
}

async function addAuditLog(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, userName || null, action, entity, entityId, JSON.stringify(details || {})]
    );
  } catch (_) { /* best-effort */ }
}

async function addNotification(userId, title, message, metadata) {
  if (!userId) return;
  try {
    await pool.execute(
      `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
       VALUES (?, 'cm_module_lifecycle', ?, ?, ?, ?)`,
      [
        userId,
        title,
        message,
        '/content',
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (_) { /* best-effort */ }
}

async function archiveLinkedDocumentsForModule(moduleRow, options = {}) {
  const moduleId = Number(moduleRow.id);
  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    return { archivedDocumentIds: [] };
  }

  const trigger = options.trigger || 'archived';
  const actorUserId = options.actorUserId || null;
  const actorUserName = options.actorUserName || 'system';
  const moduleOwnerId = moduleRow.owner_user_id || moduleRow.created_by || null;

  const [docs] = await pool.execute(
    `SELECT d.id, d.doc_id, d.name, d.status, d.version_major, d.version_minor, d.owner_user_id, d.created_by, d.selected_modules
     FROM cm_documents d
     WHERE d.response_doc_type = 'Module'
       AND d.status <> 'Archived'
       AND d.selected_modules IS NOT NULL`
  );

  const impactedDocs = docs.filter((doc) => parseSelectedModules(doc.selected_modules).includes(moduleId));
  if (impactedDocs.length === 0) {
    return { archivedDocumentIds: [] };
  }

  const impactedIds = impactedDocs.map((doc) => doc.id);
  const placeholders = impactedIds.map(() => '?').join(',');
  await pool.execute(
    `UPDATE cm_documents
     SET status = 'Archived',
         updated_by = ?,
         updated_at = NOW()
     WHERE id IN (${placeholders})`,
    [actorUserId, ...impactedIds]
  );

  for (const doc of impactedDocs) {
    const versionStr = `${doc.version_major || 1}.${doc.version_minor || 0}`;
    const notes = `Auto-archived because linked module "${moduleRow.name}" (${moduleRow.module_id || `MOD-${moduleId}`}) was ${trigger}.`;
    await addVersionHistory('document', doc.id, versionStr, 'Archived', notes, actorUserId);
    await addAuditLog(
      actorUserId,
      actorUserName,
      'AUTO_ARCHIVE_BY_MODULE',
      'cm_document',
      doc.id,
      {
        trigger,
        module_id: moduleId,
        module_code: moduleRow.module_id || null,
        module_name: moduleRow.name,
        doc_id: doc.doc_id || null,
      }
    );

    const docOwnerId = doc.owner_user_id || doc.created_by || null;
    const title = 'Document Auto-Archived (Linked Module)';
    const message = `Document "${doc.name}" was auto-archived because linked module "${moduleRow.name}" was ${trigger}.`;
    const metadata = {
      module_id: moduleId,
      module_code: moduleRow.module_id || null,
      module_name: moduleRow.name,
      document_id: doc.id,
      document_code: doc.doc_id || null,
      trigger,
    };
    const recipients = [...new Set([moduleOwnerId, docOwnerId].filter(Boolean))];
    for (const userId of recipients) {
      await addNotification(userId, title, message, metadata);
    }
  }

  return { archivedDocumentIds: impactedIds };
}

async function runCmModuleLifecycle() {
  const [expiredModules] = await pool.execute(
    `SELECT m.*
     FROM cm_modules m
     WHERE m.expiry_date IS NOT NULL
       AND m.expiry_date < CURDATE()
       AND m.status <> 'Archived'`
  );

  for (const moduleRow of expiredModules) {
    await pool.execute(
      `UPDATE cm_modules
       SET status = 'Archived',
           updated_at = NOW()
       WHERE id = ?`,
      [moduleRow.id]
    );
    const versionStr = `${moduleRow.version_major || 1}.${moduleRow.version_minor || 0}`;
    await addVersionHistory(
      'module',
      moduleRow.id,
      versionStr,
      'Archived',
      'Auto-archived because module expiry date passed.',
      null
    );
    await addAuditLog(
      null,
      'system',
      'AUTO_ARCHIVE_EXPIRED_MODULE',
      'cm_module',
      moduleRow.id,
      {
        module_id: moduleRow.module_id || null,
        name: moduleRow.name,
        expiry_date: moduleRow.expiry_date,
      }
    );
    await archiveLinkedDocumentsForModule(moduleRow, {
      trigger: 'expired',
      actorUserId: null,
      actorUserName: 'system',
    });
  }

  return { expiredModuleCount: expiredModules.length };
}

module.exports = {
  archiveLinkedDocumentsForModule,
  runCmModuleLifecycle,
  parseSelectedModules,
};

