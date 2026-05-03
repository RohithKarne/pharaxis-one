'use strict';

try { process.loadEnvFile(); } catch (_) {}

const mysql = require('mysql2/promise');

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function getConnection() {
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'mims_user',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'pharaxis_mims_dev',
  });
}

async function scalar(conn, sql, params = []) {
  const [[row]] = await conn.execute(sql, params);
  const firstKey = Object.keys(row || {})[0];
  return row ? row[firstKey] : null;
}

async function count(conn, sql, params = []) {
  return toInt(await scalar(conn, sql, params));
}

async function main() {
  const orgId = toInt(process.argv[2], 1);
  const conn = await getConnection();

  try {
    const [[org]] = await conn.execute(
      'SELECT id, name, is_active, process_explorer_enabled, two_factor_enabled, session_timeout_minutes FROM organisations WHERE id = ? LIMIT 1',
      [orgId]
    );
    if (!org) {
      throw new Error(`Organisation ${orgId} not found.`);
    }

    const counts = {
      sites: await count(conn, 'SELECT COUNT(*) AS cnt FROM sites WHERE org_id = ?', [orgId]),
      active_sites: await count(conn, 'SELECT COUNT(*) AS cnt FROM sites WHERE org_id = ? AND is_active = 1', [orgId]),
      user_org_access: await count(conn, 'SELECT COUNT(*) AS cnt FROM user_org_access WHERE org_id = ? AND is_active = 1', [orgId]),
      email_accounts: await count(conn, 'SELECT COUNT(*) AS cnt FROM email_accounts WHERE org_id = ?', [orgId]),
      inquiries: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ?', [orgId]),
      inquiry_read_receipts: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiry_read_receipts WHERE org_id = ?', [orgId]),
      cases: await count(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 0', [orgId]),
      archived_generated_cases: await count(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 1 AND internal_notes LIKE ?', [orgId, '%[novartis-simulation]%']),
      contacts: await count(conn, 'SELECT COUNT(*) AS cnt FROM contacts WHERE org_id = ? AND is_active = 1', [orgId]),
      product_families: await count(conn, 'SELECT COUNT(*) AS cnt FROM product_families WHERE org_id = ? AND is_active = 1', [orgId]),
      products: await count(conn, 'SELECT COUNT(*) AS cnt FROM products WHERE org_id = ? AND is_active = 1', [orgId]),
      security_groups: await count(conn, 'SELECT COUNT(*) AS cnt FROM security_groups WHERE org_id = ? AND is_active = 1', [orgId]),
      picklist_categories: await count(conn, 'SELECT COUNT(*) AS cnt FROM picklist_categories WHERE org_id = ? AND is_active = 1', [orgId]),
      picklist_fields: await count(conn, 'SELECT COUNT(*) AS cnt FROM picklist_fields WHERE org_id = ? AND is_active = 1', [orgId]),
      picklists: await count(conn, 'SELECT COUNT(*) AS cnt FROM picklists WHERE org_id = ? AND status = ?', [orgId, 'Active']),
      field_setup: await count(conn, 'SELECT COUNT(*) AS cnt FROM field_setup WHERE org_id = ?', [orgId]),
      case_form_definition: await count(conn, 'SELECT COUNT(*) AS cnt FROM case_form_definition WHERE org_id = ?', [orgId]),
      workflow_states: await count(conn, 'SELECT COUNT(*) AS cnt FROM workflow_states WHERE org_id = ? OR org_id IS NULL', [orgId]),
      case_number_config: await count(conn, 'SELECT COUNT(*) AS cnt FROM case_number_config WHERE org_id = ?', [orgId]),
      cm_folders: await count(conn, 'SELECT COUNT(*) AS cnt FROM cm_folders WHERE org_id = ?', [orgId]),
      cm_modules: await count(conn, 'SELECT COUNT(*) AS cnt FROM cm_modules m JOIN cm_folders f ON f.id = m.folder_id WHERE f.org_id = ?', [orgId]),
      cm_documents: await count(conn, 'SELECT COUNT(*) AS cnt FROM cm_documents d JOIN cm_folders f ON f.id = d.folder_id WHERE f.org_id = ?', [orgId]),
      cm_faqs: await count(conn, 'SELECT COUNT(*) AS cnt FROM cm_faqs q JOIN cm_folders f ON f.id = q.folder_id WHERE f.org_id = ?', [orgId]),
      help_articles: await count(conn, 'SELECT COUNT(*) AS cnt FROM help_articles WHERE org_id = ? AND is_active = 1', [orgId]),
      scheduled_jobs: await count(conn, 'SELECT COUNT(*) AS cnt FROM scheduled_jobs WHERE org_id = ?', [orgId]),
      novartis_simulation_jobs: await count(conn, 'SELECT COUNT(*) AS cnt FROM scheduled_jobs WHERE org_id = ? AND job_type = ?', [orgId, 'novartis_simulation']),
      chat_conversations: await count(conn, 'SELECT COUNT(*) AS cnt FROM chat_conversations WHERE org_id = ?', [orgId]),
      report_access_requests: await count(conn, 'SELECT COUNT(*) AS cnt FROM report_access_requests WHERE org_id = ?', [orgId]),
    };

    const anomalies = {
      cases_missing_case_type: await count(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 0 AND case_type IS NULL', [orgId]),
      cases_missing_case_number: await count(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 0 AND (case_number IS NULL OR TRIM(case_number) = "")', [orgId]),
      cases_missing_status: await count(conn, 'SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ? AND is_deleted = 0 AND status_id IS NULL', [orgId]),
      inquiries_unlinked: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND case_id IS NULL', [orgId]),
      inquiries_unassigned: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND assigned_to IS NULL', [orgId]),
      inquiries_mailer_daemon: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND LOWER(sender) LIKE "%mailer-daemon%"', [orgId]),
      inquiries_google_noise: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND (LOWER(sender) LIKE "%google%" OR LOWER(subject) LIKE "%google account%" OR LOWER(subject) LIKE "%security alert%")', [orgId]),
      inquiries_delivery_failure: await count(conn, 'SELECT COUNT(*) AS cnt FROM inquiries WHERE org_id = ? AND LOWER(subject) LIKE "%delivery status notification%"', [orgId]),
      product_families_missing: counts.product_families === 0 ? 1 : 0,
      contacts_missing: counts.contacts === 0 ? 1 : 0,
      security_groups_too_thin: counts.security_groups < 3 ? 1 : 0,
      novartis_simulation_schedule_missing: counts.novartis_simulation_jobs === 0 ? 1 : 0,
    };

    const [sampleInquiries] = await conn.execute(
      `SELECT id, sender, subject, status, triage_state, case_id, assigned_to, received_at
       FROM inquiries
       WHERE org_id = ?
       ORDER BY id DESC
       LIMIT 10`,
      [orgId]
    );

    const [sampleCases] = await conn.execute(
      `SELECT c.id, c.case_number, c.case_type, c.site_id, c.status_id, ws.name AS status_name, c.created_at
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       WHERE c.org_id = ? AND c.is_deleted = 0
       ORDER BY c.id DESC
       LIMIT 10`,
      [orgId]
    );

    const [sampleProducts] = await conn.execute(
      `SELECT p.id, p.trade_name, pf.name AS family_name, p.is_active
       FROM products p
       LEFT JOIN product_families pf ON pf.id = p.family_id
       WHERE p.org_id = ?
       ORDER BY p.id DESC
       LIMIT 10`,
      [orgId]
    );

    const [sampleJobs] = await conn.execute(
      `SELECT id, job_name, cron_expression, is_active, job_type, last_run_at, last_run_status
         FROM scheduled_jobs
        WHERE org_id = ?
        ORDER BY id DESC
        LIMIT 10`,
      [orgId]
    );

    const report = {
      generated_at: new Date().toISOString(),
      organisation: org,
      counts,
      anomalies,
      samples: {
        inquiries: sampleInquiries,
        cases: sampleCases,
        products: sampleProducts,
        scheduled_jobs: sampleJobs,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
