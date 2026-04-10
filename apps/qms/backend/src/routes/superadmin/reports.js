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
            count(*)::int AS org_count,
            coalesce(sum(b.license_limit), 0)::int AS total_license_limit
          FROM sa_org_billing_controls b
          GROUP BY b.plan_key, b.billing_status
          ORDER BY b.plan_key, b.billing_status
        `
      );
      return rows;
    });

    return res.json({ summary });
  } catch (error) {
    return next(error);
  }
});

