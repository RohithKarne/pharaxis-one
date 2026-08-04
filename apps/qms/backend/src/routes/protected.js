import { Router } from 'express';

export const protectedRouter = Router();

// The `rls` block used to be read back from the Postgres session variable
// (`current_setting('app.current_org_id', true)`), which was the evidence that
// rlsContext had actually set it. MySQL has no session GUCs and no RLS, so there
// is nothing to read back — tenant scoping is an org_id predicate on every query
// (Phase 0). The org now comes from the auth context, which is the same value
// rlsContext used to write. The response shape is unchanged.
//
// withRlsTransaction is still wrapped around it: it carries the "request reached
// a tenant route without an org" precondition, and this route is the probe used
// to check exactly that.
protectedRouter.get('/me', async (req, res, next) => {
  try {
    const context = await req.withRlsTransaction(async () => ({
      org_id: req.authContext.orgId
    }));

    res.json({
      auth: req.authContext,
      rls: context
    });
  } catch (error) {
    next(error);
  }
});
