import type { Request, RequestHandler, Response } from 'express';
import { leadScoringService } from './lead-scoring.service';
import type { ScoreRule } from './lead-scoring.rules';

const handle =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export const leadScoringController = {
  rules: handle(async (_req, res) => {
    res.json({ rules: await leadScoringService.rules() });
  }),

  replaceRules: handle(async (req, res) => {
    res.json(await leadScoringService.replaceRules(req.body.rules as ScoreRule[]));
  }),

  rescoreAll: handle(async (_req, res) => {
    res.json(await leadScoringService.rescoreAll());
  }),
};
