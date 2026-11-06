// CRM-30: reads the request, calls the service, sends the response.
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../auth';
import type { CreateQuoteInput } from './quotes.schema';
import { quotesService } from './quotes.service';

const currentUser = (req: Request) => req.user as AuthUser;

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export const quotesController = {
  create: handle(async (req, res) => {
    res
      .status(201)
      .json(
        await quotesService.create(currentUser(req), req.params.id, req.body as CreateQuoteInput),
      );
  }),

  list: handle(async (req, res) => {
    res.json(await quotesService.list(currentUser(req), req.params.id));
  }),

  pdf: handle(async (req, res) => {
    const { file, fileName } = await quotesService.pdf(currentUser(req), req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(file);
  }),
};
