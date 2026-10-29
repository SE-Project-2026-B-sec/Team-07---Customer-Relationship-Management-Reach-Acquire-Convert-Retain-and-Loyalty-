import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { errorHandler, notFound } from './common/errors';
import { logger } from './common/logger';
import { prisma } from './common/prisma';
import { acquireRouter } from './modules/acquire';
import { analyticsRouter } from './modules/analytics';
import { authRouter } from './modules/auth';
import { convertRouter } from './modules/convert';
import { loyaltyRouter } from './modules/loyalty';
import { reachRouter } from './modules/reach';
import { retainRouter } from './modules/retain';

export interface AppOptions {
  corsOrigin?: string;
}

export function createApp({ corsOrigin = 'http://localhost:5173' }: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Health check used by the uptime monitor and the deploy smoke test (CRM-NF-003, CRM-NF-010).
  app.get('/api/v1/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  const api = express.Router();
  api.use(authRouter);
  api.use(reachRouter);
  api.use(acquireRouter);
  api.use(convertRouter);
  api.use(retainRouter);
  api.use(loyaltyRouter);
  api.use(analyticsRouter);
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
