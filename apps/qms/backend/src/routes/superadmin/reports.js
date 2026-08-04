// tenant-scope-audit: cross-org — superadmin platform surface, mounted behind
// superadminAuth (src/app.js:72). These are deliberate all-org aggregates and
// cross-org user administration; scoping them to one org would break superadmin.
import { Router } from 'express';

export const superadminReportsRouter = Router();

superadminReportsRouter.get('/billing-summary', async (req, res, next) => {
  try {
    const summary = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            b.plan_key,
            b.billing_status,
            count(*) AS org_count,
            coalesce(sum(b.license_limit), 0) AS total_license_limit
          FROM sa_org_billing_controls b
          GROUP BY b.plan_key, b.billing_status
          ORDER BY b.plan_key, b.billing_status
        `
      );
      // count()/sum() come back as JS strings without the ::int cast — the API
      // contract for these two fields is numeric, so coerce here instead.
      return rows.map((row) => ({
        ...row,
        org_count: Number(row.org_count),
        total_license_limit: Number(row.total_license_limit)
      }));
    });

    return res.json({ summary });
  } catch (error) {
    return next(error);
  }
});

superadminReportsRouter.get('/login-audit', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const loginAudit = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        `
          SELECT
            id,
            org_id,
            email,
            login_surface,
            outcome,
            reason,
            ip_address,
            user_agent,
            occurred_at
          FROM qms_login_audit
          ORDER BY occurred_at DESC
          LIMIT $1
        `,
        [limit]
      );
      return rows;
    });

    return res.json({ loginAudit });
  } catch (error) {
    return next(error);
  }
});
