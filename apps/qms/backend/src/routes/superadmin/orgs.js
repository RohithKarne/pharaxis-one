import { Router } from 'express';
import { appendAuditEvent } from '../../services/auditTrailService.js';
import { logSuperadminAction } from './_adminActions.js';
import { ensureDefaultSecurityGroups } from '../../services/securityGroupService.js';

export const superadminOrgsRouter = Router();

superadminOrgsRouter.get('/', async (req, res, next) => {
  try {
    const result = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT id, org_code, org_name, is_active, created_at, updated_at
          FROM qms_orgs
          ORDER BY created_at DESC
        `
      );
      return rows;
    });

    return res.json({ orgs: result });
  } catch (error) {
    return next(error);
  }
});

superadminOrgsRouter.post('/', async (req, res, next) => {
  try {
    const { orgCode, orgName } = req.body || {};
    if (!orgCode || !orgName) {
      return res.status(400).json({ error: 'orgCode and orgName are required' });
    }

    const created = await req.withRlsTransaction(async (client) => {
      // ON CONFLICT (org_code) DO UPDATE -> ON DUPLICATE KEY UPDATE, with the
      // MySQL 8.0.20+ row alias standing in for EXCLUDED.
      // qms_orgs has two unique keys, PRIMARY(id) and UNIQUE(org_code). MySQL
      // fires on either, but id is not in the column list — it defaults to
      // UUID() — so org_code is the only key this can collide on in practice.
      await client.query(
        `
          INSERT INTO qms_orgs (org_code, org_name, is_active)
          VALUES ($1, $2, true) AS new
          ON DUPLICATE KEY UPDATE
            org_name = new.org_name,
            updated_at = CURRENT_TIMESTAMP(3)
        `,
        [orgCode, orgName]
      );

      const { rows } = await client.query(
        `
          SELECT id, org_code, org_name, is_active, created_at, updated_at
          FROM qms_orgs
          WHERE org_code = $1
          LIMIT 1
        `,
        [orgCode]
      );

      await ensureDefaultSecurityGroups(client, rows[0].id);
      // DO NOTHING -> INSERT IGNORE, against UNIQUE(org_id) on both tables.
      await client.query(
        `
          INSERT INTO sa_org_upload_policies (org_id)
          VALUES ($1)
          ON DUPLICATE KEY UPDATE org_id = org_id
        `,
        [rows[0].id]
      );
      await client.query(
        `
          INSERT INTO sa_org_security_policies (org_id)
          VALUES ($1)
          ON DUPLICATE KEY UPDATE org_id = org_id
        `,
        [rows[0].id]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.org.upsert',
        targetEntityType: 'qms_orgs',
        targetEntityId: rows[0].id,
        detailsJson: { orgCode, orgName }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'qms_orgs',
        entityId: rows[0].id,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: { orgCode, orgName }
      });

      return rows[0];
    });

    return res.status(201).json({ org: created });
  } catch (error) {
    return next(error);
  }
});

superadminOrgsRouter.patch('/:orgId/status', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { isActive } = req.body || {};

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive (boolean) is required' });
    }

    const updated = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE qms_orgs
          SET is_active = $2, updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
        `,
        [orgId, isActive]
      );

      const { rows } = await client.query(
        `
          SELECT id, org_code, org_name, is_active, updated_at
          FROM qms_orgs
          WHERE id = $1
          LIMIT 1
        `,
        [orgId]
      );

      if (!rows[0]) {
        const error = new Error('Organization not found');
        error.statusCode = 404;
        throw error;
      }

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.org.status',
        targetEntityType: 'qms_orgs',
        targetEntityId: orgId,
        detailsJson: { isActive }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'qms_orgs',
        entityId: orgId,
        actionKey: 'status_update',
        actorUserId: req.authContext.userId,
        payloadJson: { isActive }
      });

      return rows[0];
    });

    return res.json({ org: updated });
  } catch (error) {
    return next(error);
  }
});
