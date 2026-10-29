// CRM-11: reads the request, calls the service, sends the response.
// Input is already validated by the validate(...) middleware in the router.
import type { NextFunction, Request, Response } from 'express';
import { contactsService, type CurrentUser } from './contacts.service';
import type { ListContactsQuery } from './contacts.schema';

const currentUser = (req: Request) => req.user as CurrentUser;

// Express 4 does not catch errors from async handlers, so pass them to next().
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export const contactsController = {
  list: handle(async (req, res) => {
    res.json(await contactsService.list(currentUser(req), req.query as unknown as ListContactsQuery));
  }),

  get: handle(async (req, res) => {
    res.json(await contactsService.get(currentUser(req), req.params.id));
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await contactsService.create(currentUser(req), req.body));
  }),

  update: handle(async (req, res) => {
    res.json(await contactsService.update(currentUser(req), req.params.id, req.body));
  }),

  remove: handle(async (req, res) => {
    await contactsService.remove(currentUser(req), req.params.id);
    res.status(204).end();
  }),
};