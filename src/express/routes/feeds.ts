import  { Router, Request, Response } from 'express';
import { State } from '../../state';

export default function (state: State) {
  const router = Router();

  if (state.config.feedRss) {
    router.get(state.rssUrl, (req: Request, res: Response) => {
      res.setHeader('content-type', 'application/xml; charset=UTF-8');
      res.write(state.feed.feed.rss2());
      res.end();
    });
  }

  if (state.config.feedAtom) {
    router.get(state.atomUrl, (req: Request, res: Response) => {
      res.setHeader('content-type', 'application/xml; charset=UTF-8');
      res.write(state.feed.feed.atom1());
      res.end();
    });
  }

  if (state.config.feedJson) {
    router.get(state.jsonUrl, (req: Request, res: Response) => {
      res.setHeader('content-type', 'application/json; charset=UTF-8');
      res.write(state.feed.feed.json1());
      res.end();
    });
  }

  return router;
}
