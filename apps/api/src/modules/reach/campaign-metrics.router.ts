import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize, MARKETING_TEAM } from '../auth';
import { campaignMetricsController as c } from './campaign-metrics.controller';
import { simulateSchema } from './campaign-metrics.schema';
import { campaignIdParams } from './campaigns.schema';

// CRM-19: Admin and Marketing, the same roles as campaigns (CRM-18).
const guard = [authenticate, authorize(...MARKETING_TEAM), validate(campaignIdParams, 'params')];

export const campaignMetricsRouter = Router();

campaignMetricsRouter.post('/campaigns/:id/send', ...guard, c.send);
campaignMetricsRouter.get('/campaigns/:id/metrics', ...guard, c.metrics);
campaignMetricsRouter.post('/campaigns/:id/complete', ...guard, c.complete);
// Demo only: there is no real email provider, so engagement is simulated (SRS 2.6).
campaignMetricsRouter.post(
  '/campaigns/:id/simulate-engagement',
  ...guard,
  validate(simulateSchema),
  c.simulate,
);
