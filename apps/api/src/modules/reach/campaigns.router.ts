import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize } from '../auth/auth.middleware';
import { campaignsController as c } from './campaigns.controller';
import {
    campaignIdParams,
    createCampaignSchema,
    updateCampaignSchema,
} from './campaigns.schema';

export const campaignsRouter = Router();

// Admin and Marketing only, the same roles that see the Campaigns menu item.
const canManage = authorize('ADMIN', 'MARKETING');

campaignsRouter.get('/campaigns', authenticate, canManage, c.list);
campaignsRouter.get(
    '/campaigns/:id',
    authenticate,
    canManage,
    validate(campaignIdParams, 'params'),
    c.get,
);
campaignsRouter.post('/campaigns', authenticate, canManage, validate(createCampaignSchema), c.create);
campaignsRouter.patch(
    '/campaigns/:id',
    authenticate,
    canManage,
    validate(campaignIdParams, 'params'),
    validate(updateCampaignSchema),
    c.update,
);