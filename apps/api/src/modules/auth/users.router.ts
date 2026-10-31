// CRM-6: /api/v1/users — ADMIN only.
import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize } from './auth.middleware';
import { usersController as ctrl } from './users.controller';
import { createUserBody, updateUserBody } from './users.schema';

export const usersRouter = Router();

usersRouter.use(authenticate, authorize('ADMIN'));

usersRouter.get('/', ctrl.list);
usersRouter.post('/', validate(createUserBody), ctrl.create);
usersRouter.patch('/:id', validate(updateUserBody), ctrl.update);
