'use strict';

const MYSQL_DATABASE_ENV = process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

async function up(conn) {
  const dbName = conn.config?.database || MYSQL_DATABASE_ENV;

  async function ensureColumn(tableName, columnName, definitionSql) {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
      [dbName, tableName, columnName]
    );
    if (!rows.length) {
      await conn.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    }
  }

  await poolSafeDeleteSiteField(conn);

  await ensureColumn('case_contacts', 'prefix', 'VARCHAR(50) NULL AFTER contact_type');
  await ensureColumn('case_contacts', 'reporter_type', 'VARCHAR(100) NULL AFTER prefix');
  await ensureColumn('case_contacts', 'source', 'VARCHAR(100) NULL AFTER reporter_type');
  await ensureColumn('case_contacts', 'consent_status', 'VARCHAR(100) NULL AFTER source');
  await ensureColumn('case_contacts', 'country', 'VARCHAR(100) NULL AFTER institution');
  await ensureColumn('case_contacts', 'country_of_reporter', 'VARCHAR(100) NULL AFTER country');
  await ensureColumn('case_contacts', 'qualification', 'VARCHAR(100) NULL AFTER country_of_reporter');
  await ensureColumn('case_contacts', 'preferred_contact_method', 'VARCHAR(100) NULL AFTER qualification');
  await ensureColumn('case_contacts', 'language_preference', 'VARCHAR(100) NULL AFTER preferred_contact_method');

  await ensureColumn('case_mi', 'literature_reference', 'TEXT NULL AFTER status');

  await ensureColumn('case_ae_general', 'ae_status', 'VARCHAR(100) NULL AFTER report_type');
  await ensureColumn('case_ae_general', 'date_of_awareness', 'DATE NULL AFTER ae_status');
  await ensureColumn('case_ae_general', 'regulatory_reportability', 'VARCHAR(100) NULL AFTER report_type');

  await ensureColumn('case_ae_events', 'meddra_term', 'VARCHAR(255) NULL AFTER event_description');
  await ensureColumn('case_ae_events', 'reported_causality', 'VARCHAR(100) NULL AFTER outcome');
  await ensureColumn('case_ae_events', 'frequency', 'VARCHAR(100) NULL AFTER reported_causality');
  await ensureColumn('case_ae_events', 'causality_assessment', 'VARCHAR(100) NULL AFTER frequency');
  await ensureColumn('case_ae_events', 'seriousness', 'TEXT NULL AFTER causality_assessment');
  await ensureColumn('case_ae_events', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await ensureColumn('case_ae_lab_results', 'lab_name', 'VARCHAR(255) NULL AFTER version_id');
  await ensureColumn('case_ae_lab_results', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await ensureColumn('case_ae_medical_history', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  await ensureColumn('case_ae_patient_info', 'patient_initials', 'VARCHAR(20) NULL AFTER version_id');
  await ensureColumn('case_ae_patient_info', 'date_of_birth', 'DATE NULL AFTER patient_initials');
  await ensureColumn('case_ae_patient_info', 'patient_country', 'VARCHAR(100) NULL AFTER pregnant');
  await ensureColumn('case_ae_product_info', 'product_type', 'VARCHAR(100) NULL AFTER product_name');
  await ensureColumn('case_ae_product_info', 'product_category', 'VARCHAR(100) NULL AFTER product_type');
  await ensureColumn('case_ae_product_info', 'batch_lot_number', 'VARCHAR(100) NULL AFTER product_category');
  await ensureColumn('case_ae_product_info', 'action_taken', 'VARCHAR(100) NULL AFTER indication');
  await ensureColumn('case_ae_product_info', 'dechallenge', 'VARCHAR(100) NULL AFTER action_taken');
  await ensureColumn('case_ae_product_info', 'rechallenge', 'VARCHAR(100) NULL AFTER dechallenge');

  await ensureColumn('case_pc_general', 'root_cause', 'TEXT NULL AFTER severity');
  await ensureColumn('case_pc_patient_info', 'patient_name', 'VARCHAR(255) NULL AFTER version_id');
  await ensureColumn('case_pc_patient_info', 'date_of_birth', 'DATE NULL AFTER patient_name');
  await ensureColumn('case_pc_product_info', 'product_type', 'VARCHAR(100) NULL AFTER product_name');
  await ensureColumn('case_pc_product_info', 'product_category', 'VARCHAR(100) NULL AFTER product_type');
  await ensureColumn('case_pc_product_info', 'manufacturing_date', 'DATE NULL AFTER expiry_date');
  await ensureColumn('case_pc_product_info', 'pack_size', 'VARCHAR(100) NULL AFTER manufacturing_date');
  await ensureColumn('case_pc_return_retrieval', 'return_address', 'TEXT NULL AFTER return_date');
  await ensureColumn('case_pc_refund_credit', 'credit_note_number', 'VARCHAR(100) NULL AFTER credit_amount');
}

async function poolSafeDeleteSiteField(conn) {
  try {
    await conn.execute(
      `DELETE FROM field_setup
        WHERE section_name = 'Case Information'
          AND field_name = 'Site'`
    );
  } catch (_) {
    // best-effort cleanup for existing tenants
  }
}

module.exports = { up };
