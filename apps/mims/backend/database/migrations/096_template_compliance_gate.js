'use strict';

// Migration 096 — Template compliance gate.
//
// Brings cm_templates up to the same governance bar as cm_documents / cm_faqs:
// adds expiry_date plus an approval lifecycle (Draft → Approved → Published →
// Archived) with approval/publish audit stamps.
//
// Existing live templates (legacy status 'Active') are migrated to 'Published'
// so they keep appearing in the MI response builder under the new, stricter
// status filter; legacy 'Inactive' templates become 'Archived'.

async function addColumn(conn, ddl) {
  try {
    await conn.execute(`ALTER TABLE cm_templates ADD COLUMN ${ddl}`);
  } catch (_) {}
}

async function up(conn) {
  await addColumn(conn, `expiry_date  DATE     NULL`);
  await addColumn(conn, `approved_by  INT      NULL`);
  await addColumn(conn, `approved_at  DATETIME NULL`);
  await addColumn(conn, `published_by INT      NULL`);
  await addColumn(conn, `published_at DATETIME NULL`);

  // Map legacy Active/Inactive vocabulary onto the new lifecycle so existing
  // content keeps working once the response builder requires 'Published'.
  try {
    await conn.execute(
      `UPDATE cm_templates
          SET status = 'Published',
              published_at = COALESCE(published_at, updated_at, created_at)
        WHERE status = 'Active'`
    );
  } catch (_) {}
  try {
    await conn.execute(
      `UPDATE cm_templates SET status = 'Archived' WHERE status = 'Inactive'`
    );
  } catch (_) {}

  try {
    await conn.execute(
      `ALTER TABLE cm_templates ADD KEY idx_cm_templates_status_expiry (status, expiry_date)`
    );
  } catch (_) {}
}

async function down(conn) {
  try { await conn.execute(`UPDATE cm_templates SET status = 'Active'   WHERE status = 'Published'`); } catch (_) {}
  try { await conn.execute(`UPDATE cm_templates SET status = 'Inactive' WHERE status = 'Archived'`);  } catch (_) {}
  for (const col of ['expiry_date', 'approved_by', 'approved_at', 'published_by', 'published_at']) {
    try { await conn.execute(`ALTER TABLE cm_templates DROP COLUMN ${col}`); } catch (_) {}
  }
  try { await conn.execute(`ALTER TABLE cm_templates DROP INDEX idx_cm_templates_status_expiry`); } catch (_) {}
}

module.exports = { up, down };
