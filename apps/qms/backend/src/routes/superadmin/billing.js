import { Router } from 'express';
import { appendAuditEvent } from '../../services/auditTrailService.js';
import { logSuperadminAction } from './_adminActions.js';

export const superadminBillingRouter = Router();

superadminBillingRouter.get('/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;

    const billing = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            b.org_id,
            b.plan_key,
            b.billing_status,
            b.license_limit,
            b.reporting_email,
            b.notes,
            b.created_at,
            b.updated_at
          FROM sa_org_billing_controls b
          WHERE b.org_id = $1
        `,
        [orgId]
      );

      return rows[0] || null;
    });

    return res.json({ billing });
  } catch (error) {
    return next(error);
  }
});

superadminBillingRouter.put('/:orgId', async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { planKey, billingStatus, licenseLimit, reportingEmail, notes } = req.body || {};

    if (!planKey || !billingStatus) {
      return res.status(400).json({ error: 'planKey and billingStatus are required' });
    }

    const billing = await req.withRlsTransaction(async (client) => {
      // ON CONFLICT (org_id) DO UPDATE -> ON DUPLICATE KEY UPDATE. The unique
      // keys on sa_org_billing_controls are PRIMARY(id) and UNIQUE(org_id); id
      // is not supplied here, so org_id is the only reachable collision.
      await client.query(
        `
          INSERT INTO sa_org_billing_controls (
            org_id,
            plan_key,
            billing_status,
            license_limit,
            reporting_email,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6) AS new
          ON DUPLICATE KEY UPDATE
            plan_key = new.plan_key,
            billing_status = new.billing_status,
            license_limit = new.license_limit,
            reporting_email = new.reporting_email,
            notes = new.notes,
            updated_at = CURRENT_TIMESTAMP(3)
        `,
        [orgId, planKey, billingStatus, licenseLimit || null, reportingEmail || null, notes || null]
      );

      const { rows } = await client.query(
        `
          SELECT org_id, plan_key, billing_status, license_limit, reporting_email, notes, updated_at
          FROM sa_org_billing_controls
          WHERE org_id = $1
          LIMIT 1
        `,
        [orgId]
      );

      await logSuperadminAction(client, {
        orgId: req.authContext.orgId,
        actorUserId: req.authContext.userId,
        actionKey: 'superadmin.billing.upsert',
        targetEntityType: 'sa_org_billing_controls',
        targetEntityId: orgId,
        detailsJson: { planKey, billingStatus, licenseLimit, reportingEmail }
      });

      await appendAuditEvent(client, {
        orgId: req.authContext.orgId,
        moduleKey: 'superadmin',
        entityTable: 'sa_org_billing_controls',
        entityId: orgId,
        actionKey: 'upsert',
        actorUserId: req.authContext.userId,
        payloadJson: { planKey, billingStatus, licenseLimit, reportingEmail }
      });

      return rows[0];
    });

    return res.json({ billing });
  } catch (error) {
    return next(error);
  }
});

