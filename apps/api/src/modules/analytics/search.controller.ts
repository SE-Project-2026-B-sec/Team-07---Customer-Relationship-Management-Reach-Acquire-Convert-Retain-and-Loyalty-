// CRM-15: reads the request, calls the service, sends the response.
// Input is already validated by validate(searchQuery, 'query') in the router.
import type { NextFunction, Request, Response } from 'express';
import type { SearchQuery } from './search.schema';
import { searchService } from './search.service';

export const searchController = {
  // Express 4 does not catch errors from async handlers, so pass them to next().
  search: (req: Request, res: Response, next: NextFunction) => {
    const { q } = req.query as unknown as SearchQuery;
    searchService
      .search(req.user!, q)
      .then((results) => res.json(results))
      .catch(next);
  },
};
