import type { Request, RequestHandler, Response } from 'express';
import { customer360Query } from './customer360.schema';
import { customer360Service } from './customer360.service';

const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const customer360Controller = {
  get: handle(async (req, res) => {
    res.json(await customer360Service.get(req.params.id, customer360Query.parse(req.query)));
  }),
};
