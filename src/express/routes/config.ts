import  { Router, Request, Response } from 'express';
import { State } from '../../state';
import { authenticated } from '../authentication';
import { noCache } from '../middleware';
import { HealthTypes } from '../../utils';

export function handlebarOptions(state: State, req: Request) {
  return state.handlebarOptions({
    title: 'Sonarr Webhooks Configuration',
    script: 'config.js',
    healthTypes: HealthTypes,
    urls: {
      rss: state.rssUrl,
      atom: state.atomUrl,
      json: state.jsonUrl,
      sonarr: state.sonarrUrl
    },
    configure: true
  }, req);
}

export default function (state: State) {
  const router = Router();

  router.get('/config', authenticated(state), noCache, (req: Request, res: Response) => {
    res.render('config', handlebarOptions(state, req));
  });
  return router;
}
