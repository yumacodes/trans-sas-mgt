import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { AppError } from './lib/errors';
import { logger } from './lib/logger';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { auditLogsRouter } from './modules/audit-logs';
import { authRouter } from './modules/auth';
import { branchesRouter } from './modules/branches';
import { clientsRouter } from './modules/clients';
import { companyRouter } from './modules/company';
import { dashboardRouter } from './modules/dashboard';
import { meRouter } from './modules/me';
import { messagesRouter } from './modules/messages';
import { registrationsRouter } from './modules/registrations';
import { rolesRouter } from './modules/roles';
import { stockBalancesRouter } from './modules/stock-balances';
import { stockCategoriesRouter } from './modules/stock-categories';
import { stockItemsRouter } from './modules/stock-items';
import { usersRouter } from './modules/users';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function createApp() {
  const config = env();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  // The API serves JSON only, so a strict CSP and no framing are safe.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } } }));
  app.use(
    cors({
      origin: config.corsOrigins,
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = Router();
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(new AppError('RATE_LIMITED', 'Too many requests. Wait a minute and try again.')),
    }),
  );
  // Public sign-in routes; everything after `authenticate` requires a valid session.
  api.use('/auth', authRouter);
  api.use(authenticate);
  api.use('/me', meRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/company', companyRouter);
  api.use('/branches', branchesRouter);
  api.use('/roles', rolesRouter);
  api.use('/users', usersRouter);
  api.use('/clients', clientsRouter);
  api.use('/messages', messagesRouter);
  api.use('/registrations', registrationsRouter);
  api.use('/stock-categories', stockCategoriesRouter);
  api.use('/stock-items', stockItemsRouter);
  api.use('/stock-balances', stockBalancesRouter);
  api.use('/audit-logs', auditLogsRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
