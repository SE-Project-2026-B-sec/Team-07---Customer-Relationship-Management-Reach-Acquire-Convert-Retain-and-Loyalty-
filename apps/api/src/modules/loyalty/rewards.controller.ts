// CRM-26: rewards controller.
import type { NextFunction, Request, Response } from 'express';
import { rewardsService } from './rewards.service';

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const isAdmin = (req: Request) => (req.user as { role: string } | undefined)?.role === 'ADMIN';

export const rewardsController = {
  list: handle(async (req, res) => {
    res.json(await rewardsService.list(isAdmin(req)));
  }),
  create: handle(async (req, res) => {
    res.status(201).json(await rewardsService.create(req.body));
  }),
  update: handle(async (req, res) => {
    res.json(await rewardsService.update(req.params.id, req.body));
  }),
  redeem: handle(async (req, res) => {
    res.status(201).json(await rewardsService.redeem(req.params.id, req.body));
  }),
  history: handle(async (req, res) => {
    res.json(await rewardsService.history(req.params.id));
  }),
};
