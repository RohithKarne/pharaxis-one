'use strict';

/**
 * attachmentScan.js — CPPM-39: the background half of virus scanning.
 *
 * A portal attachment that could not be scanned at upload (scanner unreachable), or
 * that predates scanning, is held as 'pending': it cannot be downloaded or sent to
 * MIMS. Each scheduler tick scans a few of them. Clean → released, and forwarded to
 * the MIMS case if its report already went there. Infected → the file is deleted and
 * the row stays as the record of what happened.
 */

const fs   = require('fs');
const path = require('path');
const { pool } = require('../database/db');
const { scanFile } = require('../utils/virusScan');
const { systemAudit } = require('../utils/audit');
const log = require('../utils/logger');

const BATCH = 20;

async function rescanHeldAttachments() {
  const [rows] = await pool.execute(
    `SELECT id, submission_id, client_id, file_name, file_path FROM cp_submission_attachments
      WHERE scan_status = 'pending' ORDER BY id LIMIT ${BATCH}`);

  for (const a of rows) {
    const abs = path.join(__dirname, '..', a.file_path.replace(/^\//, ''));
    if (!fs.existsSync(abs)) {
      // Nothing left to scan or to serve; without this the row would be retried forever.
      await pool.execute(
        `UPDATE cp_submission_attachments SET scan_status = 'missing', scanned_at = NOW(), scan_detail = 'file not on disk' WHERE id = ?`, [a.id]);
      continue;
    }

    const result = await scanFile(abs);
    if (result.status === 'error') {
      // Scanner still unreachable: leave everything held and try again next tick.
      log.warn('attachments.rescan_scanner_unavailable', { error: result.error, held: rows.length });
      return;
    }

    if (result.status === 'clean') {
      await pool.execute(
        `UPDATE cp_submission_attachments SET scan_status = 'clean', scan_detail = NULL, scanned_at = NOW() WHERE id = ?`, [a.id]);
      systemAudit('virus scan', a.client_id, 'ATTACHMENT_RELEASED', 'submission', a.submission_id, { file: a.file_name });
      const { forwardReleasedAttachment } = require('../routes/portal/submit');
      await forwardReleasedAttachment(a.id)
        .catch(err => log.error('attachments.forward_after_release_failed', { err, attachment_id: a.id }));
    } else {
      try { fs.unlinkSync(abs); } catch { /* already gone */ }
      await pool.execute(
        `UPDATE cp_submission_attachments SET scan_status = 'infected', scan_detail = ?, scanned_at = NOW() WHERE id = ?`,
        [String(result.virus).slice(0, 255), a.id]);
      systemAudit('virus scan', a.client_id, 'ATTACHMENT_BLOCKED_VIRUS', 'submission', a.submission_id,
        { file: a.file_name, virus: result.virus });
    }
  }
}

module.exports = { rescanHeldAttachments };
