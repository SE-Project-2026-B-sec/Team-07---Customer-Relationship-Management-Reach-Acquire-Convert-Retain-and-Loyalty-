// CRM-24: orders and points controller.
import type { NextFunction, Request, Response } from 'express';
import type { ListOrdersQuery } from './orders.schema';
import { ordersService } from './orders.service';

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export const ordersController = {
  create: handle(async (req, res) => {
    res.status(201).json(await ordersService.create(req.body));
  }),
  list: handle(async (req, res) => {
    res.json(await ordersService.list(req.query as unknown as ListOrdersQuery));
  }),
  get: handle(async (req, res) => {
    res.json(await ordersService.get(req.params.id));
  }),
  points: handle(async (req, res) => {
    res.json(await ordersService.points(req.params.id));
  }),
};
