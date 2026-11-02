import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { dashboardController as c } from './dashboard.controller';

export const dashboardRouter = Router();

// Everyone who is logged in may see the dashboard (roles table in auth/roles.ts).
dashboardRouter.get('/dashboard/kpis', authenticate, c.kpis);