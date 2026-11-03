import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize, MARKETING_TEAM } from '../auth';
import { segmentsController as c } from './segments.controller';
import {
  createSegmentSchema,
  previewSchema,
  segmentIdParams,
  updateSegmentSchema,
} from './segments.schema';

// CRM-17: Admin and Marketing only, the same roles as campaigns.
const guard = [authenticate, authorize(...MARKETING_TEAM)];

export const segmentsRouter = Router();

segmentsRouter.get('/segments', ...guard, c.list);
segmentsRouter.post('/segments', ...guard, validate(createSegmentSchema), c.create);
// Before /segments/:id so "preview" is not read as an id.
segmentsRouter.post('/segments/preview', ...guard, validate(previewSchema), c.preview);
segmentsRouter.get('/segments/:id', ...guard, validate(segmentIdParams, 'params'), c.get);
segmentsRouter.patch(
  '/segments/:id',
  ...guard,
  validate(segmentIdParams, 'params'),
  validate(updateSegmentSchema),
  c.update,
);
segmentsRouter.get(
  '/segments/:id/audience',
  ...guard,
  validate(segmentIdParams, 'params'),
  c.audience,
);
