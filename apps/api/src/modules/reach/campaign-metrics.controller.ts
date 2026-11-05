import type { Request, RequestHandler, Response } from 'express';
import type { SimulateInput } from './campaign-metrics.schema';
import { campaignMetricsService as service } from './campaign-metrics.service';

const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const campaignMetricsController = {
  send: handle(async (req, res) => {
    res.json(await service.send(req.params.id));
  }),
  metrics: handle(async (req, res) => {
    res.json(await service.metrics(req.params.id));
  }),
  simulate: handle(async (req, res) => {
    res.json(await service.simulate(req.params.id, req.body as SimulateInput));
  }),
  complete: handle(async (req, res) => {
    res.json(await service.complete(req.params.id));
  }),
};
