import { Router } from 'express';
import { validate } from '../../common/validate';
import { authenticate, authorize, LEAD_VIEWERS, MANAGERS } from '../auth';
import { leadScoringController as c } from './lead-scoring.controller';
import { replaceRulesSchema } from './lead-scoring.rules';

// CRM-20: anyone who sees leads can read the rules; only Admin and Sales Manager change them.
export const leadScoringRouter = Router();

leadScoringRouter.get('/lead-scoring/rules', authenticate, authorize(...LEAD_VIEWERS), c.rules);
leadScoringRouter.put(
  '/lead-scoring/rules',
  authenticate,
  authorize(...MANAGERS),
  validate(replaceRulesSchema),
  c.replaceRules,
);
leadScoringRouter.post('/lead-scoring/rescore', authenticate, authorize(...MANAGERS), c.rescoreAll);
