'use strict';

/**
 * bulkUserProvisioningService.js — batch validation for user provisioning.
 *
 * PAUD-4 item 2 (approved by Rohith 2026-08-03). MIMS could only create users one
 * at a time, so standing up a client with forty people meant forty requests.
 *
 * Design decision: a batch is validated in full and then applied all-or-nothing.
 * Partial success is tempting — it is what the case importer does — but user
 * provisioning is access control. "Some of those forty exist and I am not sure
 * which" is the worst possible state to leave an administrator in, and it is not
 * something you want to have to reconstruct during an access review. Rows are
 * validated here, the caller applies them in one transaction.
 *
 * Pure: no database. Uniqueness against existing users is the caller's job — this
 * catches everything that can be known from the batch alone.
 */

const MAX_BULK_USERS = 500;

const REQUIRED_FIELDS = [
  ['user_id',           (r) => String(r.user_id || '').trim()],
  ['name',              (r) => String(r.name || '').trim()],
  ['email',             (r) => String(r.email || '').trim()],
  ['security_group_id', (r) => (r.security_group_id ? String(r.security_group_id) : '')],
];

function toFlag(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'string') return ['0', 'false', 'no', ''].includes(value.trim().toLowerCase()) ? 0 : 1;
  return value ? 1 : 0;
}

/** Trim and case-normalize a row so validation and insertion agree on the value. */
function normalizeBulkUserRow(row = {}) {
  return {
    user_id:           String(row.user_id || '').trim(),
    name:              String(row.name || '').trim(),
    email:             String(row.email || '').trim().toLowerCase(),
    initials:          String(row.initials || '').trim() || null,
    network_user_id:   String(row.network_user_id || '').trim() || null,
    department:        String(row.department || '').trim() || null,
    security_group_id: row.security_group_id || null,
    tenant_ids:        Array.isArray(row.tenant_ids) ? row.tenant_ids.map(Number).filter(Number.isInteger) : [],
    is_primary_ref:    toFlag(row.is_primary_ref),
    access_admin_site: toFlag(row.access_admin_site),
    case_admin:        toFlag(row.case_admin),
  };
}

/**
 * validateBulkUserRows — everything knowable without touching the database.
 * Returns every bad row, not just the first, so an administrator fixes the file
 * once instead of discovering problems forty submissions in a row.
 */
function validateBulkUserRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    return { valid: false, errors: [{ row: null, reason: 'No users supplied.' }], normalized: [] };
  }
  if (list.length > MAX_BULK_USERS) {
    return {
      valid: false,
      errors: [{ row: null, reason: `A batch may contain at most ${MAX_BULK_USERS} users.` }],
      normalized: [],
    };
  }

  const errors = [];
  const normalized = [];
  const seenUserIds = new Set();
  const seenEmails = new Set();

  list.forEach((raw, index) => {
    const rowNumber = index + 1;
    const row = normalizeBulkUserRow(raw);

    const missing = REQUIRED_FIELDS.filter(([, read]) => !read(raw)).map(([field]) => field);
    if (!row.tenant_ids.length) missing.push('tenant_ids');
    if (missing.length) {
      errors.push({ row: rowNumber, reason: `Missing required fields: ${missing.join(', ')}.` });
      return;
    }

    if (seenUserIds.has(row.user_id)) {
      errors.push({ row: rowNumber, reason: `Duplicate user_id within the batch: ${row.user_id}.` });
      return;
    }
    if (seenEmails.has(row.email)) {
      errors.push({ row: rowNumber, reason: `Duplicate email within the batch: ${row.email}.` });
      return;
    }

    seenUserIds.add(row.user_id);
    seenEmails.add(row.email);
    normalized.push({ row: rowNumber, ...row });
  });

  return { valid: errors.length === 0, errors, normalized };
}

module.exports = { MAX_BULK_USERS, normalizeBulkUserRow, validateBulkUserRows };
