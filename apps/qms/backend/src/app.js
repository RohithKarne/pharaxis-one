import express from 'express';
import { authRouter } from './routes/auth.js';
import { protectedRouter } from './routes/protected.js';
import { superadminRouter } from './routes/superadmin/index.js';
import { documentControlRouter } from './routes/documentControl.js';
import { capaRouter } from './routes/capa.js';
import { deviationsRouter } from './routes/deviations.js';
import { auditsRouter } from './routes/audits.js';
import { validationRouter } from './routes/validation.js';
import { platformRouter } from './routes/platform.js';
import { authSelector } from './middleware/authSelector.js';
import { resolveAuthContext } from './middleware/authContext.js';
import { withRlsContext } from './middleware/rlsContext.js';
import { superadminAuth } from './middleware/superadminAuth.js';

export function createAppServer() {
  const app = express();

  const allowedOrigins = new Set([
    'http://127.0.0.1:3146',
    'http://localhost:3146',
    'http://127.0.0.1:5173',
    'http://localhost:5173'
  ]);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  });

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'qms', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);

  app.use('/api', authSelector, resolveAuthContext, withRlsContext);
  app.use('/api/protected', protectedRouter);
  app.use('/api/document-control', documentControlRouter);
  app.use('/api/capa', capaRouter);
  app.use('/api/deviations', deviationsRouter);
  app.use('/api/audits', auditsRouter);
  app.use('/api/validation', validationRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/superadmin', superadminAuth, superadminRouter);

  app.use((err, _req, res, _next) => {
    const status = err.statusCode || 500;
    const message = err.message || 'Unexpected server error';
    res.status(status).json({ error: message });
  });

  return app;
}
