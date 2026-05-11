'use strict';
// Migration 026 — CM content management enhancements
// - cm_content_view_log: tracks who viewed which document/FAQ and when (#11)
// - cm_templates folder_id: allows templates to be organised in folders (#2)

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS cm_content_view_log (
      id          INT NOT NULL AUTO_INCREMENT,
      entity_type VARCHAR(30) NOT NULL,
      entity_id   INT NOT NULL,
      user_id     INT,
      user_name   VARCHAR(255),
      ip_address  VARCHAR(60),
      viewed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_cm_view_entity (entity_type, entity_id),
      KEY idx_cm_view_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const sql of [
    `ALTER TABLE cm_templates ADD COLUMN folder_id INT NULL`,
    `ALTER TABLE cm_templates ADD INDEX idx_cm_tmpl_folder (folder_id)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }
}

module.exports = { up };
