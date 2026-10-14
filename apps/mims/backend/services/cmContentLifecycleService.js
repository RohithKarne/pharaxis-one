'use strict';
/**
 * cmContentLifecycleService.js — CM Document & FAQ Auto-Archive
 * Runs daily at 05:00 UTC.
 * Archives Published documents and FAQs whose expiry_date has passed.
 */
const pool = require('../database/db');
const { logAudit } = require('../utils/auditLog');

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
  await logAudit(null, 'system', action, entity, entityId, details || {});
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

// A check-out holds a document for two hours. The screen said it "auto-releases"
// then, but nothing released it; and the manual release cleared the holder while
// leaving the status CheckedOut, so nobody could check it in or out again. An
// expired check-out goes back to Draft — the edits saved during it are kept.
async function releaseStaleCheckouts(orgId = null) {
  const [rows] = await pool.execute(
    `SELECT d.id, d.doc_id, d.name, d.checked_out_by, d.version_major, d.version_minor
       FROM cm_documents d JOIN cm_folders f ON f.id = d.folder_id
      WHERE d.status = 'CheckedOut' AND d.checkout_expires_at IS NOT NULL AND d.checkout_expires_at < NOW()
        ${orgId ? 'AND f.org_id = ?' : ''}`,
    orgId ? [orgId] : []
  );
  for (const doc of rows) {
    await pool.execute(
      `UPDATE cm_documents SET status = 'Draft', checked_out_by = NULL, checked_out_at = NULL, checkout_expires_at = NULL, updated_at = NOW()
        WHERE id = ? AND status = 'CheckedOut'`, [doc.id]);
    await addVersionHistory('document', doc.id, `${doc.version_major || 1}.${doc.version_minor || 0}`, 'Draft', 'Check-out expired after two hours; returned to Draft.');
    await addAuditLog('CHECKOUT_EXPIRED', 'cm_document', doc.id, { doc_id: doc.doc_id, checked_out_by: doc.checked_out_by });
    await addNotification(doc.checked_out_by, 'Check-out expired',
      `Your check-out of "${doc.name}"${doc.doc_id ? ` (${doc.doc_id})` : ''} expired and it is back in Draft. Your saved changes are kept.`,
      { document_id: doc.id, doc_code: doc.doc_id });
  }
  return { released: rows.length };
}

module.exports = { runCmContentAutoArchive, releaseStaleCheckouts };
