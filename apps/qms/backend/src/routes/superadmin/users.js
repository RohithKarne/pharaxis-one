import { Router } from 'express';
import { appendAuditEvent } from '../../services/auditTrailService.js';
import { logSuperadminAction } from './_adminActions.js';

export const superadminUsersRouter = Router();

superadminUsersRouter.get('/', async (req, res, next) => {
  try {
    const users = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            u.id,
            u.org_id,
            o.org_code,
            u.email::text AS email,
            u.full_name,
            u.role_key,
            u.is_active,
            u.created_at
          FROM qms_users u
          JOIN qms_orgs o ON o.id = u.org_id
          ORDER BY u.created_at DESC
          LIMIT 200
        `
      );
      return rows;
    });

    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

superadminUsersRouter.post('/', async (req, res, next) => {
  try {
    const { orgId, email, fullName, roleKey, password } = req.body || {};
    if (!orgId || !email || !fullName || !roleKey || !password) {
      return res.status(400).json({
        error: 'orgId, email, fullName, roleKey, and password are required'
      });
    }

    const user = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          INSERT INTO qms_users (org_id, email, full_name, role_key, password_hash, is_active)
          VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf')), true)
          RETURNING id, org_id, email::text AS email, full_name, role_key, is_active, created_at
        `,
        [orgId, email, fullName, roleKey, password]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.user.create',
        targetEntityType: 'qms_users',
        targetEntityId: rows[0].id,
        detailsJson: { orgId, email, roleKey }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'qms_users',
        entityId: rows[0].id,
        actionKey: 'create',
        actorUserId: req.authContext.userId,
        payloadJson: { orgId, email, roleKey }
      });

      return rows[0];
    });

    return res.status(201).json({ user });
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
      const { rows } = await client.query(
        `
          UPDATE qms_users
          SET is_active = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, org_id, email::text AS email, full_name, role_key, is_active, updated_at
        `,
        [userId, isActive]
      );

      if (!rows[0]) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

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

