'use strict';

try { process.loadEnvFile(); } catch (_) {}

const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcrypt');

const pool = require('../database/db');
const accessService = require('../services/accessConfigurationService');

const ORG_ID = Number(process.argv[2] || 1);
const BACKUP_DIR = path.join(__dirname, 'novartis-full-scope-backups');
const CLEANUP_RUN_TAG = 'novartis-full-scope-seed';
const NOISE_PATTERNS = [
  { sql: 'LOWER(sender) LIKE ?', value: '%mailer-daemon%' },
  { sql: 'LOWER(sender) LIKE ?', value: '%google%' },
  { sql: 'LOWER(subject) LIKE ?', value: '%google account%' },
  { sql: 'LOWER(subject) LIKE ?', value: '%security alert%' },
  { sql: 'LOWER(subject) LIKE ?', value: '%delivery status notification%' },
];
const TEST_PATTERNS = [
  { sql: 'LOWER(sender) LIKE ?', value: '%mimsuser18@gmail.com%' },
  { sql: 'LOWER(subject) LIKE ?', value: 'test%' },
  { sql: 'LOWER(subject) LIKE ?', value: 're: test%' },
];

const CONTACT_SEEDS = [
  {
    email: 'emily.carter@novartis-demo.com',
    first_name: 'Emily',
    last_name: 'Carter',
    type: 'HCP',
    specialty: 'Cardiology',
    institution: 'Mayo Clinic',
    phone: '+1-507-555-0110',
    address: '200 First St SW, Rochester, MN 55905',
    notes: 'Heart failure specialist supporting Entresto medical inquiries.',
  },
  {
    email: 'david.nguyen@novartis-demo.com',
    first_name: 'David',
    last_name: 'Nguyen',
    type: 'HCP',
    specialty: 'Oncology',
    institution: 'MD Anderson Cancer Center',
    phone: '+1-713-555-0125',
    address: '1515 Holcombe Blvd, Houston, TX 77030',
    notes: 'Breast oncology medical contact for Kisqali dose and sequencing questions.',
  },
  {
    email: 'sofia.ramirez@novartis-demo.com',
    first_name: 'Sofia',
    last_name: 'Ramirez',
    type: 'HCP',
    specialty: 'Dermatology',
    institution: 'Cleveland Clinic',
    phone: '+1-216-555-0191',
    address: '9500 Euclid Ave, Cleveland, OH 44195',
    notes: 'Psoriasis and biologics contact for Cosentyx benefit-risk follow-up.',
  },
  {
    email: 'michael.lee@novartis-demo.com',
    first_name: 'Michael',
    last_name: 'Lee',
    type: 'HCP',
    specialty: 'Neurology',
    institution: 'Johns Hopkins Hospital',
    phone: '+1-410-555-0132',
    address: '1800 Orleans St, Baltimore, MD 21287',
    notes: 'Neurology investigator contact for Kesimpta continuation and switch questions.',
  },
  {
    email: 'lisa.morgan@novartis-demo.com',
    first_name: 'Lisa',
    last_name: 'Morgan',
    type: 'Reporter',
    specialty: 'Drug Information',
    institution: 'Northwest Specialty Pharmacy',
    phone: '+1-312-555-0168',
    address: '230 W Monroe St, Chicago, IL 60606',
    notes: 'Specialty pharmacy escalation contact for quality complaints and refill barriers.',
  },
];

const COMPANY_REP_SEEDS = [
  {
    email: 'amanda.shah@novartis-demo.com',
    name: 'Amanda Shah',
    title: 'Senior Medical Information Lead',
    territory: 'US East',
    phone: '+1-908-555-0101',
  },
  {
    email: 'jordan.ellis@novartis-demo.com',
    name: 'Jordan Ellis',
    title: 'Pharmacovigilance Manager',
    territory: 'US Central',
    phone: '+1-908-555-0102',
  },
  {
    email: 'priya.nair@novartis-demo.com',
    name: 'Priya Nair',
    title: 'Quality Complaint Manager',
    territory: 'US West',
    phone: '+1-908-555-0103',
  },
];

const PRODUCT_FAMILY_SEEDS = [
  {
    name: 'Entresto',
    ingredients: ['sacubitril', 'valsartan'],
    products: [
      {
        trade_name: 'Entresto 24/26 mg',
        mah: 'Novartis Pharmaceuticals Corporation',
        dosage: '24/26 mg tablets',
        atc_code: 'C09DX04',
        authorization_country: 'US',
      },
      {
        trade_name: 'Entresto 49/51 mg',
        mah: 'Novartis Pharmaceuticals Corporation',
        dosage: '49/51 mg tablets',
        atc_code: 'C09DX04',
        authorization_country: 'US',
      },
    ],
  },
  {
    name: 'Kisqali',
    ingredients: ['ribociclib'],
    products: [
      {
        trade_name: 'Kisqali 200 mg',
        mah: 'Novartis Pharmaceuticals Corporation',
        dosage: '200 mg film-coated tablet',
        atc_code: 'L01EF02',
        authorization_country: 'US',
      },
    ],
  },
  {
    name: 'Cosentyx',
    ingredients: ['secukinumab'],
    products: [
      {
        trade_name: 'Cosentyx 150 mg/mL',
        mah: 'Novartis Pharmaceuticals Corporation',
        dosage: '150 mg/mL prefilled syringe',
        atc_code: 'L04AC10',
        authorization_country: 'US',
      },
    ],
  },
  {
    name: 'Leqvio',
    ingredients: ['inclisiran'],
    products: [
      {
        trade_name: 'Leqvio 284 mg',
        mah: 'Novartis Pharmaceuticals Corporation',
        dosage: '284 mg/1.5 mL prefilled syringe',
        atc_code: 'C10AX16',
        authorization_country: 'US',
      },
    ],
  },
];

const FLOW_SEEDS = [
  {
    key: 'mi-entresto-titration',
    case_type: 'MI',
    intake_channel: 'email',
    priority: 'high',
    status_name: 'In Review',
    product_trade_name: 'Entresto 49/51 mg',
    contact_email: 'emily.carter@novartis-demo.com',
    assigned_user_role: 'agent',
    inquiry_sender: '"Dr. Emily Carter" <emily.carter@novartis-demo.com>',
    inquiry_subject: 'Entresto titration after symptomatic hypotension',
    inquiry_body: 'Please share medical information on Entresto dose titration after symptomatic hypotension in a NYHA class II patient who recently moved from ACE inhibitor therapy.',
    inquiry_status: 'processed',
    inquiry_triage_state: 'linked',
    mi_tab: {
      mi_category: 'Dosing & Administration',
      subcategory: 'Titration guidance',
      question_summary: 'Dose titration after symptomatic hypotension',
      detailed_question: 'HCP asks for data and label-based guidance on temporary down-titration and re-escalation after symptomatic hypotension during Entresto therapy.',
      response_required_by_offset_days: 1,
      response_provided: null,
      response_date_offset_days: null,
      response_channel: 'email',
      status: 'Open',
    },
    response: {
      response_status: 'READY',
      response_channel: 'email',
      response_subject: 'Entresto dose titration after hypotension',
      response_text: 'Prepared label-based response summarising temporary down-titration, monitoring, and re-escalation considerations for Entresto.',
      follow_up_required: 1,
    },
    case_comment: 'Medical review opened with cardiology focus. Awaiting final approval before release to HCP.',
    inquiry_note: 'Linked to active MI case and assigned for same-day medical review.',
  },
  {
    key: 'mi-kisqali-monitoring',
    case_type: 'MI',
    intake_channel: 'email',
    priority: 'normal',
    status_name: 'Pending Follow-up',
    product_trade_name: 'Kisqali 200 mg',
    contact_email: 'david.nguyen@novartis-demo.com',
    assigned_user_role: 'agent',
    inquiry_sender: '"Dr. David Nguyen" <david.nguyen@novartis-demo.com>',
    inquiry_subject: 'Kisqali monitoring schedule after grade 3 neutropenia',
    inquiry_body: 'Our team needs a concise summary of recommended monitoring and dose modification timing after grade 3 neutropenia on Kisqali.',
    inquiry_status: 'pending',
    inquiry_triage_state: 'in_review',
    mi_tab: {
      mi_category: 'Safety',
      subcategory: 'Laboratory monitoring',
      question_summary: 'Monitoring after grade 3 neutropenia',
      detailed_question: 'HCP is requesting label-aligned monitoring intervals, dose interruption thresholds, and restart criteria after grade 3 neutropenia.',
      response_required_by_offset_days: 2,
      response_provided: 'Prepared summary awaiting follow-up response package sign-off.',
      response_date_offset_days: null,
      response_channel: 'email',
      status: 'Pending',
    },
    response: {
      response_status: 'APPROVED',
      response_channel: 'email',
      response_subject: 'Kisqali monitoring after grade 3 neutropenia',
      response_text: 'Response package approved. Waiting for final send after confirmation of recipient distribution list.',
      follow_up_required: 1,
    },
    case_comment: 'Approved content is ready. Team is holding send until the HCP confirms whether pharmacy nursing staff should be copied.',
    inquiry_note: 'Follow-up requested before release. Case remains visible in MI workload and pending response counts.',
  },
  {
    key: 'ae-cosentyx-hospitalization',
    case_type: 'AE',
    intake_channel: 'email',
    priority: 'high',
    status_name: 'Triage',
    product_trade_name: 'Cosentyx 150 mg/mL',
    contact_email: 'sofia.ramirez@novartis-demo.com',
    assigned_user_role: 'agent',
    inquiry_sender: '"Dr. Sofia Ramirez" <sofia.ramirez@novartis-demo.com>',
    inquiry_subject: 'Cosentyx serious infection requiring hospitalization',
    inquiry_body: 'Reporting a patient on Cosentyx for plaque psoriasis who developed a serious infection requiring hospitalization. Please route to safety and advise on required follow-up fields.',
    inquiry_status: 'processed',
    inquiry_triage_state: 'linked',
    reporter: {
      reporter_type: 'HCP',
      country: 'US',
      organisation: 'Cleveland Clinic',
    },
    patient: {
      initials: 'JR',
      age: 52,
      age_unit: 'years',
      gender: 'Female',
      weight_kg: 68.5,
    },
    ae_intake: {
      batch_lot_number: 'COS-24031',
      dose: '150 mg',
      route_of_admin: 'Subcutaneous',
      treatment_start_date_offset_days: -75,
      treatment_stop_date_offset_days: -2,
      reaction_description: 'Serious bacterial pneumonia requiring inpatient admission and IV antibiotics.',
      reaction_onset_date_offset_days: -3,
      outcome: 'Recovering',
      is_serious: 1,
      is_hospitalization: 1,
      is_other_medically_important: 1,
    },
    transmission: {
      type: 'AE',
      priority: '7-day',
      status: 'In Review',
      due_date_offset_days: 4,
      sla_status: 'at_risk',
      narrative: 'PV review in progress for expedited serious infection report.',
      resolution_notes: 'Follow-up requested on concomitant steroid exposure and discharge date.',
    },
    case_comment: 'Safety intake captured and PV handoff created. Follow-up expected from treating physician within 24 hours.',
    inquiry_note: 'Serious event triaged immediately and routed to PV workflow.',
  },
  {
    key: 'pc-leqvio-device-complaint',
    case_type: 'PC',
    intake_channel: 'email',
    priority: 'normal',
    status_name: 'Triage',
    product_trade_name: 'Leqvio 284 mg',
    contact_email: 'lisa.morgan@novartis-demo.com',
    assigned_user_role: 'agent',
    inquiry_sender: '"Lisa Morgan" <lisa.morgan@novartis-demo.com>',
    inquiry_subject: 'Leqvio syringe plunger resistance complaint',
    inquiry_body: 'A specialty pharmacy reported unusual plunger resistance during Leqvio administration prep. Need quality complaint intake and next steps.',
    inquiry_status: 'processed',
    inquiry_triage_state: 'linked',
    reporter: {
      reporter_type: 'Company Rep',
      country: 'US',
      organisation: 'Northwest Specialty Pharmacy',
    },
    pc_intake: {
      batch_lot_number: 'LEQ-88410',
      expiry_date_offset_days: 120,
      purchase_date_offset_days: -14,
      complaint_category: 'Device issue',
      complaint_description: 'Prefilled syringe plunger showed higher than expected resistance before administration. No patient harm reported.',
      sample_available: 1,
      sample_return_requested: 1,
    },
    transmission: {
      type: 'PC',
      priority: 'standard',
      status: 'Under Investigation',
      due_date_offset_days: 10,
      sla_status: 'on_track',
      resolution_notes: 'Quality complaint opened. Awaiting return sample and lot trace review.',
    },
    case_comment: 'Quality team engaged and awaiting physical sample return from pharmacy.',
    inquiry_note: 'Complaint linked to product quality workflow with sample-return tracking.',
  },
];

const DEMO_PASSWORD = 'Test@1234';
const DEMO_USER_SEEDS = [
  {
    key: 'aisha_admin',
    name: 'Aisha Verma',
    email: 'aisha.verma@novartis-demo.com',
    role: 'admin',
    role_at_org: 'admin',
    modules: ['mims_core', 'admin_console', 'data_visualization', 'reports', 'content_mgmt'],
    group_templates: ['mims_admin', 'manager'],
  },
  {
    key: 'kunal_mi',
    name: 'Kunal Mehta',
    email: 'kunal.mehta@novartis-demo.com',
    role: 'agent',
    role_at_org: 'agent',
    modules: ['mims_core', 'reports'],
    group_templates: ['mi_agent'],
  },
  {
    key: 'neha_intake',
    name: 'Neha Rao',
    email: 'neha.rao@novartis-demo.com',
    role: 'agent',
    role_at_org: 'agent',
    modules: ['mims_core', 'reports'],
    group_templates: ['mi_agent'],
  },
  {
    key: 'priya_pv',
    name: 'Priya Iyer',
    email: 'priya.iyer@novartis-demo.com',
    role: 'reviewer',
    role_at_org: 'reviewer',
    modules: ['mims_core', 'data_visualization', 'reports'],
    group_templates: ['reviewer'],
  },
  {
    key: 'rohan_quality',
    name: 'Rohan Kulkarni',
    email: 'rohan.kulkarni@novartis-demo.com',
    role: 'reviewer',
    role_at_org: 'reviewer',
    modules: ['mims_core', 'data_visualization', 'reports'],
    group_templates: ['reviewer'],
  },
];

const FLOW_IDENTITY_PLAN = {
  'mi-entresto-titration': {
    creator: 'aisha_admin',
    owner: 'kunal_mi',
    approver: null,
    transmission_assignee: null,
  },
  'mi-kisqali-monitoring': {
    creator: 'aisha_admin',
    owner: 'kunal_mi',
    approver: 'priya_pv',
    transmission_assignee: null,
  },
  'ae-cosentyx-hospitalization': {
    creator: 'aisha_admin',
    owner: 'neha_intake',
    approver: null,
    transmission_assignee: 'priya_pv',
  },
  'pc-leqvio-device-complaint': {
    creator: 'aisha_admin',
    owner: 'neha_intake',
    approver: null,
    transmission_assignee: 'rohan_quality',
  },
};

const LEGACY_USER_MATCHERS = {
  namePatterns: ['%qa%', '%test%', '%regression%', 'g10 %'],
  emailPatterns: ['%example.com%', '%reviewco.com%', '%regression@system%'],
};

function isoNow() {
  return new Date().toISOString();
}

function toDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function toDateTime(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function daysFromNow(days) {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

async function scalar(conn, sql, params = []) {
  const [[row]] = await conn.execute(sql, params);
  if (!row) return null;
  return row[Object.keys(row)[0]];
}

function isNoiseSubjectOrSender(row) {
  const sender = String(row?.sender || '').toLowerCase();
  const subject = String(row?.subject || '').toLowerCase();
  return sender.includes('mailer-daemon')
    || sender.includes('google')
    || subject.includes('google account')
    || subject.includes('security alert')
    || subject.includes('delivery status notification');
}

function isTestSubjectOrSender(row) {
  const sender = String(row?.sender || '').toLowerCase();
  const subject = String(row?.subject || '').toLowerCase();
  return sender.includes('mimsuser18@gmail.com')
    || subject.startsWith('test')
    || subject.startsWith('re: test');
}

async function buildSummary(conn, orgId) {
  const counts = {
    contacts: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM contacts WHERE org_id = ? AND is_active = 1', [orgId])),
    company_reps: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM company_reps WHERE org_id = ? AND is_active = 1', [orgId])),
    product_families: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM product_families WHERE org_id = ? AND is_active = 1', [orgId])),
    products: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM products WHERE org_id = ? AND is_active = 1', [orgId])),
    security_groups: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM security_groups WHERE org_id = ? AND is_active = 1', [orgId])),
    product_groups: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM product_groups WHERE org_id = ? AND is_active = 1', [orgId])),
    inquiries: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ?', [orgId])),
    cases: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 0', [orgId])),
    case_contacts: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM case_contacts cc JOIN cases c ON c.id = cc.case_id WHERE c.org_id = ? AND c.is_deleted = 0`, [orgId])),
    case_mi: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM case_mi mi JOIN cases c ON c.id = mi.case_id WHERE c.org_id = ? AND c.is_deleted = 0`, [orgId])),
    case_mi_responses: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM case_mi_responses r JOIN cases c ON c.id = r.case_id WHERE c.org_id = ? AND c.is_deleted = 0`, [orgId])),
    ae_transmissions: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM case_ae_transmissions t JOIN cases c ON c.id = t.case_id WHERE c.org_id = ? AND c.is_deleted = 0`, [orgId])),
    pc_transmissions: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM case_pc_transmissions t JOIN cases c ON c.id = t.case_id WHERE c.org_id = ? AND c.is_deleted = 0`, [orgId])),
    notifications: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM notifications n JOIN users u ON u.id = n.user_id JOIN user_org_access uoa ON uoa.user_id = u.id WHERE uoa.org_id = ?`, [orgId])),
  };

  const anomalies = {
    cases_missing_case_type: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 0 AND case_type IS NULL', [orgId])),
    inquiries_unlinked: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND case_id IS NULL', [orgId])),
    inquiries_unassigned: Number(await scalar(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND assigned_to IS NULL', [orgId])),
    inquiries_noise_unlinked: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND case_id IS NULL AND (${NOISE_PATTERNS.map((item) => item.sql).join(' OR ')})`, [orgId, ...NOISE_PATTERNS.map((item) => item.value)])),
    inactive_test_product: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM products WHERE org_id = ? AND trade_name = 'test product' AND is_active = 0`, [orgId])),
    inactive_legacy_security_group: Number(await scalar(conn, `SELECT COUNT(*) AS cnt FROM security_groups WHERE org_id = ? AND name = 'tet' AND is_active = 0`, [orgId])),
  };

  return { counts, anomalies };
}

async function getOrCreateCaseNumberConfig(conn, orgId, caseType) {
  const normalizedType = String(caseType || 'ALL').trim().toUpperCase() || 'ALL';
  let [[cfg]] = await conn.execute(
    'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? LIMIT 1 FOR UPDATE',
    [orgId, normalizedType]
  );
  if (!cfg) {
    const prefix = normalizedType === 'ALL' ? 'ALL' : normalizedType;
    await conn.execute(
      `INSERT INTO case_number_config
        (org_id, case_type, prefix, separator, include_year, include_month, seq_length, current_seq, is_locked)
       VALUES (?, ?, ?, '-', 0, 0, 5, 0, 0)`,
      [orgId, normalizedType, prefix]
    );
    [[cfg]] = await conn.execute(
      'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? LIMIT 1 FOR UPDATE',
      [orgId, normalizedType]
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
        'UPDATE case_number_config SET current_seq = ?, is_locked = 1, updated_at = NOW() WHERE id = ?',
        [seq, cfg.id]
      );
      await conn.execute(
        'UPDATE cases SET case_number = ?, updated_at = NOW() WHERE id = ?',
        [candidate, caseRow.id]
      );
      return candidate;
    }
    seq += 1;
  }

  throw new Error(`Unable to generate a unique case number for case ${caseRow.id}.`);
}

async function assignMissingCaseNumbers(conn, orgId) {
  const [rows] = await conn.execute(
    `SELECT id, org_id, case_type, case_number
       FROM cases
      WHERE org_id = ? AND is_deleted = 0 AND (case_number IS NULL OR TRIM(case_number) = '')
      ORDER BY id ASC
      FOR UPDATE`,
    [orgId]
  );
  const assigned = [];
  for (const row of rows) {
    assigned.push({ id: row.id, case_number: await assignCaseNumberWithConnection(conn, row) });
  }
  return assigned;
}

async function getOrgContext(conn, orgId) {
  const [[org]] = await conn.execute('SELECT id, name FROM organisations WHERE id = ? LIMIT 1', [orgId]);
  if (!org) throw new Error(`Organisation ${orgId} not found.`);

  const [sites] = await conn.execute('SELECT id, name FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY id ASC', [orgId]);
  if (!sites.length) throw new Error(`Organisation ${orgId} has no active sites.`);

  const [users] = await conn.execute(
    `SELECT u.id, u.name, u.email, u.role
       FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id
      WHERE uoa.org_id = ? AND uoa.is_active = 1 AND u.is_active = 1
      ORDER BY FIELD(u.role, 'admin', 'agent', 'reviewer', 'content_manager', 'superadmin'), u.id ASC`,
    [orgId]
  );
  if (!users.length) throw new Error(`Organisation ${orgId} has no active users.`);

  const [states] = await conn.execute('SELECT id, name FROM workflow_states WHERE is_active = 1 AND (org_id = ? OR org_id IS NULL)', [orgId]);
  const statusByName = new Map(states.map((row) => [row.name, row.id]));

  const admin = users.find((user) => user.role === 'admin') || users[0];
  const agent = users.find((user) => user.role === 'agent') || admin;
  const reviewer = users.find((user) => user.id !== admin.id && (user.role === 'admin' || user.role === 'agent')) || agent;

  return {
    org,
    site: sites[0],
    users,
    admin,
    agent,
    reviewer,
    statusByName,
  };
}

async function writeBackupFile(payload) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `${CLEANUP_RUN_TAG}-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

async function collectCleanupCandidates(conn, orgId) {
  const [nullTypeCases] = await conn.execute(
    `SELECT c.id, c.case_number, c.status_id, c.case_owner_id, c.description, c.internal_notes,
            COUNT(i.id) AS linked_inquiries
       FROM cases c
       LEFT JOIN inquiries i ON i.case_id = c.id
      WHERE c.org_id = ? AND c.case_type IS NULL AND c.is_deleted = 0
      GROUP BY c.id
      ORDER BY c.id ASC`,
    [orgId]
  );

  const [linkedInquiries] = await conn.execute(
    `SELECT id, case_id, sender, subject
       FROM inquiries
      WHERE org_id = ? AND case_id IN (${nullTypeCases.map(() => '?').join(',') || 'NULL'})
      ORDER BY id ASC`,
    [orgId, ...nullTypeCases.map((row) => row.id)]
  );
  const inquiriesByCaseId = new Map();
  for (const row of linkedInquiries) {
    if (!inquiriesByCaseId.has(row.case_id)) inquiriesByCaseId.set(row.case_id, []);
    inquiriesByCaseId.get(row.case_id).push(row);
  }

  const junkCaseIds = nullTypeCases
    .filter((row) => {
      if (row.case_owner_id || row.description || row.internal_notes) return false;
      const links = inquiriesByCaseId.get(row.id) || [];
      return links.every(isNoiseSubjectOrSender);
    })
    .map((row) => row.id);

  const [activeJunkCases] = await conn.execute(
    `SELECT c.id
       FROM cases c
       LEFT JOIN inquiries i ON i.case_id = c.id
      WHERE c.org_id = ? AND c.is_deleted = 0
      GROUP BY c.id, c.case_owner_id, c.description, c.internal_notes
      HAVING COUNT(i.id) > 0
         AND SUM(
           CASE
             WHEN LOWER(COALESCE(i.sender, '')) LIKE '%mimsuser18@gmail.com%'
               OR LOWER(COALESCE(i.sender, '')) LIKE '%mailer-daemon%'
               OR LOWER(COALESCE(i.subject, '')) LIKE 'test%'
               OR LOWER(COALESCE(i.subject, '')) LIKE 're: test%'
               OR LOWER(COALESCE(i.subject, '')) LIKE '%delivery status notification%'
             THEN 1 ELSE 0
           END
         ) = COUNT(i.id)
         AND c.case_owner_id IS NULL
         AND c.description IS NULL
         AND c.internal_notes IS NULL`,
    [orgId]
  );
  const allJunkCaseIds = Array.from(new Set([...junkCaseIds, ...activeJunkCases.map((row) => row.id)]));

  const [noiseInquiries] = await conn.execute(
    `SELECT DISTINCT id
       FROM inquiries
      WHERE (
             org_id = ?
         AND case_id IS NULL
         AND (${[...NOISE_PATTERNS, ...TEST_PATTERNS].map((item) => item.sql).join(' OR ')})
      )
         OR case_id IN (${allJunkCaseIds.map(() => '?').join(',') || 'NULL'})
      ORDER BY id ASC`,
    [orgId, ...[...NOISE_PATTERNS, ...TEST_PATTERNS].map((item) => item.value), ...allJunkCaseIds]
  );

  return {
    junkCaseIds: allJunkCaseIds,
    noiseInquiryIds: noiseInquiries.map((row) => row.id),
  };
}

async function backupCleanupTargets(conn, orgId, candidates) {
  const payload = {
    generated_at: isoNow(),
    org_id: orgId,
    cleanup_candidates: candidates,
    tables: {},
  };

  if (candidates.noiseInquiryIds.length) {
    const inquiryIds = candidates.noiseInquiryIds;
    const placeholders = inquiryIds.map(() => '?').join(',');
    const [inquiries] = await conn.execute(`SELECT * FROM inquiries WHERE id IN (${placeholders}) ORDER BY id ASC`, inquiryIds);
    const [notes] = await conn.execute(`SELECT * FROM inquiry_notes WHERE inquiry_id IN (${placeholders}) ORDER BY id ASC`, inquiryIds);
    const [attachments] = await conn.execute(`SELECT * FROM inquiry_attachments WHERE inquiry_id IN (${placeholders}) ORDER BY id ASC`, inquiryIds);
    const [receipts] = await conn.execute(`SELECT * FROM inquiry_read_receipts WHERE inquiry_id IN (${placeholders}) ORDER BY id ASC`, inquiryIds);
    payload.tables.inquiries = inquiries;
    payload.tables.inquiry_notes = notes;
    payload.tables.inquiry_attachments = attachments;
    payload.tables.inquiry_read_receipts = receipts;
  }

  if (candidates.junkCaseIds.length) {
    const caseIds = candidates.junkCaseIds;
    const placeholders = caseIds.map(() => '?').join(',');
    const [cases] = await conn.execute(`SELECT * FROM cases WHERE id IN (${placeholders}) ORDER BY id ASC`, caseIds);
    const [comments] = await conn.execute(`SELECT * FROM case_comments WHERE case_id IN (${placeholders}) ORDER BY id ASC`, caseIds);
    const [auditTrail] = await conn.execute(`SELECT * FROM case_audit_trail WHERE case_id IN (${placeholders}) ORDER BY id ASC`, caseIds);
    payload.tables.cases = cases;
    payload.tables.case_comments = comments;
    payload.tables.case_audit_trail = auditTrail;
  }

  return writeBackupFile(payload);
}

async function cleanupWastefulData(conn, context, candidates) {
  const result = {
    deleted_inquiries: 0,
    soft_deleted_cases: 0,
    deactivated_products: 0,
    deactivated_security_groups: 0,
  };

  await conn.beginTransaction();
  try {
    if (candidates.noiseInquiryIds.length) {
      const ids = candidates.noiseInquiryIds;
      const placeholders = ids.map(() => '?').join(',');
      await conn.execute(`DELETE FROM inquiry_read_receipts WHERE inquiry_id IN (${placeholders})`, ids);
      await conn.execute(`DELETE FROM inquiry_notes WHERE inquiry_id IN (${placeholders})`, ids);
      await conn.execute(`DELETE FROM inquiry_attachments WHERE inquiry_id IN (${placeholders})`, ids);
      const [deleted] = await conn.execute(`DELETE FROM inquiries WHERE id IN (${placeholders})`, ids);
      result.deleted_inquiries = Number(deleted.affectedRows || 0);
    }

    if (candidates.junkCaseIds.length) {
      const ids = candidates.junkCaseIds;
      const placeholders = ids.map(() => '?').join(',');
      const [updated] = await conn.execute(
        `UPDATE cases
            SET is_deleted = 1,
                internal_notes = CONCAT(COALESCE(internal_notes, ''), CASE WHEN COALESCE(internal_notes, '') = '' THEN '' ELSE '\n' END, '[${CLEANUP_RUN_TAG}] archived as non-business junk on ${toDateOnly(new Date())}')
          WHERE id IN (${placeholders}) AND is_deleted = 0`,
        ids
      );
      result.soft_deleted_cases = Number(updated.affectedRows || 0);
    }

    const [[productRow]] = await conn.execute(
      `SELECT p.id,
              (SELECT COUNT(*) FROM case_mi mi WHERE mi.product_id = p.id) AS mi_refs,
              (SELECT COUNT(*) FROM case_mi_responses r WHERE r.product_id = p.id) AS mi_response_refs,
              (SELECT COUNT(*) FROM product_group_members pgm WHERE pgm.member_type = 'product' AND pgm.member_id = p.id) AS product_group_refs
         FROM products p
        WHERE p.org_id = ? AND p.trade_name = 'test product' AND p.is_active = 1
        LIMIT 1`,
      [context.org.id]
    );
    if (productRow && Number(productRow.mi_refs || 0) === 0 && Number(productRow.mi_response_refs || 0) === 0 && Number(productRow.product_group_refs || 0) === 0) {
      const [updated] = await conn.execute(
        `UPDATE products
            SET is_active = 0, updated_at = NOW()
          WHERE id = ?`,
        [productRow.id]
      );
      result.deactivated_products = Number(updated.affectedRows || 0);
    }

    const [[legacyGroup]] = await conn.execute(
      `SELECT sg.id, COUNT(sgu.user_id) AS member_count
         FROM security_groups sg
         LEFT JOIN security_group_users sgu ON sgu.group_id = sg.id
        WHERE sg.org_id = ? AND sg.name = 'tet' AND sg.is_active = 1
        GROUP BY sg.id
        LIMIT 1`,
      [context.org.id]
    );
    if (legacyGroup && Number(legacyGroup.member_count || 0) === 0) {
      const [updated] = await conn.execute(
        `UPDATE security_groups
            SET is_active = 0, updated_at = NOW()
          WHERE id = ?`,
        [legacyGroup.id]
      );
      result.deactivated_security_groups = Number(updated.affectedRows || 0);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }

  return result;
}

async function upsertContact(conn, context, seed) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM contacts WHERE org_id = ? AND email = ? LIMIT 1',
    [context.org.id, seed.email]
  );
  if (existing) {
    await conn.execute(
      `UPDATE contacts
          SET type = ?, first_name = ?, last_name = ?, specialty = ?, institution = ?, phone = ?, address = ?, notes = ?, is_active = 1, updated_at = NOW()
        WHERE id = ?`,
      [seed.type, seed.first_name, seed.last_name, seed.specialty, seed.institution, seed.phone, seed.address, seed.notes, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO contacts
      (type, first_name, last_name, specialty, institution, email, phone, org_id, site_id, notes, address, do_not_update_master)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [seed.type, seed.first_name, seed.last_name, seed.specialty, seed.institution, seed.email, seed.phone, context.org.id, context.site.id, seed.notes, seed.address]
  );
  return result.insertId;
}

async function upsertCompanyRep(conn, context, seed) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM company_reps WHERE org_id = ? AND email = ? LIMIT 1',
    [context.org.id, seed.email]
  );
  if (existing) {
    await conn.execute(
      `UPDATE company_reps
          SET name = ?, title = ?, territory = ?, phone = ?, is_active = 1, updated_at = NOW()
        WHERE id = ?`,
      [seed.name, seed.title, seed.territory, seed.phone, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO company_reps (name, title, territory, email, phone, org_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [seed.name, seed.title, seed.territory, seed.email, seed.phone, context.org.id]
  );
  return result.insertId;
}

async function upsertProductFamily(conn, context, seed) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM product_families WHERE org_id = ? AND name = ? LIMIT 1',
    [context.org.id, seed.name]
  );
  if (existing) {
    await conn.execute(
      `UPDATE product_families
          SET ingredients = ?, is_active = 1, updated_at = NOW()
        WHERE id = ?`,
      [JSON.stringify(seed.ingredients), existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO product_families (name, ingredients, is_active, org_id)
     VALUES (?, ?, 1, ?)`,
    [seed.name, JSON.stringify(seed.ingredients), context.org.id]
  );
  return result.insertId;
}

async function upsertProduct(conn, context, familyId, seed) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM products WHERE org_id = ? AND trade_name = ? LIMIT 1',
    [context.org.id, seed.trade_name]
  );
  if (existing) {
    await conn.execute(
      `UPDATE products
          SET family_id = ?, mah = ?, dosage = ?, atc_code = ?, authorization_country = ?, is_active = 1, updated_at = NOW()
        WHERE id = ?`,
      [familyId, seed.mah, seed.dosage, seed.atc_code, seed.authorization_country, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO products
      (trade_name, mah, org_id, family_id, dosage, atc_code, authorization_country, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [seed.trade_name, seed.mah, context.org.id, familyId, seed.dosage, seed.atc_code, seed.authorization_country]
  );
  return result.insertId;
}

async function upsertProductGroup(conn, context, data) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM product_groups WHERE org_id = ? AND name = ? AND group_type = ? LIMIT 1',
    [context.org.id, data.name, data.group_type]
  );
  if (existing) {
    await conn.execute(
      `UPDATE product_groups
          SET description = ?, is_active = 1, updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [data.description, context.admin.id, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO product_groups
      (org_id, name, group_type, description, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [context.org.id, data.name, data.group_type, data.description, context.admin.id, context.admin.id]
  );
  return result.insertId;
}

async function ensureProductGroupMember(conn, groupId, memberType, memberId, userId) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM product_group_members WHERE group_id = ? AND member_type = ? AND member_id = ? LIMIT 1',
    [groupId, memberType, memberId]
  );
  if (existing) return existing.id;
  const [result] = await conn.execute(
    `INSERT INTO product_group_members (group_id, member_type, member_id, created_by)
     VALUES (?, ?, ?, ?)`,
    [groupId, memberType, memberId, userId]
  );
  return result.insertId;
}

async function ensureProductGroupAssignment(conn, groupId, targetType, metadata, userId) {
  const metadataJson = JSON.stringify(metadata);
  const [[existing]] = await conn.execute(
    'SELECT id FROM product_group_assignments WHERE group_id = ? AND target_type = ? AND target_id IS NULL LIMIT 1',
    [groupId, targetType]
  );
  if (existing) {
    await conn.execute(
      'UPDATE product_group_assignments SET metadata = ?, created_by = ? WHERE id = ?',
      [metadataJson, userId, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO product_group_assignments (group_id, target_type, target_id, metadata, created_by)
     VALUES (?, ?, NULL, ?, ?)`,
    [groupId, targetType, metadataJson, userId]
  );
  return result.insertId;
}

async function seedMasterData(conn, context) {
  const contactIdsByEmail = new Map();
  const productIdsByTradeName = new Map();
  const familyIdsByName = new Map();

  for (const seed of CONTACT_SEEDS) {
    const id = await upsertContact(conn, context, seed);
    contactIdsByEmail.set(seed.email, id);
  }

  for (const seed of COMPANY_REP_SEEDS) {
    await upsertCompanyRep(conn, context, seed);
  }

  for (const seed of PRODUCT_FAMILY_SEEDS) {
    const familyId = await upsertProductFamily(conn, context, seed);
    familyIdsByName.set(seed.name, familyId);
    for (const product of seed.products) {
      const productId = await upsertProduct(conn, context, familyId, product);
      productIdsByTradeName.set(product.trade_name, productId);
    }
  }

  const transmissionsByFamily = [
    ['Entresto', 'Cardiovascular transmissions for heart failure product escalations.'],
    ['Kisqali', 'Oncology transmissions for urgent medical and safety escalations.'],
    ['Cosentyx', 'Dermatology safety transmissions for serious event handling.'],
    ['Leqvio', 'Quality and supply transmissions for cardiovascular device or handling issues.'],
  ];

  for (const [familyName, description] of transmissionsByFamily) {
    const familyId = familyIdsByName.get(familyName);
    if (!familyId) continue;
    const groupId = await upsertProductGroup(conn, context, {
      name: `${familyName} Transmission Group`,
      group_type: 'transmissions',
      description,
    });
    await ensureProductGroupMember(conn, groupId, 'product_family', familyId, context.admin.id);
    await ensureProductGroupAssignment(conn, groupId, 'transmission_rule', { label: `${familyName} operational routing` }, context.admin.id);
  }

  return { contactIdsByEmail, productIdsByTradeName, familyIdsByName };
}

async function findGroupIdByTemplate(conn, orgId, templateKey) {
  const [[row]] = await conn.execute(
    'SELECT id FROM security_groups WHERE org_id = ? AND template_key = ? AND is_active = 1 LIMIT 1',
    [orgId, templateKey]
  );
  return row?.id || null;
}

async function ensureGroupUser(conn, groupId, userId) {
  if (!groupId || !userId) return;
  await conn.execute('INSERT IGNORE INTO security_group_users (group_id, user_id) VALUES (?, ?)', [groupId, userId]);
}

async function ensureUserModule(conn, userId, module) {
  const [[existing]] = await conn.execute(
    'SELECT id FROM user_module_permissions WHERE user_id = ? AND module = ? LIMIT 1',
    [userId, module]
  );
  if (existing) {
    await conn.execute(
      'UPDATE user_module_permissions SET can_access = 1 WHERE id = ?',
      [existing.id]
    );
    return;
  }
  await conn.execute(
    'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
    [userId, module]
  );
}

async function upsertDemoUser(conn, context, seed, passwordHash) {
  const normalizedEmail = seed.email.toLowerCase().trim();
  const [[existing]] = await conn.execute(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );
  let userId = existing?.id || null;

  if (!userId) {
    const [result] = await conn.execute(
      `INSERT INTO users
        (name, email, password, role, is_active, password_reset_required, email_verified, email_verified_at, org_id, failed_login_attempts, locked_until)
       VALUES (?, ?, ?, ?, 1, 0, 1, NOW(), ?, 0, NULL)`,
      [seed.name, normalizedEmail, passwordHash, seed.role, context.org.id]
    );
    userId = result.insertId;
  } else {
    await conn.execute(
      `UPDATE users
          SET name = ?, role = ?, is_active = 1, email_verified = 1, email_verified_at = COALESCE(email_verified_at, NOW()), org_id = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = ?`,
      [seed.name, seed.role, context.org.id, userId]
    );
  }

  const [[orgAccess]] = await conn.execute(
    'SELECT id FROM user_org_access WHERE user_id = ? AND org_id = ? LIMIT 1',
    [userId, context.org.id]
  );
  if (orgAccess) {
    await conn.execute(
      `UPDATE user_org_access
          SET primary_site_id = ?, role_at_org = ?, site_permission = 'full', is_active = 1,
              site_access_scope = 'primary', access_expires_at = NULL, updated_at = NOW()
        WHERE id = ?`,
      [context.site.id, seed.role_at_org, orgAccess.id]
    );
  } else {
    await conn.execute(
      `INSERT INTO user_org_access
        (user_id, org_id, primary_site_id, role_at_org, site_permission, is_active, access_expires_at, site_access_scope, approved_by, approved_at)
       VALUES (?, ?, ?, ?, 'full', 1, NULL, 'primary', ?, NOW())`,
      [userId, context.org.id, context.site.id, seed.role_at_org, context.admin.id]
    );
  }

  const [[siteAccess]] = await conn.execute(
    'SELECT id FROM user_site_access WHERE org_id = ? AND user_id = ? AND site_id = ? LIMIT 1',
    [context.org.id, userId, context.site.id]
  );
  if (siteAccess) {
    await conn.execute(
      `UPDATE user_site_access
          SET access_level = 'full', is_primary = 1, is_active = 1, updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [context.admin.id, siteAccess.id]
    );
  } else {
    await conn.execute(
      `INSERT INTO user_site_access
        (org_id, user_id, site_id, access_level, is_primary, is_active, created_by, updated_by)
       VALUES (?, ?, ?, 'full', 1, 1, ?, ?)`,
      [context.org.id, userId, context.site.id, context.admin.id, context.admin.id]
    );
  }

  for (const module of seed.modules || []) {
    await ensureUserModule(conn, userId, module);
  }

  return userId;
}

async function seedDemoUsers(conn, context) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const usersByKey = {};

  for (const seed of DEMO_USER_SEEDS) {
    usersByKey[seed.key] = {
      id: await upsertDemoUser(conn, context, seed, passwordHash),
      ...seed,
    };
  }

  for (const seed of DEMO_USER_SEEDS) {
    for (const template of seed.group_templates || []) {
      const groupId = await findGroupIdByTemplate(conn, context.org.id, template);
      await ensureGroupUser(conn, groupId, usersByKey[seed.key].id);
    }
  }

  return usersByKey;
}

async function seedSecurityModel(conn, context) {
  await accessService.seedAccessTemplates(context.org.id, context.admin.id);
  const adminGroupId = await findGroupIdByTemplate(conn, context.org.id, 'mims_admin');
  const managerGroupId = await findGroupIdByTemplate(conn, context.org.id, 'manager');
  const agentGroupId = await findGroupIdByTemplate(conn, context.org.id, 'mi_agent');
  const reviewerGroupId = await findGroupIdByTemplate(conn, context.org.id, 'reviewer');
  const contentManagerGroupId = await findGroupIdByTemplate(conn, context.org.id, 'content_manager');
  const readonlyGroupId = await findGroupIdByTemplate(conn, context.org.id, 'readonly_auditor');

  const admins = context.users.filter((user) => user.role === 'admin').slice(0, 2);
  const agents = context.users.filter((user) => user.role === 'agent').slice(0, 4);

  for (const admin of admins) {
    await ensureGroupUser(conn, adminGroupId, admin.id);
  }
  if (admins[0]) await ensureGroupUser(conn, managerGroupId, admins[0].id);
  if (admins[1]) {
    await ensureGroupUser(conn, reviewerGroupId, admins[1].id);
    await ensureGroupUser(conn, contentManagerGroupId, admins[1].id);
  }
  if (admins[0]) await ensureGroupUser(conn, readonlyGroupId, admins[0].id);
  for (const agent of agents) {
    await ensureGroupUser(conn, agentGroupId, agent.id);
  }
}

async function rebindSeededFlowIdentity(conn, context, demoUsers) {
  const results = [];

  for (const flow of FLOW_SEEDS) {
    const caseId = await getCaseBySeedKey(conn, context.org.id, flow.key);
    if (!caseId) continue;
    const plan = FLOW_IDENTITY_PLAN[flow.key];
    if (!plan) continue;

    const creator = demoUsers[plan.creator];
    const owner = demoUsers[plan.owner];
    const approver = plan.approver ? demoUsers[plan.approver] : null;
    const transmissionAssignee = plan.transmission_assignee ? demoUsers[plan.transmission_assignee] : null;

    const [[inquiry]] = await conn.execute(
      'SELECT id FROM inquiries WHERE case_id = ? ORDER BY id DESC LIMIT 1',
      [caseId]
    );

    await conn.beginTransaction();
    try {
      await conn.execute(
        'UPDATE cases SET case_owner_id = ?, updated_at = NOW() WHERE id = ?',
        [owner.id, caseId]
      );
      if (inquiry) {
        await conn.execute(
          'UPDATE inquiries SET assigned_to = ?, updated_at = NOW() WHERE id = ?',
          [owner.name, inquiry.id]
        ).catch(async () => {
          await conn.execute(
            'UPDATE inquiries SET assigned_to = ? WHERE id = ?',
            [owner.name, inquiry.id]
          );
        });
        await conn.execute(
          'UPDATE inquiry_read_receipts SET user_id = ? WHERE inquiry_id = ?',
          [owner.id, inquiry.id]
        );
        await conn.execute(
          'UPDATE inquiry_notes SET user_id = ?, user_name = ? WHERE inquiry_id = ?',
          [owner.id, owner.name, inquiry.id]
        );
      }

      await conn.execute(
        'UPDATE case_comments SET user_id = ? WHERE case_id = ?',
        [owner.id, caseId]
      );

      await conn.execute(
        `UPDATE case_audit_trail
            SET user_id = ?, user_name = ?
          WHERE case_id = ? AND action_type = 'CASE_CREATED'`,
        [creator.id, creator.name, caseId]
      );
      await conn.execute(
        `UPDATE case_audit_trail
            SET user_id = ?, user_name = ?, new_value = ?
          WHERE case_id = ? AND action_type = 'CASE_ASSIGNED'`,
        [creator.id, creator.name, String(owner.id), caseId]
      );
      await conn.execute(
        `UPDATE case_audit_trail
            SET user_id = ?, user_name = ?
          WHERE case_id = ? AND action_type = 'INQUIRY_LINKED'`,
        [owner.id, owner.name, caseId]
      );

      await conn.execute(
        `UPDATE case_mi_responses
            SET author_id = ?, author_name = ?, approved_by = ?, updated_at = NOW()
          WHERE case_id = ?`,
        [owner.id, owner.name, approver?.id || null, caseId]
      ).catch(async () => {
        await conn.execute(
          `UPDATE case_mi_responses
              SET author_id = ?, author_name = ?, approved_by = ?
            WHERE case_id = ?`,
          [owner.id, owner.name, approver?.id || null, caseId]
        );
      });

      if (transmissionAssignee) {
        await conn.execute(
          `UPDATE case_ae_transmissions
              SET assigned_to = ?, assigned_name = ?, created_by = ?, created_by_name = ?, updated_at = NOW()
            WHERE case_id = ?`,
          [transmissionAssignee.id, transmissionAssignee.name, owner.id, owner.name, caseId]
        );
        await conn.execute(
          `UPDATE case_pc_transmissions
              SET assigned_to = ?, assigned_name = ?, created_by = ?, created_by_name = ?, updated_at = NOW()
            WHERE case_id = ?`,
          [transmissionAssignee.id, transmissionAssignee.name, owner.id, owner.name, caseId]
        );
      }

      await conn.execute(
        `UPDATE notifications
            SET user_id = ?
          WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.seed_key')) = ?
            AND category = 'case_assignment'`,
        [owner.id, flow.key]
      );
      if (transmissionAssignee) {
        await conn.execute(
          `UPDATE notifications
              SET user_id = ?
            WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.seed_key')) = ?
              AND category IN ('ae_transmission', 'pc_transmission')`,
          [transmissionAssignee.id, flow.key]
        );
      }

      await conn.commit();
      results.push({
        flow_key: flow.key,
        case_id: caseId,
        owner: owner.name,
        transmission_assignee: transmissionAssignee?.name || null,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  }

  return results;
}

async function getLegacyUserCandidates(conn, orgId, protectedIds) {
  const protectedPlaceholders = protectedIds.map(() => '?').join(',') || 'NULL';
  const params = [
    orgId,
    ...protectedIds,
    ...LEGACY_USER_MATCHERS.namePatterns,
    ...LEGACY_USER_MATCHERS.emailPatterns,
  ];
  const [rows] = await conn.execute(
    `SELECT DISTINCT u.id, u.name, u.email, u.role, u.is_active
       FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ?
      WHERE u.id NOT IN (${protectedPlaceholders})
        AND (
          ${LEGACY_USER_MATCHERS.namePatterns.map(() => 'LOWER(u.name) LIKE ?').join(' OR ')}
          OR
          ${LEGACY_USER_MATCHERS.emailPatterns.map(() => 'LOWER(u.email) LIKE ?').join(' OR ')}
        )
      ORDER BY u.id`,
    params
  );
  return rows;
}

function defaultOwnerForCaseType(demoUsers, caseType) {
  if (caseType === 'MI') return demoUsers.kunal_mi;
  return demoUsers.neha_intake;
}

async function retireLegacyUsers(conn, context, demoUsers) {
  const protectedIds = [
    context.admin.id,
    ...Object.values(demoUsers).map((user) => user.id),
  ];
  const legacyUsers = await getLegacyUserCandidates(conn, context.org.id, protectedIds);
  if (!legacyUsers.length) {
    return {
      candidate_count: 0,
      disabled_org_access: [],
      reassigned_cases: [],
      disabled_global_users: [],
      revoked_sessions: 0,
      removed_group_memberships: 0,
    };
  }

  const legacyIds = legacyUsers.map((user) => user.id);
  const placeholders = legacyIds.map(() => '?').join(',');

  const [ownedCases] = await conn.execute(
    `SELECT id, case_number, case_type, case_owner_id
       FROM cases
      WHERE org_id = ? AND is_deleted = 0 AND case_owner_id IN (${placeholders})
      ORDER BY id`,
    [context.org.id, ...legacyIds]
  );

  const [aeTx] = await conn.execute(
    `SELECT t.id, t.case_id
       FROM case_ae_transmissions t
       JOIN cases c ON c.id = t.case_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND t.assigned_to IN (${placeholders})`,
    [context.org.id, ...legacyIds]
  );
  const [pcTx] = await conn.execute(
    `SELECT t.id, t.case_id
       FROM case_pc_transmissions t
       JOIN cases c ON c.id = t.case_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND t.assigned_to IN (${placeholders})`,
    [context.org.id, ...legacyIds]
  );
  const [assignedInquiries] = await conn.execute(
    `SELECT i.id, i.case_id, i.assigned_to
       FROM inquiries i
      WHERE i.org_id = ? AND i.assigned_to IN (${legacyUsers.map(() => '?').join(',')})`,
    [context.org.id, ...legacyUsers.map((user) => user.name)]
  );

  const summary = {
    candidate_count: legacyUsers.length,
    disabled_org_access: legacyUsers.map((user) => ({ id: user.id, name: user.name, email: user.email })),
    reassigned_cases: [],
    disabled_global_users: [],
    revoked_sessions: 0,
    removed_group_memberships: 0,
  };

  await conn.beginTransaction();
  try {
    for (const row of ownedCases) {
      const owner = defaultOwnerForCaseType(demoUsers, row.case_type);
      await conn.execute(
        'UPDATE cases SET case_owner_id = ?, updated_at = NOW() WHERE id = ?',
        [owner.id, row.id]
      );
      await conn.execute(
        `INSERT INTO case_audit_trail
          (case_id, user_id, user_name, action_type, field_name, old_value, new_value, timestamp)
         VALUES (?, ?, ?, 'CASE_REASSIGNED', 'case_owner_id', ?, ?, NOW())`,
        [row.id, context.admin.id, context.admin.name, String(row.case_owner_id), String(owner.id)]
      );
      summary.reassigned_cases.push({
        case_id: row.id,
        case_number: row.case_number,
        case_type: row.case_type,
        new_owner: owner.name,
      });
    }

    for (const row of assignedInquiries) {
      const owner = row.case_id && ownedCases.find((item) => item.id === row.case_id)
        ? defaultOwnerForCaseType(demoUsers, ownedCases.find((item) => item.id === row.case_id).case_type)
        : demoUsers.neha_intake;
      await conn.execute(
        'UPDATE inquiries SET assigned_to = ? WHERE id = ?',
        [owner.name, row.id]
      );
    }

    for (const row of aeTx) {
      await conn.execute(
        'UPDATE case_ae_transmissions SET assigned_to = ?, assigned_name = ?, updated_at = NOW() WHERE id = ?',
        [demoUsers.priya_pv.id, demoUsers.priya_pv.name, row.id]
      );
    }
    for (const row of pcTx) {
      await conn.execute(
        'UPDATE case_pc_transmissions SET assigned_to = ?, assigned_name = ?, updated_at = NOW() WHERE id = ?',
        [demoUsers.rohan_quality.id, demoUsers.rohan_quality.name, row.id]
      );
    }

    if (legacyIds.length) {
      const [sessionDelete] = await conn.execute(
        `DELETE FROM sessions WHERE user_id IN (${placeholders})`,
        legacyIds
      );
      summary.revoked_sessions = Number(sessionDelete.affectedRows || 0);

      const [groupDelete] = await conn.execute(
        `DELETE sgu
           FROM security_group_users sgu
           JOIN security_groups sg ON sg.id = sgu.group_id
          WHERE sg.org_id = ? AND sgu.user_id IN (${placeholders})`,
        [context.org.id, ...legacyIds]
      );
      summary.removed_group_memberships = Number(groupDelete.affectedRows || 0);

      await conn.execute(
        `UPDATE user_site_access
            SET is_active = 0, is_primary = 0, updated_by = ?, updated_at = NOW()
          WHERE org_id = ? AND user_id IN (${placeholders})`,
        [context.admin.id, context.org.id, ...legacyIds]
      );
      await conn.execute(
        `UPDATE user_org_access
            SET is_active = 0, access_expires_at = NOW(), updated_at = NOW(), approved_by = ?, approved_at = NOW()
          WHERE org_id = ? AND user_id IN (${placeholders})`,
        [context.admin.id, context.org.id, ...legacyIds]
      );
    }

    for (const user of legacyUsers) {
      const [[otherActiveOrg]] = await conn.execute(
        `SELECT COUNT(*) AS cnt
           FROM user_org_access
          WHERE user_id = ? AND is_active = 1`,
        [user.id]
      );
      if (Number(otherActiveOrg?.cnt || 0) === 0) {
        await conn.execute(
          'UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?',
          [user.id]
        );
        summary.disabled_global_users.push({ id: user.id, name: user.name, email: user.email });
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }

  return summary;
}

async function getCaseBySeedKey(conn, orgId, key) {
  const marker = `%[novartis-flow:${key}]%`;
  const [[row]] = await conn.execute(
    `SELECT id
       FROM cases
      WHERE org_id = ? AND internal_notes LIKE ?
      ORDER BY id DESC
      LIMIT 1`,
    [orgId, marker]
  );
  return row?.id || null;
}

async function insertNotification(conn, userId, payload) {
  await conn.execute(
    `INSERT INTO notifications
      (user_id, category, title, message, link_url, metadata, severity, requires_acknowledgement, event_key, is_read, created_at, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      payload.category,
      payload.title,
      payload.message,
      payload.link_url || null,
      JSON.stringify(payload.metadata || {}),
      payload.severity || 'info',
      payload.requires_acknowledgement ? 1 : 0,
      payload.event_key || null,
      payload.is_read ? 1 : 0,
      payload.created_at || toDateTime(new Date()),
      payload.delivered_at || toDateTime(new Date()),
    ]
  );
}

async function createScenarioFlow(conn, context, refs, flow, index) {
  const existingCaseId = await getCaseBySeedKey(conn, context.org.id, flow.key);
  if (existingCaseId) {
    return { case_id: existingCaseId, reused: true };
  }

  const caseOwner = flow.assigned_user_role === 'admin' ? context.admin : context.agent;
  const statusId = context.statusByName.get(flow.status_name) || context.statusByName.get('New') || 59;
  const contactId = refs.contactIdsByEmail.get(flow.contact_email);
  const productId = refs.productIdsByTradeName.get(flow.product_trade_name);
  if (!contactId) throw new Error(`Missing contact for ${flow.contact_email}`);
  if (!productId) throw new Error(`Missing product for ${flow.product_trade_name}`);

  const [[contact]] = await conn.execute('SELECT * FROM contacts WHERE id = ? LIMIT 1', [contactId]);
  const receivedDate = daysFromNow(-((index * 2) + 1));
  const inquiryReceivedAt = toDateTime(receivedDate);
  const dueDate = flow.mi_tab?.response_required_by_offset_days != null
    ? toDateOnly(daysFromNow(flow.mi_tab.response_required_by_offset_days))
    : null;

  await conn.beginTransaction();
  try {
    const [caseInsert] = await conn.execute(
      `INSERT INTO cases
        (org_id, site_id, case_type, intake_channel, priority, date_received, date_of_intake, status_id, case_owner_id, description, internal_notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        context.org.id,
        context.site.id,
        flow.case_type,
        flow.intake_channel,
        flow.priority,
        toDateOnly(receivedDate),
        inquiryReceivedAt,
        statusId,
        caseOwner.id,
        flow.inquiry_subject,
        `[novartis-flow:${flow.key}]\n${flow.case_comment}`,
        context.admin.id,
        inquiryReceivedAt,
        inquiryReceivedAt,
      ]
    );
    const caseId = caseInsert.insertId;

    const [inquiryInsert] = await conn.execute(
      `INSERT INTO inquiries
        (org_id, message_id, message_hash, sender, recipient, subject, body, received_at, status, attachments_count, source_tag, is_locked, locked_by, color, is_read, assigned_to, priority, due_date, triage_state, queue_name, mailbox_name, first_touched_at, last_action_at, case_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        context.org.id,
        `novartis-seed-${flow.key}`,
        `novartis-seed-${flow.key}`,
        flow.inquiry_sender,
        'medinfo@novartis-demo.com',
        flow.inquiry_subject,
        flow.inquiry_body,
        inquiryReceivedAt,
        flow.inquiry_status,
        'Novartis Full Scope Seed',
        flow.case_type === 'AE' ? 'amber' : 'blue',
        caseOwner.name,
        flow.priority,
        dueDate,
        flow.inquiry_triage_state,
        flow.case_type === 'AE' ? 'Safety Intake' : flow.case_type === 'PC' ? 'Quality Complaints' : 'Medical Information',
        'Novartis Shared Inbox',
        inquiryReceivedAt,
        inquiryReceivedAt,
        caseId,
        inquiryReceivedAt,
      ]
    );
    const inquiryId = inquiryInsert.insertId;

    await conn.execute(
      `INSERT INTO inquiry_read_receipts (inquiry_id, org_id, user_id, read_at, last_viewed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [inquiryId, context.org.id, caseOwner.id, inquiryReceivedAt, inquiryReceivedAt, inquiryReceivedAt]
    );

    await conn.execute(
      `INSERT INTO inquiry_notes (inquiry_id, user_id, user_name, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [inquiryId, caseOwner.id, caseOwner.name, flow.inquiry_note, inquiryReceivedAt]
    );

    const [caseContactInsert] = await conn.execute(
      `INSERT INTO case_contacts
        (case_id, contact_id, contact_role, do_not_update_master, is_primary, first_name, last_name, contact_type, specialty, institution, phone, email, address, created_at, updated_at)
       VALUES (?, ?, 'requestor', 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        caseId,
        contactId,
        contact.first_name,
        contact.last_name,
        contact.type,
        contact.specialty,
        contact.institution,
        contact.phone,
        contact.email,
        contact.address,
        inquiryReceivedAt,
        inquiryReceivedAt,
      ]
    );
    const caseContactId = caseContactInsert.insertId;

    if (flow.reporter) {
      await conn.execute(
        `INSERT INTO case_reporter
          (case_id, first_name, last_name, email, phone, reporter_type, country, organisation, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          contact.first_name,
          contact.last_name,
          contact.email,
          contact.phone,
          flow.reporter.reporter_type,
          flow.reporter.country,
          flow.reporter.organisation,
          inquiryReceivedAt,
          inquiryReceivedAt,
        ]
      );
    }

    if (flow.patient) {
      await conn.execute(
        `INSERT INTO case_patient
          (case_id, initials, age, age_unit, gender, weight_kg, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          flow.patient.initials,
          flow.patient.age,
          flow.patient.age_unit,
          flow.patient.gender,
          flow.patient.weight_kg,
          inquiryReceivedAt,
          inquiryReceivedAt,
        ]
      );
    }

    if (flow.case_type === 'MI' && flow.mi_tab) {
      const responseDate = flow.mi_tab.response_date_offset_days != null
        ? toDateOnly(daysFromNow(flow.mi_tab.response_date_offset_days))
        : null;
      const [miInsert] = await conn.execute(
        `INSERT INTO case_mi
          (case_id, tab_index, mi_category, subcategory, product_id, question_summary, detailed_question, response_required_by, response_provided, response_date, response_channel, status, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          flow.mi_tab.mi_category,
          flow.mi_tab.subcategory,
          productId,
          flow.mi_tab.question_summary,
          flow.mi_tab.detailed_question,
          dueDate,
          flow.mi_tab.response_provided,
          responseDate,
          flow.mi_tab.response_channel,
          flow.mi_tab.status,
          inquiryReceivedAt,
          inquiryReceivedAt,
        ]
      );

      const responseStatus = String(flow.response?.response_status || 'READY').toUpperCase();
      const approvedAt = responseStatus === 'APPROVED' || responseStatus === 'SENT' ? toDateTime(daysFromNow(-1)) : null;
      const sentAt = responseStatus === 'SENT' ? toDateTime(new Date()) : null;
      await conn.execute(
        `INSERT INTO case_mi_responses
          (case_id, mi_tab_id, recipient_contact_id, recipient_name, recipient_email, product_id, response_text, response_channel, response_subject, response_date, follow_up_required, response_status, draft_saved_at, approved_by, approved_at, sent_at, is_finalized, author_id, author_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          miInsert.insertId,
          caseContactId,
          `${contact.first_name} ${contact.last_name}`.trim(),
          contact.email,
          productId,
          flow.response?.response_text || null,
          flow.response?.response_channel || 'email',
          flow.response?.response_subject || null,
          approvedAt ? approvedAt.slice(0, 10) : null,
          flow.response?.follow_up_required ? 1 : 0,
          responseStatus,
          inquiryReceivedAt,
          approvedAt ? context.reviewer.id : null,
          approvedAt,
          sentAt,
          responseStatus === 'SENT' ? 1 : 0,
          context.agent.id,
          context.agent.name,
          inquiryReceivedAt,
        ]
      );
    }

    if (flow.case_type === 'AE' && flow.ae_intake) {
      await conn.execute(
        `INSERT INTO case_ae_intake
          (case_id, suspect_drug_name, batch_lot_number, dose, route_of_admin, treatment_start_date, treatment_stop_date, reaction_description, reaction_onset_date, outcome, is_serious, is_death, is_life_threatening, is_hospitalization, is_prolonged_hospitalization, is_disability, is_congenital_anomaly, is_other_medically_important, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          flow.product_trade_name,
          flow.ae_intake.batch_lot_number,
          flow.ae_intake.dose,
          flow.ae_intake.route_of_admin,
          toDateOnly(daysFromNow(flow.ae_intake.treatment_start_date_offset_days)),
          toDateOnly(daysFromNow(flow.ae_intake.treatment_stop_date_offset_days)),
          flow.ae_intake.reaction_description,
          toDateOnly(daysFromNow(flow.ae_intake.reaction_onset_date_offset_days)),
          flow.ae_intake.outcome,
          flow.ae_intake.is_serious ? 1 : 0,
          flow.ae_intake.is_death ? 1 : 0,
          flow.ae_intake.is_life_threatening ? 1 : 0,
          flow.ae_intake.is_hospitalization ? 1 : 0,
          flow.ae_intake.is_prolonged_hospitalization ? 1 : 0,
          flow.ae_intake.is_disability ? 1 : 0,
          flow.ae_intake.is_congenital_anomaly ? 1 : 0,
          flow.ae_intake.is_other_medically_important ? 1 : 0,
          inquiryReceivedAt,
          inquiryReceivedAt,
        ]
      );
    }

    if (flow.case_type === 'PC' && flow.pc_intake) {
      await conn.execute(
        `INSERT INTO case_pc_intake
          (case_id, product_name, batch_lot_number, expiry_date, purchase_date, complaint_category, complaint_description, sample_available, sample_return_requested, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          caseId,
          flow.product_trade_name,
          flow.pc_intake.batch_lot_number,
          toDateOnly(daysFromNow(flow.pc_intake.expiry_date_offset_days)),
          toDateOnly(daysFromNow(flow.pc_intake.purchase_date_offset_days)),
          flow.pc_intake.complaint_category,
          flow.pc_intake.complaint_description,
          flow.pc_intake.sample_available ? 1 : 0,
          flow.pc_intake.sample_return_requested ? 1 : 0,
          inquiryReceivedAt,
          inquiryReceivedAt,
        ]
      );
    }

    if (flow.transmission) {
      const dueDateValue = toDateOnly(daysFromNow(flow.transmission.due_date_offset_days));
      const groupName = `${flow.product_trade_name.split(' ')[0]} Transmission Group`;
      const [[group]] = await conn.execute(
        'SELECT id FROM product_groups WHERE org_id = ? AND name = ? AND group_type = ? LIMIT 1',
        [context.org.id, groupName, 'transmissions']
      );
      const snapshot = JSON.stringify([{ id: group?.id || null, name: groupName, product_id: productId }]);

      if (flow.transmission.type === 'AE') {
        await conn.execute(
          `INSERT INTO case_ae_transmissions
            (case_id, product_group_id, product_group_snapshot, assigned_to, assigned_name, priority, due_date, narrative, status, sla_status, resolution_notes, created_by, created_by_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            caseId,
            group?.id || null,
            snapshot,
            context.reviewer.id,
            context.reviewer.name,
            flow.transmission.priority,
            dueDateValue,
            flow.transmission.narrative,
            flow.transmission.status,
            flow.transmission.sla_status,
            flow.transmission.resolution_notes || null,
            context.agent.id,
            context.agent.name,
            inquiryReceivedAt,
            inquiryReceivedAt,
          ]
        );
      } else {
        await conn.execute(
          `INSERT INTO case_pc_transmissions
            (case_id, product_group_id, product_group_snapshot, assigned_to, assigned_name, priority, due_date, resolution_notes, status, sla_status, created_by, created_by_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            caseId,
            group?.id || null,
            snapshot,
            context.reviewer.id,
            context.reviewer.name,
            flow.transmission.priority,
            dueDateValue,
            flow.transmission.resolution_notes || null,
            flow.transmission.status,
            flow.transmission.sla_status,
            context.agent.id,
            context.agent.name,
            inquiryReceivedAt,
            inquiryReceivedAt,
          ]
        );
      }
    }

    await conn.execute(
      `INSERT INTO case_comments (case_id, user_id, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [caseId, caseOwner.id, flow.case_comment, inquiryReceivedAt, inquiryReceivedAt]
    );

    await conn.execute(
      `INSERT INTO case_audit_trail
        (case_id, user_id, user_name, action_type, field_name, old_value, new_value, timestamp)
       VALUES
        (?, ?, ?, 'CASE_CREATED', 'case_type', NULL, ?, ?),
        (?, ?, ?, 'INQUIRY_LINKED', 'inquiry_id', NULL, ?, ?),
        (?, ?, ?, 'CASE_ASSIGNED', 'case_owner_id', NULL, ?, ?)`,
      [
        caseId, context.admin.id, context.admin.name, flow.case_type, inquiryReceivedAt,
        caseId, caseOwner.id, caseOwner.name, String(inquiryId), inquiryReceivedAt,
        caseId, context.admin.id, context.admin.name, String(caseOwner.id), inquiryReceivedAt,
      ]
    );

    await insertNotification(conn, caseOwner.id, {
      category: 'case_assignment',
      title: `New ${flow.case_type} case assigned`,
      message: `${flow.inquiry_subject} was linked and assigned to ${caseOwner.name}.`,
      link_url: `/cases/${caseId}`,
      metadata: { case_id: caseId, inquiry_id: inquiryId, seed_key: flow.key },
      severity: flow.priority === 'high' ? 'warning' : 'info',
      event_key: 'novartis-seed-case-assignment',
      created_at: inquiryReceivedAt,
      delivered_at: inquiryReceivedAt,
    });

    if (flow.transmission) {
      await insertNotification(conn, context.reviewer.id, {
        category: flow.transmission.type === 'AE' ? 'ae_transmission' : 'pc_transmission',
        title: `${flow.transmission.type} transmission queued`,
        message: `${flow.product_trade_name} case requires ${flow.transmission.type === 'AE' ? 'PV' : 'quality'} review. Due ${toDateOnly(daysFromNow(flow.transmission.due_date_offset_days))}.`,
        link_url: `/cases/${caseId}`,
        metadata: { case_id: caseId, seed_key: flow.key },
        severity: flow.transmission.sla_status === 'at_risk' ? 'warning' : 'info',
        event_key: 'novartis-seed-transmission',
        created_at: inquiryReceivedAt,
        delivered_at: inquiryReceivedAt,
      });
    }

    await conn.commit();
    return { case_id: caseId, inquiry_id: inquiryId, reused: false };
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

async function seedOperationalFlows(conn, context, refs) {
  const created = [];
  for (let index = 0; index < FLOW_SEEDS.length; index += 1) {
    created.push(await createScenarioFlow(conn, context, refs, FLOW_SEEDS[index], index));
  }
  return created;
}

async function seedNovartisFullScope(orgId = ORG_ID, options = {}) {
  const effectiveOrgId = Number(orgId || ORG_ID || 1);
  const closePool = options.closePool !== false;
  await pool.initPromise;
  const conn = await pool.getConnection();
  try {
    const context = await getOrgContext(conn, effectiveOrgId);
    const before = await buildSummary(conn, effectiveOrgId);
    const cleanupCandidates = await collectCleanupCandidates(conn, effectiveOrgId);
    const backupFile = await backupCleanupTargets(conn, effectiveOrgId, cleanupCandidates);
    const cleanup = await cleanupWastefulData(conn, context, cleanupCandidates);
    const refs = await seedMasterData(conn, context);
    await seedSecurityModel(conn, context);
    const demoUsers = await seedDemoUsers(conn, context);
    const flows = await seedOperationalFlows(conn, context, refs);
    const reboundFlows = await rebindSeededFlowIdentity(conn, context, demoUsers);
    const retiredLegacyUsers = await retireLegacyUsers(conn, context, demoUsers);
    const assignedCaseNumbers = await assignMissingCaseNumbers(conn, effectiveOrgId);
    const after = await buildSummary(conn, effectiveOrgId);

    return {
      generated_at: isoNow(),
      org_id: effectiveOrgId,
      backup_file: backupFile,
      cleanup_candidates: cleanupCandidates,
      cleanup,
      demo_users: Object.values(demoUsers).map((user) => ({ key: user.key, id: user.id, name: user.name, email: user.email, role: user.role })),
      flows,
      rebound_flows: reboundFlows,
      retired_legacy_users: retiredLegacyUsers,
      assigned_case_numbers: assignedCaseNumbers,
      before,
      after,
    };
  } finally {
    conn.release();
    if (closePool) {
      await pool.end();
    }
  }
}

async function main() {
  const result = await seedNovartisFullScope(ORG_ID, { closePool: true });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  seedNovartisFullScope,
};
