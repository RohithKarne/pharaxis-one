import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const REQUIRED_ENV = ['DATABASE_URL'];
for (const envName of REQUIRED_ENV) {
  if (!process.env[envName]) {
    throw new Error(`[qms-seed] Missing required environment variable: ${envName}`);
  }
}

const DEFAULT_ORG_CODE = process.env.QMS_SEED_ORG_CODE || 'PHA_DEV';
const DEFAULT_ORG_NAME = process.env.QMS_SEED_ORG_NAME || 'Pharaxis Development';
const DEFAULT_EMAIL_DOMAIN = process.env.QMS_SEED_EMAIL_DOMAIN || 'pharaxis.local';
const DEFAULT_EMAIL_OTP_REQUIRED = String(process.env.QMS_SEED_EMAIL_OTP_REQUIRED || 'true').toLowerCase() === 'true';
const DEFAULT_ALLOW_ADMIN_2FA_RESET =
  String(process.env.QMS_SEED_ALLOW_ORG_ADMIN_2FA_RESET || 'true').toLowerCase() === 'true';

function makeEmail(localPart, overrideEnvValue) {
  if (overrideEnvValue) return String(overrideEnvValue).trim().toLowerCase();
  return `${localPart}@${DEFAULT_EMAIL_DOMAIN}`.toLowerCase();
}

const DEV_USERS = [
  {
    key: 'superadmin',
    fullName: process.env.QMS_SEED_SUPERADMIN_NAME || 'QMS Platform Superadmin',
    email: makeEmail('superadmin', process.env.QMS_SEED_SUPERADMIN_EMAIL || 'Superadmin'),
    password: process.env.QMS_SEED_SUPERADMIN_PASSWORD || 'Manager@123',
    roleKeys: ['superadmin'],
    primaryRole: 'superadmin',
    otpEnabled: false
  },
  {
    key: 'admin',
    fullName: process.env.QMS_SEED_ADMIN_NAME || 'QMS Admin',
    email: makeEmail('admin', process.env.QMS_SEED_ADMIN_EMAIL),
    password: process.env.QMS_SEED_ADMIN_PASSWORD || 'Admin@123',
    roleKeys: ['admin', 'qa_reviewer'],
    primaryRole: 'admin',
    otpEnabled: true
  },
  {
    key: 'author',
    fullName: process.env.QMS_SEED_AUTHOR_NAME || 'QMS Author',
    email: makeEmail('author', process.env.QMS_SEED_AUTHOR_EMAIL),
    password: process.env.QMS_SEED_AUTHOR_PASSWORD || 'Author@123',
    roleKeys: ['author'],
    primaryRole: 'author',
    otpEnabled: true
  },
  {
    key: 'qa_reviewer',
    fullName: process.env.QMS_SEED_QA_REVIEWER_NAME || 'QMS QA Reviewer',
    email: makeEmail('qareviewer', process.env.QMS_SEED_QA_REVIEWER_EMAIL),
    password: process.env.QMS_SEED_QA_REVIEWER_PASSWORD || 'QaReviewer@123',
    roleKeys: ['qa_reviewer'],
    primaryRole: 'qa_reviewer',
    otpEnabled: true
  },
  {
    key: 'approver',
    fullName: process.env.QMS_SEED_APPROVER_NAME || 'QMS Approver',
    email: makeEmail('approver', process.env.QMS_SEED_APPROVER_EMAIL),
    password: process.env.QMS_SEED_APPROVER_PASSWORD || 'Approver@123',
    roleKeys: ['approver'],
    primaryRole: 'approver',
    otpEnabled: true
  },
  {
    key: 'viewer',
    fullName: process.env.QMS_SEED_VIEWER_NAME || 'QMS Viewer',
    email: makeEmail('viewer', process.env.QMS_SEED_VIEWER_EMAIL),
    password: process.env.QMS_SEED_VIEWER_PASSWORD || 'Viewer@123',
    roleKeys: ['viewer'],
    primaryRole: 'viewer',
    otpEnabled: true
  }
];

const ROLE_MAP = new Map([
  ['superadmin', 'Superadmin'],
  ['admin', 'Admin'],
  ['author', 'Author'],
  ['qa_reviewer', 'QA Reviewer'],
  ['approver', 'Approver'],
  ['viewer', 'Viewer']
]);

async function upsertOrg(client, { orgCode, orgName }) {
  const { rows } = await client.query(
    `
      INSERT INTO qms_orgs (org_code, org_name, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT (org_code)
      DO UPDATE SET org_name = EXCLUDED.org_name, is_active = true, updated_at = now()
      RETURNING id, org_code, org_name
    `,
    [orgCode, orgName]
  );
  return rows[0];
}

async function ensureRoles(client, orgId, roleKeys) {
  for (const roleKey of roleKeys) {
    const roleName = ROLE_MAP.get(roleKey) || roleKey;
    await client.query(
      `
        INSERT INTO qms_roles (org_id, role_key, role_name, is_system)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (org_id, role_key)
        DO UPDATE SET role_name = EXCLUDED.role_name, is_system = true
      `,
      [orgId, roleKey, roleName]
    );
  }
}

async function ensureOrgDefaults(client, orgId) {
  await client.query(
    `
      INSERT INTO sa_org_upload_policies (org_id)
      VALUES ($1)
      ON CONFLICT (org_id) DO NOTHING
    `,
    [orgId]
  );

  await client.query(
    `
      INSERT INTO sa_org_security_policies (org_id, email_otp_required, allow_org_admin_2fa_reset)
      VALUES ($1, $2, $3)
      ON CONFLICT (org_id)
      DO UPDATE SET
        email_otp_required = EXCLUDED.email_otp_required,
        allow_org_admin_2fa_reset = EXCLUDED.allow_org_admin_2fa_reset,
        updated_at = now()
    `,
    [orgId, DEFAULT_EMAIL_OTP_REQUIRED, DEFAULT_ALLOW_ADMIN_2FA_RESET]
  );
}

async function upsertUser(client, orgId, userSpec) {
  const { rows } = await client.query(
    `
      INSERT INTO qms_users (org_id, email, full_name, role_key, password_hash, is_active)
      VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf')), true)
      ON CONFLICT (org_id, email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role_key = EXCLUDED.role_key,
        password_hash = crypt($5, gen_salt('bf')),
        is_active = true,
        updated_at = now()
      RETURNING id, email::text AS email, full_name, role_key
    `,
    [orgId, userSpec.email, userSpec.fullName, userSpec.primaryRole, userSpec.password]
  );

  return rows[0];
}

async function assignUserRoles(client, orgId, userId, roleKeys, primaryRole) {
  await client.query('DELETE FROM qms_user_roles WHERE org_id = $1 AND user_id = $2', [orgId, userId]);

  for (const roleKey of roleKeys) {
    await client.query(
      `
        INSERT INTO qms_user_roles (org_id, user_id, role_id)
        SELECT $1, $2, id
        FROM qms_roles
        WHERE org_id = $1
          AND role_key = $3
        ON CONFLICT (org_id, user_id, role_id) DO NOTHING
      `,
      [orgId, userId, roleKey]
    );
  }

  await client.query(
    `
      UPDATE qms_users
      SET role_key = $3, updated_at = now()
      WHERE org_id = $1 AND id = $2
    `,
    [orgId, userId, primaryRole]
  );
}

async function syncUser2fa(client, orgId, userId, otpEnabled) {
  if (!otpEnabled) {
    await client.query('DELETE FROM qms_user_2fa_settings WHERE user_id = $1', [userId]);
    return;
  }

  await client.query(
    `
      INSERT INTO qms_user_2fa_settings (org_id, user_id, email_otp_enabled, reset_required)
      VALUES ($1, $2, true, false)
      ON CONFLICT (user_id)
      DO UPDATE SET email_otp_enabled = true, reset_required = false, updated_at = now()
    `,
    [orgId, userId]
  );
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const org = await upsertOrg(client, {
      orgCode: DEFAULT_ORG_CODE,
      orgName: DEFAULT_ORG_NAME
    });

    const allRoleKeys = Array.from(new Set(DEV_USERS.flatMap((user) => user.roleKeys)));
    await ensureRoles(client, org.id, allRoleKeys);
    await ensureOrgDefaults(client, org.id);

    const createdUsers = [];

    for (const userSpec of DEV_USERS) {
      const user = await upsertUser(client, org.id, userSpec);
      await assignUserRoles(client, org.id, user.id, userSpec.roleKeys, userSpec.primaryRole);
      await syncUser2fa(client, org.id, user.id, userSpec.otpEnabled);
      createdUsers.push({ ...user, key: userSpec.key });
    }

    await client.query('COMMIT');

    console.log('[qms-seed] Seed completed.');
    console.log(`[qms-seed] Org: ${org.org_code} (${org.org_name})`);
    for (const user of createdUsers) {
      console.log(`[qms-seed] ${user.key}: ${user.email}`);
    }
    console.log('[qms-seed] Credentials are sourced from env overrides or default dev values.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('[qms-seed] Failed:', error.message);
  process.exit(1);
});
