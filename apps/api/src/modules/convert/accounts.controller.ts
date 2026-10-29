// CRM-11: accounts controller.
import type { NextFunction, Request, Response } from 'express';
import { accountsService } from './accounts.service';
import type { CurrentUser } from './contacts.service';
import type { ListAccountsQuery } from './accounts.schema';

const currentUser = (req: Request) => req.user as CurrentUser;

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export const accountsController = {
  list: handle(async (req, res) => {
    res.json(await accountsService.list(currentUser(req), req.query as unknown as ListAccountsQuery));
  }),

  get: handle(async (req, res) => {
    res.json(await accountsService.get(currentUser(req), req.params.id));
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await accountsService.create(currentUser(req), req.body));
  }),

  update: handle(async (req, res) => {
    res.json(await accountsService.update(currentUser(req), req.params.id, req.body));
  }),

  remove: handle(async (req, res) => {
    await accountsService.remove(currentUser(req), req.params.id);
    res.status(204).end();
  }),
};