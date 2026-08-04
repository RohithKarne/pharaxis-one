// tenant-scope-audit: cross-org — superadmin platform surface, mounted behind
// superadminAuth (src/app.js:72). These are deliberate all-org aggregates and
// cross-org user administration; scoping them to one org would break superadmin.
import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { appendAuditEvent } from '../../services/auditTrailService.js';
import { logSuperadminAction } from './_adminActions.js';

// Password hashing moved out of the database: it used to be
// crypt($5, gen_salt('bf')), which is pgcrypto and has no MySQL equivalent.
// 10 matches the cost factor already used across the house (CP Portal). The
// hashes pgcrypto wrote are $2a$06$ — bcrypt reads the cost from the hash, so
// old passwords keep working while new ones are written stronger.
const BCRYPT_COST = 10;
import {
  ensureDefaultSecurityGroups,
  sanitizeRoleKeys,
  syncUserSecurityGroups
} from '../../services/securityGroupService.js';

export const superadminUsersRouter = Router();

superadminUsersRouter.get('/security-groups/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const groups = await req.withRlsTransaction(async (client) => {
      await ensureDefaultSecurityGroups(client, orgId);
      const { rows } = await client.query(
        `
          SELECT role_key, role_name
          FROM qms_roles
          WHERE org_id = $1
          ORDER BY role_key ASC
        `,
        [orgId]
      );
      return rows;
    });
    return res.json({ securityGroups: groups });
  } catch (error) {
    return next(error);
  }
});

// The Postgres aggregate was
//   COALESCE(ARRAY_AGG(DISTINCT r.role_key) FILTER (WHERE r.role_key IS NOT NULL),
//            ARRAY[u.role_key]::text[])
// and MySQL's JSON_ARRAYAGG matches none of those three parts: it has no
// DISTINCT, no FILTER, and it returns a JSON array rather than a text[]. It also
// never returns NULL for a group that exists — a user with no roles comes back
// from the LEFT JOIN as the single-element array [null], not as NULL — so a
// COALESCE fallback in SQL would never fire. All three therefore have to be done
// here, after the query, or the superadmin console's user list is wrong.
//
// Order: Postgres's ARRAY_AGG(DISTINCT ...) sorts ascending as a side effect of
// the sort-based dedup, so the .sort() reproduces it rather than adding one.
function normalizeSecurityGroups(row) {
  const raw =
    typeof row.security_groups === 'string' ? JSON.parse(row.security_groups) : row.security_groups;
  const roleKeys = Array.isArray(raw) ? raw : [];
  const groups = [...new Set(roleKeys.filter((key) => key !== null && key !== undefined))].sort();
  return { ...row, security_groups: groups.length > 0 ? groups : [row.role_key] };
}

superadminUsersRouter.get('/', async (req, res, next) => {
  try {
    const users = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            u.id,
            u.org_id,
            o.org_code,
            u.email,
            u.full_name,
            u.role_key,
            u.is_active,
            u.created_at,
            JSON_ARRAYAGG(r.role_key) AS security_groups
          FROM qms_users u
          JOIN qms_orgs o ON o.id = u.org_id
          LEFT JOIN qms_user_roles ur ON ur.user_id = u.id AND ur.org_id = u.org_id
          LEFT JOIN qms_roles r ON r.id = ur.role_id
          GROUP BY u.id, o.org_code
          ORDER BY u.created_at DESC
          LIMIT 200
        `
      );
      return rows.map(normalizeSecurityGroups);
    });

    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

superadminUsersRouter.post('/', async (req, res, next) => {
  try {
    const { orgId, email, fullName, roleKey, roleKeys, password } = req.body || {};
    if (!orgId || !email || !fullName || !password) {
      return res.status(400).json({
        error: 'orgId, email, fullName, and password are required'
      });
    }

    const requestedRoleKeys = sanitizeRoleKeys(roleKeys, [roleKey || 'viewer']);
    if (requestedRoleKeys.length === 0) {
      return res.status(400).json({ error: 'At least one valid security group is required' });
    }

    const user = await req.withRlsTransaction(async (client) => {
      await ensureDefaultSecurityGroups(client, orgId);

      const primaryRole = requestedRoleKeys.includes('admin') ? 'admin' : requestedRoleKeys[0];

      const newUserId = randomUUID();
      await client.query(
        `
          INSERT INTO qms_users (id, org_id, email, full_name, role_key, password_hash, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, true)
        `,
        [newUserId, orgId, email, fullName, primaryRole, await bcrypt.hash(password, BCRYPT_COST)]
      );

      const { rows } = await client.query(
        `
          SELECT id, org_id, email, full_name, role_key, is_active, created_at
          FROM qms_users
          WHERE id = $1
            AND org_id = $2
        `,
        [newUserId, orgId]
      );

      const assignedRoleKeys = await syncUserSecurityGroups(client, {
        orgId,
        userId: rows[0].id,
        roleKeys: requestedRoleKeys
      });

      if (!assignedRoleKeys.includes('superadmin')) {
        // DO NOTHING -> INSERT IGNORE, against the UNIQUE(user_id) key.
        await client.query(
          `
            INSERT INTO qms_user_2fa_settings (org_id, user_id, email_otp_enabled)
            VALUES ($1, $2, true)
            ON DUPLICATE KEY UPDATE user_id = user_id
          `,
          [orgId, rows[0].id]
        );
      }

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.user.create',
        targetEntityType: 'qms_users',
        targetEntityId: rows[0].id,
        detailsJson: { orgId, email, roleKeys: assignedRoleKeys }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'qms_users',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { orgId, email, roleKeys: assignedRoleKeys }
      });

      return {
        ...rows[0],
        security_groups: assignedRoleKeys
      };
    });

    return res.status(201).json({ user });
  } catch (error) {
    return next(error);
  }
});

superadminUsersRouter.patch('/:userId/security-groups', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { roleKeys } = req.body || {};
    const requestedRoleKeys = sanitizeRoleKeys(roleKeys, []);
    if (requestedRoleKeys.length === 0) {
      return res.status(400).json({ error: 'At least one valid security group is required' });
    }

    const updated = await req.withRlsTransaction(async (client) => {
      const { rows: userRows } = await client.query(
        `
          SELECT id, org_id, email
          FROM qms_users
          WHERE id = $1
        `,
        [userId]
      );
      if (!userRows[0]) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      const assignedRoleKeys = await syncUserSecurityGroups(client, {
        orgId: userRows[0].org_id,
        userId,
        roleKeys: requestedRoleKeys
      });

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.user.security_groups',
        targetEntityType: 'qms_users',
        targetEntityId: userId,
        detailsJson: { roleKeys: assignedRoleKeys }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'qms_users',
        entityId: userId,
        actionKey: 'security_groups_update',
        actorUserId: req.authContext.userId,
        payloadJson: { roleKeys: assignedRoleKeys }
      });

      return {
        id: userId,
        orgId: userRows[0].org_id,
        email: userRows[0].email,
        securityGroups: assignedRoleKeys
      };
    });

    return res.json({ user: updated });
  } catch (error) {
    return next(error);
  }
});

superadminUsersRouter.patch('/:userId/status', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body || {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive (boolean) is required' });
    }

    const updated = await req.withRlsTransaction(async (client) => {
      // RETURNING is gone, so the row has to be read back. Look the user up
      // first: that gives both the 404 and the org_id the write-back and the
      // read-back are scoped by, instead of leaving them on RLS alone.
      const { rows: targetRows } = await client.query(
        `
          SELECT org_id
          FROM qms_users
          WHERE id = $1
        `,
        [userId]
      );

      if (!targetRows[0]) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      await client.query(
        `
          UPDATE qms_users
          SET is_active = $2, updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $3
        `,
        [userId, isActive, targetRows[0].org_id]
      );

      const { rows } = await client.query(
        `
          SELECT id, org_id, email, full_name, role_key, is_active, updated_at
          FROM qms_users
          WHERE id = $1
            AND org_id = $2
        `,
        [userId, targetRows[0].org_id]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.user.status',
        targetEntityType: 'qms_users',
        targetEntityId: userId,
        detailsJson: { isActive }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'qms_users',
        entityId: userId,
        actionKey: 'status_update',
        actorUserId: req.authContext.userId,
        payloadJson: { isActive }
      });

      return rows[0];
    });

    return res.json({ user: updated });
  } catch (error) {
    return next(error);
  }
});
