'use strict';

const pool = require('../database/db');
const { logger } = require('./logger');
const { logService } = require('./serviceLogger');
const { seedNovartisFullScope } = require('../scripts/seed-novartis-full-scope');

const GENERATED_MARKER = '[novartis-simulation]';
const GENERATED_SOURCE_TAG = 'Novartis Daily Simulation';
const GENERATED_CONTENT_TAG = 'novartis-simulation';
const JOB_NAME_PREFIX = 'novartis-daily-simulation-org-';
const DEFAULT_CRON = '15 1 * * *';
const DEFAULT_CONFIG = Object.freeze({
  orgId: 1,
  targetCases: 100000,
  targetInquiries: 100000,
  contentFolders: 24,
  contentModules: 240,
  contentDocuments: 360,
  contentFaqs: 180,
  helpArticles: 60,
  archiveAfterDays: 30,
  historySpanDays: 45,
  batchSize: 300,
  isActive: true,
});

const CASE_TYPE_SEQUENCE = ['MI', 'MI', 'MI', 'MI', 'MI', 'MI', 'AE', 'AE', 'PC', 'PC'];
const PRIORITY_SEQUENCE = ['high', 'normal', 'normal', 'low', 'normal', 'high', 'normal', 'low'];
const MI_SCENARIOS = [
  {
    subject: 'Entresto titration after symptomatic hypotension',
    summary: 'Dose titration after symptomatic hypotension',
    detail: 'HCP needs label-aligned guidance for temporary down-titration, monitoring, and re-escalation after symptomatic hypotension.',
    category: 'Dosing & Administration',
    subcategory: 'Titration guidance',
  },
  {
    subject: 'Kisqali monitoring after grade 3 neutropenia',
    summary: 'Monitoring after grade 3 neutropenia',
    detail: 'Oncology team requested monitoring frequency, interruption thresholds, and restart criteria after grade 3 neutropenia.',
    category: 'Safety',
    subcategory: 'Laboratory monitoring',
  },
  {
    subject: 'Leqvio administration timing around missed appointments',
    summary: 'Missed-dose administration timing',
    detail: 'Requester needs concise guidance on re-scheduling Leqvio when a patient misses the planned maintenance visit.',
    category: 'Administration',
    subcategory: 'Missed dose',
  },
  {
    subject: 'Kesimpta switch guidance after prior anti-CD20 therapy',
    summary: 'Switching between anti-CD20 therapies',
    detail: 'Neurology contact asked for medical information on switching timelines, monitoring, and patient counseling during therapy transition.',
    category: 'Treatment transition',
    subcategory: 'Switch strategy',
  },
];
const AE_SCENARIOS = [
  {
    subject: 'Serious infection requiring hospitalization',
    reaction: 'Patient developed a serious infection that required inpatient hospitalization and IV antimicrobial treatment.',
    outcome: 'Recovering',
  },
  {
    subject: 'Suspected hepatic signal with transaminase elevation',
    reaction: 'Patient showed symptomatic transaminase elevation with treatment interruption requested by the reporting physician.',
    outcome: 'Recovering',
  },
  {
    subject: 'Severe rash with emergency evaluation',
    reaction: 'Reporter described an acute dermatologic reaction requiring emergency evaluation and treatment discontinuation.',
    outcome: 'Not recovered',
  },
];
const PC_SCENARIOS = [
  {
    subject: 'Leaking prefilled syringe reported by specialty pharmacy',
    category: 'Device defect',
    complaint: 'Pharmacy reported a leaking prefilled syringe discovered during preparation for administration.',
  },
  {
    subject: 'Tablet bottle seal concern before dispense',
    category: 'Packaging issue',
    complaint: 'Packaging seal appeared compromised before dispense and the customer requested replacement guidance.',
  },
  {
    subject: 'Cold-chain excursion concern during delivery',
    category: 'Distribution issue',
    complaint: 'Reporter raised a possible temperature excursion during shipment and requested complaint handling instructions.',
  },
];
const FOLDER_THEMES = [
  'Cardiology Response Library',
  'Oncology Response Library',
  'Immunology Knowledge Base',
  'Neurology Knowledge Base',
  'Safety Intake Playbooks',
  'Product Quality Playbooks',
  'Field Medical Briefs',
  'Call Center SOPs',
  'Escalation Decision Trees',
  'Response Template Hub',
  'FAQ Authoring Workspace',
  'Case Review Toolkit',
];
const MODULE_TYPES = ['Guidance', 'Checklist', 'Template', 'Reference', 'SOP'];
const DOCUMENT_TYPES = ['SRD', 'FAQ', 'Reference', 'Template', 'Response'];
const CONTENT_STATUSES = ['Draft', 'Published', 'Certified', 'Archived'];
const FAQ_CATEGORIES = ['Dosing', 'Safety', 'Access', 'Storage', 'Escalation', 'Administration'];
const HELP_GROUPS = ['platform', 'content', 'cases', 'inbox', 'reports', 'admin'];

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jobNameForOrg(orgId) {
  return `${JOB_NAME_PREFIX}${orgId}`;
}

function now() {
  return new Date();
}

function isoNow() {
  return now().toISOString();
}

function toDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daysAgo(days, hourOffset = 0, minuteOffset = 0) {
  const date = now();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours((date.getUTCHours() + hourOffset + 24) % 24, minuteOffset % 60, 0, 0);
  return date;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildInClause(length) {
  return `(${new Array(length).fill('?').join(', ')})`;
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function bulkInsertSql(table, columns, rows) {
  if (!rows.length) return null;
  const placeholderRow = `(${columns.map(() => '?').join(', ')})`;
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rows.map(() => placeholderRow).join(', ')}`,
    params: rows.flat(),
  };
}

async function executeBulkInsert(conn, table, columns, rows) {
  if (!rows.length) {
    return { insertId: 0, affectedRows: 0 };
  }
  const payload = bulkInsertSql(table, columns, rows);
  const [result] = await conn.execute(payload.sql, payload.params);
  return result;
}

async function scalar(conn, sql, params = []) {
  const [[row]] = await conn.execute(sql, params);
  if (!row) return null;
  return row[Object.keys(row)[0]];
}

function normalizeConfig(raw = {}) {
  const config = {
    orgId: toInt(raw.orgId, DEFAULT_CONFIG.orgId),
    targetCases: Math.max(0, toInt(raw.targetCases, DEFAULT_CONFIG.targetCases)),
    targetInquiries: Math.max(0, toInt(raw.targetInquiries, DEFAULT_CONFIG.targetInquiries)),
    contentFolders: Math.max(0, toInt(raw.contentFolders, DEFAULT_CONFIG.contentFolders)),
    contentModules: Math.max(0, toInt(raw.contentModules, DEFAULT_CONFIG.contentModules)),
    contentDocuments: Math.max(0, toInt(raw.contentDocuments, DEFAULT_CONFIG.contentDocuments)),
    contentFaqs: Math.max(0, toInt(raw.contentFaqs, DEFAULT_CONFIG.contentFaqs)),
    helpArticles: Math.max(0, toInt(raw.helpArticles, DEFAULT_CONFIG.helpArticles)),
    archiveAfterDays: Math.max(1, toInt(raw.archiveAfterDays, DEFAULT_CONFIG.archiveAfterDays)),
    historySpanDays: Math.max(7, toInt(raw.historySpanDays, DEFAULT_CONFIG.historySpanDays)),
    batchSize: Math.min(1000, Math.max(50, toInt(raw.batchSize, DEFAULT_CONFIG.batchSize))),
    isActive: raw.isActive !== false,
  };
  if (config.targetInquiries < config.targetCases) {
    config.targetInquiries = config.targetCases;
  }
  return config;
}

function scheduledJobPayload(config) {
  return {
    orgId: config.orgId,
    targetCases: config.targetCases,
    targetInquiries: config.targetInquiries,
    contentFolders: config.contentFolders,
    contentModules: config.contentModules,
    contentDocuments: config.contentDocuments,
    contentFaqs: config.contentFaqs,
    helpArticles: config.helpArticles,
    archiveAfterDays: config.archiveAfterDays,
    historySpanDays: config.historySpanDays,
    batchSize: config.batchSize,
  };
}

async function ensureScheduledJobRow(conn, config) {
  const payload = JSON.stringify(scheduledJobPayload(config));
  await conn.execute(
    `INSERT INTO scheduled_jobs
       (job_name, cron_expression, description, is_active, org_id, job_type, job_config, schedule_cron, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       cron_expression = VALUES(cron_expression),
       description = VALUES(description),
       org_id = VALUES(org_id),
       job_type = VALUES(job_type),
       job_config = VALUES(job_config),
       schedule_cron = VALUES(schedule_cron),
       is_active = VALUES(is_active),
       updated_at = NOW()`,
    [
      jobNameForOrg(config.orgId),
      DEFAULT_CRON,
      'Daily Novartis high-volume simulation and archival run',
      config.isActive ? 1 : 0,
      config.orgId,
      'novartis_simulation',
      payload,
      DEFAULT_CRON,
    ]
  );
}

async function updateScheduledJobRun(conn, orgId, status, errorText = null) {
  await conn.execute(
    `UPDATE scheduled_jobs
        SET last_run_at = NOW(),
            last_run_status = ?,
            last_error = ?,
            updated_at = NOW()
      WHERE job_name = ?`,
    [status, errorText, jobNameForOrg(orgId)]
  );
}

async function loadScheduledJobConfig(conn, orgId) {
  const [[row]] = await conn.execute(
    `SELECT id, is_active, job_config
       FROM scheduled_jobs
      WHERE job_name = ?
      LIMIT 1`,
    [jobNameForOrg(orgId)]
  );
  if (!row) return normalizeConfig({ orgId });
  const payload = safeJsonParse(row.job_config, {});
  const config = normalizeConfig({ orgId, ...payload, isActive: !!row.is_active });
  config.jobRowId = row.id;
  return config;
}

async function ensureBaselineIfNeeded(config) {
  await pool.initPromise;
  const conn = await pool.getConnection();
  try {
    const [[counts]] = await conn.execute(
      `SELECT
         (SELECT COUNT(*) FROM sites WHERE org_id = ? AND is_active = 1) AS sites,
         (SELECT COUNT(*) FROM user_org_access uoa JOIN users u ON u.id = uoa.user_id WHERE uoa.org_id = ? AND uoa.is_active = 1 AND u.is_active = 1) AS active_users,
         (SELECT COUNT(*) FROM email_accounts WHERE org_id = ? AND is_active = 1) AS email_accounts,
         (SELECT COUNT(*) FROM contacts WHERE org_id = ? AND is_active = 1) AS contacts,
         (SELECT COUNT(*) FROM products WHERE org_id = ? AND is_active = 1) AS products,
         (SELECT COUNT(*) FROM product_groups WHERE org_id = ? AND is_active = 1) AS product_groups`,
      [config.orgId, config.orgId, config.orgId, config.orgId, config.orgId, config.orgId]
    );

    const needsBaseline = !counts
      || Number(counts.sites || 0) < 1
      || Number(counts.active_users || 0) < 5
      || Number(counts.email_accounts || 0) < 1
      || Number(counts.contacts || 0) < 5
      || Number(counts.products || 0) < 4
      || Number(counts.product_groups || 0) < 3;

    if (needsBaseline) {
      logger.info({ org_id: config.orgId }, 'Novartis simulation baseline missing, running full-scope seed');
      await seedNovartisFullScope(config.orgId, { closePool: false });
    }
  } finally {
    conn.release();
  }
}

async function getSimulationContext(conn, config) {
  const [[org]] = await conn.execute('SELECT id, name FROM organisations WHERE id = ? LIMIT 1', [config.orgId]);
  if (!org) throw new Error(`Organisation ${config.orgId} not found.`);

  const [[mailbox]] = await conn.execute(
    'SELECT * FROM email_accounts WHERE org_id = ? AND is_active = 1 ORDER BY is_default_outbound DESC, id ASC LIMIT 1',
    [config.orgId]
  );
  if (!mailbox) throw new Error(`Organisation ${config.orgId} has no active mailbox.`);

  const [sites] = await conn.execute(
    'SELECT id, name FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY id ASC',
    [config.orgId]
  );
  if (!sites.length) throw new Error(`Organisation ${config.orgId} has no active site.`);

  const [users] = await conn.execute(
    `SELECT u.id, u.name, u.email, u.role, uoa.role_at_org
       FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id
      WHERE uoa.org_id = ? AND uoa.is_active = 1 AND u.is_active = 1
      ORDER BY u.id ASC`,
    [config.orgId]
  );
  if (!users.length) throw new Error(`Organisation ${config.orgId} has no active users.`);

  const [states] = await conn.execute(
    'SELECT id, name FROM workflow_states WHERE is_active = 1 AND (org_id = ? OR org_id IS NULL) ORDER BY id ASC',
    [config.orgId]
  );
  const statusByName = new Map(states.map((row) => [row.name, row.id]));

  const [products] = await conn.execute(
    `SELECT p.id, p.trade_name, pf.name AS family_name
       FROM products p
       LEFT JOIN product_families pf ON pf.id = p.family_id
      WHERE p.org_id = ? AND p.is_active = 1
      ORDER BY p.id ASC`,
    [config.orgId]
  );
  const [contacts] = await conn.execute(
    `SELECT id, first_name, last_name, email, type, specialty, institution, phone, address
       FROM contacts
      WHERE org_id = ? AND is_active = 1
      ORDER BY id ASC`,
    [config.orgId]
  );
  const [groups] = await conn.execute(
    `SELECT id, name, group_type
       FROM product_groups
      WHERE org_id = ? AND is_active = 1
      ORDER BY id ASC`,
    [config.orgId]
  );

  const demoUsers = users.filter((user) => String(user.email || '').endsWith('@novartis-demo.com'));
  const workloadUsers = demoUsers.length >= 4 ? demoUsers : users;
  const owners = workloadUsers.filter((user) => ['admin', 'agent'].includes(String(user.role || '').toLowerCase()));
  const reviewers = workloadUsers.filter((user) => ['reviewer', 'admin'].includes(String(user.role || '').toLowerCase()));

  return {
    org,
    site: sites[0],
    mailbox,
    users,
    owners: owners.length ? owners : users,
    reviewers: reviewers.length ? reviewers : users,
    admin: workloadUsers.find((user) => String(user.role || '').toLowerCase() === 'admin') || users[0],
    statusByName,
    products,
    contacts,
    productGroups: groups,
  };
}

function allocateOwner(context, caseType, index) {
  const poolForType = context.owners.filter((user) => {
    if (caseType === 'MI') return ['agent', 'admin'].includes(String(user.role || '').toLowerCase());
    if (caseType === 'AE' || caseType === 'PC') return ['agent', 'admin'].includes(String(user.role || '').toLowerCase());
    return true;
  });
  const users = poolForType.length ? poolForType : context.owners;
  return users[index % users.length];
}

function allocateReviewer(context, index) {
  const users = context.reviewers.length ? context.reviewers : context.users;
  return users[index % users.length];
}

function pickProduct(context, caseType, index) {
  const lowerProducts = context.products.map((product) => ({
    ...product,
    trade_name_lower: String(product.trade_name || '').toLowerCase(),
  }));
  let candidates = lowerProducts;
  if (caseType === 'MI') {
    candidates = lowerProducts.filter((item) => !item.trade_name_lower.includes('cosentyx'));
  } else if (caseType === 'AE') {
    candidates = lowerProducts.filter((item) => item.trade_name_lower.includes('cosentyx') || item.trade_name_lower.includes('kisqali') || item.trade_name_lower.includes('leqvio'));
  } else if (caseType === 'PC') {
    candidates = lowerProducts.filter((item) => item.trade_name_lower.includes('leqvio') || item.trade_name_lower.includes('entresto') || item.trade_name_lower.includes('cosentyx'));
  }
  const products = candidates.length ? candidates : context.products;
  return products[index % products.length];
}

function pickContact(context, caseType, index) {
  let candidates = context.contacts;
  if (caseType === 'MI') {
    candidates = context.contacts.filter((item) => item.type === 'HCP');
  } else if (caseType === 'AE') {
    candidates = context.contacts.filter((item) => item.type === 'HCP');
  } else if (caseType === 'PC') {
    candidates = context.contacts.filter((item) => item.type === 'Reporter');
  }
  const contacts = candidates.length ? candidates : context.contacts;
  return contacts[index % contacts.length];
}

function pickProductGroup(context, product) {
  const productLabel = String(product.trade_name || '').split(' ')[0];
  return context.productGroups.find((group) => String(group.name || '').startsWith(productLabel)) || context.productGroups[0] || null;
}

function determineQueue(caseType, priority, statusName) {
  if (caseType === 'AE') return priority === 'high' ? 'Safety Escalations' : 'Safety Intake';
  if (caseType === 'PC') return statusName === 'Closed' ? 'Quality Archive' : 'Quality Complaints';
  if (priority === 'high') return 'Medical Escalations';
  return statusName === 'Pending Follow-up' ? 'Scientific Response Draft' : 'Medical Information';
}

function determineLifecycle(historySpanDays, sequence) {
  const daysBack = sequence % historySpanDays;
  if (daysBack <= 1) return { daysBack, statusName: 'New', triageState: 'new', inquiryStatus: 'pending', closed: false };
  if (daysBack <= 5) return { daysBack, statusName: 'Triage', triageState: 'in_review', inquiryStatus: 'pending', closed: false };
  if (daysBack <= 14) return { daysBack, statusName: 'In Review', triageState: 'linked', inquiryStatus: 'processed', closed: false };
  if (daysBack <= 24) return { daysBack, statusName: 'Pending Follow-up', triageState: 'converted', inquiryStatus: 'processed', closed: false };
  return { daysBack, statusName: 'Closed', triageState: 'closed', inquiryStatus: 'processed', closed: true };
}

function buildScenario(context, config, sequence, ordinal, runLabel) {
  const caseType = CASE_TYPE_SEQUENCE[sequence % CASE_TYPE_SEQUENCE.length];
  const lifecycle = determineLifecycle(config.historySpanDays, sequence);
  const product = pickProduct(context, caseType, ordinal);
  const contact = pickContact(context, caseType, ordinal);
  const owner = allocateOwner(context, caseType, ordinal);
  const reviewer = allocateReviewer(context, ordinal);
  const priority = caseType === 'AE' ? PRIORITY_SEQUENCE[(sequence + 1) % PRIORITY_SEQUENCE.length] : PRIORITY_SEQUENCE[sequence % PRIORITY_SEQUENCE.length];
  const receivedDate = daysAgo(lifecycle.daysBack, (ordinal * 3) % 24, (ordinal * 11) % 60);
  const receivedAt = toDateTime(receivedDate);
  const receivedOn = toDateOnly(receivedDate);
  const dueDate = lifecycle.closed ? null : toDateOnly(daysAgo(-Math.max(1, 3 - (sequence % 3))));
  const queueName = determineQueue(caseType, priority, lifecycle.statusName);
  const closedAt = lifecycle.closed ? toDateTime(daysAgo(Math.max(0, lifecycle.daysBack - 2), 12, (ordinal * 7) % 60)) : null;
  const productLabel = String(product.trade_name || 'Novartis Product').split(' ')[0];
  const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();

  if (caseType === 'MI') {
    const pattern = MI_SCENARIOS[ordinal % MI_SCENARIOS.length];
    return {
      runLabel,
      caseType,
      product,
      contact,
      owner,
      reviewer,
      priority,
      receivedAt,
      receivedOn,
      dueDate,
      queueName,
      closedAt,
      lifecycle,
      subject: `${productLabel}: ${pattern.subject}`,
      body: `${contactName} requested medical information for ${product.trade_name}. ${pattern.detail}`,
      caseComment: `Scientific response in progress for ${product.trade_name}. Queue: ${queueName}.`,
      inquiryNote: `Simulation workload item routed to ${owner.name} for ${pattern.category.toLowerCase()}.`,
      mi: {
        category: pattern.category,
        subcategory: pattern.subcategory,
        summary: `${productLabel} - ${pattern.summary}`,
        detail: `${pattern.detail} Requester: ${contactName}.`,
        responseStatus: lifecycle.statusName === 'Closed' ? 'SENT' : lifecycle.statusName === 'Pending Follow-up' ? 'APPROVED' : lifecycle.statusName === 'In Review' ? 'READY' : 'DRAFT',
      },
    };
  }

  if (caseType === 'AE') {
    const pattern = AE_SCENARIOS[ordinal % AE_SCENARIOS.length];
    return {
      runLabel,
      caseType,
      product,
      contact,
      owner,
      reviewer,
      priority: priority === 'low' ? 'normal' : priority,
      receivedAt,
      receivedOn,
      dueDate,
      queueName,
      closedAt,
      lifecycle,
      subject: `${productLabel}: ${pattern.subject}`,
      body: `${contactName} reported a potential adverse event for ${product.trade_name}. ${pattern.reaction}`,
      caseComment: `Safety case triaged for ${product.trade_name}; reviewer handoff prepared.`,
      inquiryNote: `Safety intake routed to ${owner.name} with seriousness review required.`,
      ae: {
        reaction: pattern.reaction,
        outcome: pattern.outcome,
        dose: `${100 + (ordinal % 4) * 50} mg`,
        route: ordinal % 2 === 0 ? 'subcutaneous' : 'oral',
        lot: `LOT-AE-${String(ordinal + 1).padStart(6, '0')}`,
      },
    };
  }

  const pattern = PC_SCENARIOS[ordinal % PC_SCENARIOS.length];
  return {
    runLabel,
    caseType,
    product,
    contact,
    owner,
    reviewer,
    priority,
    receivedAt,
    receivedOn,
    dueDate,
    queueName,
    closedAt,
    lifecycle,
    subject: `${productLabel}: ${pattern.subject}`,
    body: `${contactName} reported a product quality complaint related to ${product.trade_name}. ${pattern.complaint}`,
    caseComment: `Quality complaint opened for ${product.trade_name}. Sample availability recorded for follow-up.`,
    inquiryNote: `Quality intake routed to ${owner.name} for investigation planning.`,
    pc: {
      category: pattern.category,
      complaint: pattern.complaint,
      lot: `LOT-PC-${String(ordinal + 1).padStart(6, '0')}`,
    },
  };
}

async function getOrCreateCaseNumberConfig(conn, orgId, caseType) {
  let [[config]] = await conn.execute(
    'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? LIMIT 1 FOR UPDATE',
    [orgId, caseType]
  );
  if (!config) {
    await conn.execute(
      `INSERT INTO case_number_config
         (org_id, case_type, prefix, separator, include_year, include_month, seq_length, current_seq, is_locked)
       VALUES (?, ?, ?, '-', 0, 0, 5, 0, 0)`,
      [orgId, caseType, caseType]
    );
    [[config]] = await conn.execute(
      'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? LIMIT 1 FOR UPDATE',
      [orgId, caseType]
    );
  }
  return config;
}

function formatCaseNumber(config, seq) {
  const parts = [config.prefix || 'CASE'];
  if (Number(config.include_year || 0)) parts.push(String(now().getUTCFullYear()));
  if (Number(config.include_month || 0)) parts.push(String(now().getUTCMonth() + 1).padStart(2, '0'));
  parts.push(String(seq).padStart(Number(config.seq_length || 5), '0'));
  return parts.join(config.separator || '-');
}

async function reserveCaseNumbers(conn, orgId, scenarios) {
  const byType = new Map();
  scenarios.forEach((scenario) => {
    byType.set(scenario.caseType, (byType.get(scenario.caseType) || 0) + 1);
  });
  const sequences = new Map();

  for (const caseType of CASE_TYPE_SEQUENCE.filter((value, index, all) => all.indexOf(value) === index)) {
    const needed = byType.get(caseType) || 0;
    if (!needed) continue;
    const config = await getOrCreateCaseNumberConfig(conn, orgId, caseType);
    const start = Number(config.current_seq || 0) + 1;
    const end = start + needed - 1;
    const numbers = [];
    for (let seq = start; seq <= end; seq += 1) {
      numbers.push(formatCaseNumber(config, seq));
    }
    await conn.execute(
      'UPDATE case_number_config SET current_seq = ?, is_locked = 1, updated_at = NOW() WHERE id = ?',
      [end, config.id]
    );
    sequences.set(caseType, numbers);
  }

  return scenarios.map((scenario) => {
    const queue = sequences.get(scenario.caseType) || [];
    if (!queue.length) {
      throw new Error(`Unable to reserve case number for ${scenario.caseType}`);
    }
    return queue.shift();
  });
}

async function insertOperationalBatch(conn, context, config, scenarios) {
  if (!scenarios.length) {
    return { createdCases: 0, createdInquiries: 0, notifications: 0 };
  }

  await conn.beginTransaction();
  try {
    const caseNumbers = await reserveCaseNumbers(conn, context.org.id, scenarios);
    const caseRows = scenarios.map((scenario, index) => ([
      context.org.id,
      context.site.id,
      scenario.caseType,
      'email',
      scenario.priority,
      scenario.receivedOn,
      scenario.receivedAt,
      caseNumbers[index],
      context.statusByName.get(scenario.lifecycle.statusName) || context.statusByName.get('New') || null,
      scenario.owner.id,
      `${GENERATED_MARKER} ${scenario.subject}`,
      `${GENERATED_MARKER} run=${scenario.runLabel}; queue=${scenario.queueName}; type=${scenario.caseType}; status=${scenario.lifecycle.statusName}`,
      context.admin.id,
      scenario.receivedAt,
      scenario.receivedAt,
    ]));
    const caseResult = await executeBulkInsert(
      conn,
      'cases',
      ['org_id', 'site_id', 'case_type', 'intake_channel', 'priority', 'date_received', 'date_of_intake', 'case_number', 'status_id', 'case_owner_id', 'description', 'internal_notes', 'created_by', 'created_at', 'updated_at'],
      caseRows
    );

    const casesFirstId = Number(caseResult.insertId || 0);
    scenarios.forEach((scenario, index) => {
      scenario.caseId = casesFirstId + index;
      scenario.caseNumber = caseNumbers[index];
    });

    const inquiryRows = scenarios.map((scenario, index) => ([
      context.org.id,
      context.mailbox.id,
      `nov-sim-${scenario.runLabel}-${scenario.caseNumber}`,
      `nov-sim-${scenario.runLabel}-${scenario.caseNumber}`,
      `"${scenario.contact.first_name} ${scenario.contact.last_name}" <${scenario.contact.email}>`,
      context.mailbox.mailbox_email || context.mailbox.from_email || 'medinfo@novartis-demo.com',
      scenario.subject,
      scenario.body,
      scenario.receivedAt,
      scenario.lifecycle.inquiryStatus,
      0,
      GENERATED_SOURCE_TAG,
      0,
      null,
      scenario.caseType === 'AE' ? 'amber' : scenario.caseType === 'PC' ? 'orange' : 'blue',
      scenario.lifecycle.statusName === 'New' ? 0 : 1,
      scenario.owner.name,
      scenario.priority,
      scenario.dueDate,
      scenario.lifecycle.triageState,
      scenario.queueName,
      context.mailbox.account_name,
      scenario.lifecycle.statusName === 'New' ? null : scenario.receivedAt,
      scenario.lifecycle.statusName === 'Closed' ? scenario.receivedAt : null,
      scenario.closedAt,
      scenario.receivedAt,
      scenario.caseId,
    ]));
    const inquiryResult = await executeBulkInsert(
      conn,
      'inquiries',
      ['org_id', 'email_account_id', 'message_id', 'message_hash', 'sender', 'recipient', 'subject', 'body', 'received_at', 'status', 'attachments_count', 'source_tag', 'is_locked', 'locked_by', 'color', 'is_read', 'assigned_to', 'priority', 'due_date', 'triage_state', 'queue_name', 'mailbox_name', 'first_touched_at', 'first_response_at', 'closed_at', 'last_action_at', 'case_id'],
      inquiryRows
    );
    const inquiriesFirstId = Number(inquiryResult.insertId || 0);
    scenarios.forEach((scenario, index) => {
      scenario.inquiryId = inquiriesFirstId + index;
    });

    await executeBulkInsert(
      conn,
      'inquiry_read_receipts',
      ['inquiry_id', 'org_id', 'user_id', 'read_at', 'last_viewed_at', 'created_at'],
      scenarios.map((scenario) => ([
        scenario.inquiryId,
        context.org.id,
        scenario.owner.id,
        scenario.lifecycle.statusName === 'New' ? scenario.receivedAt : toDateTime(new Date(new Date(scenario.receivedAt).getTime() + 15 * 60000)),
        toDateTime(new Date(new Date(scenario.receivedAt).getTime() + 20 * 60000)),
        scenario.receivedAt,
      ]))
    );

    await executeBulkInsert(
      conn,
      'inquiry_notes',
      ['inquiry_id', 'user_id', 'user_name', 'note', 'created_at'],
      scenarios.map((scenario) => ([
        scenario.inquiryId,
        scenario.owner.id,
        scenario.owner.name,
        scenario.inquiryNote,
        scenario.receivedAt,
      ]))
    );

    await executeBulkInsert(
      conn,
      'case_contacts',
      ['case_id', 'contact_id', 'contact_role', 'do_not_update_master', 'is_primary', 'first_name', 'last_name', 'contact_type', 'specialty', 'institution', 'phone', 'email', 'address', 'created_at', 'updated_at'],
      scenarios.map((scenario) => ([
        scenario.caseId,
        scenario.contact.id,
        'requestor',
        0,
        1,
        scenario.contact.first_name,
        scenario.contact.last_name,
        scenario.contact.type,
        scenario.contact.specialty,
        scenario.contact.institution,
        scenario.contact.phone,
        scenario.contact.email,
        scenario.contact.address,
        scenario.receivedAt,
        scenario.receivedAt,
      ]))
    );

    const reporterRows = scenarios
      .filter((scenario) => scenario.caseType !== 'MI')
      .map((scenario) => ([
        scenario.caseId,
        scenario.contact.first_name,
        scenario.contact.last_name,
        scenario.contact.email,
        scenario.contact.phone,
        scenario.contact.type || 'HCP',
        'US',
        scenario.contact.institution,
        scenario.receivedAt,
        scenario.receivedAt,
      ]));
    await executeBulkInsert(
      conn,
      'case_reporter',
      ['case_id', 'first_name', 'last_name', 'email', 'phone', 'reporter_type', 'country', 'organisation', 'created_at', 'updated_at'],
      reporterRows
    );

    const patientRows = scenarios
      .filter((scenario) => scenario.caseType === 'AE')
      .map((scenario, index) => ([
        scenario.caseId,
        `PT${String((scenario.caseId + index) % 999).padStart(3, '0')}`,
        24 + ((scenario.caseId + index) % 45),
        'years',
        (scenario.caseId + index) % 2 === 0 ? 'Female' : 'Male',
        (55 + ((scenario.caseId + index) % 40)).toFixed(2),
        scenario.receivedAt,
        scenario.receivedAt,
      ]));
    await executeBulkInsert(
      conn,
      'case_patient',
      ['case_id', 'initials', 'age', 'age_unit', 'gender', 'weight_kg', 'created_at', 'updated_at'],
      patientRows
    );

    const miScenarios = scenarios.filter((scenario) => scenario.caseType === 'MI');
    const miRows = miScenarios.map((scenario) => ([
      scenario.caseId,
      1,
      scenario.mi.category,
      scenario.mi.subcategory,
      scenario.product.id,
      scenario.mi.summary,
      scenario.mi.detail,
      scenario.dueDate,
      scenario.lifecycle.statusName === 'Closed' ? `Response sent for ${scenario.product.trade_name}.` : scenario.lifecycle.statusName === 'Pending Follow-up' ? `Approved response package awaiting final follow-up.` : null,
      scenario.lifecycle.statusName === 'Closed' ? scenario.receivedOn : null,
      'email',
      scenario.lifecycle.statusName === 'Closed' ? 'Closed' : scenario.lifecycle.statusName === 'Pending Follow-up' ? 'Pending' : 'Open',
      scenario.receivedAt,
      scenario.receivedAt,
    ]));
    const miResult = await executeBulkInsert(
      conn,
      'case_mi',
      ['case_id', 'tab_index', 'mi_category', 'subcategory', 'product_id', 'question_summary', 'detailed_question', 'response_required_by', 'response_provided', 'response_date', 'response_channel', 'status', 'created_at', 'updated_at'],
      miRows
    );
    const miFirstId = Number(miResult.insertId || 0);
    miScenarios.forEach((scenario, index) => {
      scenario.miTabId = miFirstId + index;
    });

    const miResponseRows = miScenarios.map((scenario) => ([
      scenario.caseId,
      scenario.miTabId,
      scenario.contact.id,
      `${scenario.contact.first_name} ${scenario.contact.last_name}`.trim(),
      scenario.contact.email,
      scenario.product.id,
      `${GENERATED_MARKER} Prepared response for ${scenario.product.trade_name}.`,
      'email',
      `${scenario.product.trade_name} response package`,
      scenario.lifecycle.statusName === 'Closed' ? scenario.receivedOn : null,
      scenario.lifecycle.statusName === 'Pending Follow-up' || scenario.lifecycle.statusName === 'In Review' ? 1 : 0,
      scenario.mi.responseStatus,
      scenario.receivedAt,
      ['APPROVED', 'SENT'].includes(scenario.mi.responseStatus) ? scenario.reviewer.id : null,
      ['APPROVED', 'SENT'].includes(scenario.mi.responseStatus) ? scenario.receivedAt : null,
      scenario.mi.responseStatus === 'SENT' ? scenario.receivedAt : null,
      scenario.mi.responseStatus === 'SENT' ? 1 : 0,
      scenario.owner.id,
      scenario.owner.name,
      scenario.receivedAt,
    ]));
    await executeBulkInsert(
      conn,
      'case_mi_responses',
      ['case_id', 'mi_tab_id', 'recipient_contact_id', 'recipient_name', 'recipient_email', 'product_id', 'response_text', 'response_channel', 'response_subject', 'response_date', 'follow_up_required', 'response_status', 'draft_saved_at', 'approved_by', 'approved_at', 'sent_at', 'is_finalized', 'author_id', 'author_name', 'created_at'],
      miResponseRows
    );

    const aeScenarios = scenarios.filter((scenario) => scenario.caseType === 'AE');
    await executeBulkInsert(
      conn,
      'case_ae_intake',
      ['case_id', 'suspect_drug_name', 'batch_lot_number', 'dose', 'route_of_admin', 'treatment_start_date', 'treatment_stop_date', 'reaction_description', 'reaction_onset_date', 'outcome', 'is_serious', 'is_death', 'is_life_threatening', 'is_hospitalization', 'is_prolonged_hospitalization', 'is_disability', 'is_congenital_anomaly', 'is_other_medically_important', 'created_at', 'updated_at'],
      aeScenarios.map((scenario, index) => ([
        scenario.caseId,
        scenario.product.trade_name,
        scenario.ae.lot,
        scenario.ae.dose,
        scenario.ae.route,
        toDateOnly(daysAgo(scenario.lifecycle.daysBack + 14 + (index % 5))),
        toDateOnly(daysAgo(Math.max(0, scenario.lifecycle.daysBack - 1))),
        scenario.ae.reaction,
        toDateOnly(daysAgo(Math.max(0, scenario.lifecycle.daysBack - 2))),
        scenario.ae.outcome,
        1,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        scenario.receivedAt,
        scenario.receivedAt,
      ]))
    );

    const pcScenarios = scenarios.filter((scenario) => scenario.caseType === 'PC');
    await executeBulkInsert(
      conn,
      'case_pc_intake',
      ['case_id', 'product_name', 'batch_lot_number', 'expiry_date', 'purchase_date', 'complaint_category', 'complaint_description', 'sample_available', 'sample_return_requested', 'created_at', 'updated_at'],
      pcScenarios.map((scenario, index) => ([
        scenario.caseId,
        scenario.product.trade_name,
        scenario.pc.lot,
        toDateOnly(daysAgo(-(120 + (index % 90)))),
        toDateOnly(daysAgo(scenario.lifecycle.daysBack + 10 + (index % 7))),
        scenario.pc.category,
        scenario.pc.complaint,
        index % 2 === 0 ? 1 : 0,
        index % 3 === 0 ? 1 : 0,
        scenario.receivedAt,
        scenario.receivedAt,
      ]))
    );

    const aeTransmissionRows = aeScenarios.map((scenario, index) => {
      const group = pickProductGroup(context, scenario.product);
      return [
        scenario.caseId,
        group ? group.id : null,
        JSON.stringify(group ? [{ id: group.id, name: group.name, product_id: scenario.product.id }] : []),
        scenario.reviewer.id,
        scenario.reviewer.name,
        scenario.priority === 'high' ? 'urgent' : 'standard',
        scenario.dueDate,
        `${GENERATED_MARKER} PV narrative for ${scenario.product.trade_name}.`,
        scenario.lifecycle.statusName === 'Closed' ? 'Completed' : 'Pending',
        scenario.lifecycle.statusName === 'Pending Follow-up' ? 'at_risk' : 'on_track',
        scenario.lifecycle.statusName === 'Closed' ? 'Completed by simulation workflow.' : null,
        scenario.owner.id,
        scenario.owner.name,
        scenario.receivedAt,
        scenario.receivedAt,
      ];
    });
    await executeBulkInsert(
      conn,
      'case_ae_transmissions',
      ['case_id', 'product_group_id', 'product_group_snapshot', 'assigned_to', 'assigned_name', 'priority', 'due_date', 'narrative', 'status', 'sla_status', 'resolution_notes', 'created_by', 'created_by_name', 'created_at', 'updated_at'],
      aeTransmissionRows
    );

    const pcTransmissionRows = pcScenarios.map((scenario) => {
      const group = pickProductGroup(context, scenario.product);
      return [
        scenario.caseId,
        group ? group.id : null,
        JSON.stringify(group ? [{ id: group.id, name: group.name, product_id: scenario.product.id }] : []),
        scenario.reviewer.id,
        scenario.reviewer.name,
        scenario.priority === 'high' ? 'urgent' : 'standard',
        scenario.dueDate,
        scenario.lifecycle.statusName === 'Closed' ? 'Complaint closed in simulation archive pass.' : `Investigation pending for ${scenario.product.trade_name}.`,
        scenario.lifecycle.statusName === 'Closed' ? 'Completed' : 'Pending',
        scenario.lifecycle.statusName === 'Pending Follow-up' ? 'at_risk' : 'on_track',
        scenario.owner.id,
        scenario.owner.name,
        scenario.receivedAt,
        scenario.receivedAt,
      ];
    });
    await executeBulkInsert(
      conn,
      'case_pc_transmissions',
      ['case_id', 'product_group_id', 'product_group_snapshot', 'assigned_to', 'assigned_name', 'priority', 'due_date', 'resolution_notes', 'status', 'sla_status', 'created_by', 'created_by_name', 'created_at', 'updated_at'],
      pcTransmissionRows
    );

    await executeBulkInsert(
      conn,
      'case_comments',
      ['case_id', 'user_id', 'comment', 'created_at', 'updated_at'],
      scenarios.map((scenario) => ([
        scenario.caseId,
        scenario.owner.id,
        scenario.caseComment,
        scenario.receivedAt,
        scenario.receivedAt,
      ]))
    );

    const auditRows = [];
    scenarios.forEach((scenario) => {
      auditRows.push([scenario.caseId, context.admin.id, context.admin.name, 'CASE_CREATED', 'case_type', null, scenario.caseType, scenario.receivedAt]);
      auditRows.push([scenario.caseId, scenario.owner.id, scenario.owner.name, 'INQUIRY_LINKED', 'inquiry_id', null, String(scenario.inquiryId), scenario.receivedAt]);
      auditRows.push([scenario.caseId, context.admin.id, context.admin.name, 'CASE_ASSIGNED', 'case_owner_id', null, String(scenario.owner.id), scenario.receivedAt]);
    });
    await executeBulkInsert(
      conn,
      'case_audit_trail',
      ['case_id', 'user_id', 'user_name', 'action_type', 'field_name', 'old_value', 'new_value', 'timestamp'],
      auditRows
    );

    const notificationRows = scenarios.map((scenario) => ([
      scenario.owner.id,
      'case_assignment',
      `${scenario.caseType} workload assigned`,
      `${scenario.subject} was routed to ${scenario.owner.name}.`,
      `/cases/${scenario.caseId}`,
      JSON.stringify({ case_id: scenario.caseId, inquiry_id: scenario.inquiryId, source: 'novartis-simulation' }),
      scenario.priority === 'high' ? 'warning' : 'info',
      0,
      'novartis-sim-assignment',
      scenario.lifecycle.statusName === 'Closed' ? 1 : 0,
      scenario.receivedAt,
      scenario.closedAt,
      null,
      null,
      1,
      3,
      scenario.receivedAt,
      null,
      null,
      scenario.receivedAt,
    ]));
    const transmissionNotificationRows = scenarios
      .filter((scenario) => scenario.caseType === 'AE' || scenario.caseType === 'PC')
      .map((scenario) => ([
        scenario.reviewer.id,
        scenario.caseType === 'AE' ? 'ae_transmission' : 'pc_transmission',
        `${scenario.caseType} reviewer queue updated`,
        `${scenario.product.trade_name} requires ${scenario.caseType === 'AE' ? 'PV' : 'quality'} follow-up.`,
        `/cases/${scenario.caseId}`,
        JSON.stringify({ case_id: scenario.caseId, source: 'novartis-simulation' }),
        scenario.lifecycle.statusName === 'Pending Follow-up' ? 'warning' : 'info',
        0,
        'novartis-sim-transmission',
        scenario.lifecycle.statusName === 'Closed' ? 1 : 0,
        scenario.receivedAt,
        scenario.closedAt,
        null,
        null,
        1,
        3,
        scenario.receivedAt,
        null,
        null,
        scenario.receivedAt,
      ]));
    const notificationResult = await executeBulkInsert(
      conn,
      'notifications',
      ['user_id', 'category', 'title', 'message', 'link_url', 'metadata', 'severity', 'requires_acknowledgement', 'event_key', 'is_read', 'created_at', 'read_at', 'acknowledged_at', 'acknowledged_by', 'delivery_attempts', 'max_delivery_attempts', 'last_delivery_attempt_at', 'next_retry_at', 'failure_reason', 'delivered_at'],
      notificationRows.concat(transmissionNotificationRows)
    );

    await conn.commit();
    return {
      createdCases: scenarios.length,
      createdInquiries: scenarios.length,
      notifications: Number(notificationResult.affectedRows || 0),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

async function ensureContentFootprint(conn, context, config) {
  const [[counts]] = await conn.execute(
    `SELECT
       (SELECT COUNT(*) FROM cm_folders WHERE org_id = ?) AS folders,
       (SELECT COUNT(*) FROM cm_modules m JOIN cm_folders f ON f.id = m.folder_id WHERE f.org_id = ?) AS modules,
       (SELECT COUNT(*) FROM cm_documents d JOIN cm_folders f ON f.id = d.folder_id WHERE f.org_id = ?) AS documents,
       (SELECT COUNT(*) FROM cm_faqs q JOIN cm_folders f ON f.id = q.folder_id WHERE f.org_id = ?) AS faqs,
       (SELECT COUNT(*) FROM help_articles WHERE org_id = ? AND is_active = 1) AS help_articles`,
      [context.org.id, context.org.id, context.org.id, context.org.id, context.org.id]
    );

  const targets = {
    folders: Math.max(0, config.contentFolders - Number(counts.folders || 0)),
    modules: Math.max(0, config.contentModules - Number(counts.modules || 0)),
    documents: Math.max(0, config.contentDocuments - Number(counts.documents || 0)),
    faqs: Math.max(0, config.contentFaqs - Number(counts.faqs || 0)),
    helpArticles: Math.max(0, config.helpArticles - Number(counts.help_articles || 0)),
  };

  const folderRows = [];
  for (let index = 0; index < targets.folders; index += 1) {
    const theme = FOLDER_THEMES[index % FOLDER_THEMES.length];
    const product = context.products[index % context.products.length];
    folderRows.push([
      `${theme} ${String(Number(counts.folders || 0) + index + 1).padStart(3, '0')}`,
      product ? product.id : null,
      context.site.id,
      `${GENERATED_MARKER} ${theme} for ${product ? product.trade_name : context.org.name}.`,
      'Active',
      context.admin.id,
      context.org.id,
    ]);
  }
  await executeBulkInsert(
    conn,
    'cm_folders',
    ['name', 'product_id', 'site_id', 'description', 'status', 'created_by', 'org_id'],
    folderRows
  );

  const [folders] = await conn.execute(
    'SELECT id, name FROM cm_folders WHERE org_id = ? ORDER BY id ASC',
    [context.org.id]
  );
  const [[moduleMaxRow]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_modules');
  const [[docMaxRow]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_documents');
  let nextModuleId = Number(moduleMaxRow.maxId || 0) + 1;
  let nextDocId = Number(docMaxRow.maxId || 0) + 1;

  const moduleRows = [];
  for (let index = 0; index < targets.modules; index += 1) {
    const folder = folders[index % folders.length];
    const status = CONTENT_STATUSES[index % CONTENT_STATUSES.length];
    moduleRows.push([
      `MOD-${String(nextModuleId).padStart(5, '0')}`,
      folder.id,
      MODULE_TYPES[index % MODULE_TYPES.length],
      `${folder.name} Module ${String(index + 1).padStart(3, '0')}`,
      `<p>${GENERATED_MARKER} ${folder.name} workflow guidance for ${context.org.name}.</p>`,
      null,
      null,
      null,
      null,
      status,
      1,
      index % 3,
      toDateOnly(daysAgo(-(60 + (index % 120)))),
      toDateOnly(daysAgo(index % 15)),
      'en',
      `${GENERATED_CONTENT_TAG}, ${String(folder.name).toLowerCase()}`,
      0,
      0,
      context.admin.id,
      context.admin.id,
      `Use for ${MODULE_TYPES[index % MODULE_TYPES.length].toLowerCase()} review and response preparation.`,
      index % 2 === 0 ? 'Medical Response' : 'Safety Operations',
      `Reusable ${MODULE_TYPES[index % MODULE_TYPES.length].toLowerCase()} content for ${folder.name}.`,
      JSON.stringify({ generated: true, tag: GENERATED_CONTENT_TAG }),
      context.admin.id,
      null,
      null,
    ]);
    nextModuleId += 1;
  }
  await executeBulkInsert(
    conn,
    'cm_modules',
    ['module_id', 'folder_id', 'module_type', 'name', 'content_html', 'file_path', 'file_name', 'file_size', 'file_mime', 'status', 'version_major', 'version_minor', 'expiry_date', 'activation_date', 'language', 'search_tags', 'publish_as_pdf', 'send_as_pdf', 'created_by', 'updated_by', 'usage_instructions', 'document_category', 'standard_response_text', 'attributes', 'owner_user_id', 'checked_out_by', 'checked_out_at'],
    moduleRows
  );

  const documentRows = [];
  for (let index = 0; index < targets.documents; index += 1) {
    const folder = folders[index % folders.length];
    const status = CONTENT_STATUSES[(index + 1) % CONTENT_STATUSES.length];
    documentRows.push([
      `DOC-${String(nextDocId).padStart(5, '0')}`,
      folder.id,
      DOCUMENT_TYPES[index % DOCUMENT_TYPES.length],
      index % 2 === 0 ? 'File' : 'Email',
      `${folder.name} Document ${String(index + 1).padStart(3, '0')}`,
      `<p>${GENERATED_MARKER} Approved content asset for ${folder.name}.</p>`,
      null,
      null,
      null,
      null,
      status,
      1,
      index % 4,
      toDateOnly(daysAgo(-(90 + (index % 180)))),
      toDateOnly(daysAgo(index % 10)),
      'en',
      index % 3 === 0 ? 1 : 0,
      1,
      `${GENERATED_CONTENT_TAG}, approved-response, ${String(folder.name).toLowerCase()}`,
      `Use this document when ${folder.name.toLowerCase()} is selected in MI response builder.`,
      0,
      0,
      JSON.stringify([]),
      JSON.stringify({ generated: true, tag: GENERATED_CONTENT_TAG }),
      context.admin.id,
      context.admin.id,
      null,
      index % 2 === 0 ? 'Medical Response' : 'FAQ',
      `Reusable response document for ${folder.name}.`,
      context.admin.id,
      180,
      `NOV-SIM-${String(index + 1).padStart(4, '0')}`,
      JSON.stringify({ generated: true }),
      `Simulation version ${index + 1}`,
      JSON.stringify([30, 14, 7]),
      null,
      JSON.stringify([context.admin.email]),
      null,
      'upload',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    nextDocId += 1;
  }
  await executeBulkInsert(
    conn,
    'cm_documents',
    ['doc_id', 'folder_id', 'doc_type', 'response_doc_type', 'name', 'content_html', 'file_path', 'file_name', 'file_size', 'file_mime', 'status', 'version_major', 'version_minor', 'expiry_date', 'activation_date', 'language', 'is_product_specific', 'is_site_specific', 'search_tags', 'usage_instructions', 'publish_as_pdf', 'send_as_pdf', 'selected_modules', 'attributes', 'created_by', 'updated_by', 'mi_category_id', 'document_category', 'standard_response_text', 'owner_user_id', 'review_cycle_days', 'regulatory_ref', 'custom_attributes', 'version_notes', 'alert_days', 'alert_email_account_id', 'expiry_alert_recipients', 'checkout_expires_at', 'authoring_source', 'external_provider', 'external_document_url', 'external_share_url', 'external_document_id', 'external_drive_id', 'external_account_email', 'external_api_endpoint'],
    documentRows
  );

  const faqRows = [];
  for (let index = 0; index < targets.faqs; index += 1) {
    const folder = folders[index % folders.length];
    faqRows.push([
      folder.id,
      `${folder.name}: frequently asked question ${String(index + 1).padStart(3, '0')}`,
      `<p>${GENERATED_MARKER} Answer for ${folder.name}. Use approved Novartis wording and escalate when request falls outside label or SOP.</p>`,
      FAQ_CATEGORIES[index % FAQ_CATEGORIES.length],
      index % 3 === 0 ? 1 : 0,
      toDateOnly(daysAgo(-(120 + (index % 120)))),
      CONTENT_STATUSES[index % CONTENT_STATUSES.length],
      1,
      index % 2,
      context.admin.id,
      context.admin.id,
      index * 3,
      `${GENERATED_CONTENT_TAG}, faq, ${FAQ_CATEGORIES[index % FAQ_CATEGORIES.length].toLowerCase()}`,
    ]);
  }
  await executeBulkInsert(
    conn,
    'cm_faqs',
    ['folder_id', 'question', 'answer_html', 'category', 'approval_required', 'expiry_date', 'status', 'version_major', 'version_minor', 'created_by', 'updated_by', 'view_count', 'search_tags'],
    faqRows
  );

  const helpRows = [];
  for (let index = 0; index < targets.helpArticles; index += 1) {
    const group = HELP_GROUPS[index % HELP_GROUPS.length];
    const featureKey = `novartis.simulation.${group}.${String(Number(counts.help_articles || 0) + index + 1).padStart(3, '0')}`;
    helpRows.push([
      featureKey,
      group,
      JSON.stringify([GENERATED_CONTENT_TAG, group]),
      `Novartis ${group} help article ${String(index + 1).padStart(3, '0')}`,
      `<p>${GENERATED_MARKER} Reference guidance for ${group} workflows in the Novartis simulation environment.</p>`,
      `Generated help article for ${group} workflows.`,
      JSON.stringify(['all']),
      context.org.id,
      1,
      toDateTime(daysAgo(index % 10)),
      context.admin.id,
      100 + index,
      0,
      context.admin.id,
      context.admin.id,
      toDateTime(daysAgo(index % 5)),
      toDateTime(daysAgo(index % 5)),
    ]);
  }
  await executeBulkInsert(
    conn,
    'help_articles',
    ['feature_key', 'feature_group', 'tags', 'title', 'content_html', 'summary', 'audience', 'org_id', 'version', 'last_reviewed_at', 'reviewed_by', 'sort_order', 'view_count', 'created_by', 'updated_by', 'created_at', 'updated_at'],
    helpRows
  );

  return {
    createdFolders: targets.folders,
    createdModules: targets.modules,
    createdDocuments: targets.documents,
    createdFaqs: targets.faqs,
    createdHelpArticles: targets.helpArticles,
  };
}

async function archiveGeneratedCases(conn, context, config) {
  const [rows] = await conn.execute(
    `SELECT c.id
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.org_id = ?
        AND c.is_deleted = 0
        AND c.internal_notes LIKE ?
        AND c.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND (ws.name = 'Closed' OR c.updated_at < DATE_SUB(NOW(), INTERVAL ? DAY))
      ORDER BY c.id ASC`,
    [context.org.id, `%${GENERATED_MARKER}%`, config.archiveAfterDays, config.archiveAfterDays]
  );
  if (!rows.length) {
    return { archivedCases: 0, archivedInquiries: 0 };
  }

  let archivedCases = 0;
  let archivedInquiries = 0;
  for (const chunk of chunkArray(rows.map((row) => row.id), 2000)) {
    const placeholders = buildInClause(chunk.length);
    await conn.beginTransaction();
    try {
      const [caseResult] = await conn.execute(
        `UPDATE cases
            SET is_deleted = 1,
                updated_at = NOW(),
                internal_notes = CONCAT(COALESCE(internal_notes, ''), '\n${GENERATED_MARKER} archived=', NOW())
          WHERE id IN ${placeholders}`,
        chunk
      );
      const [inquiryResult] = await conn.execute(
        `UPDATE inquiries
            SET status = 'archived',
                triage_state = 'closed',
                queue_name = 'Archive',
                closed_at = COALESCE(closed_at, NOW()),
                last_action_at = NOW()
          WHERE case_id IN ${placeholders}`,
        chunk
      );
      await conn.commit();
      archivedCases += Number(caseResult.affectedRows || 0);
      archivedInquiries += Number(inquiryResult.affectedRows || 0);
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  }

  return { archivedCases, archivedInquiries };
}

async function createOperationalTopUp(conn, context, config) {
  const [[counts]] = await conn.execute(
    `SELECT
       (SELECT COUNT(*) FROM cases WHERE org_id = ? AND is_deleted = 0) AS cases,
       (SELECT COUNT(*) FROM inquiries WHERE org_id = ?) AS inquiries`,
    [context.org.id, context.org.id]
  );
  const currentCases = Number(counts.cases || 0);
  const currentInquiries = Number(counts.inquiries || 0);
  const createCount = Math.max(config.targetCases - currentCases, config.targetInquiries - currentInquiries, 0);
  if (!createCount) {
    return {
      beforeCases: currentCases,
      beforeInquiries: currentInquiries,
      createdCases: 0,
      createdInquiries: 0,
      notifications: 0,
    };
  }

  const runLabel = `${context.org.id}-${Date.now()}`;
  let createdCases = 0;
  let createdInquiries = 0;
  let notifications = 0;

  for (let offset = 0; offset < createCount; offset += config.batchSize) {
    const batchSize = Math.min(config.batchSize, createCount - offset);
    const scenarios = [];
    for (let index = 0; index < batchSize; index += 1) {
      const globalSequence = currentCases + offset + index;
      scenarios.push(buildScenario(context, config, globalSequence, globalSequence + 1, runLabel));
    }
    const result = await insertOperationalBatch(conn, context, config, scenarios);
    createdCases += result.createdCases;
    createdInquiries += result.createdInquiries;
    notifications += result.notifications;
    if ((offset + batchSize) % (config.batchSize * 10) === 0 || (offset + batchSize) === createCount) {
      logger.info(
        { org_id: context.org.id, created_cases: createdCases, target_cases: createCount },
        'Novartis simulation bulk generation progress'
      );
    }
  }

  return {
    beforeCases: currentCases,
    beforeInquiries: currentInquiries,
    createdCases,
    createdInquiries,
    notifications,
  };
}

async function getSimulationAudit(conn, orgId) {
  const [[counts]] = await conn.execute(
    `SELECT
       (SELECT COUNT(*) FROM inquiries WHERE org_id = ?) AS inquiries,
       (SELECT COUNT(*) FROM cases WHERE org_id = ? AND is_deleted = 0) AS active_cases,
       (SELECT COUNT(*) FROM cases WHERE org_id = ? AND is_deleted = 1 AND internal_notes LIKE ?) AS archived_generated_cases,
       (SELECT COUNT(*) FROM cm_folders WHERE org_id = ?) AS folders,
       (SELECT COUNT(*) FROM cm_modules m JOIN cm_folders f ON f.id = m.folder_id WHERE f.org_id = ?) AS modules,
       (SELECT COUNT(*) FROM cm_documents d JOIN cm_folders f ON f.id = d.folder_id WHERE f.org_id = ?) AS documents,
       (SELECT COUNT(*) FROM cm_faqs q JOIN cm_folders f ON f.id = q.folder_id WHERE f.org_id = ?) AS faqs,
       (SELECT COUNT(*) FROM help_articles WHERE org_id = ? AND is_active = 1) AS help_articles,
       (SELECT COUNT(*) FROM scheduled_jobs WHERE job_name = ?) AS scheduled_job`,
      [orgId, orgId, orgId, `%${GENERATED_MARKER}%`, orgId, orgId, orgId, orgId, orgId, jobNameForOrg(orgId)]
    );
  return counts;
}

async function runNovartisSimulation(input = {}) {
  const requested = normalizeConfig(input);
  await ensureBaselineIfNeeded(requested);

  const conn = await pool.getConnection();
  try {
    await ensureScheduledJobRow(conn, requested);
    const effectiveConfig = input.useScheduledConfig === false
      ? requested
      : await loadScheduledJobConfig(conn, requested.orgId);

    if (!effectiveConfig.isActive) {
      return {
        skipped: true,
        reason: 'scheduled job is inactive',
        config: effectiveConfig,
      };
    }

    const context = await getSimulationContext(conn, effectiveConfig);
    const archiveSummary = await archiveGeneratedCases(conn, context, effectiveConfig);
    const contentSummary = await ensureContentFootprint(conn, context, effectiveConfig);
    const operationalSummary = await createOperationalTopUp(conn, context, effectiveConfig);
    const audit = await getSimulationAudit(conn, effectiveConfig.orgId);

    await updateScheduledJobRun(conn, effectiveConfig.orgId, 'success', null);

    const summary = {
      generated_at: isoNow(),
      config: effectiveConfig,
      archive: archiveSummary,
      content: contentSummary,
      operations: operationalSummary,
      audit,
    };

    await logService({
      source: 'Novartis Simulation',
      service_type: 'CRON',
      description: `Novartis simulation completed for org ${effectiveConfig.orgId}`,
      status: 'success',
      details: summary,
    });

    return summary;
  } catch (error) {
    try {
      await updateScheduledJobRun(conn, requested.orgId, 'failed', error.message || String(error));
    } catch (_) {}
    await logService({
      source: 'Novartis Simulation',
      service_type: 'CRON',
      description: `Novartis simulation failed for org ${requested.orgId}`,
      status: 'failed',
      details: { error: error.message || String(error) },
    });
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  DEFAULT_NOVARTIS_SIMULATION_CONFIG: DEFAULT_CONFIG,
  runNovartisSimulation,
  jobNameForOrg,
};
