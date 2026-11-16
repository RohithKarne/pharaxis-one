'use strict';

/**
 * Migration 196 — Baseline defaults for Content Management.
 *
 * WHY
 * Prior to this migration, fresh database deployments and new organisations
 * lacked baseline CM picklists (document categories and document types),
 * alert settings, and folder permissions, resulting in empty category dropdowns
 * and unconfigured alert intervals until manual authoring intervention.
 *
 * WHAT
 * 1. Seeds standard document categories and document types in `cm_picklists`
 *    for all existing organisations and global scope (org_id = 1, etc.).
 * 2. Seeds standard expiry alert intervals ([30, 60, 90] days) and default
 *    alert roles (admin, content_manager, reviewer) in `cm_org_settings`.
 * 3. Ensures active root folders have default permission entries in
 *    `cm_folder_permissions`.
 */

const DOCUMENT_CATEGORIES = [
  'Clinical Overview',
  'Product Monograph',
  'Prescribing Information',
  'Patient Guide',
  'Regulatory Letter',
  'Response Builder',
];

const DOCUMENT_TYPES = [
  'Standard Response',
  'Scientific Monograph',
  'Clinical Protocol',
  'Safety Bulletin',
  'Prescribing Information',
];

async function up(conn) {
  const [orgRows] = await conn.execute('SELECT id FROM organisations');
  const orgIds = orgRows.map((r) => r.id);
  if (!orgIds.includes(1)) orgIds.push(1);

  for (const orgId of orgIds) {
    // 1. Seed document categories
    let order = 10;
    for (const cat of DOCUMENT_CATEGORIES) {
      await conn.execute(
        `INSERT IGNORE INTO cm_picklists (org_id, field_type, value, label, sort_order, is_active, created_at)
         VALUES (?, 'document_category', ?, ?, ?, 1, NOW())`,
        [orgId, cat, cat, order]
      );
      order += 10;
    }

    // 2. Seed document types
    order = 10;
    for (const dt of DOCUMENT_TYPES) {
      await conn.execute(
        `INSERT IGNORE INTO cm_picklists (org_id, field_type, value, label, sort_order, is_active, created_at)
         VALUES (?, 'document_type', ?, ?, ?, 1, NOW())`,
        [orgId, dt, dt, order]
      );
      order += 10;
    }

    // 3. Seed cm_org_settings
    await conn.execute(
      `INSERT INTO cm_org_settings (org_id, setting_key, setting_value, updated_at)
       VALUES (?, 'default_alert_days', ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
      [orgId, JSON.stringify([30, 60, 90])]
    );

    await conn.execute(
      `INSERT INTO cm_org_settings (org_id, setting_key, setting_value, updated_at)
       VALUES (?, 'default_alert_roles', ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
      [orgId, JSON.stringify(['admin', 'content_manager', 'reviewer'])]
    );

    // 4. Default folder permissions for folders without explicit permissions
    const [folders] = await conn.execute(
      `SELECT f.id FROM cm_folders f
        WHERE f.org_id = ? AND f.status = 'Active'
          AND NOT EXISTS (SELECT 1 FROM cm_folder_permissions p WHERE p.folder_id = f.id)`,
      [orgId]
    );

    const [groups] = await conn.execute(
      `SELECT id FROM security_groups WHERE org_id = ? LIMIT 1`,
      [orgId]
    ).catch(() => [[]]);

    const groupId = groups[0]?.id || null;
    if (groupId) {
      for (const f of folders) {
        await conn.execute(
          `INSERT IGNORE INTO cm_folder_permissions (folder_id, security_group_id, permission_level, created_at)
           VALUES (?, ?, 'edit', NOW())`,
          [f.id, groupId]
        );
      }
    }
  }
}

module.exports = { up };
