'use strict';
/**
 * miResponseService.js — MI Response Builder + Context Resolution
 *
 * Extracted from routes/cases.js (Architecture Fix A1).
 * Handles the response package assembly: template rendering, document/module
 * resolution, recipient lookup, and merge-field application.
 *
 * Route handlers (GET context, POST preview, POST create, PATCH status)
 * remain in routes/cases.js — they call buildResponsePackage() from here.
 *
 * Owned by: Varun (CTO)
 */

const pool = require('../database/db');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const {
  uniquePositiveInts,
  stripHtml,
  applyMergeFields,
  parseJsonSafe,
} = require('./caseHelpers');

// ── Case + MI tab scope helpers ───────────────────────────────────────────────

async function getResponseBuilderCase(req, caseId) {
  const isPlatformAdmin = hasGlobalAdminScope(req.user);
  const [rows] = await pool.execute(
    isPlatformAdmin
      ? `SELECT c.id, c.case_number, c.case_type, c.org_id, c.site_id, c.description, o.name AS org_name
           FROM cases c LEFT JOIN organisations o ON o.id = c.org_id WHERE c.id = ?`
      : `SELECT c.id, c.case_number, c.case_type, c.org_id, c.site_id, c.description, o.name AS org_name
           FROM cases c LEFT JOIN organisations o ON o.id = c.org_id WHERE c.id = ? AND c.org_id = ?`,
    isPlatformAdmin ? [caseId] : [caseId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getResponseBuilderMiTab(caseId, miTabId = null) {
  const [rows] = await pool.execute(
    `SELECT mi.*, p.trade_name AS product_name, p.family_id, p.authorization_country, pf.name AS family_name
       FROM case_mi mi
       LEFT JOIN products p ON p.id = mi.product_id
       LEFT JOIN product_families pf ON pf.id = p.family_id
      WHERE mi.case_id = ? ${miTabId ? 'AND mi.id = ?' : ''}
      ORDER BY mi.tab_index ASC, mi.id ASC LIMIT 1`,
    miTabId ? [caseId, miTabId] : [caseId]
  );
  return rows[0] || null;
}

async function getResponseBuilderRecipient(caseId, recipientContactId = null, fallbackEmail = null, fallbackName = null) {
  const params = [caseId];
  let extra = '';
  if (recipientContactId) { extra = 'AND cc.id = ?'; params.push(Number(recipientContactId)); }

  const [rows] = await pool.execute(
    `SELECT cc.id AS case_contact_id, cc.contact_id,
            COALESCE(cc.first_name, ct.first_name, '') AS first_name,
            COALESCE(cc.last_name,  ct.last_name,  '') AS last_name,
            COALESCE(cc.email,      ct.email,       '') AS email,
            COALESCE(cc.institution, ct.institution, '') AS institution,
            cc.role_in_case, cc.is_primary
       FROM case_contacts cc
       LEFT JOIN contacts ct ON ct.id = cc.contact_id
      WHERE cc.case_id = ? ${extra}
      ORDER BY cc.is_primary DESC, cc.id ASC LIMIT 1`,
    params
  );
  const row      = rows[0] || {};
  const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  return {
    case_contact_id: row.case_contact_id || recipientContactId || null,
    name:            fullName || fallbackName || fallbackEmail || '',
    email:           row.email || fallbackEmail || '',
    institution:     row.institution || '',
    role_in_case:    row.role_in_case || '',
    is_primary:      row.is_primary ? 1 : 0,
  };
}

async function listResponseBuilderRecipients(caseId) {
  const [rows] = await pool.execute(
    `SELECT cc.id AS case_contact_id, cc.contact_id,
            COALESCE(cc.first_name, ct.first_name, '') AS first_name,
            COALESCE(cc.last_name,  ct.last_name,  '') AS last_name,
            COALESCE(cc.email,      ct.email,       '') AS email,
            COALESCE(cc.institution, ct.institution, '') AS institution,
            cc.role_in_case, cc.is_primary
       FROM case_contacts cc
       LEFT JOIN contacts ct ON ct.id = cc.contact_id
      WHERE cc.case_id = ?
      ORDER BY cc.is_primary DESC, cc.id ASC`,
    [caseId]
  );
  return rows.map((row) => ({
    ...row,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || `Contact #${row.case_contact_id}`,
  }));
}

// ── Response package builder — assembles template + docs + merge fields ───────

async function buildResponsePackage(req, caseId, payload = {}) {
  const scopedCase = await getResponseBuilderCase(req, caseId);
  if (!scopedCase) {
    const error = new Error('Case not found.');
    error.statusCode = 404;
    throw error;
  }

  const miTab    = await getResponseBuilderMiTab(caseId, payload.mi_tab_id || null);
  const productId = Number(payload.product_id || miTab?.product_id || 0) || null;
  let product = null;
  if (productId) {
    const [[row]] = await pool.execute(
      `SELECT p.*, pf.name AS family_name FROM products p LEFT JOIN product_families pf ON pf.id = p.family_id WHERE p.id = ?`,
      [productId]
    );
    product = row || null;
  }

  const recipient = await getResponseBuilderRecipient(
    caseId,
    payload.recipient_contact_id || null,
    payload.recipient_email       || null,
    payload.recipient_name        || null
  );

  let template = null;
  if (payload.template_id) {
    const [templateRows] = await pool.execute(
      `SELECT t.* FROM cm_templates t LEFT JOIN users u ON u.id = t.created_by
        WHERE t.id = ? AND t.status = 'Active'
          AND (? = 1 OR u.org_id = ? OR EXISTS (
            SELECT 1 FROM user_org_access uoa WHERE uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
          )) LIMIT 1`,
      [payload.template_id, hasGlobalAdminScope(req.user) ? 1 : 0, scopedCase.org_id, scopedCase.org_id]
    );
    template = templateRows[0] || null;
    if (!template) {
      const error = new Error('Template not found for this organisation.');
      error.statusCode = 404;
      throw error;
    }
  }

  // Resolve documents
  const selectedDocumentIds = uniquePositiveInts(payload.selected_document_ids || payload.document_ids || []);
  const selectedModuleIds   = uniquePositiveInts(payload.selected_module_ids   || payload.module_ids   || []);

  let selectedDocuments = [];
  if (selectedDocumentIds.length) {
    const placeholders = selectedDocumentIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.doc_type, d.response_doc_type, d.content_html,
              d.standard_response_text, d.file_path, d.file_name, d.file_mime, d.language,
              d.send_as_pdf, d.selected_modules
         FROM cm_documents d INNER JOIN cm_folders f ON f.id = d.folder_id
        WHERE d.id IN (${placeholders}) AND (? = 1 OR f.org_id = ?)
          AND d.status = 'Approved'
          AND (d.expiry_date     IS NULL OR d.expiry_date     >= CURDATE())
          AND (d.activation_date IS NULL OR d.activation_date <= CURDATE())`,
      [...selectedDocumentIds, hasGlobalAdminScope(req.user) ? 1 : 0, scopedCase.org_id]
    );
    selectedDocuments = rows;

    // Refuse the build rather than silently sending a response that is missing
    // content the author believed they had attached. cmExpiryAlertService only
    // emails ahead of an expiry date; nothing stopped the send itself until now
    // (PAUD-2 item 3). Same shape as the template check above.
    if (rows.length !== selectedDocumentIds.length) {
      const found   = new Set(rows.map((d) => d.id));
      const blocked = selectedDocumentIds.filter((id) => !found.has(id));
      const error = new Error(
        `Document(s) ${blocked.join(', ')} are not available to send. A document must be Approved, past its activation date and not expired.`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  let moduleIdsFromDocuments = [];
  selectedDocuments.forEach((doc) => {
    moduleIdsFromDocuments = moduleIdsFromDocuments.concat(parseJsonSafe(doc.selected_modules, []));
  });
  const allModuleIds = uniquePositiveInts([...selectedModuleIds, ...moduleIdsFromDocuments]);
  let selectedModules = [];
  if (allModuleIds.length) {
    const placeholders = allModuleIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT m.id, m.module_id, m.name, m.module_type, m.content_html, m.standard_response_text,
              m.language, m.send_as_pdf
         FROM cm_modules m INNER JOIN cm_folders f ON f.id = m.folder_id
        WHERE m.id IN (${placeholders}) AND (? = 1 OR f.org_id = ?)`,
      [...allModuleIds, hasGlobalAdminScope(req.user) ? 1 : 0, scopedCase.org_id]
    );
    selectedModules = rows;
  }

  // Assemble content blocks
  const contentBlocks = [];
  selectedModules.forEach((mod) => {
    contentBlocks.push(`<section data-response-module-id="${mod.id}"><h3>${mod.name}</h3>${mod.standard_response_text || mod.content_html || ''}</section>`);
  });
  selectedDocuments.forEach((doc) => {
    const docBody = doc.standard_response_text || doc.content_html || '';
    if (docBody) contentBlocks.push(`<section data-response-document-id="${doc.id}"><h3>${doc.name}</h3>${docBody}</section>`);
  });
  const selectedContent = contentBlocks.join('\n');

  // Merge field map
  const mergeData = {
    date:             new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
    agent_name:       req.user.name || req.user.email || '',
    case_number:      scopedCase.case_number || '',
    case_type:        scopedCase.case_type || '',
    org_name:         scopedCase.org_name || '',
    recipient_name:   recipient.name || recipient.email || 'Requestor',
    recipient_email:  recipient.email || '',
    patient_name:     recipient.name || '',
    patient_email:    recipient.email || '',
    product_name:     product?.trade_name || miTab?.product_name || '',
    product_family:   product?.family_name || miTab?.family_name || '',
    mi_question:      miTab?.question_summary || miTab?.detailed_question || '',
    selected_content: selectedContent,
    smpc_link:        payload.smpc_link || '',
    qr_code:          payload.qr_code || '',
  };

  const templateSubject = payload.subject !== undefined
    ? payload.subject
    : (template?.subject || `Medical Information Response - Case ${scopedCase.case_number || caseId}`);
  const templateBody = payload.body_html !== undefined
    ? payload.body_html
    : (template?.body_html || payload.response_text || '');
  const customText = String(payload.custom_text || '').trim();
  const bodyWithCustomText = customText
    ? `${templateBody || ''}<section data-custom-response-text="true"><h3>Additional Response Text</h3><p>${customText.replace(/\n/g, '<br/>')}</p></section>`
    : templateBody;

  const renderedSubject = applyMergeFields(templateSubject, mergeData);
  const renderedBody    = applyMergeFields(bodyWithCustomText || '{{selected_content}}', mergeData);
  const previewHtml     = `<article class="mi-response-preview"><h2>${renderedSubject}</h2>${renderedBody}</article>`;

  return {
    case:              scopedCase,
    mi_tab:            miTab,
    product,
    recipient,
    template,
    rendered_subject:      renderedSubject,
    rendered_body_html:    renderedBody,
    rendered_text:         stripHtml(renderedBody),
    rendered_preview_html: previewHtml,
    selected_documents: selectedDocuments.map((doc) => ({
      id: doc.id, doc_id: doc.doc_id, name: doc.name, doc_type: doc.doc_type,
      response_doc_type: doc.response_doc_type, file_name: doc.file_name,
      file_mime: doc.file_mime, language: doc.language, send_as_pdf: doc.send_as_pdf ? 1 : 0,
    })),
    selected_modules: selectedModules.map((mod) => ({
      id: mod.id, module_id: mod.module_id, name: mod.name, module_type: mod.module_type,
      language: mod.language, send_as_pdf: mod.send_as_pdf ? 1 : 0,
    })),
    source_template_snapshot: template ? {
      id: template.id, name: template.name, type: template.type, subject: template.subject,
      body_html: template.body_html,
      version: `${template.version_major || 1}.${template.version_minor || 0}`,
    } : null,
    source_document_snapshot: selectedDocuments.map((doc) => ({
      id: doc.id, doc_id: doc.doc_id, name: doc.name, doc_type: doc.doc_type,
      version: `${doc.version_major || 1}.${doc.version_minor || 0}`,
    })),
    merge_data: mergeData,
    language:     payload.language || template?.language || selectedDocuments[0]?.language || 'en',
    is_customized: payload.is_customized !== undefined
      ? !!payload.is_customized
      : !!(payload.body_html !== undefined || payload.subject !== undefined || customText),
  };
}

module.exports = {
  getResponseBuilderCase,
  getResponseBuilderMiTab,
  getResponseBuilderRecipient,
  listResponseBuilderRecipients,
  buildResponsePackage,
};
