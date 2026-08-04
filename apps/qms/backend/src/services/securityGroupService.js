export const DEFAULT_SECURITY_GROUPS = [
  { roleKey: 'admin', roleName: 'Admin' },
  { roleKey: 'author', roleName: 'Author' },
  { roleKey: 'qa_reviewer', roleName: 'QA Reviewer' },
  { roleKey: 'approver', roleName: 'Approver' },
  { roleKey: 'viewer', roleName: 'Viewer' }
];

export const ALL_SECURITY_GROUP_KEYS = new Set([
  ...DEFAULT_SECURITY_GROUPS.map((role) => role.roleKey),
  'superadmin'
]);

function normalizeRoleKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function sanitizeRoleKeys(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  const unique = new Set();
  for (const value of source) {
    const key = normalizeRoleKey(value);
    if (!key) continue;
    if (!ALL_SECURITY_GROUP_KEYS.has(key)) continue;
    unique.add(key);
  }
  return Array.from(unique);
}

export async function ensureDefaultSecurityGroups(client, orgId) {
  for (const role of DEFAULT_SECURITY_GROUPS) {
    await client.query(
      `
        INSERT INTO qms_roles (org_id, role_key, role_name, is_system)
        VALUES ($1, $2, $3, true) AS new
        ON DUPLICATE KEY UPDATE role_name = new.role_name
      `,
      [orgId, role.roleKey, role.roleName]
    );
  }
}

export async function ensureRoleRows(client, orgId, roleKeys) {
  const keys = sanitizeRoleKeys(roleKeys);
  for (const key of keys) {
    const roleName =
      DEFAULT_SECURITY_GROUPS.find((item) => item.roleKey === key)?.roleName ||
      key
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

    await client.query(
      `
        INSERT INTO qms_roles (org_id, role_key, role_name, is_system)
        VALUES ($1, $2, $3, true) AS new
        ON DUPLICATE KEY UPDATE role_name = new.role_name
      `,
      [orgId, key, roleName]
    );
  }
}

export async function syncUserSecurityGroups(client, { orgId, userId, roleKeys }) {
  const keys = sanitizeRoleKeys(roleKeys);
  if (keys.length === 0) {
    const error = new Error('At least one valid security group is required');
    error.statusCode = 400;
    throw error;
  }

  await ensureRoleRows(client, orgId, keys);

  // `role_key = ANY($2)` was PostgreSQL-only — MySQL has no ANY(array). The key
  // list is expanded into one placeholder per key instead of leaning on mysql2's
  // `IN (?)` array expansion, because that expansion only happens on the text
  // protocol: on a prepared-statement path `IN (?)` would bind the array as a
  // single value and silently match nothing. This is the login path, so a silent
  // wrong answer here costs a user their roles.
  // `keys` is guaranteed non-empty by the length check above, so `IN ()` — which
  // is a syntax error in MySQL — cannot be produced.
  const keyPlaceholders = keys.map((_, index) => `$${index + 2}`).join(', ');

  const { rows: roleRows } = await client.query(
    `
      SELECT id, role_key
      FROM qms_roles
      WHERE org_id = $1
        AND role_key IN (${keyPlaceholders})
    `,
    [orgId, ...keys]
  );

  if (roleRows.length === 0) {
    const error = new Error('No matching security groups found for user assignment');
    error.statusCode = 400;
    throw error;
  }

  await client.query('DELETE FROM qms_user_roles WHERE org_id = $1 AND user_id = $2', [orgId, userId]);

  for (const row of roleRows) {
    await client.query(
      `
        INSERT IGNORE INTO qms_user_roles (org_id, user_id, role_id)
        VALUES ($1, $2, $3)
      `,
      [orgId, userId, row.id]
    );
  }

  const primaryRole = keys.includes('admin') ? 'admin' : keys[0];
  await client.query(
    `
      UPDATE qms_users
      SET role_key = $3, updated_at = CURRENT_TIMESTAMP(3)
      WHERE org_id = $1 AND id = $2
    `,
    [orgId, userId, primaryRole]
  );

  return keys;
}

export async function resolveUserSecurityGroups(client, { orgId, userId, fallbackRoleKey }) {
  const { rows } = await client.query(
    `
      SELECT r.role_key
      FROM qms_user_roles ur
      JOIN qms_roles r ON r.id = ur.role_id
      WHERE ur.org_id = $1
        AND ur.user_id = $2
      ORDER BY r.role_key ASC
    `,
    [orgId, userId]
  );

  const roleKeys = rows.map((row) => row.role_key).filter(Boolean);
  if (roleKeys.length > 0) {
    if (fallbackRoleKey && !roleKeys.includes(fallbackRoleKey)) roleKeys.push(fallbackRoleKey);
    return Array.from(new Set(roleKeys));
  }

  const fallback = sanitizeRoleKeys([fallbackRoleKey]);
  return fallback.length > 0 ? fallback : ['viewer'];
}
