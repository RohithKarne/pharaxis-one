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
import { changeControlRouter } from './routes/changeControl.js';
import { securityRouter } from './routes/security.js';
import { complaintsRouter } from './routes/complaints.js';
import { nonconformanceRouter } from './routes/nonconformance.js';
import { supplierQualityRouter } from './routes/supplierQuality.js';
import { riskManagementRouter } from './routes/riskManagement.js';
import { managementReviewRouter } from './routes/managementReview.js';
import { aiInsightsRouter } from './routes/aiInsights.js';
import { integrationsRouter } from './routes/integrations.js';
import { authSelector } from './middleware/authSelector.js';
import { resolveAuthContext } from './middleware/authContext.js';
import { withRlsContext } from './middleware/rlsContext.js';
import { superadminAuth } from './middleware/superadminAuth.js';
import { requestContext } from './middleware/requestContext.js';
import { inputSecurity } from './middleware/inputSecurity.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { env } from './config/env.js';

function parseAllowedOrigins(rawOrigins) {
  const values = String(rawOrigins || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(values);
}

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

function mountApiRoutes(app, basePath) {
  app.use(`${basePath}/auth`, authRouter);

  app.use(basePath, authSelector, resolveAuthContext, withRlsContext);
  app.use(`${basePath}/protected`, protectedRouter);
  app.use(`${basePath}/document-control`, documentControlRouter);
  app.use(`${basePath}/capa`, capaRouter);
  app.use(`${basePath}/deviations`, deviationsRouter);
  app.use(`${basePath}/audits`, auditsRouter);
  app.use(`${basePath}/validation`, validationRouter);
  app.use(`${basePath}/change-control`, changeControlRouter);
  app.use(`${basePath}/platform`, platformRouter);
  app.use(`${basePath}/security`, securityRouter);
  app.use(`${basePath}/complaints`, complaintsRouter);
  app.use(`${basePath}/nonconformance`, nonconformanceRouter);
  app.use(`${basePath}/supplier-quality`, supplierQualityRouter);
  app.use(`${basePath}/risk-management`, riskManagementRouter);
  app.use(`${basePath}/management-review`, managementReviewRouter);
  app.use(`${basePath}/intelligence`, aiInsightsRouter);
  app.use(`${basePath}/integrations`, integrationsRouter);
  app.use(`${basePath}/superadmin`, superadminAuth, superadminRouter);
}

export function createAppServer() {
  const app = express();
  if (env.CORS_ALLOW_ALL && env.NODE_ENV === 'production') {
    throw new Error('CORS_ALLOW_ALL cannot be enabled in production.');
  }
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const defaultOrigins = new Set([
    'http://127.0.0.1:3146',
    'http://localhost:3146',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://13.205.213.128',
    'https://13.205.213.128'
  ]);
  const envOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const allowedOrigins =
    env.CORS_ALLOW_ALL || envOrigins.size === 0 ? defaultOrigins : envOrigins;

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (env.CORS_ALLOW_ALL || allowedOrigins.has(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  });

  app.use(applySecurityHeaders);
  app.use(requestContext);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 1000 }));
  app.use('/api', createRateLimiter({
    windowMs: 60 * 1000,
    max: Number(process.env.QMS_API_RATE_LIMIT || 600),
    message: 'Rate limit exceeded. Please retry shortly.'
  }));
  app.use('/api', inputSecurity);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'qms', timestamp: new Date().toISOString() });
  });
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, app: 'qms', version: 'v1', timestamp: new Date().toISOString() });
  });

  mountApiRoutes(app, '/api/v1');
  mountApiRoutes(app, '/api');

  app.use((err, req, res, _next) => {
    const status = err.statusCode || 500;
    const message = err.message || 'Unexpected server error';
    res.status(status).json({ error: message, request_id: req.requestId || null });
  });

  return app;
}
