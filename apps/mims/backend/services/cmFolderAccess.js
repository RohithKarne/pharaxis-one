'use strict';

/**
 * cmFolderAccess.js — folder permissions in Content Management (content review,
 * Rohith 2026-10-14).
 *
 * A folder could be given to security groups at Read, Write or Manage level, but
 * nothing read the list: every user saw and changed everything. Now:
 *
 *   - a folder with no groups listed is open to everyone who can use content;
 *   - a folder with groups listed is seen only by members of those groups, and
 *     changed only by members at Write (content) or Manage (the folder itself);
 *   - organisation and platform administrators are never shut out, so a folder
 *     cannot be locked away from everyone.
 *
 * Membership is a row in security_group_users or the user's own security group,
 * the same two places the admin screens read.
 */

const pool = require('../database/db');
const { isAdminUser } = require('../utils/adminScope');

const RANK = { read: 1, write: 2, manage: 3 };

const bypass = (user) => isAdminUser(user);

// Folders this user may not use at `level`. Empty for administrators.
async function blockedFolderIds(user, level = 'read') {
  if (!user || bypass(user)) return [];
  const [rows] = await pool.execute(
    `SELECT fp.folder_id,
            MAX(CASE WHEN fp.security_group_id IN (
                  SELECT sgu.group_id FROM security_group_users sgu WHERE sgu.user_id = ?
                  UNION SELECT u.security_group_id FROM users u WHERE u.id = ? AND u.security_group_id IS NOT NULL)
                THEN CASE LOWER(fp.permission_level) WHEN 'manage' THEN 3 WHEN 'write' THEN 2 ELSE 1 END
                ELSE 0 END) AS best
       FROM cm_folder_permissions fp
      GROUP BY fp.folder_id`,
    [user.userId || 0, user.userId || 0]);
  return rows.filter((r) => Number(r.best) < RANK[level]).map((r) => Number(r.folder_id));
}

// An SQL condition (with a leading AND) that hides content in folders the user
// may not read. The ids are integers from our own table, so they are inlined.
async function folderFilterSql(user, column, level = 'read') {
  const ids = await blockedFolderIds(user, level);
  if (!ids.length) return '';
  return ` AND (${column} IS NULL OR ${column} NOT IN (${ids.map(Number).join(',')}))`;
}

async function canUseFolder(user, folderId, level = 'read') {
  if (!folderId) return true;
  const ids = await blockedFolderIds(user, level);
  return !ids.includes(Number(folderId));
}

module.exports = { blockedFolderIds, folderFilterSql, canUseFolder };
