import type { Request, RequestHandler, Response } from 'express';
import {
  audienceQuery,
  type CreateSegmentInput,
  listSegmentsQuery,
  type UpdateSegmentInput,
} from './segments.schema';
import { segmentsService } from './segments.service';

// Sends any thrown error to the shared error handler.
const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const segmentsController = {
  list: handle(async (req, res) => {
    res.json(await segmentsService.list(listSegmentsQuery.parse(req.query)));
  }),

  get: handle(async (req, res) => {
    res.json(await segmentsService.get(req.params.id));
  }),

  create: handle(async (req, res) => {
    res.status(201).json(await segmentsService.create(req.body as CreateSegmentInput));
  }),

  update: handle(async (req, res) => {
    res.json(await segmentsService.update(req.params.id, req.body as UpdateSegmentInput));
  }),

  preview: handle(async (req, res) => {
    res.json(await segmentsService.preview(req.body.filter));
  }),

  audience: handle(async (req, res) => {
    res.json(await segmentsService.audience(req.params.id, audienceQuery.parse(req.query)));
  }),
};
