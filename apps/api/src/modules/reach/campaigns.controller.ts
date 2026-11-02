import type { Request, RequestHandler, Response } from 'express';
import {
  type CreateCampaignInput,
  listCampaignsQuery,
  type UpdateCampaignInput,
} from './campaigns.schema';
import { campaignsService } from './campaigns.service';

// Sends any thrown error to the shared error handler.
const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const campaignsController = {
  list: handle(async (req, res) => {
    res.json(await campaignsService.list(listCampaignsQuery.parse(req.query)));
  }),

  get: handle(async (req, res) => {
    res.json(await campaignsService.get(req.params.id));
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await campaignsService.create(req.body as CreateCampaignInput));
  }),

  update: handle(async (req, res) => {
    res.json(await campaignsService.update(req.params.id, req.body as UpdateCampaignInput));
  }),
};
