'use strict';

// Migration 020 - MI response builder, response package snapshots, and starter response content.

async function addColumn(conn, table, ddl) {
  try { await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); } catch (_) {}
}

async function addIndex(conn, table, ddl) {
  try { await conn.execute(`ALTER TABLE ${table} ADD ${ddl}`); } catch (_) {}
}

function templateBody(kind) {
  const commonFooter = '<p style="margin-top:16px;">Regards,<br/>{{agent_name}}<br/>Medical Information</p>';
  if (kind === 'ack') {
    return '<p>Dear {{recipient_name}},</p><p>Thank you for contacting Medical Information regarding {{product_name}}. Your inquiry has been recorded under case {{case_number}}.</p><p>We will review your request and respond according to the applicable medical information process.</p>' + commonFooter;
  }
  if (kind === 'fr-adult-child') {
    return '<p>Bonjour {{recipient_name}},</p><p>Veuillez trouver ci-dessous les informations medicales relatives a {{product_name}}.</p><p>Les documents applicables pour les adultes et les enfants sont joints ou inclus dans cette reponse.</p>{{selected_content}}' + commonFooter;
  }
  if (kind === 'fr-general') {
    return '<p>Bonjour {{recipient_name}},</p><p>Suite a votre demande concernant {{product_name}}, veuillez trouver les informations disponibles et les references applicables.</p>{{selected_content}}' + commonFooter;
  }
  return '<p>Dear {{recipient_name}},</p><p>Please find below the medical information response for case {{case_number}} regarding {{product_name}}.</p>{{selected_content}}' + commonFooter;
}

const TEMPLATE_SEEDS = [
  ['MI Response Email Cover', 'Email', 'Medical Information Response - Case {{case_number}}', templateBody('response')],
  ['Medical Information Acknowledgment', 'Acknowledgment', 'Acknowledgment - Case {{case_number}}', templateBody('ack')],
  ['Standard Response Letter Shell', 'Response', 'Medical Information Letter - {{product_name}}', templateBody('response')],
  ['FR Modalites Administration - Adultes et Enfants', 'Response', 'Reponse information medicale - {{product_name}}', templateBody('fr-adult-child')],
  ['FR Sujet General - AE Hydratation', 'Response', 'Reponse information medicale - {{product_name}}', templateBody('fr-general')],
];

const MODULE_SEEDS = [
  ['Protocole', 'FR Response Block', '<p><strong>Protocole</strong>: Informations de protocole applicables a la demande medicale.</p>', 'fr', 'french,protocole,response'],
  ['Tableau', 'FR Response Block', '<p><strong>Tableau</strong>: Tableau de synthese pour les modalites applicables.</p>', 'fr', 'french,tableau,response'],
  ['Fiche pediatre', 'FR Response Block', '<p><strong>Fiche pediatre</strong>: Informations destinees aux situations pediatriques.</p>', 'fr', 'french,pediatric,response'],
  ['Fiche adultes', 'FR Response Block', '<p><strong>Fiche adultes</strong>: Informations destinees aux situations adultes.</p>', 'fr', 'french,adult,response'],
  ['SmPC Link and QR Code Block', 'Response Block', '<p><strong>SmPC:</strong> Include the applicable National Authority SmPC link and QR code placeholder for the selected product/country.</p>', 'en', 'smpc,qr,response'],
];

async function getOrCreateFolder(conn, orgId, userId) {
  const baseName = 'Response Builder Library';
  const scopedFallbackName = `Response Builder Library - Org ${orgId}`;
  const [[existing]] = await conn.execute(
    'SELECT id FROM cm_folders WHERE org_id = ? AND name IN (?, ?) LIMIT 1',
    [orgId, baseName, scopedFallbackName]
  );
  if (existing) return existing.id;

  const [[globalFolder]] = await conn.execute(
    'SELECT id, org_id FROM cm_folders WHERE name = ? LIMIT 1',
    [baseName]
  );
  const targetName = globalFolder && Number(globalFolder.org_id) !== Number(orgId)
    ? scopedFallbackName
    : baseName;

  const [result] = await conn.execute(
    `INSERT INTO cm_folders (org_id, name, description, status, created_by)
     VALUES (?, ?, 'Starter response templates, letters, and reusable response blocks.', 'Active', ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [orgId, targetName, userId]
  );
  return result.insertId;
}

async function seedOrgResponseContent(conn) {
  const [orgs] = await conn.execute('SELECT id FROM organisations ORDER BY id');
  for (const org of orgs) {
    const [[owner]] = await conn.execute(
      `SELECT id FROM users
        WHERE (org_id = ? OR id IN (SELECT user_id FROM user_org_access WHERE org_id = ? AND is_active = 1))
        ORDER BY CASE WHEN role IN ('admin','superadmin') THEN 0 ELSE 1 END, id ASC
        LIMIT 1`,
      [org.id, org.id]
    );
    if (!owner?.id) continue;
    const folderId = await getOrCreateFolder(conn, org.id, owner.id);

    const templateIds = {};
    for (const [name, type, subject, body] of TEMPLATE_SEEDS) {
      const [[existing]] = await conn.execute(
        `SELECT t.id
           FROM cm_templates t
           JOIN users u ON u.id = t.created_by
          WHERE t.name = ? AND (u.org_id = ? OR EXISTS (SELECT 1 FROM user_org_access uoa WHERE uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1))
          LIMIT 1`,
        [name, org.id, org.id]
      );
      if (existing?.id) {
        templateIds[name] = existing.id;
        continue;
      }
      const [inserted] = await conn.execute(
        `INSERT INTO cm_templates (type, name, subject, body_html, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, 'Active', ?, ?)`,
        [type, name, subject, body, owner.id, owner.id]
      );
      templateIds[name] = inserted.insertId;
    }

    const moduleIds = {};
    for (const [name, moduleType, contentHtml, language, tags] of MODULE_SEEDS) {
      const [[existing]] = await conn.execute(
        'SELECT id FROM cm_modules WHERE folder_id = ? AND name = ? LIMIT 1',
        [folderId, name]
      );
      if (existing?.id) {
        moduleIds[name] = existing.id;
        continue;
      }
      const [[{ maxId }]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_modules');
      const moduleId = `MOD-${String((Number(maxId || 0) + 1)).padStart(5, '0')}`;
      const [inserted] = await conn.execute(
        `INSERT INTO cm_modules
           (module_id, folder_id, module_type, name, content_html, status, created_by, updated_by, activation_date, language, search_tags, document_category, standard_response_text, send_as_pdf)
         VALUES (?, ?, ?, ?, ?, 'Published', ?, ?, CURDATE(), ?, ?, 'Response Builder', ?, 1)`,
        [moduleId, folderId, moduleType, name, contentHtml, owner.id, owner.id, language, tags, contentHtml]
      );
      moduleIds[name] = inserted.insertId;
    }

    const documentSeeds = [
      ['Protocole', 'SRD', 'fr', moduleIds.Protocole],
      ['Tableau', 'SRD', 'fr', moduleIds.Tableau],
      ['Fiche pediatre', 'SRD', 'fr', moduleIds['Fiche pediatre']],
      ['Fiche adultes', 'SRD', 'fr', moduleIds['Fiche adultes']],
      ['SmPC Link and QR Code Block', 'Reference', 'en', moduleIds['SmPC Link and QR Code Block']],
    ];
    const documentIds = {};
    for (const [name, docType, language, moduleId] of documentSeeds) {
      const [[existing]] = await conn.execute(
        'SELECT id FROM cm_documents WHERE folder_id = ? AND name = ? LIMIT 1',
        [folderId, name]
      );
      if (existing?.id) {
        documentIds[name] = existing.id;
        continue;
      }
      const [[{ maxId }]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_documents');
      const docId = `DOC-${String((Number(maxId || 0) + 1)).padStart(5, '0')}`;
      const moduleHtml = MODULE_SEEDS.find(([moduleName]) => moduleName === name)?.[2] || '';
      const [inserted] = await conn.execute(
        `INSERT INTO cm_documents
           (doc_id, folder_id, doc_type, response_doc_type, name, content_html, status, created_by, updated_by, activation_date, language, selected_modules, document_category, standard_response_text, send_as_pdf)
         VALUES (?, ?, ?, 'Module', ?, ?, 'Published', ?, ?, CURDATE(), ?, ?, 'Response Builder', ?, 1)`,
        [docId, folderId, docType, name, moduleHtml, owner.id, owner.id, language, JSON.stringify(moduleId ? [moduleId] : []), moduleHtml]
      );
      documentIds[name] = inserted.insertId;
    }

    const bundles = [
      ['fr_adult_child', 'FR Adult and Child Administration', 'fr', 'Medical enquiry requesting modalities for adults and children', templateIds['FR Modalites Administration - Adultes et Enfants'], ['Protocole', 'Tableau', 'Fiche pediatre', 'Fiche adultes']],
      ['fr_adult', 'FR Adult Administration', 'fr', 'Medical enquiry requesting modalities for adults only', templateIds['FR Modalites Administration - Adultes et Enfants'], ['Protocole', 'Tableau', 'Fiche adultes']],
      ['fr_child', 'FR Pediatric Administration', 'fr', 'Medical enquiry requesting modalities for children only', templateIds['FR Modalites Administration - Adultes et Enfants'], ['Protocole', 'Tableau', 'Fiche pediatre']],
      ['fr_general', 'FR General Topic Response', 'fr', 'General AE management, hydration, literature search, and protocol enclosure', templateIds['FR Sujet General - AE Hydratation'], ['Protocole', 'SmPC Link and QR Code Block']],
    ];
    for (const [bundleKey, name, language, description, templateId, docNames] of bundles) {
      await conn.execute(
        `INSERT IGNORE INTO response_template_bundles
           (org_id, bundle_key, name, language, scenario_key, description, template_id, document_ids, module_ids, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          org.id,
          bundleKey,
          name,
          language,
          bundleKey,
          description,
          templateId || null,
          JSON.stringify(docNames.map((docName) => documentIds[docName]).filter(Boolean)),
          JSON.stringify(docNames.map((docName) => moduleIds[docName]).filter(Boolean)),
          owner.id,
        ]
      );
    }
  }
}

module.exports = {
  async up(conn) {
    await addColumn(conn, 'case_mi_responses', 'recipient_contact_id INT NULL AFTER mi_tab_id');
    await addColumn(conn, 'case_mi_responses', 'recipient_name VARCHAR(255) NULL AFTER recipient_contact_id');
    await addColumn(conn, 'case_mi_responses', 'recipient_email VARCHAR(255) NULL AFTER recipient_name');
    await addColumn(conn, 'case_mi_responses', 'product_id INT NULL AFTER recipient_email');
    await addColumn(conn, 'case_mi_responses', 'template_id INT NULL AFTER product_id');
    await addColumn(conn, 'case_mi_responses', 'template_name VARCHAR(500) NULL AFTER template_id');
    await addColumn(conn, 'case_mi_responses', 'response_subject VARCHAR(500) NULL AFTER response_channel');
    await addColumn(conn, 'case_mi_responses', 'response_body_html MEDIUMTEXT NULL AFTER response_text');
    await addColumn(conn, 'case_mi_responses', 'rendered_preview_html MEDIUMTEXT NULL AFTER response_body_html');
    await addColumn(conn, 'case_mi_responses', 'selected_documents JSON NULL AFTER rendered_preview_html');
    await addColumn(conn, 'case_mi_responses', 'selected_modules JSON NULL AFTER selected_documents');
    await addColumn(conn, 'case_mi_responses', 'source_template_snapshot JSON NULL AFTER selected_modules');
    await addColumn(conn, 'case_mi_responses', 'source_document_snapshot JSON NULL AFTER source_template_snapshot');
    await addColumn(conn, 'case_mi_responses', 'language VARCHAR(20) NOT NULL DEFAULT \'en\' AFTER source_document_snapshot');
    await addColumn(conn, 'case_mi_responses', 'is_customized TINYINT(1) NOT NULL DEFAULT 0 AFTER language');
    await addColumn(conn, 'case_mi_responses', 'customization_notes TEXT NULL AFTER is_customized');
    await addColumn(conn, 'case_mi_responses', 'delivery_metadata JSON NULL AFTER customization_notes');
    await addColumn(conn, 'case_mi_responses', 'sent_at DATETIME NULL AFTER approved_at');
    await addIndex(conn, 'case_mi_responses', 'INDEX idx_case_mi_resp_template (template_id)');
    await addIndex(conn, 'case_mi_responses', 'INDEX idx_case_mi_resp_recipient (recipient_email)');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS response_template_bundles (
        id               INT NOT NULL AUTO_INCREMENT,
        org_id           INT NOT NULL,
        bundle_key       VARCHAR(120) NOT NULL,
        name             VARCHAR(255) NOT NULL,
        language         VARCHAR(20) NOT NULL DEFAULT 'en',
        scenario_key     VARCHAR(120) NULL,
        description      TEXT NULL,
        product_id       INT NULL,
        product_group_id INT NULL,
        country          VARCHAR(100) NULL,
        template_id      INT NULL,
        document_ids     JSON NULL,
        module_ids       JSON NULL,
        is_active        TINYINT(1) NOT NULL DEFAULT 1,
        created_by       INT NULL,
        updated_by       INT NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_response_template_bundle (org_id, bundle_key),
        KEY idx_response_template_bundles_org_lang (org_id, language, is_active),
        KEY idx_response_template_bundles_product (product_id, product_group_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await seedOrgResponseContent(conn);
  }
};
