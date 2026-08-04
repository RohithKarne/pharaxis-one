// tenant-scope-audit: cross-org — dev seed script, not a runtime request path.
// Runs once against a dev database to provision fixture users.
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { getMysqlPool, getMysqlClient } from './mysql/pool.js';

dotenv.config();

// Was crypt($5, gen_salt('bf')) — pgcrypto, which MySQL does not have.
// 10 matches the house cost factor (CP Portal).
const BCRYPT_COST = 10;

// The DATABASE_URL guard is gone with the `pg` driver: connection settings now
// come from MYSQL_* (see src/db/mysql/pool.js), which supplies dev defaults, so
// there is no longer an environment variable whose absence is fatal.

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

function fallbackSeedPassword(envName) {
  const supplied = String(process.env[envName] || '').trim();
  if (supplied) return supplied;
  const generated = randomBytes(12).toString('base64url');
  console.warn(`[qms-seed] ${envName} not set. Using generated one-time password for this run.`);
  return generated;
}

const DEV_USERS = [
  {
    key: 'superadmin',
    fullName: process.env.QMS_SEED_SUPERADMIN_NAME || 'QMS Platform Superadmin',
    email: makeEmail('superadmin', process.env.QMS_SEED_SUPERADMIN_EMAIL || 'Superadmin'),
    password: fallbackSeedPassword('QMS_SEED_SUPERADMIN_PASSWORD'),
    roleKeys: ['superadmin'],
    primaryRole: 'superadmin',
    otpEnabled: false
  },
  {
    key: 'admin',
    fullName: process.env.QMS_SEED_ADMIN_NAME || 'QMS Admin',
    email: makeEmail('admin', process.env.QMS_SEED_ADMIN_EMAIL),
    password: fallbackSeedPassword('QMS_SEED_ADMIN_PASSWORD'),
    roleKeys: ['admin', 'qa_reviewer'],
    primaryRole: 'admin',
    otpEnabled: true
  },
  {
    key: 'author',
    fullName: process.env.QMS_SEED_AUTHOR_NAME || 'QMS Author',
    email: makeEmail('author', process.env.QMS_SEED_AUTHOR_EMAIL),
    password: fallbackSeedPassword('QMS_SEED_AUTHOR_PASSWORD'),
    roleKeys: ['author'],
    primaryRole: 'author',
    otpEnabled: true
  },
  {
    key: 'qa_reviewer',
    fullName: process.env.QMS_SEED_QA_REVIEWER_NAME || 'QMS QA Reviewer',
    email: makeEmail('qareviewer', process.env.QMS_SEED_QA_REVIEWER_EMAIL),
    password: fallbackSeedPassword('QMS_SEED_QA_REVIEWER_PASSWORD'),
    roleKeys: ['qa_reviewer'],
    primaryRole: 'qa_reviewer',
    otpEnabled: true
  },
  {
    key: 'approver',
    fullName: process.env.QMS_SEED_APPROVER_NAME || 'QMS Approver',
    email: makeEmail('approver', process.env.QMS_SEED_APPROVER_EMAIL),
    password: fallbackSeedPassword('QMS_SEED_APPROVER_PASSWORD'),
    roleKeys: ['approver'],
    primaryRole: 'approver',
    otpEnabled: true
  },
  {
    key: 'viewer',
    fullName: process.env.QMS_SEED_VIEWER_NAME || 'QMS Viewer',
    email: makeEmail('viewer', process.env.QMS_SEED_VIEWER_EMAIL),
    password: fallbackSeedPassword('QMS_SEED_VIEWER_PASSWORD'),
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
  await client.query(
    `
      INSERT INTO qms_orgs (org_code, org_name, is_active)
      VALUES ($1, $2, true) AS new
      ON DUPLICATE KEY UPDATE
        org_name = new.org_name, is_active = true, updated_at = CURRENT_TIMESTAMP(3)
    `,
    [orgCode, orgName]
  );

  // Read back on the natural key, not a generated id: on the conflict branch the
  // surviving row keeps its own id, so a generated one would match nothing.
  const { rows } = await client.query(
    'SELECT id, org_code, org_name FROM qms_orgs WHERE org_code = $1',
    [orgCode]
  );
  return rows[0];
}

async function ensureRoles(client, orgId, roleKeys) {
  for (const roleKey of roleKeys) {
    const roleName = ROLE_MAP.get(roleKey) || roleKey;
    await client.query(
      `
        INSERT INTO qms_roles (org_id, role_key, role_name, is_system)
        VALUES ($1, $2, $3, true) AS new
        ON DUPLICATE KEY UPDATE role_name = new.role_name, is_system = true
      `,
      [orgId, roleKey, roleName]
    );
  }
}

async function ensureOrgDefaults(client, orgId) {
  await client.query(
    `
      INSERT IGNORE INTO sa_org_upload_policies (org_id)
      VALUES ($1)
    `,
    [orgId]
  );

  await client.query(
    `
      INSERT INTO sa_org_security_policies (org_id, email_otp_required, allow_org_admin_2fa_reset)
      VALUES ($1, $2, $3) AS new
      ON DUPLICATE KEY UPDATE
        email_otp_required = new.email_otp_required,
        allow_org_admin_2fa_reset = new.allow_org_admin_2fa_reset,
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [orgId, DEFAULT_EMAIL_OTP_REQUIRED, DEFAULT_ALLOW_ADMIN_2FA_RESET]
  );
}

async function upsertUser(client, orgId, userSpec) {
  await client.query(
    `
      INSERT INTO qms_users (org_id, email, full_name, role_key, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, true) AS new
      ON DUPLICATE KEY UPDATE
        full_name = new.full_name,
        role_key = new.role_key,
        password_hash = new.password_hash,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [
      orgId,
      userSpec.email,
      userSpec.fullName,
      userSpec.primaryRole,
      await bcrypt.hash(userSpec.password, BCRYPT_COST)
    ]
  );

  // Natural key, not a generated id — the conflict branch keeps the existing row.
  const { rows } = await client.query(
    'SELECT id, email, full_name, role_key FROM qms_users WHERE org_id = $1 AND email = $2',
    [orgId, userSpec.email]
  );

  return rows[0];
}

async function assignUserRoles(client, orgId, userId, roleKeys, primaryRole) {
  await client.query('DELETE FROM qms_user_roles WHERE org_id = $1 AND user_id = $2', [orgId, userId]);

  for (const roleKey of roleKeys) {
    await client.query(
      `
        INSERT IGNORE INTO qms_user_roles (org_id, user_id, role_id)
        SELECT $1, $2, id
        FROM qms_roles
        WHERE org_id = $1
          AND role_key = $3
      `,
      [orgId, userId, roleKey]
    );
  }

  await client.query(
    `
      UPDATE qms_users
      SET role_key = $3, updated_at = CURRENT_TIMESTAMP(3)
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
      ON DUPLICATE KEY UPDATE
        email_otp_enabled = true, reset_required = false, updated_at = CURRENT_TIMESTAMP(3)
    `,
    [orgId, userId]
  );
}

async function run() {
  const client = await getMysqlClient();

  try {
    await client.query('BEGIN');

    // The two set_config() calls that used to bracket this block are gone: they
    // set the Postgres RLS session variables, and MySQL has neither. The seed
    // reaches every row it needs because it is the only writer here, and each
    // statement already names its org_id explicitly.
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
    await getMysqlPool().end();
  }
}

run().catch((error) => {
  console.error('[qms-seed] Failed:', error.message);
  process.exit(1);
});
