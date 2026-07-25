'use strict';

const pool = require('../database/db');
const { seedNewOrgWithConnection } = require('./seedService');

const CORE_CASE_TYPES = ['MI', 'AE', 'PC'];
const BASELINE_WORKFLOW_STATES = ['New', 'Triage', 'In Review', 'Pending Follow-up', 'Closed'];
const WORKFLOW_PRIORITY = ['New', 'Open', 'Triage', 'In Review', 'Pending Follow-up', 'Closed'];
const REQUIRED_HELP_KEYS = [
  'general',
  'cases',
  'cases.create',
  'cases.detail',
  'cases.contacts',
  'cases.mi',
  'cases.ae',
  'cases.pc',
  'cases.workflow',
  'cm.folders',
  'cm.documents',
  'cm.modules',
  'cm.templates',
  'cm.merge_reports',
  'cm.faqs',
  'cm.reviews',
  'admin.picklists',
  'admin.field_setup',
  'admin.workflow',
  'admin.product_dictionary',
  'admin.security_groups',
  'admin.case_numbering',
  'admin.organisations',
  'admin.content_intelligence',
  'admin.policy_graph',
  'reports',
  'inbox',
  'browse',
];
const CONTENT_PACK = [
  {
    folderKey: 'core-responses',
    folderLabel: 'Core Responses',
    folderDescription: 'Starter response content for medical, safety, and quality workflows.',
    moduleName: 'Intake Decision Guide',
    moduleType: 'Guidance',
    moduleBody: '<p>Use this starter guide to triage incoming MI, AE, and PC requests consistently across sites.</p>',
    documentName: 'Response Draft Template',
    documentType: 'SRD',
    documentBody: '<p>Draft response template for approved case communications and internal review.</p>',
  },
  {
    folderKey: 'knowledge-base',
    folderLabel: 'Knowledge Base',
    folderDescription: 'Starter knowledge assets for browse, FAQ, and reusable content.',
    moduleName: 'Content Governance Checklist',
    moduleType: 'Checklist',
    moduleBody: '<p>Baseline checklist for review, approval, and publication governance inside Content Management.</p>',
    documentName: 'Starter FAQ Pack',
    documentType: 'FAQ',
    documentBody: '<p>Populate common answers, approved references, and approved escalation guidance here.</p>',
  },
];

function slugify(value) {
  return String(value || 'org')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
}

function titleCaseKey(key) {
  return key
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ');
}

function helpGroupForKey(key) {
  if (key.startsWith('cases')) return 'cases';
  if (key.startsWith('cm.')) return 'content';
  if (key.startsWith('admin.')) return 'admin';
  return 'platform';
}

function helpHtmlForKey(key) {
  const label = titleCaseKey(key);
  return `<p>${label} is enabled as a platform-wide baseline help topic.</p><p>Use this article as the starting point for organisation-specific SOPs, approvals, and operating details.</p>`;
}

async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getOrganisationRow(conn, orgId) {
  const [[org]] = await conn.execute('SELECT * FROM organisations WHERE id = ? LIMIT 1', [orgId]);
  return org || null;
}

async function ensureGlobalWorkflowStates(conn) {
  for (const name of BASELINE_WORKFLOW_STATES) {
    await conn.execute(
      `INSERT INTO workflow_states (name, org_id, is_active)
       SELECT ?, NULL, 1
       WHERE NOT EXISTS (
         SELECT 1 FROM workflow_states WHERE name = ? LIMIT 1
       )`,
      [name, name]
    );
  }
}

async function ensureGlobalHelpArticles(conn, userId) {
  for (const featureKey of REQUIRED_HELP_KEYS) {
    await conn.execute(
      `INSERT INTO help_articles
         (feature_key, feature_group, tags, title, content_html, summary, audience, org_id, sort_order, is_active, created_by, updated_by)
       SELECT ?, ?, ?, ?, ?, ?, ?, NULL, 100, 1, ?, ?
       WHERE NOT EXISTS (
         SELECT 1
         FROM help_articles
         WHERE feature_key = ?
           AND org_id IS NULL
           AND is_active = 1
         LIMIT 1
       )`,
      [
        featureKey,
        helpGroupForKey(featureKey),
        JSON.stringify(['baseline', 'platform']),
        `${titleCaseKey(featureKey)} Help`,
        helpHtmlForKey(featureKey),
        `Platform baseline help for ${titleCaseKey(featureKey)}.`,
        JSON.stringify(['all']),
        userId || null,
        userId || null,
        featureKey,
      ]
    );
  }
}

async function ensureDefaultSite(conn, orgId) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY is_primary DESC, id ASC LIMIT 1',
    [orgId]
  );
  if (existing?.id) return existing.id;

  const [insertResult] = await conn.execute(
    'INSERT INTO sites (org_id, name, country, is_primary, is_active) VALUES (?, ?, ?, 1, 1)',
    [orgId, 'Primary Site', 'United States']
  );
  return insertResult.insertId;
}

async function ensureCaseNumberConfigs(conn, orgId) {
  for (const caseType of CORE_CASE_TYPES) {
    await conn.execute(
      `INSERT INTO case_number_config (org_id, case_type, prefix, \`separator\`, include_year, include_month, seq_length, current_seq, is_locked)
       VALUES (?, ?, ?, '-', 0, 0, 5, 0, 0)
       ON DUPLICATE KEY UPDATE prefix = VALUES(prefix)`,
      [orgId, caseType, caseType]
    );
  }
}

async function generateModuleId(conn) {
  const [[{ maxId }]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_modules');
  return `MOD-${String((Number(maxId || 0) + 1)).padStart(5, '0')}`;
}

async function generateDocId(conn) {
  const [[{ maxId }]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_documents');
  return `DOC-${String((Number(maxId || 0) + 1)).padStart(5, '0')}`;
}

async function ensureContentPack(conn, org, userId, siteId) {
  const orgSlug = slugify(org.name);
  for (const item of CONTENT_PACK) {
    const folderName = `${item.folderLabel} (${orgSlug})`;
    let [[folder]] = await conn.execute(
      'SELECT id FROM cm_folders WHERE org_id = ? AND name = ? LIMIT 1',
      [org.id, folderName]
    );

    if (!folder) {
      const [folderInsert] = await conn.execute(
        `INSERT INTO cm_folders (org_id, name, site_id, description, status, created_by)
         VALUES (?, ?, ?, ?, 'Active', ?)`,
        [org.id, folderName, siteId || null, item.folderDescription, userId || null]
      );
      folder = { id: folderInsert.insertId };
    }

    const [[moduleRow]] = await conn.execute(
      'SELECT id FROM cm_modules WHERE folder_id = ? AND name = ? LIMIT 1',
      [folder.id, item.moduleName]
    );
    if (!moduleRow) {
      const moduleId = await generateModuleId(conn);
      await conn.execute(
        `INSERT INTO cm_modules
           (module_id, folder_id, module_type, name, content_html, status, created_by, updated_by, activation_date, language)
         VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, CURDATE(), 'en')`,
        [moduleId, folder.id, item.moduleType, item.moduleName, item.moduleBody, userId || null, userId || null]
      );
    }

    const [[documentRow]] = await conn.execute(
      'SELECT id FROM cm_documents WHERE folder_id = ? AND name = ? LIMIT 1',
      [folder.id, item.documentName]
    );
    if (!documentRow) {
      const docId = await generateDocId(conn);
      await conn.execute(
        `INSERT INTO cm_documents
           (doc_id, folder_id, doc_type, response_doc_type, name, content_html, status, created_by, updated_by, activation_date, language)
         VALUES (?, ?, ?, 'File', ?, ?, 'Draft', ?, ?, CURDATE(), 'en')`,
        [docId, folder.id, item.documentType, item.documentName, item.documentBody, userId || null, userId || null]
      );
    }
  }
}

async function selectDefaultWorkflowState(conn, orgId) {
  const [rows] = await conn.execute(
    `SELECT id, name, org_id
     FROM workflow_states
     WHERE is_active = 1
       AND (org_id = ? OR org_id IS NULL)
     ORDER BY
       CASE
         WHEN org_id = ? THEN 0
         ELSE 1
       END,
       CASE
         WHEN name = 'New' THEN 0
         WHEN name = 'Open' THEN 1
         WHEN name = 'Triage' THEN 2
         WHEN name = 'In Review' THEN 3
         WHEN name = 'Pending Follow-up' THEN 4
         WHEN name = 'Closed' THEN 5
         ELSE 99
       END,
       id ASC`,
    [orgId, orgId]
  );
  return rows[0] || null;
}

async function resolveDefaultWorkflowStateId(conn, orgId) {
  await ensureGlobalWorkflowStates(conn);
  const state = await selectDefaultWorkflowState(conn, orgId);
  return state?.id || null;
}

async function getOrCreateCaseNumberConfig(conn, orgId, caseType) {
  let [[cfg]] = await conn.execute(
    'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
    [orgId, caseType]
  );
  if (!cfg) {
    await conn.execute(
      `INSERT INTO case_number_config (org_id, case_type, prefix, \`separator\`, include_year, include_month, seq_length, current_seq, is_locked)
       VALUES (?, ?, ?, '-', 0, 0, 5, 0, 0)`,
      [orgId, caseType, caseType || 'CASE']
    );
    [[cfg]] = await conn.execute(
      'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
      [orgId, caseType]
    );
  }
  return cfg;
}

async function assignCaseNumberWithConnection(conn, caseRow) {
  if (caseRow.case_number) return caseRow.case_number;
  const cfg = await getOrCreateCaseNumberConfig(conn, caseRow.org_id, caseRow.case_type || 'ALL');
  let seq = Number(cfg.current_seq || 0) + 1;
  const separator = cfg.separator || '-';
  const prefix = cfg.prefix || caseRow.case_type || 'CASE';
  const seqLength = Number(cfg.seq_length || 5);

  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const parts = [prefix];
    if (cfg.include_year) parts.push(String(new Date().getFullYear()));
    if (cfg.include_month) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
    parts.push(String(seq).padStart(seqLength, '0'));
    const candidate = parts.join(separator);

    const [[dup]] = await conn.execute(
      'SELECT id FROM cases WHERE org_id = ? AND case_number = ? LIMIT 1 FOR UPDATE',
      [caseRow.org_id, candidate]
    );
    if (!dup) {
      await conn.execute(
        'UPDATE case_number_config SET current_seq = ?, is_locked = 1 WHERE id = ?',
        [seq, cfg.id]
      );
      await conn.execute(
        'UPDATE cases SET case_number = ? WHERE id = ?',
        [candidate, caseRow.id]
      );
      return candidate;
    }
    seq += 1;
  }

  throw new Error(`Unable to generate a unique case number for case ${caseRow.id}.`);
}

async function repairOrgDataWithConnection(conn, orgId) {
  const defaultStatusId = await resolveDefaultWorkflowStateId(conn, orgId);
  if (defaultStatusId) {
    await conn.execute(
      `UPDATE cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       SET c.status_id = ?
       WHERE c.org_id = ?
         AND (c.status_id IS NULL OR ws.id IS NULL)`,
      [defaultStatusId, orgId]
    );
  }

  const [casesMissingNumbers] = await conn.execute(
    `SELECT id, org_id, case_type, case_number
     FROM cases
     WHERE org_id = ?
       AND (case_number IS NULL OR TRIM(case_number) = '')
     ORDER BY id ASC
     FOR UPDATE`,
    [orgId]
  );

  for (const caseRow of casesMissingNumbers) {
    await assignCaseNumberWithConnection(conn, caseRow);
  }
}

async function bootstrapOrgWithConnection(conn, orgId, userId) {
  const org = await getOrganisationRow(conn, orgId);
  if (!org) {
    throw new Error('Organisation not found.');
  }

  await ensureGlobalWorkflowStates(conn);
  await ensureGlobalHelpArticles(conn, userId);
  await seedNewOrgWithConnection(conn, orgId, userId);
  const siteId = await ensureDefaultSite(conn, orgId);
  await ensureCaseNumberConfigs(conn, orgId);
  await ensureContentPack(conn, org, userId, siteId);
  await repairOrgDataWithConnection(conn, orgId);

  return getOrgReadinessWithConnection(conn, orgId);
}

async function bootstrapOrg(orgId, userId) {
  return withTransaction((conn) => bootstrapOrgWithConnection(conn, orgId, userId));
}

async function repairOrgData(orgId) {
  return withTransaction(async (conn) => {
    await ensureGlobalWorkflowStates(conn);
    await ensureCaseNumberConfigs(conn, orgId);
    await repairOrgDataWithConnection(conn, orgId);
    return getOrgReadinessWithConnection(conn, orgId);
  });
}

async function getOrgReadinessWithConnection(conn, orgId) {
  const org = await getOrganisationRow(conn, orgId);
  if (!org) {
    throw new Error('Organisation not found.');
  }

  await ensureGlobalWorkflowStates(conn);

  const [
    [[siteCounts]],
    [[workflowCounts]],
    [[helpCounts]],
    [[folderCounts]],
    [[moduleCounts]],
    [[documentCounts]],
    [[configCounts]],
    [[caseDataCounts]],
  ] = await Promise.all([
    conn.execute(
      `SELECT
         COUNT(*) AS total_sites,
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_sites
       FROM sites
       WHERE org_id = ?`,
      [orgId]
    ),
    conn.execute(
      `SELECT COUNT(*) AS active_states
       FROM workflow_states
       WHERE is_active = 1
         AND (org_id = ? OR org_id IS NULL)`,
      [orgId]
    ),
    conn.execute(
      `SELECT COUNT(DISTINCT feature_key) AS covered_keys
       FROM help_articles
       WHERE is_active = 1
         AND (org_id = ? OR org_id IS NULL)`,
      [orgId]
    ),
    conn.execute(
      'SELECT COUNT(*) AS total_folders FROM cm_folders WHERE org_id = ?',
      [orgId]
    ),
    conn.execute(
      `SELECT COUNT(*) AS total_modules
       FROM cm_modules m
       INNER JOIN cm_folders f ON f.id = m.folder_id
       WHERE f.org_id = ?`,
      [orgId]
    ),
    conn.execute(
      `SELECT COUNT(*) AS total_documents
       FROM cm_documents d
       INNER JOIN cm_folders f ON f.id = d.folder_id
       WHERE f.org_id = ?`,
      [orgId]
    ),
    conn.execute(
      `SELECT COUNT(*) AS total_configs
       FROM case_number_config
       WHERE org_id = ?
         AND case_type IN ('MI', 'AE', 'PC')`,
      [orgId]
    ),
    conn.execute(
      `SELECT
         SUM(CASE WHEN c.case_number IS NULL OR TRIM(c.case_number) = '' THEN 1 ELSE 0 END) AS missing_case_numbers,
         SUM(CASE WHEN c.status_id IS NULL OR ws.id IS NULL THEN 1 ELSE 0 END) AS missing_status_links
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       WHERE c.org_id = ?`,
      [orgId]
    ),
  ]);

  const counts = {
    sites: Number(siteCounts?.active_sites || 0),
    workflowStates: Number(workflowCounts?.active_states || 0),
    helpCoverage: Number(helpCounts?.covered_keys || 0),
    helpTotal: REQUIRED_HELP_KEYS.length,
    folders: Number(folderCounts?.total_folders || 0),
    modules: Number(moduleCounts?.total_modules || 0),
    documents: Number(documentCounts?.total_documents || 0),
    caseNumberConfigs: Number(configCounts?.total_configs || 0),
    missingCaseNumbers: Number(caseDataCounts?.missing_case_numbers || 0),
    missingStatusLinks: Number(caseDataCounts?.missing_status_links || 0),
  };

  const checks = [
    {
      key: 'sites',
      label: 'Active site baseline',
      ok: counts.sites > 0,
      detail: counts.sites > 0 ? `${counts.sites} active site(s)` : 'No active site configured.',
    },
    {
      key: 'workflow',
      label: 'Workflow baseline',
      ok: counts.workflowStates > 0,
      detail: counts.workflowStates > 0 ? `${counts.workflowStates} workflow state(s) available` : 'No workflow states available.',
    },
    {
      key: 'help',
      label: 'Help baseline',
      ok: counts.helpCoverage === counts.helpTotal,
      detail: `${counts.helpCoverage}/${counts.helpTotal} help topics covered`,
    },
    {
      key: 'content',
      label: 'Content baseline',
      ok: counts.folders > 0 && counts.modules > 0 && counts.documents > 0,
      detail: `${counts.folders} folder(s), ${counts.modules} module(s), ${counts.documents} document(s)`,
    },
    {
      key: 'numbering',
      label: 'Case numbering defaults',
      ok: counts.caseNumberConfigs >= CORE_CASE_TYPES.length,
      detail: `${counts.caseNumberConfigs}/${CORE_CASE_TYPES.length} core case numbering configs`,
    },
    {
      key: 'case-data',
      label: 'Case data quality',
      ok: counts.missingCaseNumbers === 0 && counts.missingStatusLinks === 0,
      detail: `${counts.missingCaseNumbers} missing case number(s), ${counts.missingStatusLinks} missing status link(s)`,
    },
  ];

  const blockers = checks.filter((check) => !check.ok).map((check) => check.detail);
  const warnings = [];
  if (counts.helpCoverage > 0 && counts.helpCoverage < counts.helpTotal) {
    warnings.push(`Help coverage is partial at ${counts.helpCoverage}/${counts.helpTotal}.`);
  }
  if ((siteCounts?.total_sites || 0) > counts.sites) {
    warnings.push('One or more sites exist but are inactive.');
  }

  const passedChecks = checks.filter((check) => check.ok).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    org_id: Number(org.id),
    org_name: org.name,
    ready: blockers.length === 0,
    score,
    counts,
    blockers,
    warnings,
    checks,
    config: {
      two_factor_enabled: !!org.two_factor_enabled,
      session_timeout_minutes: Number(org.session_timeout_minutes || 30),
    },
  };
}

async function getOrgReadiness(orgId) {
  const conn = await pool.getConnection();
  try {
    return await getOrgReadinessWithConnection(conn, orgId);
  } finally {
    conn.release();
  }
}

async function getPlatformReadinessSummary() {
  const conn = await pool.getConnection();
  try {
    const [orgs] = await conn.execute('SELECT id FROM organisations ORDER BY name ASC');
    const readiness = [];
    for (const org of orgs) {
      readiness.push(await getOrgReadinessWithConnection(conn, org.id));
    }

    const readyOrgs = readiness.filter((item) => item.ready).length;
    const attentionOrgs = readiness.length - readyOrgs;
    const averageScore = readiness.length
      ? Math.round(readiness.reduce((sum, item) => sum + Number(item.score || 0), 0) / readiness.length)
      : 100;
    const totalBlockers = readiness.reduce((sum, item) => sum + item.blockers.length, 0);

    return {
      total_orgs: readiness.length,
      ready_orgs: readyOrgs,
      attention_orgs: attentionOrgs,
      average_score: averageScore,
      total_blockers: totalBlockers,
      orgs: readiness,
    };
  } finally {
    conn.release();
  }
}

module.exports = {
  BASELINE_WORKFLOW_STATES,
  REQUIRED_HELP_KEYS,
  bootstrapOrg,
  bootstrapOrgWithConnection,
  getOrgReadiness,
  getOrgReadinessWithConnection,
  getPlatformReadinessSummary,
  repairOrgData,
  repairOrgDataWithConnection,
  resolveDefaultWorkflowStateId,
  assignCaseNumberWithConnection,
};
