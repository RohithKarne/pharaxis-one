import { Router } from 'express';
import { superadminOrgsRouter } from './orgs.js';
import { superadminUsersRouter } from './users.js';
import { superadminBillingRouter } from './billing.js';
import { superadminReportsRouter } from './reports.js';

export const superadminRouter = Router();

superadminRouter.use('/orgs', superadminOrgsRouter);
superadminRouter.use('/users', superadminUsersRouter);
superadminRouter.use('/billing', superadminBillingRouter);
superadminRouter.use('/reports', superadminReportsRouter);

