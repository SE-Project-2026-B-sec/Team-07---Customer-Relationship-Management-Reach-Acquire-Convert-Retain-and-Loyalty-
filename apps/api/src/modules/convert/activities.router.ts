import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate } from '../auth';
import { activitiesController as c } from './activities.controller';
import { activityIdParams, createActivitySchema, updateActivitySchema } from './activities.schema';

export const activitiesRouter = Router();

activitiesRouter.get('/activities', authenticate, c.list);
activitiesRouter.post('/activities', authenticate, validate(createActivitySchema), c.create);
activitiesRouter.patch(
  '/activities/:id',
  authenticate,
  validate(activityIdParams, 'params'),
  validate(updateActivitySchema),
  c.update,
);
