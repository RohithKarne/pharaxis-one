'use strict';
/**
 * cmContentLifecycleService.js — CM Document & FAQ Auto-Archive
 * Runs daily at 05:00 UTC.
 * Archives Published documents and FAQs whose expiry_date has passed.
 */
const pool = require('../database/db');

async function addVersionHistory(entityType, entityId, version, status, notes) {
  try {
    await pool.execute(
      `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [entityType, entityId, version, status, notes || null]
    );
  } catch (_) {}
}

async function addAuditLog(action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (NULL, 'system', ?, ?, ?, ?)`,
      [action, entity, entityId, JSON.stringify(details || {})]
    );
  } catch (_) {}
}

async function addNotification(userId, title, message, metadata) {
  if (!userId) return;
  try {
    await pool.execute(
      `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
       VALUES (?, 'cm_lifecycle', ?, ?, '/content', ?)`,
      [userId, title, message, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (_) {}
}

async function runCmContentAutoArchive() {
  let archivedDocs = 0;
  let archivedFaqs = 0;

  const [expiredDocs] = await pool.execute(
    `SELECT d.id, d.doc_id, d.name, d.version_major, d.version_minor,
            COALESCE(d.owner_user_id, d.created_by) AS notify_user_id
     FROM cm_documents d
     WHERE d.status = 'Published'
       AND d.expiry_date IS NOT NULL
       AND d.expiry_date < CURDATE()`
  );

  for (const doc of expiredDocs) {
    await pool.execute(
      `UPDATE cm_documents SET status = 'Archived', updated_at = NOW() WHERE id = ?`,
      [doc.id]
    );
    const versionStr = `${doc.version_major || 1}.${doc.version_minor || 0}`;
    await addVersionHistory('document', doc.id, versionStr, 'Archived', 'Auto-archived: expiry date passed.');
    await addAuditLog('AUTO_ARCHIVE_EXPIRED', 'cm_document', doc.id, { doc_id: doc.doc_id, name: doc.name });
    await addNotification(
      doc.notify_user_id,
      'Document Auto-Archived',
      `"${doc.name}"${doc.doc_id ? ` (${doc.doc_id})` : ''} has been automatically archived as its expiry date has passed.`,
      { document_id: doc.id, doc_code: doc.doc_id }
    );
    archivedDocs++;
  }

  const [expiredFaqs] = await pool.execute(
    `SELECT fq.id, fq.question AS name, fq.version_major, fq.version_minor,
            fq.created_by AS notify_user_id
     FROM cm_faqs fq
     WHERE fq.status = 'Published'
       AND fq.expiry_date IS NOT NULL
       AND fq.expiry_date < CURDATE()`
  );

  for (const faq of expiredFaqs) {
    await pool.execute(
      `UPDATE cm_faqs SET status = 'Archived', updated_at = NOW() WHERE id = ?`,
      [faq.id]
    );
    const versionStr = `${faq.version_major || 1}.${faq.version_minor || 0}`;
    await addVersionHistory('faq', faq.id, versionStr, 'Archived', 'Auto-archived: expiry date passed.');
    await addAuditLog('AUTO_ARCHIVE_EXPIRED', 'cm_faq', faq.id, { name: faq.name });
    const truncatedName = faq.name.length > 80 ? faq.name.substring(0, 80) + '...' : faq.name;
    await addNotification(
      faq.notify_user_id,
      'FAQ Auto-Archived',
      `FAQ "${truncatedName}" has been automatically archived as its expiry date has passed.`,
      { faq_id: faq.id }
    );
    archivedFaqs++;
  }

  return { archivedDocs, archivedFaqs };
}

module.exports = { runCmContentAutoArchive };
