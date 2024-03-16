import  { Router, Request, Response } from 'express';
import { State } from '../state';

export default function (state: State) {
  const router = Router();

  router.get('/rss', (req: Request, res: Response) => {
    res.setHeader('content-type', 'application/xml; charset=UTF-8');
    res.write(state.feed.feed.rss2());
    res.end();
  });

  return router;
}
