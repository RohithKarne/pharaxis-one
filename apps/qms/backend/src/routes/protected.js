import { Router } from 'express';

export const protectedRouter = Router();

protectedRouter.get('/me', async (req, res, next) => {
  try {
    const context = await req.withRlsTransaction(async (client) => {
      const { rows } = await client.query(
        "SELECT current_setting('app.current_org_id', true) AS org_id"
      );
      return rows[0];
    });

    res.json({
      auth: req.authContext,
      rls: context
    });
  } catch (error) {
    next(error);
  }
});
